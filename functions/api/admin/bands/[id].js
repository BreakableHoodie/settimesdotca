// Admin specific band operations
// PUT /api/admin/bands/{id} - Update band
// DELETE /api/admin/bands/{id} - Delete band

import { checkPermission, auditLog } from "../_middleware.js";
import {
  FIELD_LIMITS,
  isValidEmail,
  safeReflectSocialLinks,
  sanitizeBandSocialLinks,
  sanitizeOptionalHttpUrl,
  sanitizeOptionalText,
  sanitizeString,
  validatePerformanceDate,
  validateSetTimes,
} from "../../../utils/validation.js";
import { getClientIP, getUrlId } from "../../../utils/request.js";
import { checkConflicts } from "../../../utils/timeConflicts.js";
import { parseOrigin } from "../../../utils/parseOrigin.js";
import { normalizeBandName } from "../../../utils/bandName.js";

async function getEventForPerformance(DB, performanceId) {
  if (!performanceId) return null;

  return DB.prepare(
    `
    SELECT e.id, e.status, e.name, e.date, e.end_date
    FROM performances p
    JOIN events e ON p.event_id = e.id
    WHERE p.id = ?
  `,
  )
    .bind(performanceId)
    .first();
}

// PUT - Update band
/**
 * Parse a `profile_<n>` id, or return null if it is not one.
 *
 * Anchored on the WHOLE string. `split("_")[1]` read only the second segment,
 * so "profile_1_extra" resolved to profile 1 — a malformed identifier silently
 * addressing a real record. On the DELETE path that meant deleting it.
 *
 * isSafeInteger, not isInteger: Number("9007199254740993") silently becomes
 * ...992, so past 2^53 an id resolves to a DIFFERENT record while still looking
 * like a valid integer.
 *
 * One implementation because there are two call sites (PUT and DELETE) and they
 * had already drifted — PUT was fixed first and DELETE kept the unsafe parse.
 *
 * @param {unknown} rawId
 * @returns {number|null}
 */
