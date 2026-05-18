// Admin specific band operations
// PUT /api/admin/bands/{id} - Update band
// DELETE /api/admin/bands/{id} - Delete band

import { checkPermission, auditLog } from "../_middleware.js";
import {
  FIELD_LIMITS,
  isValidEmail,
  sanitizeBandSocialLinks,
  sanitizeOptionalHttpUrl,
  sanitizeString,
} from "../../../utils/validation.js";
import { getClientIP } from "../../../utils/request.js";
import { sendEmail, isEmailConfigured } from "../../../utils/email.js";
import { buildIntervals, intervalsOverlap } from "../../../utils/timeConflicts.js";
import { parseOrigin } from "../../../utils/parseOrigin.js";

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Helper to extract band ID from path
function getBandId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("bands") + 1;
  return parts[idIndex];
}

// Helper to normalize band name
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function getEventForPerformance(DB, performanceId) {
  if (!performanceId) return null;

  return DB.prepare(
    `
    SELECT e.id, e.status, e.name
    FROM performances p
    JOIN events e ON p.event_id = e.id
    WHERE p.id = ?
  `,
  )
    .bind(performanceId)
    .first();
}

async function checkConflicts(
  DB,
  eventId,
  venueId,
  startTime,
  endTime,
  excludePerformanceId = null,
) {
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

  const { results: existingBands } = await DB.prepare(query).bind(...bindings).all();
  const newIntervals = buildIntervals(startTime, endTime);
  const conflicts = [];

  for (const band of existingBands) {
    if (!band.start_time || !band.end_time) continue;
    const bandIntervals = buildIntervals(band.start_time, band.end_time);
    const hasOverlap = bandIntervals.some((b) =>
      newIntervals.some((a) => intervalsOverlap(a, b)),
    );
    if (hasOverlap) {
      conflicts.push({
        id: band.id,
        name: band.name,
        startTime: band.start_time,
        endTime: band.end_time,
        type: band.start_time === startTime && band.end_time === endTime ? "conflict" : "overlap",
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
      venueId,
      name,
      startTime,
      endTime,
      url,
      description,
      genre,
      origin,
      origin_city,
      origin_region,
      contact_email,
      is_active,
      photo_url,
      social_links,
    } = body;
    let resolvedPhotoUrl;
    try {
      resolvedPhotoUrl =
        photo_url !== undefined
          ? sanitizeOptionalHttpUrl(
              photo_url,
              FIELD_LIMITS.bandUrl.max,
              "Photo URL",
            )
          : undefined;
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: error.message }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    let realPerformanceId = performanceId;
    let bandProfileId = null;

    if (isProfileUpdate) {
      const parsed = Number(performanceId.toString().split("_")[1]);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return new Response(
          JSON.stringify({ error: "Bad request", message: "Invalid profile ID" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      bandProfileId = parsed;
      realPerformanceId = null;
    }

    let performance = null;
    let linkedEvent = null;

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
          JSON.stringify({
            error: "Not found",
            message: "Band performance not found",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
      bandProfileId = performance.band_profile_id;
      linkedEvent = await getEventForPerformance(DB, realPerformanceId);

      if (linkedEvent?.status === "archived") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message:
              "Archived event performances cannot be edited. Copy the event as a template instead.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      // Fetch profile directly
      const profile = await DB.prepare(
        "SELECT * FROM band_profiles WHERE id = ?",
      )
        .bind(bandProfileId)
        .first();

      if (!profile) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Band profile not found",
          }),
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
        `SELECT id FROM band_profiles WHERE name_normalized = ? AND id != ?`,
      )
        .bind(nameNormalized, performance.band_profile_id)
        .first();

      if (existingProfile) {
        // Renaming updates the shared profile globally — all performances of this band reflect the change.
      }
    }

    if (
      contact_email !== undefined &&
      contact_email &&
      !isValidEmail(contact_email)
    ) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Contact email must be a valid email address",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate time format (only if a non-empty time is provided; empty string = TBD)
    if (
      startTime !== undefined &&
      startTime !== "" &&
      !/^\d{2}:\d{2}$/.test(startTime)
    ) {
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

    if (
      endTime !== undefined &&
      endTime !== "" &&
      !/^\d{2}:\d{2}$/.test(endTime)
    ) {
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
    const actualStartTime =
      startTime !== undefined ? startTime : performance.start_time;
    const actualEndTime =
      endTime !== undefined ? endTime : performance.end_time;
    const actualVenueId =
      venueId !== undefined ? venueId : performance.venue_id;

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
    if (
      actualVenueId &&
      actualStartTime &&
      actualEndTime &&
      performance.event_id
    ) {
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
      origin_city !== undefined ||
      origin_region !== undefined ||
      contact_email !== undefined ||
      is_active !== undefined ||
      photo_url !== undefined ||
      social_links !== undefined
    ) {
      const profileUpdates = [];
      const profileParams = [];

      if (name !== undefined) {
        profileUpdates.push("name = ?");
        profileUpdates.push("name_normalized = ?");
        const sanitizedName = sanitizeString(name);
        profileParams.push(sanitizedName);
        profileParams.push(normalizeName(sanitizedName));
      }

      // Update other profile fields
      if (description !== undefined) {
        profileUpdates.push("description = ?");
        profileParams.push(sanitizeString(description) || null);
      }
      if (genre !== undefined) {
        profileUpdates.push("genre = ?");
        profileParams.push(sanitizeString(genre) || null);
      }
      const parsedOrigin =
        origin !== undefined
          ? parseOrigin(origin)
          : { city: null, region: null };
      const resolvedOriginCity =
        origin_city !== undefined ? origin_city : parsedOrigin.city;
      const resolvedOriginRegion =
        origin_region !== undefined ? origin_region : parsedOrigin.region;
      const computedOrigin =
        origin !== undefined
          ? origin
          : [resolvedOriginCity, resolvedOriginRegion]
              .filter(Boolean)
              .join(", ") || undefined;

      if (origin !== undefined || origin_city !== undefined) {
        profileUpdates.push("origin_city = ?");
        profileParams.push(resolvedOriginCity || null);
      }
      if (origin !== undefined || origin_region !== undefined) {
        profileUpdates.push("origin_region = ?");
        profileParams.push(resolvedOriginRegion || null);
      }
      if (computedOrigin !== undefined) {
        profileUpdates.push("origin = ?");
        profileParams.push(computedOrigin || null);
      }
      if (contact_email !== undefined) {
        profileUpdates.push("contact_email = ?");
        profileParams.push(contact_email || null);
      }
      if (is_active !== undefined) {
        profileUpdates.push("is_active = ?");
        profileParams.push(Number(is_active) === 1 ? 1 : 0);
      }
      if (photo_url !== undefined) {
        profileUpdates.push("photo_url = ?");
        profileParams.push(resolvedPhotoUrl || null);
      }

      // Handle Social Links (merge or overwrite?)
      // The frontend sends a JSON string for social_links usually.
      // Or if 'url' is sent legacy style, we merge it.

      let newSocialLinks = null;
      let shouldUpdateSocialLinks = false;
      if (social_links !== undefined) {
        shouldUpdateSocialLinks = true;
        try {
          newSocialLinks = sanitizeBandSocialLinks(social_links);
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: "Validation error",
              message: error.message,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      } else if (url !== undefined) {
        shouldUpdateSocialLinks = true;
        // Legacy update of just website
        let existingLinks = {};
        try {
          const profile = await DB.prepare(
            "SELECT social_links FROM band_profiles WHERE id = ?",
          )
            .bind(performance.band_profile_id)
            .first();
          existingLinks = JSON.parse(profile.social_links || "{}");
        } catch (e) {}
        try {
          existingLinks.website = sanitizeOptionalHttpUrl(
            url,
            FIELD_LIMITS.bandUrl.max,
            "Website URL",
          );
          newSocialLinks = sanitizeBandSocialLinks(existingLinks);
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: "Validation error",
              message: error.message,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }

      if (shouldUpdateSocialLinks) {
        profileUpdates.push("social_links = ?");
        profileParams.push(newSocialLinks);
      }

      if (profileUpdates.length > 0) {
        profileParams.push(performance.band_profile_id);
        await DB.prepare(
          `UPDATE band_profiles SET ${profileUpdates.join(", ")} WHERE id = ?`,
        )
          .bind(...profileParams)
          .run();
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
        params.push(startTime || null);
      }
      if (endTime !== undefined) {
        updates.push("end_time = ?");
        params.push(endTime || null);
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
            `,
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
        SELECT
          p.*,
          bp.name,
          bp.social_links,
          bp.origin,
          bp.origin_city,
          bp.origin_region,
          bp.contact_email,
          bp.is_active
        FROM performances p
        JOIN band_profiles bp ON p.band_profile_id = bp.id
        WHERE p.id = ?
        `,
      )
        .bind(realPerformanceId)
        .first();
    } else {
      const profile = await DB.prepare(
        "SELECT * FROM band_profiles WHERE id = ?",
      )
        .bind(bandProfileId)
        .first();
      result = {
        id: `profile_${profile.id}`,
        name: profile.name,
        origin: profile.origin,
        origin_city: profile.origin_city,
        origin_region: profile.origin_region,
        contact_email: profile.contact_email,
        is_active: profile.is_active,
        social_links: profile.social_links,
        // ... map other fields if needed by frontend ...
      };
    }

    // Unpack social links for response compatibility
    let social = {};
    try {
      social = JSON.parse(result.social_links || "{}");
    } catch (e) {}
    result.url = social.website || "";
    result.origin =
      [result.origin_city, result.origin_region].filter(Boolean).join(", ") ||
      result.origin ||
      "";

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

// PATCH - Toggle is_announced for a performance
export async function onRequestPatch(context) {
  const { request, env } = context;
  const { DB } = env;

  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    const performanceId = getBandId(request);
    if (!performanceId || isNaN(performanceId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid performance ID",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.is_announced !== "boolean") {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "is_announced (boolean) is required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const performance = await DB.prepare(
      "SELECT id, is_announced, band_follow_notified FROM performances WHERE id = ?",
    )
      .bind(performanceId)
      .first();

    if (!performance) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Performance not found",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const linkedEvent = await getEventForPerformance(DB, performanceId);
    if (linkedEvent?.status === "archived") {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Archived event performances cannot be edited.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const newValue = body.is_announced ? 1 : 0;
    await DB.prepare(
      "UPDATE performances SET is_announced = ?, updated_at = datetime('now') WHERE id = ?",
    )
      .bind(newValue, performanceId)
      .run();

    // Notify band followers on first 0 → 1 transition only
    if (
      newValue === 1 &&
      performance.is_announced === 0 &&
      !performance.band_follow_notified
    ) {
      const perf = await DB.prepare(
        `SELECT p.band_profile_id, bp.name as band_name, e.name as event_name
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         JOIN events e ON p.event_id = e.id
         WHERE p.id = ?`,
      )
        .bind(performanceId)
        .first();

      if (perf) {
        const { results: followers = [] } = await DB.prepare(
          "SELECT email, unsubscribe_token FROM band_follows WHERE band_profile_id = ? AND verified = 1",
        )
          .bind(perf.band_profile_id)
          .all();

        if (followers.length > 0 && isEmailConfigured(env)) {
          // Atomic claim: only the first concurrent request sees changes > 0.
          // Latch is only set when email is actually configured — if email is temporarily
          // misconfigured, band_follow_notified stays 0 so notifications can fire later.
          const claimed = await DB.prepare(
            "UPDATE performances SET band_follow_notified = 1 WHERE id = ? AND band_follow_notified = 0",
          )
            .bind(performanceId)
            .run();

          if (claimed.meta.changes > 0) {
            const publicUrl = env.PUBLIC_URL || "https://settimes.ca";
            const emailResults = await Promise.allSettled(
              followers.map((follower) => {
                const unsubUrl = `${publicUrl}/api/bands/${perf.band_profile_id}/unfollow?token=${follower.unsubscribe_token}`;
                return sendEmail(env, {
                  to: follower.email,
                  subject: `${perf.band_name} just joined the lineup for ${perf.event_name}!`,
                  text: `${perf.band_name} is now on the lineup for ${perf.event_name}.\n\nUnfollow: ${unsubUrl}`,
                  html: `<p><strong>${escapeHtml(perf.band_name)}</strong> is now on the lineup for <strong>${escapeHtml(perf.event_name)}</strong>.</p><p><a href="${unsubUrl}">Unfollow this band</a></p>`,
                });
              }),
            );
            // sendEmail returns {delivered:false} on failure rather than throwing — filter both rejection types
            const failedCount = emailResults.filter(
              (r) =>
                r.status === "rejected" ||
                (r.status === "fulfilled" && !r.value?.delivered),
            ).length;
            if (failedCount > 0) {
              await auditLog(
                env,
                user.userId,
                "performance.announced.email_failure",
                "performance",
                Number(performanceId),
                { failed_count: failedCount, band_name: perf.band_name },
                ipAddress,
              ).catch(() => {});
            }
          }
        }
      }
    }

    await auditLog(
      env,
      user.userId,
      newValue ? "performance.announced" : "performance.unannounced",
      "performance",
      Number(performanceId),
      { is_announced: newValue, changedBy: user.email },
      ipAddress,
    );

    const updated = await DB.prepare(
      "SELECT band_follow_notified FROM performances WHERE id = ?",
    )
      .bind(performanceId)
      .first();

    return new Response(
      JSON.stringify({
        success: true,
        performance: {
          id: Number(performanceId),
          is_announced: newValue,
          band_follow_notified: updated?.band_follow_notified ?? 0,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error toggling is_announced:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update performance",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
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
      const bandProfileId = Number(performanceId.toString().split("_")[1]);
      if (!Number.isInteger(bandProfileId) || bandProfileId <= 0) {
        return new Response(
          JSON.stringify({ error: "Bad request", message: "Invalid profile ID" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      // Check if any performances exist
      const perfCount = await DB.prepare(
        "SELECT COUNT(*) as count FROM performances WHERE band_profile_id = ?",
      )
        .bind(bandProfileId)
        .first();

      if (perfCount.count > 0) {
        return new Response(
          JSON.stringify({
            error: "Conflict",
            message:
              "Cannot delete band profile because it has associated performances. Delete performances first.",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Audit log
      await auditLog(
        env,
        user.userId,
        "band_profile.deleted",
        "band_profile",
        bandProfileId,
        { deletedBy: user.email },
        ipAddress,
      );

      // Delete profile
      await DB.prepare("DELETE FROM band_profiles WHERE id = ?")
        .bind(bandProfileId)
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message: "Band profile deleted successfully",
        }),
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

    const linkedEvent = await getEventForPerformance(DB, performanceId);
    if (linkedEvent?.status === "archived") {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message:
            "Archived event performances cannot be deleted. Copy the event as a template instead.",
        }),
        {
          status: 400,
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
