// Event Wizard endpoint — atomic multi-entity creation
// POST /api/admin/events/wizard
//
// Accepts { event, venues, bands } in a single request and creates all entities
// using DB.batch() so venue inserts and performance inserts are each atomic.
// bands[].venueIndex is a 0-based index into the venues array (not a DB ID).

import { checkPermission, auditLog } from "../_middleware.js";
import {
  validateEntity,
  VALIDATION_SCHEMAS,
  validationErrorResponse,
  sanitizeString,
  sanitizeOptionalHttpUrl,
  FIELD_LIMITS,
} from "../../../utils/validation.js";
import { getClientIP } from "../../../utils/request.js";

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validateTimeFormat(t) {
  return !t || /^\d{2}:\d{2}$/.test(t);
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

  // --- Validate venues ---
  if (!Array.isArray(venuesInput) || venuesInput.length > 50) {
    return new Response(
      JSON.stringify({ error: "venues must be an array of up to 50 items" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  const sanitizedVenues = venuesInput.map((v, i) => {
    const venueName = sanitizeString(String(v?.name || ""));
    if (!venueName || venueName.length > FIELD_LIMITS.venueName.max) {
      throw Object.assign(
        new Error(
          `Venue ${i + 1}: name is required (max ${FIELD_LIMITS.venueName.max} chars)`,
        ),
        { status: 400 },
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

  // --- Validate bands ---
  if (!Array.isArray(bandsInput) || bandsInput.length > 200) {
    return new Response(
      JSON.stringify({ error: "bands must be an array of up to 200 items" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
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
      if (
        !validateTimeFormat(b?.startTime) ||
        !validateTimeFormat(b?.endTime)
      ) {
        throw new Error(`Band ${i + 1}: times must be in HH:MM format`);
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
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
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

    // --- Batch-create venues ---
    const venueIds = [];
    if (sanitizedVenues.length > 0) {
      const venueResults = await DB.batch(
        sanitizedVenues.map((v) =>
          DB.prepare(
            `INSERT INTO venues (name, address) VALUES (?, ?) RETURNING id`,
          ).bind(v.name, v.address),
        ),
      );
      for (const r of venueResults) {
        venueIds.push(r.results[0]?.id);
      }
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

      // Batch-insert all performances atomically
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
