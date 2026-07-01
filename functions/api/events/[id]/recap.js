import { getPublicDataGateResponse } from "../../../utils/publicGate.js";

/**
 * Public API: Get recap stats and band list for a single archived event
 *
 * GET /api/events/:id/recap
 *
 * Returns 404 if the event is not found or is not archived.
 * Accepts numeric ID or slug in params.id.
 */
export async function onRequestGet(context) {
  const { env, params } = context;

  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }

  const { DB } = env;

  // Resolve event by numeric ID or slug
  const rawId = params.id;
  const numericId = Number(rawId);
  const isNumeric = Number.isFinite(numericId) && String(numericId) === rawId;

  try {
    const event = isNumeric
      ? await DB.prepare(`SELECT id, name, slug, date FROM events WHERE id = ? AND status = 'archived' LIMIT 1`)
          .bind(numericId)
          .first()
      : await DB.prepare(`SELECT id, name, slug, date FROM events WHERE slug = ? AND status = 'archived' LIMIT 1`)
          .bind(rawId)
          .first();

    if (!event) {
      return new Response(JSON.stringify({ error: "Event not found or not archived" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const bandsResult = await DB.prepare(
      `
      SELECT
        bp.id   AS band_id,
        p.id    AS performance_id,
        bp.name AS band_name,
        bp.genre,
        bp.photo_url,
        p.start_time,
        p.end_time,
        v.id   AS venue_id,
        v.name AS venue_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM performances p2
          JOIN events e2 ON p2.event_id = e2.id
          WHERE p2.band_profile_id = bp.id
            AND p2.event_id != ?
            AND e2.status = 'archived'
        ) THEN 1 ELSE 0 END AS is_returning
      FROM performances p
      JOIN band_profiles bp ON p.band_profile_id = bp.id
      LEFT JOIN venues v ON p.venue_id = v.id
      WHERE p.event_id = ?
      ORDER BY p.start_time NULLS LAST, bp.name
      `,
    )
      .bind(event.id, event.id)
      .all();

    const rows = bandsResult.results || [];

    // Aggregate stats from rows
    const venueIds = new Set();
    let firstTimers = 0;
    let returningActs = 0;

    const bands = rows.map((row) => {
      if (row.venue_id) {
        venueIds.add(row.venue_id);
      }
      const isReturning = row.is_returning === 1;
      if (isReturning) {
        returningActs++;
      } else {
        firstTimers++;
      }

      return {
        id: row.band_id,
        performance_id: row.performance_id,
        name: row.band_name,
        genre: row.genre,
        photo_url: row.photo_url,
        start_time: row.start_time,
        end_time: row.end_time,
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        is_returning: isReturning,
      };
    });

    const stats = {
      total_sets: rows.length, // performance slots; one band playing two sets counts as 2
      venue_count: venueIds.size,
      first_timers: firstTimers,
      returning_acts: returningActs,
    };

    return new Response(JSON.stringify({ event, stats, bands }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching event recap:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch event recap" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
