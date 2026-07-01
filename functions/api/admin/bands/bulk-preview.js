import { checkPermission } from "../_middleware.js";
import { detectBulkConflicts } from "../../../utils/timeConflicts.js";
import { validateIdArray, isValidTime } from "../../../utils/validation.js";

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
  const mutableBandResults = bandResults.filter((band) => band.event_status !== "archived");

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
    const venue = await env.DB.prepare("SELECT name FROM venues WHERE id = ?").bind(venue_id).first();

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

    // Scheduling conflict detection via shared utility (handles after-midnight sets).
    const schedulingConflicts = await detectBulkConflicts(env, {
      action,
      bandIds: validatedBandIds,
      params: { venue_id },
    });
    conflicts.push(...schedulingConflicts);
  } else if (action === "change_time") {
    const { start_time } = params;

    const timeValidation = isValidTime(start_time);
    if (!timeValidation.valid) {
      return new Response(JSON.stringify({ error: timeValidation.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Build changes list
    for (const band of mutableBandResults) {
      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_time: band.start_time,
        to_time: start_time,
      });
    }

    // Scheduling conflict detection via shared utility (handles after-midnight sets).
    const schedulingConflicts = await detectBulkConflicts(env, {
      action,
      bandIds: validatedBandIds,
      params: { start_time },
    });
    conflicts.push(...schedulingConflicts);
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
