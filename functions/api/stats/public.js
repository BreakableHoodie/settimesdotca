// Public API: privacy-safe aggregate platform stats
// GET /api/stats/public
//
// Returns counts, sums, and a top-N-by-popularity band list for the public
// stats page (social proof for the Vol-17 push). Gated by
// PUBLIC_DATA_PUBLISH_ENABLED, same as /api/venues and /api/artists.
//
// PRIVACY CONTRACT (see #462) — this endpoint must NEVER select or return any
// individual/PII/joinable-to-a-person field:
//   - band_follows has email, verification_token, unsubscribe_token, consent_ip.
//     Only ever `COUNT(*) WHERE verified = 1` against it — never SELECT those columns.
//   - share_links: COUNT and SUM(view_count) only — never slug/band_names/performance_ids.
//   - No IPs, emails, session IDs, tokens, or raw rows anywhere in the response.
// Bands/venues/events are public data, so their names/counts are fine.

import { getPublicDataGateResponse } from "../../utils/publicGate.js";

const TOP_BANDS_LIMIT = 8;

// Mirrors frontend/src/utils/slugify.js:slugifyBandName. Duplicated (not
// imported) because functions/ and frontend/ are separate build targets.
// This value is for API/display completeness only — the frontend builds its
// own band-page links via buildBandProfileHref(name), the same helper
// ArtistsPage uses, so a future change to the frontend slug algorithm can't
// silently break links here. Keep in sync if that algorithm changes.
function slugifyBandName(name = "") {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function onRequestGet(context) {
  const { env } = context;

  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }

  const { DB } = env;

  try {
    const [bandsRes, venuesRes, eventsRes, performancesRes, shareRes, followsRes, pageViewsRes, topBandsRes] =
      await DB.batch([
        DB.prepare(`SELECT COUNT(*) AS count FROM band_profiles WHERE is_active = 1`),
        DB.prepare(`SELECT COUNT(*) AS count FROM venues`),
        DB.prepare(`SELECT COUNT(*) AS count FROM events WHERE is_published = 1`),
        DB.prepare(
          `SELECT COUNT(*) AS count
           FROM performances p
           JOIN events e ON e.id = p.event_id
           WHERE e.is_published = 1`,
        ),
        // share_links: aggregate only — count of rows + sum of view_count.
        DB.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(view_count), 0) AS total_views FROM share_links`),
        // band_follows: verified-only count. Never select email/tokens/consent_ip.
        DB.prepare(`SELECT COUNT(*) AS count FROM band_follows WHERE verified = 1`),
        DB.prepare(`SELECT COALESCE(SUM(views), 0) AS total_views FROM page_views_daily`),
        // Top bands by popularity. The secondary ORDER BY key (name) makes this
        // degrade gracefully to alphabetical order pre-event, when
        // popularity_score is all zero.
        DB.prepare(
          `SELECT name, popularity_score
           FROM band_profiles
           WHERE is_active = 1
           ORDER BY popularity_score DESC, name COLLATE NOCASE ASC
           LIMIT ?`,
        ).bind(TOP_BANDS_LIMIT),
      ]);

    const topBands = (topBandsRes.results || []).map((row) => ({
      name: row.name,
      slug: slugifyBandName(row.name),
      score: Math.round(row.popularity_score || 0),
    }));

    const body = {
      bands: bandsRes.results?.[0]?.count || 0,
      venues: venuesRes.results?.[0]?.count || 0,
      events: eventsRes.results?.[0]?.count || 0,
      performances: performancesRes.results?.[0]?.count || 0,
      routes_shared: shareRes.results?.[0]?.count || 0,
      route_views: shareRes.results?.[0]?.total_views || 0,
      fans_following: followsRes.results?.[0]?.count || 0,
      page_views: pageViewsRes.results?.[0]?.total_views || 0,
      top_bands: topBands,
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error fetching public stats:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch stats",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
