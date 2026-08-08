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
import { normalizeHttpUrl } from "../../utils/validation.js";

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
    event = await env.DB.prepare(
      `SELECT id, name, slug, date, poster_url
       FROM events
       WHERE slug = ? AND (is_published = 1 OR status = 'archived')`,
    )
      .bind(slug)
      .first();
  } catch (err) {
    console.error("SSR event recap lookup failed:", slug, err);
    return env.ASSETS.fetch(request);
  }
  if (!event) return env.ASSETS.fetch(request);

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

  // EventRecapPage's own Helmet sets only title/description/canonical/og:url
  // -- no og:title/og:description of its own. Per the STATIC_PAGES registry
  // convention (functions/utils/staticPageMeta.js), those are derived from
  // this page's own title/description, never from the homepage defaults and
  // never invented copy.
  const metaTags = [
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:image" content="${escapeAttr(ogImageUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(ogImageUrl)}" />`,
  ];

  return serveWithInjectedMeta(context, { title, metaTags });
}
