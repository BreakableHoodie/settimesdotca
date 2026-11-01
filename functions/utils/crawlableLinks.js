// Server-rendered, crawlable entity links for the hub pages (#1447).
//
// The <noscript> nav in frontend/index.html links only parameterless routes, so
// between seasons nothing in raw HTML reached an event, recap, band or venue
// page: the sitemap was the sole referrer, and Search Console showed those
// URLs as "Discovered/Crawled - currently not indexed" or "unknown to Google".
// A sitemap is a hint, not a substitute for links.
//
// ONE helper owns the shape: loaders return plain {href, text} items,
// `renderLinkList` escapes and builds the <ul>, and `serveWithInjectedMeta`
// splices it in at PAGE_LINKS_MARKER (inside the shell's <noscript>, same
// raw-HTML-only pattern as functions/index.js). Handlers never build markup.
//
// Visibility goes through eventVisibility.js and the reveal gate
// `(e.reveal_mode = 0 OR p.is_announced = 1)`, so a draft event or an
// unannounced act is never linked. A failed read yields NO links (logged at
// error) and never fails the page.
import { eventLocalFestivalToday } from "./eventDay.js";
import { concludedEventSql, publicEventStatusSql } from "./eventVisibility.js";
import { isPublicDataEnabled } from "./publicGate.js";
import { escapeAttr } from "./ssrMeta.js";

/**
 * @param {Array<{href: string, text: string}>} items
 * @param {string} heading
 * @returns {string} escaped markup, "" when there is nothing to link
 */
export function renderLinkList(items, heading) {
  if (!items || items.length === 0) return "";
  const lis = items.map(({ href, text }) => `<li><a href="${escapeAttr(href)}">${escapeAttr(text)}</a></li>`).join("");
  return `<h2>${escapeAttr(heading)}</h2><ul>${lis}</ul>`;
}

const idPath = (prefix, id) => `${prefix}/${encodeURIComponent(String(id))}`;

export function bandLinkItems(bands) {
  return bands.map((b) => ({ href: idPath("/band", b.id), text: b.name }));
}

export function venueLinkItems(venues) {
  return venues.map((v) => ({ href: idPath("/venue", v.id), text: v.name }));
}

/** Lineup + venue links for one edition (rows already reveal-gated). */
export function renderEventLinks(bands, venues) {
  return renderLinkList(bandLinkItems(bands), "Lineup") + renderLinkList(venueLinkItems(venues), "Venues");
}

const REVEAL_GATE = "(e.reveal_mode = 0 OR p.is_announced = 1)";

async function historyLinks(env) {
  const { results } = await env.DB.prepare(
    `SELECT slug, name, CASE WHEN ${concludedEventSql()} THEN 1 ELSE 0 END AS is_concluded
     FROM events
     WHERE ${publicEventStatusSql()}
     ORDER BY date DESC`,
  )
    .bind(eventLocalFestivalToday())
    .all();
  const items = [];
  for (const e of results ?? []) {
    items.push({ href: `/event/${e.slug}`, text: e.name });
    // Same rule as the sitemap: a recap exists only once the event concluded.
    if (e.is_concluded) items.push({ href: `/events/${e.slug}/recap`, text: `${e.name} recap` });
  }
  return renderLinkList(items, "Editions");
}

async function artistLinks(env) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT bp.id, bp.name
     FROM band_profiles bp
     JOIN performances p ON p.band_profile_id = bp.id
     JOIN events e ON e.id = p.event_id
     WHERE ${publicEventStatusSql("e")} AND ${REVEAL_GATE}
     ORDER BY bp.name COLLATE NOCASE`,
  ).all();
  return renderLinkList(bandLinkItems(results ?? []), "Artists");
}

async function venueLinks(env) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT v.id, v.name
     FROM venues v
     JOIN performances p ON p.venue_id = v.id
     JOIN events e ON e.id = p.event_id
     WHERE ${publicEventStatusSql("e")} AND ${REVEAL_GATE}
     ORDER BY v.name COLLATE NOCASE`,
  ).all();
  return renderLinkList(venueLinkItems(results ?? []), "Venues");
}

/** Reveal-gated lineup + venue links for one event (recap page). */
export async function loadEventLinks(env, event) {
  const bind = event.reveal_mode ?? 0;
  const [bands, venues] = await Promise.all([
    env.DB.prepare(
      `SELECT DISTINCT bp.id, bp.name FROM performances p
       JOIN band_profiles bp ON bp.id = p.band_profile_id
       WHERE p.event_id = ? AND (? = 0 OR p.is_announced = 1)
       ORDER BY bp.name COLLATE NOCASE`,
    )
      .bind(event.id, bind)
      .all(),
    env.DB.prepare(
      `SELECT DISTINCT v.id, v.name FROM performances p
       JOIN venues v ON v.id = p.venue_id
       WHERE p.event_id = ? AND (? = 0 OR p.is_announced = 1)
       ORDER BY v.name COLLATE NOCASE`,
    )
      .bind(event.id, bind)
      .all(),
  ]);
  return renderEventLinks(bands.results ?? [], venues.results ?? []);
}

const HUB_LOADERS = { "/history": historyLinks, "/artists": artistLinks, "/venues": venueLinks };

/**
 * Link markup for a hub path, or "" for any other path, a closed public-data
 * gate, or a failed read (logged at error; the page still renders).
 */
export async function loadHubLinks(env, path) {
  const loader = HUB_LOADERS[path];
  if (!loader || !isPublicDataEnabled(env)) return "";
  try {
    return await loader(env);
  } catch (err) {
    console.error("Crawlable hub link read failed:", path, err);
    return "";
  }
}
