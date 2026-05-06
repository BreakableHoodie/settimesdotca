import { checkPermission } from "../_middleware.js";
import { buildIntervals, computeNewEndTime, intervalsOverlap } from "../../../utils/timeConflicts.js";
import { validateIdArray } from "../../../utils/validation.js";

const MAX_BULK_PREVIEW_IDS = 200;

export async function onRequestPost(context) {
  const { request, env } = context;

  // RBAC: Require editor role or higher (preview is for bulk edit operations)
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  let band_ids, action, params;
  try {
    ({ band_ids, action, ...params } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  const idValidation = validateIdArray(band_ids, { maxLength: MAX_BULK_PREVIEW_IDS });
  if (!idValidation.valid) {
    return new Response(JSON.stringify({ error: "Invalid band_ids", message: idValidation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const validatedBandIds = idValidation.values;

  const changes = [];
  const conflicts = [];

  // Get current band data
  const placeholders = validatedBandIds.map(() => "?").join(",");
  const bands = await env.DB.prepare(
    `SELECT p.*, bp.name, v.name as venue_name, e.status as event_status, e.name as event_name
     FROM performances p
     JOIN band_profiles bp ON p.band_profile_id = bp.id
     LEFT JOIN venues v ON p.venue_id = v.id
     JOIN events e ON p.event_id = e.id
     WHERE p.id IN (${placeholders})`,
  )
    .bind(...validatedBandIds)
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

    // Conflict detection: fetch all existing performances at target venue per event,
    // then check for overlaps in JS (handles after-midnight sets correctly).
    const eventIds = [...new Set(mutableBandResults.map((b) => b.event_id))];
    const venuePerformancesByEvent = new Map();
    for (const eventId of eventIds) {
      const rows = await env.DB.prepare(
        `SELECT p.id, p.start_time, p.end_time, bp.name
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         WHERE p.venue_id = ? AND p.event_id = ? AND p.id NOT IN (${placeholders})`,
      )
        .bind(venue_id, eventId, ...validatedBandIds)
        .all();
      venuePerformancesByEvent.set(eventId, rows.results || []);
    }

    for (const band of mutableBandResults) {
      if (!band.start_time || !band.end_time) continue;
      const bandIntervals = buildIntervals(band.start_time, band.end_time);
      const existing = venuePerformancesByEvent.get(band.event_id) || [];
      for (const other of existing) {
        if (!other.start_time || !other.end_time) continue;
        const otherIntervals = buildIntervals(other.start_time, other.end_time);
        if (bandIntervals.some(a => otherIntervals.some(b => intervalsOverlap(a, b)))) {
          const isExact =
            other.start_time === band.start_time &&
            other.end_time === band.end_time;
          conflicts.push({
            band_id: band.id,
            type: isExact ? "conflict" : "overlap",
            message: isExact
              ? `"${band.name}" has the exact same time as "${other.name}" at the new venue (${other.start_time}-${other.end_time})`
              : `"${band.name}" overlaps with "${other.name}" at new venue (${other.start_time}-${other.end_time})`,
            severity: "error",
          });
        }
      }
    }

    // Check pairs within the batch for conflicts at the new venue.
    // The pre-existing query excludes all batch members to avoid false positives from
    // their current positions, so batch members are invisible to each other. We must
    // compare them pairwise here. One entry per pair (not two mirror entries) to avoid
    // duplicate messages in the preview modal.
    for (let i = 0; i < mutableBandResults.length; i++) {
      const bandA = mutableBandResults[i];
      if (!bandA.start_time || !bandA.end_time) continue;
      const intervalsA = buildIntervals(bandA.start_time, bandA.end_time);

      for (let j = i + 1; j < mutableBandResults.length; j++) {
        const bandB = mutableBandResults[j];
        if (!bandB.start_time || !bandB.end_time) continue;
        if (bandA.event_id !== bandB.event_id) continue;

        const intervalsB = buildIntervals(bandB.start_time, bandB.end_time);
        if (!intervalsA.some((a) => intervalsB.some((b) => intervalsOverlap(a, b)))) continue;

        const isExact = bandA.start_time === bandB.start_time && bandA.end_time === bandB.end_time;
        conflicts.push({
          band_id: bandA.id,
          type: isExact ? "conflict" : "overlap",
          message: isExact
            ? `"${bandA.name}" and "${bandB.name}" have the exact same time (both being moved to ${venue.name})`
            : `"${bandA.name}" and "${bandB.name}" overlap (both being moved to ${venue.name})`,
          severity: "error",
        });
      }
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

    // Conflict detection: fetch existing performances at each band's venue per event,
    // then check overlaps in JS using computeNewEndTime (preserves duration, handles midnight).
    const changeTimeVenueKey = (venueId, eventId) => `${venueId}:${eventId}`;
    const changeTimeCache = new Map();

    for (const band of mutableBandResults) {
      if (!band.start_time || !band.end_time || !band.venue_id) continue;

      const newEndTime = computeNewEndTime(band.start_time, band.end_time, start_time);
      const cacheKey = changeTimeVenueKey(band.venue_id, band.event_id);

      if (!changeTimeCache.has(cacheKey)) {
        const rows = await env.DB.prepare(
          `SELECT p.id, p.start_time, p.end_time, bp.name
           FROM performances p
           JOIN band_profiles bp ON p.band_profile_id = bp.id
           WHERE p.venue_id = ? AND p.event_id = ? AND p.id NOT IN (${placeholders})`,
        )
          .bind(band.venue_id, band.event_id, ...validatedBandIds)
          .all();
        changeTimeCache.set(cacheKey, rows.results || []);
      }

      const existing = changeTimeCache.get(cacheKey);
      const bandIntervals = buildIntervals(start_time, newEndTime);

      for (const other of existing) {
        if (!other.start_time || !other.end_time) continue;
        const otherIntervals = buildIntervals(other.start_time, other.end_time);
        if (bandIntervals.some(a => otherIntervals.some(b => intervalsOverlap(a, b)))) {
          const isExact =
            other.start_time === start_time && other.end_time === newEndTime;
          conflicts.push({
            band_id: band.id,
            type: isExact ? "conflict" : "overlap",
            message: isExact
              ? `"${band.name}" has the exact same time as "${other.name}" at venue (${other.start_time}-${other.end_time})`
              : `"${band.name}" overlaps with "${other.name}" at venue (${other.start_time}-${other.end_time})`,
            severity: "error",
          });
        }
      }
    }

    // Check pairs that share venue+event — both receive the same new start_time so they
    // will always overlap at minimum. The pre-existing cache excludes all batch members,
    // making them invisible to each other. One entry per pair to avoid duplicate messages
    // in the preview modal.
    for (let i = 0; i < mutableBandResults.length; i++) {
      const bandA = mutableBandResults[i];
      if (!bandA.start_time || !bandA.end_time || !bandA.venue_id) continue;

      for (let j = i + 1; j < mutableBandResults.length; j++) {
        const bandB = mutableBandResults[j];
        if (!bandB.start_time || !bandB.end_time || !bandB.venue_id) continue;
        if (bandA.venue_id !== bandB.venue_id || bandA.event_id !== bandB.event_id) continue;

        const newEndA = computeNewEndTime(bandA.start_time, bandA.end_time, start_time);
        const newEndB = computeNewEndTime(bandB.start_time, bandB.end_time, start_time);
        const intervalsA = buildIntervals(start_time, newEndA);
        const intervalsB = buildIntervals(start_time, newEndB);
        if (!intervalsA.some((a) => intervalsB.some((b) => intervalsOverlap(a, b)))) continue;

        const isExact = newEndA === newEndB;
        conflicts.push({
          band_id: bandA.id,
          type: isExact ? "conflict" : "overlap",
          message: isExact
            ? `"${bandA.name}" and "${bandB.name}" have the exact same time at venue after time change`
            : `"${bandA.name}" and "${bandB.name}" overlap at venue after time change`,
          severity: "error",
        });
      }
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