function parseProfileId(rawId) {
  const match = /^profile_([1-9]\d*)$/.exec(String(rawId ?? ""));
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

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
    const { rawId: performanceId, valid } = getUrlId(request, "bands");

    // Check if ID is a profile ID (starts with "profile_"). getUrlId() reads a
    // path segment, so rawId is string | undefined — undefined whenever no id
    // segment follows. The typeof guard replaces a .toString() that threw on
    // that case, turning the documented 400 below into a 500.
    const isProfileUpdate = typeof performanceId === "string" && performanceId.startsWith("profile_");

    if (!valid && !isProfileUpdate) {
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
      performanceDate,
      url,
      description,
      genre,
      origin,
      origin_city,
      origin_region,
      contact_email,
      is_active,
      photo_url,
      photo_alt_text,
      social_links,
      notes,
    } = body;

    // Normalize venueId: treat "", 0, "0" as null (no venue assigned).
    // Guards against the frontend sending Number("") = 0 when no venue is selected,
    // which would otherwise pass the !== null check and then 404 on "Venue not found".
    const normalizedVenueId =
      venueId === undefined ? undefined : !venueId || Number(venueId) <= 0 ? null : Number(venueId);
    let resolvedPhotoUrl;
    let resolvedNotes;
    try {
      resolvedPhotoUrl =
        photo_url !== undefined ? sanitizeOptionalHttpUrl(photo_url, FIELD_LIMITS.bandUrl.max, "Photo URL") : undefined;
      resolvedNotes =
        notes !== undefined ? sanitizeOptionalText(notes, FIELD_LIMITS.performanceNotes.max, "Notes") : undefined;
    } catch (error) {
      return new Response(JSON.stringify({ error: "Validation error", message: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    let realPerformanceId = performanceId;
    let bandProfileId = null;

    if (isProfileUpdate) {
      const parsed = parseProfileId(performanceId);
      if (parsed === null) {
        return new Response(
          JSON.stringify({
            error: "Bad request",
            message: "Invalid profile ID",
          }),
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

      // An archived event freezes its lineup's event-specific fields (set times,
      // venue) — but band-profile fields (is_active, name, genre, origin, photo,
      // social links, bio) are band-WIDE and must stay editable regardless of the
      // events the band has played. Only block when a performance field is the
      // thing actually being changed.
      const editsPerformanceFields =
        normalizedVenueId !== undefined ||
        startTime !== undefined ||
        endTime !== undefined ||
        performanceDate !== undefined ||
        notes !== undefined;
      if (linkedEvent?.status === "archived" && editsPerformanceFields) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Archived event set times cannot be edited. Copy the event as a template instead.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      // Fetch profile directly
      const profile = await DB.prepare("SELECT * FROM band_profiles WHERE id = ?").bind(bandProfileId).first();

      if (!profile) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Band profile not found",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
      // Deliberately leaves `performance` null. This used to assign a
      // fabricated performance-shaped object here so shared downstream code
      // would run — but its `name` and `social_links` were never read, and its
      // only live field duplicated `bandProfileId`, which is already set above.
      // The remaining reads are optional-chained, because several of them DO
      // run on this path — computing actualStartTime/actualEndTime/actualVenueId
      // and the conflict check. On a profile edit there is no performance, so
      // those resolve to undefined and the conflict check short-circuits, which
      // is what the mock's null fields were simulating all along.
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

      const nameNormalized = normalizeBandName(name);
      const existingProfile = await DB.prepare(`SELECT id FROM band_profiles WHERE name_normalized = ? AND id != ?`)
        .bind(nameNormalized, bandProfileId)
        .first();

      if (existingProfile) {
        // Renaming updates the shared profile globally — all performances of this band reflect the change.
      }
    }

    if (contact_email !== undefined && contact_email && !isValidEmail(contact_email)) {
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
    if (startTime !== undefined && startTime !== "" && !/^\d{2}:\d{2}$/.test(startTime)) {
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

    if (endTime !== undefined && endTime !== "" && !/^\d{2}:\d{2}$/.test(endTime)) {
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

    // Validate performance_date (#540): must fall within the linked event's
    // festival-day span [event.date, event.end_date]. Only applies to real
    // performances — profile-only rows have no event/performance to date.
    let resolvedPerformanceDate;
    if (!isProfileUpdate && performanceDate !== undefined) {
      const performanceDateCheck = validatePerformanceDate(performanceDate, linkedEvent);
      if (!performanceDateCheck.valid) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: performanceDateCheck.error,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      resolvedPerformanceDate = performanceDateCheck.value;
    }

    // Determine actual times to use (provided or existing)
    const actualStartTime = startTime !== undefined ? startTime : performance?.start_time;
    const actualEndTime = endTime !== undefined ? endTime : performance?.end_time;
    const actualVenueId = normalizedVenueId !== undefined ? normalizedVenueId : performance?.venue_id;

    // Validate times (allow sets that cross midnight; prevent zero-length sets).
    // Checked against the MERGED values, not the body: a PATCH that touches only
    // end_time can still land it on the stored start_time.
    const setTimesCheck = validateSetTimes(actualStartTime, actualEndTime);
    if (!setTimesCheck.valid) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: setTimesCheck.error,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if venue exists (only when a specific positive venue id was provided)
    if (normalizedVenueId != null) {
      const venue = await DB.prepare(
        `
        SELECT id FROM venues WHERE id = ?
      `,
      )
        .bind(normalizedVenueId)
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
    if (actualVenueId && actualStartTime && actualEndTime && performance?.event_id) {
      conflicts = await checkConflicts(DB, {
        eventId: performance?.event_id,
        venueId: actualVenueId,
        startTime: actualStartTime,
        endTime: actualEndTime,
        excludePerformanceId: performanceId,
        // The performance's festival day after this update: the newly supplied
        // day if it's being changed, otherwise the day it already had.
        performanceDate: performanceDate !== undefined ? resolvedPerformanceDate : performance?.performance_date,
        eventDate: linkedEvent.date,
      });
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
      photo_alt_text !== undefined ||
      social_links !== undefined
    ) {
      const profileUpdates = [];
      const profileParams = [];

      if (name !== undefined) {
        profileUpdates.push("name = ?");
        profileUpdates.push("name_normalized = ?");
        const sanitizedName = sanitizeString(name);
        profileParams.push(sanitizedName);
        profileParams.push(normalizeBandName(sanitizedName));
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
      const parsedOrigin = origin !== undefined ? parseOrigin(origin) : { city: null, region: null };
      const resolvedOriginCity = origin_city !== undefined ? origin_city : parsedOrigin.city;
      const resolvedOriginRegion = origin_region !== undefined ? origin_region : parsedOrigin.region;
      const computedOrigin =
        origin !== undefined
          ? origin
          : [resolvedOriginCity, resolvedOriginRegion].filter(Boolean).join(", ") || undefined;

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
      if (photo_alt_text !== undefined) {
        profileUpdates.push("photo_alt_text = ?");
        const cleanedAlt = sanitizeString(photo_alt_text);
        profileParams.push(cleanedAlt ? cleanedAlt.slice(0, 250) : null);
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
          const profile = await DB.prepare("SELECT social_links FROM band_profiles WHERE id = ?")
            .bind(bandProfileId)
            .first();
          existingLinks = JSON.parse(profile.social_links || "{}");
        } catch (_e) {
          /* ignore malformed JSON — existingLinks stays {} */
        }
        try {
          existingLinks.website = sanitizeOptionalHttpUrl(url, FIELD_LIMITS.bandUrl.max, "Website URL");
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
        profileParams.push(bandProfileId);
        await DB.prepare(`UPDATE band_profiles SET ${profileUpdates.join(", ")} WHERE id = ?`)
          .bind(...profileParams)
          .run();
      }
    }

    // Handle performance updates (ONLY if it's a real performance)
    if (!isProfileUpdate) {
      if (normalizedVenueId !== undefined) {
        updates.push("venue_id = ?");
        params.push(normalizedVenueId);
      }
      if (startTime !== undefined) {
        updates.push("start_time = ?");
        params.push(startTime || null);
      }
      if (endTime !== undefined) {
        updates.push("end_time = ?");
        params.push(endTime || null);
      }
      if (performanceDate !== undefined) {
        updates.push("performance_date = ?");
        params.push(resolvedPerformanceDate);
      }
      if (notes !== undefined) {
        updates.push("notes = ?");
        params.push(resolvedNotes);
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
      const profile = await DB.prepare("SELECT * FROM band_profiles WHERE id = ?").bind(bandProfileId).first();
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

    // Unpack social links for response compatibility. Read-path sanitize
    // (#493): `result.social_links` may reflect a pre-#483 (or otherwise
    // untouched) DB value even when this request didn't itself update
    // social_links — never echo it back verbatim.
    const social = safeReflectSocialLinks(result.social_links || "{}");
    // Preserve the raw string/null shape of `social_links` in the response —
    // the admin frontend (RosterTab.jsx / LineupTab.jsx) JSON.parses this
    // field directly.
    result.social_links = result.social_links == null ? result.social_links : JSON.stringify(social);
    result.url = social.website || "";
    result.origin = [result.origin_city, result.origin_region].filter(Boolean).join(", ") || result.origin || "";

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

// PATCH - Toggle is_announced and/or is_cancelled for a performance
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
    const { valid, value: performanceId } = getUrlId(request, "bands");
    if (!valid) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid performance ID",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const hasAnnounced = body.is_announced !== undefined;
    const hasCancelled = body.is_cancelled !== undefined;

    if (!hasAnnounced && !hasCancelled) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "is_announced or is_cancelled is required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (hasAnnounced && typeof body.is_announced !== "boolean") {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "is_announced must be a boolean",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (hasCancelled && typeof body.is_cancelled !== "boolean") {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "is_cancelled must be a boolean",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const performance = await DB.prepare(
      "SELECT id, is_announced, is_cancelled, band_follow_notified FROM performances WHERE id = ?",
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

    const newValue = hasAnnounced ? (body.is_announced ? 1 : 0) : performance.is_announced;
    // Reversible by design (#732): un-cancelling restores the set, which is
    // the entire reason this is a column and not a DELETE.
    const isCancelled = hasCancelled ? (body.is_cancelled ? 1 : 0) : performance.is_cancelled;

    const updates = ["updated_at = datetime('now')"];
    const params = [];
    if (hasAnnounced) {
      updates.push("is_announced = ?");
      params.push(newValue);
    }
    if (hasCancelled) {
      updates.push("is_cancelled = ?");
      params.push(isCancelled);
    }
    params.push(performanceId);

    await DB.prepare(`UPDATE performances SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...params)
      .run();

    // Sweep this performance's own pending band_announce_queue rows the
    // moment it's cancelled (#732 MAJOR 1 hygiene) -- a set that will never
    // be sent shouldn't sit in the queue as a dead row. The digest itself
    // also re-checks is_cancelled at send time (functions/utils/announceDigest.js)
    // as a second layer of defense for the race where cancellation lands
    // between the queue insert and the flush's read.
    if (hasCancelled && isCancelled === 1) {
      await DB.prepare("DELETE FROM band_announce_queue WHERE performance_id = ?").bind(performanceId).run();
    }

    // Queue band-follower notifications on first 0 → 1 transition.
    // Followers are batched into band_announce_queue; POST /api/admin/flush-announce-digest
    // groups them by (email, event) and sends one digest per fan per event.
    //
    // `isCancelled` above already holds the EFFECTIVE post-request value (the
    // new body value if this request touched is_cancelled, otherwise the
    // stored one) -- gating on it here, not performance.is_cancelled, is what
    // catches BOTH a same-request cancel+announce (body sets is_cancelled
    // true) AND an announce-only request against a row that was already
    // cancelled (body never sets is_cancelled, so the stored value carries
    // through unchanged). Without this a cancelled set could still email
    // every verified follower (#732 MAJOR 1).
    if (
      hasAnnounced &&
      newValue === 1 &&
      isCancelled === 0 &&
      performance.is_announced === 0 &&
      !performance.band_follow_notified
    ) {
      const perf = await DB.prepare(
        `SELECT p.band_profile_id, bp.name as band_name,
                e.id as event_id, e.name as event_name, e.slug as event_slug
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         JOIN events e ON p.event_id = e.id
         WHERE p.id = ?`,
      )
        .bind(performanceId)
        .first();

      if (perf) {
        const { results: followers = [] } = await DB.prepare(
          "SELECT id FROM band_follows WHERE band_profile_id = ? AND verified = 1",
        )
          .bind(perf.band_profile_id)
          .all();

        if (followers.length > 0) {
          // Atomic latch: only the first concurrent announce-toggle queues followers.
          const claimed = await DB.prepare(
            "UPDATE performances SET band_follow_notified = 1 WHERE id = ? AND band_follow_notified = 0",
          )
            .bind(performanceId)
            .run();

          if (claimed.meta.changes > 0) {
            // Queue one row per follower. INSERT OR IGNORE on UNIQUE(band_follow_id,
            // performance_id) prevents double-queuing from a retry.
            await DB.batch(
              followers.map((f) =>
                DB.prepare(
                  `INSERT OR IGNORE INTO band_announce_queue
                   (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ).bind(
                  f.id,
                  Number(performanceId),
                  perf.event_id,
                  perf.band_name,
                  perf.event_name,
                  perf.event_slug,
                  perf.band_profile_id,
                ),
              ),
            );
          }
        }
      }
    }

    // Pick the most specific audit action name: a request only ever flips one
    // of these two flags in practice (the LineupTab announce toggle and the
    // cancel toggle are separate buttons), but a combined request still logs
    // sensibly rather than lying about which flag moved.
    let auditAction = "performance.updated";
    if (hasCancelled && !hasAnnounced) {
      auditAction = isCancelled ? "performance.cancelled" : "performance.restored";
    } else if (hasAnnounced && !hasCancelled) {
      auditAction = newValue ? "performance.announced" : "performance.unannounced";
    }

    await auditLog(
      env,
      user.userId,
      auditAction,
      "performance",
      Number(performanceId),
      {
        ...(hasAnnounced ? { is_announced: newValue } : {}),
        ...(hasCancelled ? { is_cancelled: isCancelled } : {}),
        changedBy: user.email,
      },
      ipAddress,
    );

    const updated = await DB.prepare(
      "SELECT is_announced, is_cancelled, band_follow_notified FROM performances WHERE id = ?",
    )
      .bind(performanceId)
      .first();

    return new Response(
      JSON.stringify({
        success: true,
        performance: {
          id: Number(performanceId),
          is_announced: updated?.is_announced ?? newValue,
          is_cancelled: updated?.is_cancelled ?? isCancelled,
          band_follow_notified: updated?.band_follow_notified ?? 0,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error toggling is_announced/is_cancelled:", error);
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
    const { rawId: performanceId, valid } = getUrlId(request, "bands");

    // Same guard as the update handler above: rawId is string | undefined, and
    // .toString() on undefined turned the documented 400 into a 500.
    const isProfileDelete = typeof performanceId === "string" && performanceId.startsWith("profile_");

    if (!valid && !isProfileDelete) {
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
      const bandProfileId = parseProfileId(performanceId);
      if (bandProfileId === null) {
        return new Response(
          JSON.stringify({
            error: "Bad request",
            message: "Invalid profile ID",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      // Check if any performances exist
      const perfCount = await DB.prepare("SELECT COUNT(*) as count FROM performances WHERE band_profile_id = ?")
        .bind(bandProfileId)
        .first();

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
      await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(bandProfileId).run();

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
          message: "Archived event performances cannot be deleted. Copy the event as a template instead.",
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
