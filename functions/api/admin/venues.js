// Admin venues endpoint
// GET /api/admin/venues - List all venues
// POST /api/admin/venues - Create new venue

import { checkPermission, auditLog } from "./_middleware.js";
import {
  validateEntity,
  VALIDATION_SCHEMAS,
  validationErrorResponse,
} from "../../utils/validation.js";
import { getClientIP } from "../../utils/request.js";

function formatVenueAddress(venue) {
  if (!venue) return "";
  const line1 = [venue.address_line1, venue.address_line2].filter(Boolean).join(", ");
  const line2 = [venue.city, venue.region].filter(Boolean).join(", ");
  const line3 = [venue.postal_code, venue.country].filter(Boolean).join(" ").trim();
  return [line1, line2, line3].filter(Boolean).join(", ");
}

// GET - List all venues
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require viewer role or higher
  const permCheck = await checkPermission(context, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const result = await DB.prepare(
      `
      SELECT
        v.*,
        COUNT(p.id) as band_count
      FROM venues v
      LEFT JOIN performances p ON v.id = p.venue_id
      GROUP BY v.id
      ORDER BY v.name
    `,
    ).all();

    const venues = (result.results || []).map((venue) => {
      const formattedAddress = formatVenueAddress(venue);
      return {
        ...venue,
        address: venue.address || formattedAddress || null,
      };
    });

    return new Response(JSON.stringify({ venues }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching venues:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch venues",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// POST - Create new venue
export async function onRequestPost(context) {
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
    const body = await request.json().catch(() => ({}));

    // Validate input using schema
    const validation = validateEntity(body, VALIDATION_SCHEMAS.venue);
    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      return validationErrorResponse(firstError, { fields: validation.errors });
    }

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
    } = validation.sanitized;

    const formattedAddress =
      formatVenueAddress({
        address_line1,
        address_line2,
        city,
        region,
        postal_code,
        country,
      }) || address || null;

    const resolvedAddressLine1 =
      address_line1 || (address ? address.trim() : null);

    // Check if venue already exists
    const existingVenue = await DB.prepare(
      `
      SELECT id FROM venues WHERE name = ?
    `,
    )
      .bind(name)
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

    // Create venue
    const result = await DB.prepare(
      `
      INSERT INTO venues (
        name,
        address,
        address_line1,
        address_line2,
        city,
        region,
        postal_code,
        country,
        phone,
        contact_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
      .bind(
        name,
        formattedAddress,
        resolvedAddressLine1,
        address_line2 || null,
        city || null,
        region || null,
        postal_code || null,
        country || null,
        phone || null,
        contact_email || null,
      )
      .first();

    // Audit log the creation
    await auditLog(
      env,
      user.userId,
      "venue.created",
      "venue",
      result.id,
      {
        venueName: name,
        address: formattedAddress,
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
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error creating venue:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to create venue",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
