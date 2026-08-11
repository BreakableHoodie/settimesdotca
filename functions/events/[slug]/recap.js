// CF Pages Function: serve /events/[slug]/recap with server-rendered meta for
// crawlers. Distinct from /event/[slug] (singular) -- this is the ARCHIVE
// recap page (frontend/src/pages/EventRecapPage.jsx), reachable once an
// event's date is past (functions/sitemap.xml.js emits it there). Modeled on
// functions/event/[slug].js: same D1 lookup shape, same published-event gate,
// same fallback discipline (gate closed / not found / DB error -> the SPA
// shell via env.ASSETS.fetch so the page still renders client-side). See
// functions/utils/ssrMeta.js for the full SSR-injection rationale.

import { isPublicDataEnabled } from "../../utils/publicGate.js";
import { escapeAttr, serveWithInjectedMeta, CANONICAL_HOST, DEFAULT_OG_IMAGE } from "../../utils/ssrMeta.js";
import { normalizeHttpUrl, validateDate } from "../../utils/validation.js";
import { eventLocalToday, eventLocalFestivalToday } from "../../utils/eventDay.js";
import { concludedEventSql } from "../../utils/eventVisibility.js";

const DATE_LABEL_FORMAT = { year: "numeric", month: "long", day: "numeric" };

// Mirrors EventRecapPage.jsx's own `formattedDate` derivation (parseLocalDate
// + toLocaleDateString('en-CA', ...)) exactly, so the SSR description matches
// what the client renders after hydration. Date-only components are
// timezone-invariant here: constructing a "local" Date from Y/M/D and
// re-extracting Y/M/D on format always round-trips to the same calendar date,
// whether "local" is a visitor's browser timezone or workerd's UTC.
function formatEventDate(dateStr) {
  if (typeof dateStr !== "string") return "Date TBD";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return "Date TBD";
  const [year, month, day] = parts;
  return new Date(year, month - 1, day).toLocaleDateString("en-CA", DATE_LABEL_FORMAT);
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const slug = params.slug;

  if (!/^[a-z0-9-]{1,64}$/i.test(slug || "") || !isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }

  let event;
  try {
    // Publicly visible AND concluded (#787). This gate previously checked
    // visibility only, so SSR would happily emit canonical/og:url/title for the
    // recap of an event that had not happened yet, while
    // GET /api/events/:id/recap -- which the page renders from -- returned
    // nothing. Identical predicate and identical bind value as that API and as
    // the sitemap: the drift between the three IS the bug.
    event = await env.DB.prepare(
      `SELECT id, name, slug, date, end_date, poster_url
       FROM events
       WHERE slug = ? AND ${concludedEventSql()}`,
    )
      .bind(slug, eventLocalFestivalToday())
      .first();
  } catch (err) {
    console.error("SSR event recap lookup failed:", slug, err);
    return env.ASSETS.fetch(request);
  }
  if (!event) return env.ASSETS.fetch(request);

  // This route claims to be the ARCHIVE recap (see file header) -- the
  // published/archived gate above says nothing about whether the event has
  // actually happened yet. Without this check, a direct request for a
  // future published event would get recap-specific meta ("recap for X on
  // <date>") for a show that hasn't played, ahead of the sitemap ever
  // listing it there. end_date || date mirrors the multi-day convention
  // elsewhere (CLAUDE.md, scheduleStorage) -- a multi-day event isn't over
  // until its LAST day has passed, not its first.
  //
  // `date`/`end_date` are TEXT columns with no DB-level format constraint, so
  // a legacy row can hold a syntactically-YYYY-MM-DD but calendar-invalid
  // value (e.g. "2026-02-30"). A plain typeof/string check doesn't catch
  // that, and a lexicographic compare against an out-of-range day can still
  // resolve either way -- validateDate() (validation.js) does real
  // month-length/leap-year validation, same helper the write-side event form
  // uses, so an invalid legacy date falls back to the shell rather than
  // risking a wrong-signed comparison (CodeRabbit, #784 follow-up).
  const lastDay = event.end_date || event.date;
  if (!validateDate(lastDay).valid || lastDay >= eventLocalToday()) {
    return env.ASSETS.fetch(request);
  }

  // Cheap aggregate -- mirrors the two numbers EventRecapPage.jsx's Helmet
  // actually quotes (stats.total_sets, stats.venue_count). The full
  // first-timer/returning-act breakdown the JSON /api/events/:id/recap
  // endpoint computes is not needed for meta and isn't queried here.
  let stats = { total_sets: 0, venue_count: 0 };
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS total_sets, COUNT(DISTINCT venue_id) AS venue_count
       FROM performances
       WHERE event_id = ?`,
    )
      .bind(event.id)
      .first();
    if (row) {
      stats = { total_sets: row.total_sets ?? 0, venue_count: row.venue_count ?? 0 };
    }
  } catch (err) {
    // Non-fatal: fall through with zeroed stats, same "?? 0" the client
    // Helmet formula already tolerates for missing counts.
    console.error("SSR event recap stats lookup failed:", slug, err);
  }

  // Pin to the production host -- preview deploys must not self-canonicalise.
  const url = `${CANONICAL_HOST}/events/${event.slug}/recap`;
  // Verbatim shape of EventRecapPage.jsx's <Helmet> title/description.
  const title = `${event.name} — Event Recap | SetTimes.ca`;
  const formattedDate = formatEventDate(event.date);
  const description = `Recap for ${event.name} on ${formattedDate}. ${stats.total_sets} sets across ${stats.venue_count} venues.`;

  // Read-path sanitize (#504 convention, #616): never reflect a
  // pre-validation legacy poster_url into og:image/twitter:image.
  const safePosterUrl = normalizeHttpUrl(event.poster_url);
  const ogImageUrl = safePosterUrl || DEFAULT_OG_IMAGE;

  // SSR owns this route's identity meta (see functions/utils/ssrMeta.js) --
  // EventRecapPage.jsx's client <Helmet> sets <title> only now. og:title/
  // og:description have no client precedent to match; they're derived from
  // this page's own title/description, never from the homepage defaults and
  // never invented copy (same STATIC_PAGES registry convention).
  const metaTags = [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    // index.html's baked-in og:site_name is stripped by DEFAULT_META_RE
    // (ssrMeta.js) same as every other identity tag -- this route must
    // re-emit it or it silently disappears rather than merely de-duplicating
    // (#784 CodeRabbit follow-up).
    `<meta property="og:site_name" content="SetTimes" />`,
    `<meta property="og:image" content="${escapeAttr(ogImageUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(ogImageUrl)}" />`,
  ];

  return serveWithInjectedMeta(context, { title, metaTags });
}
