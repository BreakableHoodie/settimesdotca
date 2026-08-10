// The single canonical home for "is this event publicly visible?" — mirrors
// functions/utils/eventDay.js's role as the one place that owns a
// recurring cross-file predicate (see CLAUDE.md).
//
// `events.is_published` was deprecated in migration 0005 in favour of
// `events.status TEXT` ('draft' | 'published' | 'archived'), but the column
// was never dropped. `functions/api/admin/events/[id]/archive.js` writes
// `status = 'archived', is_published = 0` — archiving an event therefore
// UNPUBLISHES it under the old column. Every production event ends up
// 'archived' or 'draft', so a public read path still gated on bare
// `is_published = 1` matches ZERO rows once an event has been archived.
//
// `status` is the real gate. An event is publicly visible iff
// `status IN ('published', 'archived')`; it is specifically archived iff
// `status = 'archived'`. `is_published` must never be read on a public path
// again — the guard test in functions/utils/__tests__/eventVisibility.test.js
// scans the source tree and fails the build if it is. Admin write paths
// (functions/api/admin/**) are exempt: they must keep writing `is_published`
// in lockstep with `status` so the eventual column-drop migration stays safe
// and this change stays rollback-able.

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
