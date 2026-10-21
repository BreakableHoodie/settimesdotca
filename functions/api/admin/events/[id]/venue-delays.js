// The running-late state of every venue in an event, for the admin Lineup
// tab (#1249). GET /api/admin/events/{id}/venue-delays (viewer and above)
//
// Read fresh, not from /api/schedule: that response is cached for 60 s and
// leaves out drafts, so an operator who just tapped "+15" would reload and see
// the old delay. Every venue with a set at the event is listed, at 0 when it
// is on time, so the panel can offer each one.

import { checkPermission } from "../../_middleware.js";
import { validateId } from "../../../../utils/validation.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
  const { env, params } = context;
  const permCheck = await checkPermission(context, "viewer");
  if (permCheck.error) return permCheck.response;

  const eventIdCheck = validateId(params?.id);
  if (!eventIdCheck.valid) {
    return new Response(JSON.stringify({ error: "Bad request", message: "Invalid event ID" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    const result = await env.DB.prepare(
      `SELECT v.id AS venue_id, v.name AS venue, COALESCE(d.delay_minutes, 0) AS delay_minutes, d.updated_at
       FROM venues v
       LEFT JOIN event_venue_delays d ON d.event_id = ? AND d.venue_id = v.id
       WHERE v.id IN (SELECT venue_id FROM performances WHERE event_id = ? AND venue_id IS NOT NULL)
       ORDER BY v.name`,
    )
      .bind(eventIdCheck.value, eventIdCheck.value)
      .all();
    const delays = (result.results || []).map((row) => ({
      venueId: row.venue_id,
      venue: row.venue,
      minutes: row.delay_minutes,
      updatedAt: row.updated_at ?? null,
    }));
    return new Response(JSON.stringify({ delays }), { status: 200, headers: JSON_HEADERS });
  } catch (error) {
    console.error("Error reading venue delays:", { eventId: eventIdCheck.value, error: error?.message || error });
    return new Response(JSON.stringify({ error: "Database error", message: "Failed to read venue delays" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
