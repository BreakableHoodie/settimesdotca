import { getPublicDataGateResponse } from "../../../utils/publicGate.js";
import { normalizeHttpUrl } from "../../../utils/validation.js";

/**
 * Public API: Get event details (bands + venues) for a single published event
 *
 * GET /api/events/:id/details
 */

export async function onRequestGet(context) {
  const { env, params } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const { DB } = env;

  const formatVenueAddress = (venue) => {
    if (!venue) return null;
    const line1 = [venue.address_line1, venue.address_line2].filter(Boolean).join(", ");
    const line2 = [venue.city, venue.region].filter(Boolean).join(", ");
    const line3 = [venue.postal_code, venue.country].filter(Boolean).join(" ").trim();
    return [line1, line2, line3].filter(Boolean).join(", ");
  };

  const eventId = Number(params.id);
  if (!Number.isFinite(eventId)) {
    return new Response(JSON.stringify({ error: "Invalid event id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const event = await DB.prepare(
      `
      SELECT id, name, slug, date, ticket_url, status, reveal_mode
      FROM events
      WHERE id = ? AND (is_published = 1 OR status = 'archived')
      LIMIT 1
    `,
    )
      .bind(eventId)
      .first();

    if (!event) {
      return new Response(JSON.stringify({ error: "Event not found or not published" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Read-path sanitize (#504): a pre-validation legacy ticket_url (e.g. a
    // javascript: scheme) must not be reflected to this public, unauthenticated
    // endpoint — normalizeHttpUrl returns null for anything that isn't a real
    // http(s) URL.
    event.ticket_url = normalizeHttpUrl(event.ticket_url);

    const bandsResult = await DB.prepare(
      `
      SELECT
        p.id as performance_id,
        b.id as band_id,
        b.name as band_name,
        p.start_time,
        p.end_time,
        p.is_cancelled,
        b.genre,
        b.photo_url,
        v.id as venue_id,
        v.name as venue_name,
        v.address as venue_address,
        v.address_line1,
        v.address_line2,
        v.city,
        v.region,
        v.postal_code,
        v.country
      FROM performances p
      LEFT JOIN band_profiles b ON p.band_profile_id = b.id
      LEFT JOIN venues v ON p.venue_id = v.id
      WHERE p.event_id = ?
        AND (? = 0 OR p.is_announced = 1)
      ORDER BY p.start_time, v.name
    `,
    )
      .bind(eventId, event.reveal_mode ?? 0)
      .all();

    const rows = bandsResult.results || [];
    const venuesMap = new Map();
    // Distinct band ids across the whole event — a band playing two sets
    // must count once in band_count even though `bands` below stays
    // per-performance (the expanded lineup grid legitimately shows each set).
    const distinctBandIds = new Set();
    const bands = rows.map((row) => {
      if (row.band_id) {
        distinctBandIds.add(row.band_id);
      }

      // Per-venue band_count must also be distinct bands, not a per-row
      // tally — a band playing the same venue twice (two sets) must count
      // once. `bandIds` is stripped from the response below.
      if (row.venue_id) {
        if (!venuesMap.has(row.venue_id)) {
          venuesMap.set(row.venue_id, {
            id: row.venue_id,
            name: row.venue_name,
            address: row.venue_address || formatVenueAddress(row),
            band_count: 0,
            bandIds: new Set(),
          });
        }
        const venue = venuesMap.get(row.venue_id);
        if (row.band_id && !venue.bandIds.has(row.band_id)) {
          venue.bandIds.add(row.band_id);
          venue.band_count++;
        }
      }

      return {
        id: row.band_id,
        performance_id: row.performance_id,
        name: row.band_name,
        start_time: row.start_time,
        end_time: row.end_time,
        is_cancelled: row.is_cancelled,
        genre: row.genre,
        photo_url: row.photo_url,
        venue_id: row.venue_id,
        venue_name: row.venue_name,
      };
    });

    return new Response(
      JSON.stringify({
        event,
        bands,
        venues: Array.from(venuesMap.values()).map(({ bandIds: _bandIds, ...venue }) => venue),
        band_count: distinctBandIds.size,
        venue_count: venuesMap.size,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching event details:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch event details" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
