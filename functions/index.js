import { eventLocalFestivalToday } from "./utils/eventDay.js";
import { concludedEventSql, publishedEventStatusSql } from "./utils/eventVisibility.js";
import { escapeAttr, headersForRewrittenShell } from "./utils/ssrMeta.js";

const CURRENT_EVENT_MARKER = "<!-- current-event-links -->";

async function fetchShell(env, request) {
  const origin = new URL(request.url).origin;
  return env.ASSETS.fetch(new Request(`${origin}/`));
}

export async function onRequestGet(context) {
  const { env, request } = context;

  try {
    const assetResponse = await fetchShell(env, request);
    if (!assetResponse.ok) return env.ASSETS.fetch(request);

    const html = await assetResponse.text();
    if (!html.includes(CURRENT_EVENT_MARKER)) return env.ASSETS.fetch(request);

    const { results: events } = await env.DB.prepare(
      `SELECT slug, name
       FROM events
       WHERE ${publishedEventStatusSql()} AND NOT ${concludedEventSql()}
       ORDER BY date ASC
       LIMIT 5`,
    )
      .bind(eventLocalFestivalToday())
      .all();

    const links = events
      .map((event) => `<li><a href="/event/${escapeAttr(event.slug)}">${escapeAttr(event.name)}</a></li>`)
      .join("");
    // Policy headers (CSP, Cache-Control, ...) carried over unchanged; the
    // shell's ETag/Content-Length are NOT, because this body is different.
    const headers = headersForRewrittenShell(assetResponse.headers);

    return new Response(html.replace(CURRENT_EVENT_MARKER, links), {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  } catch (error) {
    console.error("Homepage event-link injection error:", error);
    return env.ASSETS.fetch(request);
  }
}
