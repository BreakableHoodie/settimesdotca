// Public API: venue directory
// GET /api/venues?q=<search>&limit=&offset=
//
// Lists venues that have hosted >=1 performance at a published or archived event,
// so venues are discoverable. Gated by PUBLIC_DATA_PUBLISH_ENABLED.

import { getPublicDataGateResponse } from "../utils/publicGate.js";
import { CACHE_BROWSE } from "../utils/cacheHeaders.js";
import { publicEventStatusSql } from "../utils/eventVisibility.js";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

function formatLocation(row) {
  const parts = [row.city, row.region].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }

  const { DB } = env;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);

  const parsedLimit = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const parsedOffset = Number.parseInt(url.searchParams.get("offset") || "", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  try {
    const rows = await DB.prepare(
      `
      SELECT
        v.id,
        v.name,
        v.city,
        v.region,
        COUNT(DISTINCT p.id) AS performance_count,
        COUNT(DISTINCT e.id) AS event_count
      FROM venues v
      JOIN performances p ON p.venue_id = v.id
      JOIN events e ON e.id = p.event_id
      WHERE ${publicEventStatusSql("e")}
        AND (
          ? = ''
          OR v.name LIKE ? ESCAPE '\\'
          OR v.city LIKE ? ESCAPE '\\'
        )
      GROUP BY v.id
      ORDER BY v.name COLLATE NOCASE
      LIMIT ? OFFSET ?
    `,
    )
      .bind(q, like, like, limit + 1, offset)
      .all();

    const results = rows.results || [];
    const hasMore = results.length > limit;
    const venues = results.slice(0, limit).map((row) => ({
      id: row.id,
      name: row.name,
      location: formatLocation(row),
      performance_count: row.performance_count,
      event_count: row.event_count,
    }));

    return new Response(JSON.stringify({ venues, hasMore }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": CACHE_BROWSE,
      },
    });
  } catch (error) {
    console.error("Error fetching venue directory:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch venues",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
