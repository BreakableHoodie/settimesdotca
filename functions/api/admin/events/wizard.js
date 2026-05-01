// Event Wizard endpoint — single-request event creation
// POST /api/admin/events/wizard
//
// Accepts { event, venues, bands } and creates all three entity types.
// Venue inserts use find-or-create (reuses an existing venue by name).
// Performance inserts are wrapped in a single DB.batch() for atomicity.
// bands[].venueIndex is a 0-based index into the venues array (not a DB ID).

import { checkPermission, auditLog } from "../_middleware.js";
import {
  validateEntity,
  VALIDATION_SCHEMAS,
  validationErrorResponse,
  sanitizeString,
  sanitizeOptionalHttpUrl,
  isValidTime,
  FIELD_LIMITS,
} from "../../../utils/validation.js";
import { getClientIP } from "../../../utils/request.js";

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) return permCheck.response;
  const currentUser = permCheck.user;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const {
    event: eventInput = {},
    venues: venuesInput = [],
    bands: bandsInput = [],
  } = body;

  // --- Validate event ---
  const eventValidation = validateEntity(eventInput, VALIDATION_SCHEMAS.event);
  if (!eventValidation.valid) {
    const firstError = Object.values(eventValidation.errors)[0];
    return validationErrorResponse(firstError, {
      fields: eventValidation.errors,
    });
  }
  const { name, date, slug, description } = eventValidation.sanitized;

  // Reject past dates — same rule as POST /api/admin/events
  const eventDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (eventDate < today) {
    return validationErrorResponse("Date cannot be in the past");
  }

  // --- Validate venues ---
  if (!Array.isArray(venuesInput) || venuesInput.length > 50) {
    return new Response(
      JSON.stringify({ error: "venues must be an array of up to 50 items" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  let sanitizedVenues;
  try {
    sanitizedVenues = venuesInput.map((v, i) => {
      const venueName = sanitizeString(String(v?.name || ""));
      if (!venueName || venueName.length > FIELD_LIMITS.venueName.max) {
        throw new Error(
          `Venue ${i + 1}: name is required (max ${FIELD_LIMITS.venueName.max} chars)`,
        );
      }
      return {
        name: venueName,
        address:
          sanitizeString(String(v?.address || "")).slice(
            0,
            FIELD_LIMITS.venueAddress.max,
          ) || null,
      };
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- Validate bands ---
  if (!Array.isArray(bandsInput) || bandsInput.length > 200) {
    return new Response(
      JSON.stringify({ error: "bands must be an array of up to 200 items" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  let sanitizedBands;
  try {
    sanitizedBands = bandsInput.map((b, i) => {
      const bandName = sanitizeString(String(b?.name || ""));
      if (!bandName || bandName.length > FIELD_LIMITS.bandName.max) {
        throw new Error(
          `Band ${i + 1}: name is required (max ${FIELD_LIMITS.bandName.max} chars)`,
        );
      }
      const venueIndex = Number(b?.venueIndex);
      if (
        !Number.isInteger(venueIndex) ||
        venueIndex < 0 ||
        venueIndex >= sanitizedVenues.length
      ) {
        throw new Error(
          `Band ${i + 1}: venueIndex ${venueIndex} is out of range`,
        );
      }
      if (b?.startTime) {
        const startCheck = isValidTime(b.startTime);
        if (!startCheck.valid)
          throw new Error(`Band ${i + 1}: ${startCheck.error}`);
      }
      if (b?.endTime) {
        const endCheck = isValidTime(b.endTime);
        if (!endCheck.valid)
          throw new Error(`Band ${i + 1}: ${endCheck.error}`);
      }
      let url = null;
      try {
        url = sanitizeOptionalHttpUrl(
          b?.url,
          FIELD_LIMITS.bandUrl.max,
          "Website URL",
        );
      } catch {
        throw new Error(`Band ${i + 1}: invalid URL`);
      }
      return {
        name: bandName,
        venueIndex,
        startTime: b?.startTime || null,
        endTime: b?.endTime || null,
        url,
      };
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // --- Check for duplicate slug ---
    const existing = await DB.prepare("SELECT id FROM events WHERE slug = ?")
      .bind(slug)
      .first();
    if (existing) {
      return new Response(
        JSON.stringify({ error: "An event with this slug already exists" }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // --- Create event ---
    const event = await DB.prepare(
      `INSERT INTO events (name, date, slug, status, is_published, description, created_by_user_id)
       VALUES (?, ?, ?, 'draft', 0, ?, ?)
       RETURNING *`,
    )
      .bind(name, date, slug, description || null, currentUser.userId)
      .first();

    // --- Find or create venues (reuses existing venue if name already taken) ---
    const venueIds = [];
    for (const v of sanitizedVenues) {
      await DB.prepare(
        `INSERT OR IGNORE INTO venues (name, address) VALUES (?, ?)`,
      )
        .bind(v.name, v.address)
        .run();
      const venue = await DB.prepare(`SELECT id FROM venues WHERE name = ?`)
        .bind(v.name)
        .first();
      venueIds.push(venue.id);
    }

    // --- Upsert band_profiles, then batch-create performances ---
    if (sanitizedBands.length > 0) {
      // Resolve each band profile (find or create) sequentially — dedup by normalized name
      const profileIds = [];
      for (const band of sanitizedBands) {
        const normalized = normalizeName(band.name);
        let profile = await DB.prepare(
          "SELECT id FROM band_profiles WHERE name_normalized = ?",
        )
          .bind(normalized)
          .first();
        if (!profile) {
          const socialLinksJson = band.url
            ? JSON.stringify({ website: band.url })
            : null;
          profile = await DB.prepare(
            `INSERT INTO band_profiles (name, name_normalized, is_active, social_links)
             VALUES (?, ?, 1, ?)
             RETURNING id`,
          )
            .bind(band.name, normalized, socialLinksJson)
            .first();
        }
        profileIds.push(profile.id);
      }

      // Batch-insert all performances — all succeed or all fail together
      await DB.batch(
        sanitizedBands.map((band, i) =>
          DB.prepare(
            `INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time)
             VALUES (?, ?, ?, ?, ?)`,
          ).bind(
            event.id,
            venueIds[band.venueIndex],
            profileIds[i],
            band.startTime,
            band.endTime,
          ),
        ),
      );
    }

    await auditLog(
      env,
      currentUser.userId,
      "event.wizard_created",
      "event",
      event.id,
      {
        name,
        slug,
        venueCount: sanitizedVenues.length,
        bandCount: sanitizedBands.length,
      },
      ipAddress,
    );

    return new Response(JSON.stringify({ success: true, event }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Wizard creation error:", error);
    return new Response(JSON.stringify({ error: "Failed to create event" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
