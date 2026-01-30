// Admin specific band operations
// PUT /api/admin/bands/{id} - Update band
// DELETE /api/admin/bands/{id} - Delete band

import { checkPermission, auditLog } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";

// Helper to extract band ID from path
function getBandId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("bands") + 1;
  return parts[idIndex];
}

// Helper to normalize band name
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper to check for time conflicts (supports sets that cross midnight)
async function checkConflicts(
  DB,
  eventId,
  venueId,
  startTime,
  endTime,
  excludePerformanceId = null,
) {
  const conflicts = [];

  // Convert HH:MM to minutes for easier comparison
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const normalizeEndMinutes = (startMinutes, endMinutes) => {
    return endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
  };

  const buildIntervals = (start, end) => {
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    const normalizedEnd = normalizeEndMinutes(startMinutes, endMinutes);
    return [
      [startMinutes, normalizedEnd],
      [startMinutes + 24 * 60, normalizedEnd + 24 * 60],
    ];
  };

  const query = excludePerformanceId
    ? `SELECT p.id, p.start_time, p.end_time, bp.name
       FROM performances p
       JOIN band_profiles bp ON p.band_profile_id = bp.id
       WHERE p.event_id = ? AND p.venue_id = ? AND p.id != ?`
    : `SELECT p.id, p.start_time, p.end_time, bp.name
       FROM performances p
       JOIN band_profiles bp ON p.band_profile_id = bp.id
       WHERE p.event_id = ? AND p.venue_id = ?`;

  const bindings = excludePerformanceId
    ? [eventId, venueId, excludePerformanceId]
    : [eventId, venueId];

  const result = await DB.prepare(query)
    .bind(...bindings)
    .all();
  const existingBands = result.results || [];

  const intervalsOverlap = (intervalA, intervalB) =>
    intervalA[0] < intervalB[1] && intervalB[0] < intervalA[1];

  const newIntervals = buildIntervals(startTime, endTime);

  for (const band of existingBands) {
    const bandIntervals = buildIntervals(band.start_time, band.end_time);
    const hasOverlap = bandIntervals.some((intervalB) =>
      newIntervals.some((intervalA) => intervalsOverlap(intervalA, intervalB)),
    );

    if (hasOverlap) {
      conflicts.push({
        id: band.id,
        name: band.name,
        startTime: band.start_time,
        endTime: band.end_time,
      });
    }
  }

  return conflicts;
}

