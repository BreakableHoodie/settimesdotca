import { auditLog, checkPermission } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";

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

  try {
    const body = await request.json();
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

    const performanceIds = band_ids.filter((id) => !id.toString().startsWith("profile_"));
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

    // Process deletions sequentially to handle logic per item
    for (const id of band_ids) {
      try {
        // Check if ID is a profile ID
        const isProfileDelete = id.toString().startsWith("profile_");
        
        if (isProfileDelete) {
            const bandProfileId = id.split("_")[1];
            
            // Check if any performances exist
            const perfCount = await DB.prepare("SELECT COUNT(*) as count FROM performances WHERE band_profile_id = ?").bind(bandProfileId).first();
            
            if (perfCount.count > 0) {
                errors.push(`Cannot delete profile ${id} because it has existing performances`);
                continue;
            }

            // Audit log
            await auditLog(env, user.userId, "band_profile.deleted", "band_profile", bandProfileId, { deletedBy: user.email, bulk: true }, ipAddress);

            // Delete profile
            await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(bandProfileId).run();
            deletedCount++;
        } else {
            // Delete performance
            // Check if band exists first to get name for audit log
            const performance = await DB.prepare(
                `SELECT p.*, bp.name FROM performances p JOIN band_profiles bp ON p.band_profile_id = bp.id WHERE p.id = ?`
            ).bind(id).first();

            if (performance) {
                // Audit log
                await auditLog(env, user.userId, "band.deleted", "band", id, { 
                    bandName: performance.name,
                    bulk: true 
                }, ipAddress);

                await DB.prepare("DELETE FROM performances WHERE id = ?").bind(id).run();
                deletedCount++;
            }
        }
      } catch (err) {
        console.error(`Failed to delete band ${id}:`, err);
        errors.push(`Failed to delete ${id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
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
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { band_profile_ids, event_id, venue_id, start_time, end_time } = body;

  if (!Array.isArray(band_profile_ids) || band_profile_ids.length === 0) {
    return new Response(
      JSON.stringify({ error: "Bad request", message: "band_profile_ids must be a non-empty array" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (band_profile_ids.length > MAX_BULK_BAND_IDS) {
    return new Response(
      JSON.stringify({ error: "Bad request", message: `Maximum ${MAX_BULK_BAND_IDS} IDs per request` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!event_id || !venue_id) {
    return new Response(
      JSON.stringify({ error: "Bad request", message: "event_id and venue_id are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate event exists and is not archived
  const event = await DB.prepare("SELECT id, status FROM events WHERE id = ?").bind(event_id).first();
  if (!event) {
    return new Response(
      JSON.stringify({ error: "Not found", message: "Event not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  if (event.status === "archived") {
    return new Response(
      JSON.stringify({ error: "Validation error", message: "Cannot add performances to an archived event" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate venue exists
  const venue = await DB.prepare("SELECT id FROM venues WHERE id = ?").bind(venue_id).first();
  if (!venue) {
    return new Response(
      JSON.stringify({ error: "Not found", message: "Venue not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const added = [];
  const skipped = [];
  const errors = [];

  for (const profileId of band_profile_ids) {
    try {
      const profile = await DB.prepare("SELECT id, name FROM band_profiles WHERE id = ?")
        .bind(profileId)
        .first();

      if (!profile) {
        errors.push(`Profile ${profileId} not found`);
        continue;
      }

      // Skip if already in this event (same profile + event)
      const existing = await DB.prepare(
        "SELECT id FROM performances WHERE band_profile_id = ? AND event_id = ?"
      ).bind(profileId, event_id).first();

      if (existing) {
        skipped.push(profile.name);
        continue;
      }

      const result = await DB.prepare(
        `INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time)
         VALUES (?, ?, ?, ?, ?) RETURNING id`
      ).bind(event_id, venue_id, profileId, start_time || null, end_time || null).first();

      await auditLog(env, user.userId, "band.added_to_lineup", "band", result.id, {
        bandName: profile.name, eventId: event_id, venueId: venue_id, bulk: true,
      }, ipAddress);

      added.push(profile.name);
    } catch (err) {
      console.error(`Failed to add profile ${profileId}:`, err);
      errors.push(`Failed to add profile ${profileId}`);
    }
  }

  return new Response(
    JSON.stringify({ success: true, added, skipped, errors: errors.length ? errors : undefined }),
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

  const { band_ids, action, ignore_conflicts, ...params } =
    await request.json();

  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (band_ids.length > MAX_BULK_BAND_IDS) {
    return new Response(
      JSON.stringify({ error: `Maximum ${MAX_BULK_BAND_IDS} band IDs allowed per request` }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const archivedPerformances = await getArchivedPerformancesByPerformanceIds(env.DB, band_ids);
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
        message: `Action must be one of: ${Array.from(allowedActions).join(
          ", "
        )}`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    let result;
    let rowsAffected = 0;

    if (action === "move_venue") {
      const { venue_id } = params;

      // Build batch update statements (ATOMIC - all or nothing)
      const statements = band_ids.map((id) =>
        env.DB.prepare("UPDATE performances SET venue_id = ? WHERE id = ?").bind(
          venue_id,
          id
        )
      );

      result = await env.DB.batch(statements);
      rowsAffected = result.reduce(
        (total, res) => total + (res.meta?.changes ?? 0),
        0
      );
    } else if (action === "change_time") {
      const { start_time } = params;

      // Preserve duration when changing time
      const statements = band_ids.map((id) =>
        env.DB.prepare(
          `
          UPDATE performances
          SET start_time = ?,
              end_time = datetime(?, '+' ||
                (strftime('%s', end_time) - strftime('%s', start_time)) || ' seconds')
          WHERE id = ?
        `
        ).bind(start_time, start_time, id)
      );

      result = await env.DB.batch(statements);
      rowsAffected = result.reduce(
        (total, res) => total + (res.meta?.changes ?? 0),
        0
      );
    } else if (action === "delete") {
      const placeholders = band_ids.map(() => "?").join(",");
      result = await env.DB.prepare(
        `DELETE FROM performances WHERE id IN (${placeholders})`
      )
        .bind(...band_ids)
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
        bandIds: band_ids,
        bandCount: band_ids.length,
        params,
      },
      ipAddress
    );

    return new Response(
      JSON.stringify({
        success: true,
        updated: rowsAffected,
        action: action,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
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
      }
    );
  }
}
