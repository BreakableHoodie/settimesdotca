// Public API: artist directory
// GET /api/artists?q=<search>&limit=&offset=
//
// Lists band profiles that have performed at >=1 published or archived event,
// so artists are discoverable outside of a specific event. Gated by the same
// PUBLIC_DATA_PUBLISH_ENABLED switch as the rest of the public data.

import { getPublicDataGateResponse } from "../utils/publicGate.js";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

function formatOrigin(row) {
  const parts = [row.origin_city, row.origin_region].filter(Boolean);
  return parts.length ? parts.join(", ") : row.origin || null;
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

  // Escape LIKE wildcards in user input so a literal % / _ isn't treated as one.
  const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

  try {
    // Fetch one extra row to compute hasMore without a separate COUNT query.
    const rows = await DB.prepare(
      `
      SELECT
        bp.id,
        bp.name,
        bp.photo_url,
        bp.photo_alt_text,
        bp.genre,
        bp.origin,
        bp.origin_city,
        bp.origin_region,
        COUNT(DISTINCT p.id) AS performance_count
      FROM band_profiles bp
      JOIN performances p ON p.band_profile_id = bp.id
      JOIN events e ON e.id = p.event_id
      WHERE (e.is_published = 1 OR e.status = 'archived')
        AND (
          ? = ''
          OR bp.name LIKE ? ESCAPE '\\'
          OR bp.genre LIKE ? ESCAPE '\\'
        )
      GROUP BY bp.id
      ORDER BY bp.name COLLATE NOCASE
      LIMIT ? OFFSET ?
    `,
    )
      .bind(q, like, like, limit + 1, offset)
      .all();

    const results = rows.results || [];
    const hasMore = results.length > limit;
    const artists = results.slice(0, limit).map((row) => ({
      id: row.id,
      name: row.name,
      photo_url: row.photo_url,
      photo_alt_text: row.photo_alt_text,
      genre: row.genre,
      origin: formatOrigin(row),
      performance_count: row.performance_count,
    }));

    return new Response(JSON.stringify({ artists, hasMore }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error fetching artists directory:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch artists",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