// PUT - Update band
export async function onRequestPut(context) {
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
    const performanceId = getBandId(request);
    
    // Check if ID is a profile ID (starts with "profile_")
    const isProfileUpdate = performanceId.toString().startsWith("profile_");

    if ((!performanceId || isNaN(performanceId)) && !isProfileUpdate) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid band ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { 
      venueId, name, startTime, endTime, url,
      description, genre, origin, photo_url, social_links 
    } = body;
    let realPerformanceId = performanceId;
    let bandProfileId = null;

    if (isProfileUpdate) {
        bandProfileId = performanceId.split("_")[1];
        realPerformanceId = null;
    }

    let performance = null;

    if (!isProfileUpdate) {
        // Check if performance exists
        performance = await DB.prepare(
        `
        SELECT p.*, bp.name, bp.social_links, bp.id as band_profile_id
        FROM performances p
        JOIN band_profiles bp ON p.band_profile_id = bp.id
        WHERE p.id = ?
        `,
        )
        .bind(realPerformanceId)
        .first();

        if (!performance) {
            return new Response(
                JSON.stringify({ error: "Not found", message: "Band performance not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } },
            );
        }
        bandProfileId = performance.band_profile_id;
    } else {
        // Fetch profile directly
        const profile = await DB.prepare(
            "SELECT * FROM band_profiles WHERE id = ?"
        ).bind(bandProfileId).first();

        if (!profile) {
             return new Response(
                JSON.stringify({ error: "Not found", message: "Band profile not found" }),
                { status: 404, headers: { "Content-Type": "application/json" } },
            );
        }
        // Mock performance object with profile data for downstream logic
        performance = {
            band_profile_id: bandProfileId,
            name: profile.name,
            social_links: profile.social_links,
            // other fields null
        };
    }

    // Validation - only validate provided fields
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Band name cannot be empty",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Check for duplicate band name (excluding current band)
      // In new schema, multiple performances can have same band name (same profile)
      // But we probably want to avoid renaming a profile to a name that exists as ANOTHER profile?
      // Or maybe we just switch profile?
      // For now, let's just update the profile name if it's unique, or switch if it exists.
      
      const nameNormalized = normalizeName(name);
      const existingProfile = await DB.prepare(
        `SELECT id FROM band_profiles WHERE name_normalized = ? AND id != ?`
      )
        .bind(nameNormalized, performance.band_profile_id)
        .first();

      if (existingProfile) {
         // If we are renaming to an existing band, we should probably switch this performance to that band profile
         // But that's a big change.
         // Let's stick to the previous behavior: warn about duplicate?
         // But wait, duplicate names are allowed in performances (same band, different event).
         // The previous check was:
         // SELECT id, name FROM bands WHERE LOWER(name) = LOWER(?) AND id != ?
         // This prevented TWO bands with same name in the `bands` table.
         // But `bands` table mixed performance and profile.
         
         // In new schema, we WANT to reuse profiles.
         // So if I rename "Band A" to "Band B", and "Band B" exists, I should link to "Band B".
         // But `onRequestPut` is updating a specific performance.
         
         // Let's just update the profile name for now, but warn if it conflicts?
         // Actually, if we update the profile name, it affects ALL performances of this band.
         // This might be unintended.
         // Ideally, we should check if the user intends to rename the BAND (globally) or change the band for this PERFORMANCE.
         // Given the API is `PUT /bands/{id}`, it implies updating this specific entity.
         
         // Let's assume we update the profile name.
      }
    }

    // Validate time format (only if times are provided)
    if (startTime !== undefined && !/^\d{2}:\d{2}$/.test(startTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid start time format. Use HH:MM (24-hour format)",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (endTime !== undefined && !/^\d{2}:\d{2}$/.test(endTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid end time format. Use HH:MM (24-hour format)",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Determine actual times to use (provided or existing)
    const actualStartTime = startTime !== undefined ? startTime : performance.start_time;
    const actualEndTime = endTime !== undefined ? endTime : performance.end_time;
    const actualVenueId = venueId !== undefined ? venueId : performance.venue_id;

    // Validate times (allow sets that cross midnight; prevent zero-length sets)
    if (actualStartTime && actualEndTime && actualStartTime === actualEndTime) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Start and end time cannot be the same",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if venue exists (only if venueId is being changed)
    if (venueId !== undefined && venueId !== null) {
      const venue = await DB.prepare(
        `
        SELECT id FROM venues WHERE id = ?
      `,
      )
        .bind(venueId)
        .first();

      if (!venue) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Venue not found",
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Check for conflicts only if we have all required scheduling fields
    let conflicts = [];
    if (actualVenueId && actualStartTime && actualEndTime && performance.event_id) {
      conflicts = await checkConflicts(
        DB,
        performance.event_id,
        actualVenueId,
        actualStartTime,
        actualEndTime,
        performanceId,
      );
    }

    if (conflicts.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Time conflict detected",
          message: "This time overlaps another set at the same venue.",
          conflicts,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Build dynamic update query based on provided fields
    const updates = [];
    const params = [];

    // Handle profile updates (name, url, and other profile fields)
    if (
      name !== undefined || 
      url !== undefined || 
      description !== undefined || 
      genre !== undefined || 
      origin !== undefined || 
      photo_url !== undefined ||
      social_links !== undefined
    ) {
        const profileUpdates = [];
        const profileParams = [];
        
        if (name !== undefined) {
            profileUpdates.push("name = ?");
            profileUpdates.push("name_normalized = ?");
            profileParams.push(name);
            profileParams.push(normalizeName(name));
        }
        
        // Update other profile fields
        if (description !== undefined) {
            profileUpdates.push("description = ?");
            profileParams.push(description);
        }
        if (genre !== undefined) {
            profileUpdates.push("genre = ?");
            profileParams.push(genre);
        }
        if (origin !== undefined) {
            profileUpdates.push("origin = ?");
            profileParams.push(origin);
        }
        if (photo_url !== undefined) {
            profileUpdates.push("photo_url = ?");
            profileParams.push(photo_url);
        }

        // Handle Social Links (merge or overwrite?)
        // The frontend sends a JSON string for social_links usually.
        // Or if 'url' is sent legacy style, we merge it.
        
        let newSocialLinks = null;
        if (social_links !== undefined) {
           newSocialLinks = social_links; // Assume string or object? Frontend sends string.
        } else if (url !== undefined) {
            // Legacy update of just website
            let existingLinks = {};
            try {
                const profile = await DB.prepare("SELECT social_links FROM band_profiles WHERE id = ?").bind(performance.band_profile_id).first();
                existingLinks = JSON.parse(profile.social_links || '{}');
            } catch (e) {}
            existingLinks.website = url;
            newSocialLinks = JSON.stringify(existingLinks);
        }

        if (newSocialLinks !== null) {
            profileUpdates.push("social_links = ?");
            profileParams.push(newSocialLinks);
        }
        
        if (profileUpdates.length > 0) {
            profileParams.push(performance.band_profile_id);
            await DB.prepare(`UPDATE band_profiles SET ${profileUpdates.join(", ")} WHERE id = ?`).bind(...profileParams).run();
        }
    }

    // Handle performance updates (ONLY if it's a real performance)
    if (!isProfileUpdate) {
        if (venueId !== undefined) {
        updates.push("venue_id = ?");
        params.push(venueId);
        }
        if (startTime !== undefined) {
        updates.push("start_time = ?");
        params.push(startTime);
        }
        if (endTime !== undefined) {
        updates.push("end_time = ?");
        params.push(endTime);
        }

        // If performance fields to update
        if (updates.length > 0) {
            // Add performance ID as final parameter
            params.push(realPerformanceId);

            // Update performance
            await DB.prepare(
            `
            UPDATE performances
            SET ${updates.join(", ")}
            WHERE id = ?
            `
            )
            .bind(...params)
            .run();
        }
    } else {
       // If we are updating a profile-only entry, we might be trying to convert it to a performance?
       // But this PUT endpoint usually just updates fields.
       // The BandForm doesn't support "assigning to event" from the Edit modal easily yet.
       // So we ignore performance fields here if it's a profile update (for safety).
    }

    // Fetch updated result
    let result;
    if (!isProfileUpdate) {
        result = await DB.prepare(
        `
        SELECT p.*, bp.name, bp.social_links
        FROM performances p
        JOIN band_profiles bp ON p.band_profile_id = bp.id
        WHERE p.id = ?
        `
        ).bind(realPerformanceId).first();
    } else {
        const profile = await DB.prepare("SELECT * FROM band_profiles WHERE id = ?").bind(bandProfileId).first();
        result = {
            id: `profile_${profile.id}`,
            name: profile.name,
            social_links: profile.social_links,
            // ... map other fields if needed by frontend ...
        };
    }
    
    // Unpack social links for response compatibility
    let social = {};
    try { social = JSON.parse(result.social_links || '{}'); } catch(e) {}
    result.url = social.website || '';

    // Audit log the update
    await auditLog(
      env,
      user.userId,
      "band.updated",
      "band",
      performanceId,
      {
        bandName: result.name,
        changedFields: Object.keys(body).filter((k) => body[k] !== undefined),
        hasConflicts: conflicts.length > 0,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        band: result,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        warning:
          conflicts.length > 0
            ? `This band overlaps with ${conflicts.length} other band(s) at the same venue`
            : undefined,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating band:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update band",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// DELETE - Delete band
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
    const performanceId = getBandId(request);

    // Check if ID is a profile ID (starts with "profile_")
    const isProfileDelete = performanceId.toString().startsWith("profile_");

    if ((!performanceId || isNaN(performanceId)) && !isProfileDelete) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid band ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (isProfileDelete) {
        const bandProfileId = performanceId.split("_")[1];
        // Check if any performances exist
        const perfCount = await DB.prepare("SELECT COUNT(*) as count FROM performances WHERE band_profile_id = ?").bind(bandProfileId).first();
        
        if (perfCount.count > 0) {
             return new Response(
                JSON.stringify({
                error: "Conflict",
                message: "Cannot delete band profile because it has associated performances. Delete performances first.",
                }),
                {
                status: 409,
                headers: { "Content-Type": "application/json" },
                },
            );
        }

        // Audit log
        await auditLog(env, user.userId, "band_profile.deleted", "band_profile", bandProfileId, { deletedBy: user.email }, ipAddress);

        // Delete profile
        await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(bandProfileId).run();

        return new Response(
            JSON.stringify({ success: true, message: "Band profile deleted successfully" }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
    }

    // Check if band exists
    const performance = await DB.prepare(
      `
      SELECT p.*, bp.name
      FROM performances p
      JOIN band_profiles bp ON p.band_profile_id = bp.id
      WHERE p.id = ?
    `,
    )
      .bind(performanceId)
      .first();

    if (!performance) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Band not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Audit log before deletion
    await auditLog(
      env,
      user.userId,
      "band.deleted",
      "band",
      performanceId,
      {
        bandName: performance.name,
        eventId: performance.event_id,
        venueId: performance.venue_id,
        startTime: performance.start_time,
        endTime: performance.end_time,
      },
      ipAddress,
    );

    // Delete performance
    await DB.prepare(
      `
      DELETE FROM performances WHERE id = ?
    `,
    )
      .bind(performanceId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Band deleted successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error deleting band:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to delete band",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
