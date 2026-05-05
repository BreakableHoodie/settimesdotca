import { checkPermission } from "../_middleware.js";

const MAX_BULK_PREVIEW_IDS = 200;

// Compute the new end time after shifting start time while preserving duration.
// Handles sets that span midnight (e.g. 23:40–00:10).
function computeNewEndTime(oldStart, oldEnd, newStart) {
  const toMins = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fromMins = (m) =>
    `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  let dur = toMins(oldEnd) - toMins(oldStart);
  if (dur < 0) dur += 24 * 60;
  return fromMins((toMins(newStart) + dur) % (24 * 60));
}

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

  if (band_ids.length > MAX_BULK_PREVIEW_IDS) {
    return new Response(
      JSON.stringify({
        error: `Maximum ${MAX_BULK_PREVIEW_IDS} band IDs allowed per preview`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const changes = [];
  const conflicts = [];

  // Get current band data
  const placeholders = band_ids.map(() => "?").join(",");
  const bands = await env.DB.prepare(
    `SELECT p.*, bp.name, v.name as venue_name, e.status as event_status, e.name as event_name
     FROM performances p
     JOIN band_profiles bp ON p.band_profile_id = bp.id
     LEFT JOIN venues v ON p.venue_id = v.id
     JOIN events e ON p.event_id = e.id
     WHERE p.id IN (${placeholders})`,
  )
    .bind(...band_ids)
    .all();

  const bandResults = bands.results || [];
  const mutableBandResults = bandResults.filter(
    (band) => band.event_status !== "archived",
  );

  bandResults
    .filter((band) => band.event_status === "archived")
    .forEach((band) => {
      conflicts.push({
        band_id: band.id,
        message: `"${band.name}" belongs to archived event "${band.event_name}" and cannot be changed in bulk.`,
        severity: "error",
      });
    });

  if (action === "move_venue") {
    const { venue_id } = params;
    const venue = await env.DB.prepare("SELECT name FROM venues WHERE id = ?")
      .bind(venue_id)
      .first();

    if (!venue) {
      return new Response(JSON.stringify({ error: "Target venue not found" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build changes list
    for (const band of mutableBandResults) {
      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_venue: band.venue_name,
        to_venue: venue.name,
      });
    }

    // Conflict detection: check for time overlaps at target venue
    for (const band of mutableBandResults) {
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
        const isExact =
          conflict.start_time === band.start_time &&
          conflict.end_time === band.end_time;
        conflicts.push({
          band_id: band.id,
          type: isExact ? "conflict" : "overlap",
          message: isExact
            ? `"${band.name}" has the exact same time as "${conflict.name}" at the new venue (${conflict.start_time}-${conflict.end_time})`
            : `"${band.name}" overlaps with "${conflict.name}" at new venue (${conflict.start_time}-${conflict.end_time})`,
          severity: "error",
        });
      });
    }
  } else if (action === "change_time") {
    const { start_time } = params;

    // Build changes list
    for (const band of mutableBandResults) {
      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_time: band.start_time,
        to_time: start_time,
      });
    }

    // Conflict detection: check for time overlaps at same venue using the
    // computed new end_time (preserving duration), not the old end_time.
    for (const band of mutableBandResults) {
      if (!band.start_time || !band.end_time || !band.venue_id) continue;

      const newEndTime = computeNewEndTime(
        band.start_time,
        band.end_time,
        start_time,
      );

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
          newEndTime,
          start_time,
          start_time,
          newEndTime,
        )
        .all();

      overlaps.results.forEach((conflict) => {
        const isExact =
          conflict.start_time === start_time &&
          conflict.end_time === newEndTime;
        conflicts.push({
          band_id: band.id,
          type: isExact ? "conflict" : "overlap",
          message: isExact
            ? `"${band.name}" has the exact same time as "${conflict.name}" at venue (${conflict.start_time}-${conflict.end_time})`
            : `"${band.name}" overlaps with "${conflict.name}" at venue (${conflict.start_time}-${conflict.end_time})`,
          severity: "error",
        });
      });
    }
  } else if (action === "delete") {
    // Build changes list for deletion
    for (const band of mutableBandResults) {
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
