// The single canonical home for "is this event publicly visible?" — mirrors
// functions/utils/eventDay.js's role as the one place that owns a
// recurring cross-file predicate (see CLAUDE.md).
//
// `events.is_published` was deprecated in migration 0005 in favour of
// `events.status TEXT` ('draft' | 'published' | 'archived'), but the column
// was never dropped. Until #799, `functions/api/admin/events/[id]/archive.js`
// wrote `status = 'archived', is_published = 0` — archiving an event therefore
// UNPUBLISHED it under the old column, so a public read path gated on bare
// `is_published = 1` stopped matching that event the instant it was archived.
//
// A live event really was `status = 'published'` with `is_published = 1`, so
// the two columns agreed while it ran and nothing looked wrong. The failure is
// terminal rather than gradual: every edition eventually gets archived, and
// when the last un-archived one does, every such read path drops to ZERO rows
// at the same instant. That is what took the public site dark on 2026-08-10.
//
// `status` is the real gate. An event is publicly visible iff
// `status IN ('published', 'archived')`; it is specifically archived iff
// `status = 'archived'`.
//
// As of #799 no PRODUCTION code in functions/ or frontend/src/ reads or writes
// `is_published` — the admin write paths that kept it in lockstep with
// `status` (for rollback safety across #800) are gone, and the guard test in
// functions/utils/__tests__/eventVisibility.test.js now scans the whole tree
// with no admin exemption. Migration 0059 dropped the column itself, along
// with its two indexes (replaced by idx_events_status_date) — #799 is
// complete. The guard test stays in the suite regardless: it is what makes a
// reintroduction of `is_published` (a copy-pasted old query, a reverted
// migration without reverted callers) fail CI instead of shipping.

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

// The alias is always a hardcoded literal supplied by the calling module,
// never user input — but it is validated anyway so this helper can never
// become an injection vector if a caller ever passes something dynamic.
function assertValidAlias(alias) {
  // The typeof check is load-bearing, not defensive noise: IDENTIFIER_RE.test()
  // stringifies its argument, and String(null) === "null" matches the identifier
  // pattern. Without it, a null alias passes validation and then silently
  // degrades to an unaliased column via the falsy check in columnRef().
  if (typeof alias !== "string" || (alias !== "" && !IDENTIFIER_RE.test(alias))) {
    throw new Error(`eventVisibility: invalid table alias "${alias}"`);
  }
}

function columnRef(alias) {
  assertValidAlias(alias);
  return alias ? `${alias}.status` : "status";
}

/**
 * SQL predicate for "this event is publicly visible" — published or
 * archived. Pass the table alias in use at the call site (e.g. "e"); omit it
 * when the query selects directly from `events` with no alias.
 *
 * @param {string} [alias] - table alias, e.g. "e"; "" (default) for none
 * @returns {string} e.g. "e.status IN ('published', 'archived')"
 */
export function publicEventStatusSql(alias = "") {
  return `${columnRef(alias)} IN ('published', 'archived')`;
}

/**
 * SQL predicate for "this event is archived" — the subset of public
 * visibility used by recap pages, which exist only for concluded editions.
 *
 * @param {string} [alias] - table alias, e.g. "e2"; "" (default) for none
 * @returns {string} e.g. "e.status = 'archived'"
 */
export function archivedEventStatusSql(alias = "") {
  return `${columnRef(alias)} = 'archived'`;
}

/**
 * SQL predicate for "this event is published" — the NARROWER subset that
 * deliberately excludes archived events.
 *
 * Use this only where serving a concluded event would be wrong, not merely
 * unusual. The live case is `/api/schedule?event=current`: an event archived
 * on its own final day still satisfies
 * `COALESCE(end_date, date) >= date('now','-6 hours')`, so the broader
 * publicEventStatusSql() would hand a fan the archived edition as tonight's
 * running schedule. Browse and history surfaces want publicEventStatusSql()
 * instead — archived editions are the site's back catalogue, not an error.
 *
 * @param {string} [alias] - table alias, e.g. "e"; "" (default) for none
 * @returns {string} e.g. "e.status = 'published'"
 */
export function publishedEventStatusSql(alias = "") {
  return `${columnRef(alias)} = 'published'`;
}

/**
 * SQL predicate for "this event has concluded" — archived (any date), or
 * published with its LAST day already elapsed. Promoted here from
 * `functions/api/events/timeline.js`, where it powers the `past` bucket,
 * once a second consumer (recap + sitemap gating, #787) needed the exact
 * same answer (the #550 precedent: unify a duplicated predicate when a
 * second consumer appears, not before).
 *
 * Lifecycle outranks the calendar: `status = 'archived'` MEANS "this edition
 * is concluded", so an archived event counts as concluded regardless of its
 * date — the same trap `/api/schedule?event=current` avoids in the other
 * direction with publishedEventStatusSql(). Without the `archived OR` half,
 * an event archived early (before its own date) would satisfy neither "not
 * concluded" nor the archived branch and vanish from any bucket built on
 * this predicate.
 *
 * A recap exists iff an event is publicly visible AND concluded — nothing
 * more, nothing less. Gating recap visibility (or a sitemap recap URL) on
 * anything narrower, such as `status = 'archived'` alone, produces a soft-404:
 * an indexable URL / full SSR identity meta for an event whose JSON data API
 * still 404s, because archiving is an admin housekeeping click that can lag
 * the event's actual end by days.
 *
 * Embeds exactly ONE unbound `?` for the date comparison — the caller MUST
 * bind one parameter for it, and that value MUST be
 * `eventLocalFestivalToday()` (functions/utils/eventDay.js), never
 * `eventLocalToday()`. An event ending at 2 AM is still running: the festival
 * day steps back a calendar day below AFTER_MIDNIGHT_THRESHOLD_HOUR (6 AM) so
 * a still-airing after-midnight set is never treated as concluded. Every
 * consumer of this predicate must answer "is this event over?" with the same
 * value the timeline's past bucket uses for itself, or two call sites drift
 * back into disagreeing (the exact defect #787 fixes).
 *
 * @param {string} [alias] - table alias, e.g. "e"; "" (default) for none
 * @returns {string} e.g. "(status = 'archived' OR (status = 'published' AND COALESCE(end_date, date) < ?))"
 */
export function concludedEventSql(alias = "") {
  // Validate BEFORE interpolating. The two helpers below would throw on a bad
  // alias anyway, but `dateExpr` is built first, so `${alias}` would already
  // have stringified the argument -- running a custom toString() on a hostile
  // object before any guard fired. Every other path in this module validates
  // ahead of interpolation (see columnRef); this one now matches.
  assertValidAlias(alias);
  const dateExpr = alias ? `COALESCE(${alias}.end_date, ${alias}.date)` : "COALESCE(end_date, date)";
  return `(${archivedEventStatusSql(alias)} OR (${publishedEventStatusSql(alias)} AND ${dateExpr} < ?))`;
}
