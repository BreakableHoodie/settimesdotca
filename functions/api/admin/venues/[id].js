// Admin specific venue operations
// PUT /api/admin/venues/{id} - Update venue
// DELETE /api/admin/venues/{id} - Delete venue

import { checkPermission, auditLog } from "../_middleware.js";
import {
  FIELD_LIMITS,
  isValidEmail,
  isValidPhone,
  isValidPostalCode,
  normalizePostalCode,
  sanitizeString,
} from "../../../utils/validation.js";
import { getClientIP } from "../../../utils/request.js";

function formatVenueAddress(venue) {
  if (!venue) return "";
  const line1 = [venue.address_line1, venue.address_line2].filter(Boolean).join(", ");
  const line2 = [venue.city, venue.region].filter(Boolean).join(", ");
  const line3 = [venue.postal_code, venue.country].filter(Boolean).join(" ").trim();
  return [line1, line2, line3].filter(Boolean).join(", ");
}

// Helper to extract venue ID from path
function getVenueId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("venues") + 1;
  return parts[idIndex];
}

// PUT - Update venue
export async function onRequestPut(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require admin role (venues are structural)
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    const venueId = getVenueId(request);

    if (!venueId || isNaN(venueId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid venue ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      name,
      address,
      address_line1,
      address_line2,
      city,
      region,
      postal_code,
      country,
      phone,
      contact_email,
    } = body;

    const trimmedName = name ? sanitizeString(name) : "";

    // Validation
    if (!trimmedName) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Venue name is required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (trimmedName.length > FIELD_LIMITS.venueName.max) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: `Venue name must be no more than ${FIELD_LIMITS.venueName.max} characters`,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (address_line1 && address_line1.length > FIELD_LIMITS.venueAddressLine1.max) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: `Street address must be no more than ${FIELD_LIMITS.venueAddressLine1.max} characters`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (address_line2 && address_line2.length > FIELD_LIMITS.venueAddressLine2.max) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: `Address line 2 must be no more than ${FIELD_LIMITS.venueAddressLine2.max} characters`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (city && city.length > FIELD_LIMITS.venueCity.max) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: `City must be no more than ${FIELD_LIMITS.venueCity.max} characters`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (region && region.length > FIELD_LIMITS.venueRegion.max) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: `Province/State must be no more than ${FIELD_LIMITS.venueRegion.max} characters`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (postal_code && !isValidPostalCode(postal_code)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Postal code must be a valid US ZIP or Canadian postal code",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (country && country.length > FIELD_LIMITS.venueCountry.max) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: `Country must be no more than ${FIELD_LIMITS.venueCountry.max} characters`,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (phone && !isValidPhone(phone)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Phone number must contain only digits and formatting characters",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (contact_email && !isValidEmail(contact_email)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Contact email must be a valid email address",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if venue exists
    const venue = await DB.prepare(
      `
      SELECT * FROM venues WHERE id = ?
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

    // Check if name is already taken by another venue
    if (trimmedName !== venue.name) {
      const existingVenue = await DB.prepare(
        `
        SELECT id FROM venues WHERE name = ? AND id != ?
      `,
      )
        .bind(trimmedName, venueId)
        .first();

      if (existingVenue) {
        return new Response(
          JSON.stringify({
            error: "Conflict",
            message: "A venue with this name already exists",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Update venue
    const nextAddressLine1 =
      address_line1 !== undefined
        ? address_line1 || null
        : address
          ? address.trim()
          : venue.address_line1 || null;
    const nextAddressLine2 =
      address_line2 !== undefined
        ? address_line2 || null
        : venue.address_line2 || null;
    const nextCity = city !== undefined ? city || null : venue.city || null;
    const nextRegion = region !== undefined ? region || null : venue.region || null;
    const nextPostal =
      postal_code !== undefined
        ? normalizePostalCode(postal_code)
        : venue.postal_code || null;
    const nextCountry =
      country !== undefined ? country || null : venue.country || null;

    const formattedAddress =
      formatVenueAddress({
        address_line1: nextAddressLine1,
        address_line2: nextAddressLine2,
        city: nextCity,
        region: nextRegion,
        postal_code: nextPostal,
        country: nextCountry,
      }) || (address ? address.trim() : venue.address || null);

    const result = await DB.prepare(
      `
      UPDATE venues
      SET name = ?,
          address = ?,
          address_line1 = ?,
          address_line2 = ?,
          city = ?,
          region = ?,
          postal_code = ?,
          country = ?,
          phone = ?,
          contact_email = ?
      WHERE id = ?
      RETURNING *
    `,
    )
      .bind(
        trimmedName,
        formattedAddress,
        nextAddressLine1,
        nextAddressLine2,
        nextCity,
        nextRegion,
        nextPostal,
        nextCountry,
        phone !== undefined ? phone || null : venue.phone || null,
        contact_email !== undefined ? contact_email || null : venue.contact_email || null,
        venueId,
      )
      .first();

    // Audit log the update
    await auditLog(
      env,
      user.userId,
      "venue.updated",
      "venue",
      venueId,
      {
        oldName: venue.name,
        newName: name,
        oldAddress: venue.address,
        newAddress: formattedAddress,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        venue: {
          ...result,
          address: result.address || formattedAddress,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating venue:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update venue",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// DELETE - Delete venue
export async function onRequestDelete(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require admin role (venues are structural)
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  try {
    const venueId = getVenueId(request);

    if (!venueId || isNaN(venueId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid venue ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if venue exists
    const venue = await DB.prepare(
      `
      SELECT * FROM venues WHERE id = ?
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

    // Check if venue is used by any bands
    const bandCount = await DB.prepare(
      `
      SELECT COUNT(*) as count FROM performances WHERE venue_id = ?
    `,
    )
      .bind(venueId)
      .first();

    if (bandCount.count > 0) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: `Cannot delete venue. It is used by ${bandCount.count} band(s).`,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Audit log before deletion
    await auditLog(
      env,
      user.userId,
      "venue.deleted",
      "venue",
      venueId,
      {
        venueName: venue.name,
        address: venue.address,
      },
      ipAddress,
    );

    // Delete venue
    await DB.prepare(
      `
      DELETE FROM venues WHERE id = ?
    `,
    )
      .bind(venueId)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Venue deleted successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error deleting venue:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to delete venue"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
