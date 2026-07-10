// Public API: venue detail
// GET /api/venues/:id
//
// Returns a venue plus its lineup (upcoming/past performances at published or
// archived events). Gated by PUBLIC_DATA_PUBLISH_ENABLED.

import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { validateId } from "../../utils/validation.js";
import { eventLocalToday } from "../../utils/eventDay.js";

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

function formatLocation(v) {
  const parts = [v.city, v.region].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function formatAddress(v) {
  const cityRegion = [v.city, v.region].filter(Boolean).join(", ");
  const parts = [v.address_line1, v.address_line2, cityRegion, v.postal_code].filter(Boolean);
  return parts.length ? parts.join(", ") : v.address || null;
}

export async function onRequestGet(context) {
  const { params, env } = context;

  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }

  const { DB } = env;
  const { valid, value: id } = validateId(params.id);
  if (!valid) {
    return json({ error: "Invalid venue id" }, 400);
  }

  try {
    const venue = await DB.prepare("SELECT * FROM venues WHERE id = ?").bind(id).first();
    if (!venue) {
      return json({ error: "Venue not found" }, 404);
    }

    const perfs = await DB.prepare(
      `
      SELECT
        p.id AS performance_id,
        p.start_time,
        p.end_time,
        e.id AS event_id,
        e.name AS event_name,
        e.slug AS event_slug,
        e.date AS event_date,
        e.status AS event_status,
        bp.id AS band_id,
        bp.name AS band_name
      FROM performances p
      JOIN events e ON e.id = p.event_id
      JOIN band_profiles bp ON bp.id = p.band_profile_id
      WHERE p.venue_id = ?
        AND (e.is_published = 1 OR e.status = 'archived')
        AND (e.reveal_mode = 0 OR p.is_announced = 1)
      ORDER BY e.date DESC, p.start_time
    `,
    )
      .bind(id)
      .all();

    const all = perfs.results || [];
    const today = eventLocalToday();
    const isPast = (p) => p.event_date < today || p.event_status === "archived";

    const mapPerf = (p) => ({
      performance_id: p.performance_id,
      start_time: p.start_time,
      end_time: p.end_time,
      event_id: p.event_id,
      event_name: p.event_name,
      event_slug: p.event_slug,
      event_date: p.event_date,
      band_id: p.band_id,
      band_name: p.band_name,
    });

    return json(
      {
        venue: {
          id: venue.id,
          name: venue.name,
          location: formatLocation(venue),
          address: formatAddress(venue),
          website: venue.website || null,
          instagram: venue.instagram || null,
          facebook: venue.facebook || null,
          performance_count: all.length,
          event_count: new Set(all.map((p) => p.event_id)).size,
        },
        upcoming: all.filter((p) => !isPast(p)).map(mapPerf),
        past: all.filter(isPast).map(mapPerf),
      },
      200,
      { "Cache-Control": "public, max-age=300" },
    );
  } catch (error) {
    console.error("Error fetching venue:", error);
    return json({ error: "Database error", message: "Failed to fetch venue" }, 500);
  }
}
