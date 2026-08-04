// Public API: venue detail
// GET /api/venues/:id
//
// Returns a venue plus its lineup (upcoming/past performances at published or
// archived events). Gated by PUBLIC_DATA_PUBLISH_ENABLED.

import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { validateId } from "../../utils/validation.js";
import { eventLocalFestivalToday } from "../../utils/eventDay.js";

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
        p.performance_date,
        p.is_cancelled,
        e.id AS event_id,
        e.name AS event_name,
        e.slug AS event_slug,
        e.date AS event_date,
        e.end_date AS event_end_date,
        e.status AS event_status,
        bp.id AS band_id,
        bp.name AS band_name
      FROM performances p
      JOIN events e ON e.id = p.event_id
      JOIN band_profiles bp ON bp.id = p.band_profile_id
      WHERE p.venue_id = ?
        AND (e.is_published = 1 OR e.status = 'archived')
        AND (e.reveal_mode = 0 OR p.is_announced = 1)
      -- Events newest-first, but sets CHRONOLOGICAL within an event (#741).
      -- Ordering on start_time alone put a day-3 16:10 set ahead of a day-1
      -- 20:00 set, because every set at one event shares e.date. The coalesce
      -- keeps single-day events (NULL performance_date) working unchanged.
      ORDER BY e.date DESC, COALESCE(p.performance_date, e.date) ASC, p.start_time
    `,
    )
      .bind(id)
      .all();

    const all = perfs.results || [];
    // (#750) Same bug class fixed in #732 for bands/[name].js and
    // bands/stats/[name].js: eventLocalToday() is the CALENDAR day, which
    // rolls over at local midnight while an after-midnight set (before
    // AFTER_MIDNIGHT_THRESHOLD_HOUR = 6, functions/utils/eventDay.js) is still
    // playing. eventLocalFestivalToday() stays on the previous date until
    // 06:00, so the split doesn't flip a still-airing performance to "past".
    const today = eventLocalFestivalToday();
    // Per-PERFORMANCE, not per-event (#603/#741): on a multi-day event each
    // set's OWN day decides its bucket, so a venue's day-1 set is already
    // "past" while its day-3 set is still "upcoming" mid-festival. NULL
    // performance_date inherits the event's start date (the #543 convention).
    const isPast = (p) => (p.performance_date || p.event_date) < today || p.event_status === "archived";

    const mapPerf = (p) => ({
      performance_id: p.performance_id,
      start_time: p.start_time,
      // Which DAY of a multi-day event this set belongs to. Without it every
      // set at one event reported the event's start date (#741).
      performance_date: p.performance_date,
      end_time: p.end_time,
      is_cancelled: p.is_cancelled,
      event_id: p.event_id,
      event_name: p.event_name,
      // NULL for single-day events. The client needs it to decide whether a
      // "(Day N)" suffix belongs at all (#540/#541).
      event_end_date: p.event_end_date || null,
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
