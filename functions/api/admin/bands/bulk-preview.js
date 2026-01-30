import { checkPermission } from "../_middleware.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // RBAC: Require editor role or higher (preview is for bulk edit operations)
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  const { band_ids, action, ...params } = await request.json();

  // Validate inputs
  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const changes = [];
  const conflicts = [];

  // Get current band data
  const placeholders = band_ids.map(() => "?").join(",");
  const bands = await env.DB.prepare(
    `SELECT p.*, bp.name, v.name as venue_name
     FROM performances p
     JOIN band_profiles bp ON p.band_profile_id = bp.id
     JOIN venues v ON p.venue_id = v.id
     WHERE p.id IN (${placeholders})`,
  )
    .bind(...band_ids)
    .all();

  if (action === "move_venue") {
    const { venue_id } = params;

    // Build changes list
    for (const band of bands.results) {
      const venue = await env.DB.prepare("SELECT name FROM venues WHERE id = ?")
        .bind(venue_id)
        .first();

      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_venue: band.venue_name,
        to_venue: venue.name,
      });
    }

    // Conflict detection: check for time overlaps at target venue
    for (const band of bands.results) {
      const overlaps = await env.DB.prepare(
        `
        SELECT bp.name, p.start_time, p.end_time
        FROM performances p
        JOIN band_profiles bp ON p.band_profile_id = bp.id
        WHERE p.venue_id = ?
          AND p.event_id = ?
          AND p.id NOT IN (${placeholders})
          AND (
            (p.start_time < ? AND p.end_time > ?) OR
            (p.start_time >= ? AND p.start_time < ?)
          )
      `,
      )
        .bind(
          venue_id,
          band.event_id,
          ...band_ids,
          band.end_time,
          band.start_time,
          band.start_time,
          band.end_time,
        )
        .all();

      overlaps.results.forEach((conflict) => {
        conflicts.push({
          band_id: band.id,
          message: `"${band.name}" overlaps with "${conflict.name}" at new venue (${conflict.start_time}-${conflict.end_time})`,
          severity: "error",
        });
      });
    }
  } else if (action === "change_time") {
    const { start_time } = params;

    // Build changes list
    for (const band of bands.results) {
      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_time: band.start_time,
        to_time: start_time,
      });
    }

    // Conflict detection: check for time overlaps at same venue
    for (const band of bands.results) {
      const overlaps = await env.DB.prepare(
        `
        SELECT bp.name, p.start_time, p.end_time
        FROM performances p
        JOIN band_profiles bp ON p.band_profile_id = bp.id
        WHERE p.venue_id = ?
          AND p.event_id = ?
          AND p.id NOT IN (${placeholders})
          AND (
            (p.start_time < ? AND p.end_time > ?) OR
            (p.start_time >= ? AND p.start_time < ?)
          )
      `,
      )
        .bind(
          band.venue_id,
          band.event_id,
          ...band_ids,
          band.end_time,
          start_time,
          start_time,
          band.end_time,
        )
        .all();

      overlaps.results.forEach((conflict) => {
        conflicts.push({
          band_id: band.id,
          message: `"${band.name}" overlaps with "${conflict.name}" at venue (${conflict.start_time}-${conflict.end_time})`,
          severity: "error",
        });
      });
    }
  } else if (action === "delete") {
    // Build changes list for deletion
    for (const band of bands.results) {
      changes.push({
        band_id: band.id,
        band_name: band.name,
        action: "delete",
      });
    }
  }

  return new Response(JSON.stringify({ success: true, changes, conflicts }), {
    headers: { "Content-Type": "application/json" },
  });
}

