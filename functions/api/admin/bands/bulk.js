import { auditLog, checkPermission } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";
import { computeNewEndTime } from "../../../utils/timeConflicts.js";
import { isValidTime, validateIdArray } from "../../../utils/validation.js";

const MAX_BULK_BAND_IDS = 200;

async function getArchivedPerformancesByPerformanceIds(DB, performanceIds) {
  if (!Array.isArray(performanceIds) || performanceIds.length === 0) {
    return [];
  }

  const placeholders = performanceIds.map(() => "?").join(",");
  const result = await DB.prepare(
    `SELECT p.id, bp.name, e.name AS event_name
     FROM performances p
     JOIN band_profiles bp ON p.band_profile_id = bp.id
     JOIN events e ON p.event_id = e.id
     WHERE p.id IN (${placeholders})
       AND e.status = 'archived'`,
  )
    .bind(...performanceIds)
    .all();

  return result.results || [];
}

// DELETE - Bulk delete bands
export async function onRequestDelete(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { band_ids } = body;

    if (!band_ids || !Array.isArray(band_ids) || band_ids.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "No band IDs provided",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (band_ids.length > MAX_BULK_BAND_IDS) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: `Maximum ${MAX_BULK_BAND_IDS} band IDs allowed per request`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const performanceIds = band_ids
      .filter((id) => !id.toString().startsWith("profile_"))
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    const archivedPerformances = await getArchivedPerformancesByPerformanceIds(DB, performanceIds);

    if (archivedPerformances.length > 0) {
      const lockedNames = archivedPerformances.map((performance) => performance.name).join(", ");
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: `Cannot delete performances from archived events: ${lockedNames}`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    let deletedCount = 0;
    const errors = [];

    // Separate IDs into two buckets and validate profile IDs are integers
    const validProfileIds = [];
    const invalidProfileRaws = [];
    for (const id of band_ids) {
      if (id.toString().startsWith("profile_")) {
        const n = Number(id.toString().split("_")[1]);
        if (Number.isInteger(n) && n > 0) {
          validProfileIds.push(n);
        } else {
          invalidProfileRaws.push(id);
        }
      }
    }
    for (const id of invalidProfileRaws) {
      errors.push(`Invalid profile ID: ${id}`);
    }

    // Pre-fetch performance counts for all valid profile IDs in one query
    const profileHasPerformances = new Map();
    if (validProfileIds.length > 0) {
      const ph = validProfileIds.map(() => "?").join(",");
      const counts = await DB.prepare(
        `SELECT band_profile_id, COUNT(*) as count FROM performances WHERE band_profile_id IN (${ph}) GROUP BY band_profile_id`,
      )
        .bind(...validProfileIds)
        .all();
      for (const row of counts.results || []) {
        profileHasPerformances.set(row.band_profile_id, row.count > 0);
      }
    }

    // Pre-fetch all performance records for performance IDs in one query
    const performanceMap = new Map();
    if (performanceIds.length > 0) {
      const ph = performanceIds.map(() => "?").join(",");
      const rows = await DB.prepare(
        `SELECT p.id, bp.name FROM performances p JOIN band_profiles bp ON p.band_profile_id = bp.id WHERE p.id IN (${ph})`,
      )
        .bind(...performanceIds)
        .all();
      for (const row of rows.results || []) {
        performanceMap.set(row.id, row);
      }
    }

    for (const id of band_ids) {
      try {
        if (id.toString().startsWith("profile_")) {
          const profileId = Number(id.toString().split("_")[1]);
          if (!Number.isInteger(profileId) || profileId <= 0) continue; // already pushed to errors above

          if (profileHasPerformances.get(profileId)) {
            errors.push(`Cannot delete profile ${id} because it has existing performances`);
            continue;
          }

          await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(profileId).run();
          await auditLog(
            env,
            user.userId,
            "band_profile.deleted",
            "band_profile",
            profileId,
            { deletedBy: user.email, bulk: true },
            ipAddress,
          );
          deletedCount++;
        } else {
          const performance = performanceMap.get(Number(id));
          if (performance) {
            await DB.prepare("DELETE FROM performances WHERE id = ?").bind(id).run();
            await auditLog(
              env,
              user.userId,
              "band.deleted",
              "band",
              id,
              { bandName: performance.name, bulk: true },
              ipAddress,
            );
            deletedCount++;
          }
        }
      } catch (err) {
        console.error("Failed to delete band", id, err);
        errors.push(`Failed to delete ${id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        message: `Deleted ${deletedCount} bands`,
        deletedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Bulk delete error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Bulk delete operation failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// POST - Bulk add artists from roster to an event lineup
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) return permCheck.response;

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { band_profile_ids, event_id, venue_id, start_time, end_time } = body;

  if (!Array.isArray(band_profile_ids) || band_profile_ids.length === 0) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: "band_profile_ids must be a non-empty array",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (band_profile_ids.length > MAX_BULK_BAND_IDS) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: `Maximum ${MAX_BULK_BAND_IDS} IDs per request`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!event_id) {
    return new Response(JSON.stringify({ error: "Bad request", message: "event_id is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resolvedVenueId = venue_id ? Number(venue_id) : null;

  if ((start_time || end_time) && !resolvedVenueId) {
    return new Response(
      JSON.stringify({
        error: "Bad request",
        message: "A venue is required when setting a start or end time",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate event exists and is not archived
  const event = await DB.prepare("SELECT id, status FROM events WHERE id = ?").bind(event_id).first();
  if (!event) {
    return new Response(JSON.stringify({ error: "Not found", message: "Event not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (event.status === "archived") {
    return new Response(
      JSON.stringify({
        error: "Validation error",
        message: "Cannot add performances to an archived event",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate venue exists only if provided
  if (resolvedVenueId) {
    const venue = await DB.prepare("SELECT id FROM venues WHERE id = ?").bind(resolvedVenueId).first();
    if (!venue) {
      return new Response(JSON.stringify({ error: "Not found", message: "Venue not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const added = [];
  const skipped = [];
  const errors = [];

  // Pre-fetch all band profiles in one query
  const profilePh = band_profile_ids.map(() => "?").join(",");
  const profileRows = await DB.prepare(`SELECT id, name FROM band_profiles WHERE id IN (${profilePh})`)
    .bind(...band_profile_ids)
    .all();
  const profileMap = new Map((profileRows.results || []).map((p) => [p.id, p]));

  // Pre-fetch which profiles already have a performance in this event
  const alreadyInEvent = new Set();
  if (band_profile_ids.length > 0) {
    const existingRows = await DB.prepare(
      `SELECT band_profile_id FROM performances WHERE band_profile_id IN (${profilePh}) AND event_id = ?`,
    )
      .bind(...band_profile_ids, event_id)
      .all();
    for (const row of existingRows.results || []) {
      alreadyInEvent.add(row.band_profile_id);
    }
  }

  for (const profileId of band_profile_ids) {
    try {
      const numProfileId = Number(profileId);
      const profile = profileMap.get(numProfileId);
      if (!profile) {
        errors.push(`Profile ${profileId} not found`);
        continue;
      }

      if (alreadyInEvent.has(numProfileId)) {
        skipped.push(profile.name);
        continue;
      }

      const result = await DB.prepare(
        `INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(event_id, resolvedVenueId, numProfileId, start_time || null, end_time || null)
        .first();

      await auditLog(
        env,
        user.userId,
        "band.added_to_lineup",
        "band",
        result.id,
        { bandName: profile.name, eventId: event_id, venueId: resolvedVenueId, bulk: true },
        ipAddress,
      );

      // Track the newly inserted profile so duplicate IDs in this request are skipped
      alreadyInEvent.add(numProfileId);
      added.push(profile.name);
    } catch (err) {
      console.error("Failed to add profile", profileId, err);
      errors.push(`Failed to add profile ${profileId}`);
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      added,
      skipped,
      errors: errors.length ? errors : undefined,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
}

// PATCH - Bulk update bands (existing functionality)
export async function onRequestPatch(context) {
  const { request, env } = context;

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { band_ids, action, ignore_conflicts, ...params } = body;

  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (band_ids.length > MAX_BULK_BAND_IDS) {
    return new Response(
      JSON.stringify({
        error: `Maximum ${MAX_BULK_BAND_IDS} band IDs allowed per request`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const idValidation = validateIdArray(band_ids, { maxLength: MAX_BULK_BAND_IDS });
  if (!idValidation.valid) {
    return new Response(JSON.stringify({ error: "Invalid band_ids", message: idValidation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const validatedBandIds = idValidation.values;

  const archivedPerformances = await getArchivedPerformancesByPerformanceIds(env.DB, validatedBandIds);
  if (archivedPerformances.length > 0) {
    const lockedNames = archivedPerformances.map((performance) => performance.name).join(", ");
    return new Response(
      JSON.stringify({
        error: "Validation error",
        message: `Cannot modify performances from archived events: ${lockedNames}`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const allowedActions = new Set(["move_venue", "change_time", "delete"]);
  if (!allowedActions.has(action)) {
    return new Response(
      JSON.stringify({
        error: "Invalid action",
        message: `Action must be one of: ${Array.from(allowedActions).join(", ")}`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    let result;
    let rowsAffected = 0;

    if (action === "move_venue") {
      const { venue_id } = params;

      const venueExists = await env.DB.prepare("SELECT id FROM venues WHERE id = ?").bind(venue_id).first();
      if (!venueExists) {
        return new Response(JSON.stringify({ error: "Not found", message: "Venue not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Build batch update statements (ATOMIC - all or nothing)
      const statements = validatedBandIds.map((id) =>
        env.DB.prepare("UPDATE performances SET venue_id = ? WHERE id = ?").bind(venue_id, id),
      );

      result = await env.DB.batch(statements);
      rowsAffected = result.reduce((total, res) => total + (res.meta?.changes ?? 0), 0);
    } else if (action === "change_time") {
      const { start_time } = params;

      if (!isValidTime(start_time).valid) {
        return new Response(JSON.stringify({ error: "Bad request", message: "start_time must be in HH:MM format" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Fetch current times so we can compute new end_time in JS.
      // The SQLite strftime arithmetic produces null/negative values for
      // after-midnight sets (e.g. 23:30–00:30), so we do this in JS instead.
      const placeholders = validatedBandIds.map(() => "?").join(",");
      const { results: currentPerfs } = await env.DB.prepare(
        `SELECT id, start_time, end_time FROM performances WHERE id IN (${placeholders})`,
      )
        .bind(...validatedBandIds)
        .all();

      const statements = currentPerfs.map((perf) => {
        const newEnd =
          perf.start_time && perf.end_time ? computeNewEndTime(perf.start_time, perf.end_time, start_time) : null;
        return env.DB.prepare("UPDATE performances SET start_time = ?, end_time = ? WHERE id = ?").bind(
          start_time,
          newEnd,
          perf.id,
        );
      });

      result = await env.DB.batch(statements);
      rowsAffected = result.reduce((total, res) => total + (res.meta?.changes ?? 0), 0);
    } else if (action === "delete") {
      const placeholders = validatedBandIds.map(() => "?").join(",");
      result = await env.DB.prepare(`DELETE FROM performances WHERE id IN (${placeholders})`)
        .bind(...validatedBandIds)
        .run();
      rowsAffected = result.meta?.changes ?? 0;
    }

    // Audit log the bulk operation
    await auditLog(
      env,
      user.userId,
      `band.bulk_${action}`,
      "band",
      null,
      {
        action,
        bandIds: validatedBandIds,
        bandCount: validatedBandIds.length,
        params,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        updated: rowsAffected,
        action: action,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Bulk operation failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Database operation failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
