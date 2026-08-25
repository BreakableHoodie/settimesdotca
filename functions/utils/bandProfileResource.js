import { auditLog } from "../api/admin/_middleware.js";
import {
  FIELD_LIMITS,
  isValidEmail,
  safeReflectSocialLinks,
  sanitizeOptionalHttpUrl,
  sanitizeOptionalText,
  validateSetTimes,
} from "./validation.js";
import { findDuplicateBandProfile, findVenue, prepareBandProfileFields } from "./bandProfileFields.js";

export async function onRequestProfilePut(context, { performanceId, body, bandProfileId }) {
  const { env } = context;
  const { DB } = env;
  const user = context.user;
  const ipAddress = context.ipAddress;

  try {
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
      photo_alt_text,
      social_links,
      notes,
    } = body;

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
    void resolvedNotes;

    if (bandProfileId === null) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid profile ID",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

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

      const existingProfile = await findDuplicateBandProfile(DB, name, bandProfileId);

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

    const actualStartTime = startTime !== undefined ? startTime : undefined;
    const actualEndTime = endTime !== undefined ? endTime : undefined;
    const actualVenueId = normalizedVenueId !== undefined ? normalizedVenueId : undefined;
    void actualVenueId;

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

    if (normalizedVenueId != null) {
      const venue = await findVenue(DB, normalizedVenueId);

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

    const writeStatements = [];
    const { profileStatement, error: profileFieldsError } = await prepareBandProfileFields(
      DB,
      body,
      bandProfileId,
      resolvedPhotoUrl,
    );
    if (profileFieldsError) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: profileFieldsError.message,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (profileStatement) {
      writeStatements.push(profileStatement);
    }

    if (writeStatements.length > 0) {
      await DB.batch(writeStatements);
    }

    const updatedProfile = await DB.prepare("SELECT * FROM band_profiles WHERE id = ?").bind(bandProfileId).first();
    const result = {
      id: `profile_${updatedProfile.id}`,
      name: updatedProfile.name,
      origin: updatedProfile.origin,
      origin_city: updatedProfile.origin_city,
      origin_region: updatedProfile.origin_region,
      contact_email: updatedProfile.contact_email,
      is_active: updatedProfile.is_active,
      social_links: updatedProfile.social_links,
    };

    const social = safeReflectSocialLinks(result.social_links || "{}");
    result.social_links = result.social_links == null ? result.social_links : JSON.stringify(social);
    result.url = social.website || "";
    result.origin = [result.origin_city, result.origin_region].filter(Boolean).join(", ") || result.origin || "";

    await auditLog(
      env,
      user.userId,
      "band.updated",
      "band",
      performanceId,
      {
        bandName: result.name,
        changedFields: Object.keys(body).filter((k) => body[k] !== undefined),
        hasConflicts: false,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        band: result,
        conflicts: undefined,
        warning: undefined,
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

export async function onRequestProfileDelete(context, { performanceId: _performanceId, valid, bandProfileId }) {
  const { env } = context;
  const { DB } = env;
  const user = context.user;
  const ipAddress = context.ipAddress;
  try {
    if (!valid && bandProfileId === null) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid profile ID",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

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

    await auditLog(
      env,
      user.userId,
      "band_profile.deleted",
      "band_profile",
      bandProfileId,
      { deletedBy: user.email },
      ipAddress,
    );

    await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(bandProfileId).run();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Band profile deleted successfully",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
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
