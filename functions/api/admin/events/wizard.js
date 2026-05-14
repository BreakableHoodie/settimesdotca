// Event Wizard endpoint — single-request event creation
// POST /api/admin/events/wizard
//
// Accepts { event, venues, bands } and creates all three entity types.
// Requires admin role — venue creation is admin-only throughout the app.
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
import { buildIntervals, intervalsOverlap } from "../../../utils/timeConflicts.js";

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Detect scheduling conflicts within the submitted band list (all for a new event).
function findConflict(bands) {
  const byVenue = {};
  for (const b of bands) {
    if (!b.startTime || !b.endTime) continue;
    (byVenue[b.venueIndex] ??= []).push(b);
  }
  for (const group of Object.values(byVenue)) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const aIntervals = buildIntervals(group[i].startTime, group[i].endTime);
        const bIntervals = buildIntervals(group[j].startTime, group[j].endTime);
        const hasOverlap = aIntervals.some((a) =>
          bIntervals.some((b) => intervalsOverlap(a, b)),
        );
        if (hasOverlap) {
          return `"${group[i].name}" and "${group[j].name}" have overlapping times at the same venue`;
        }
      }
    }
  }
  return null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  // Venue creation is admin-only throughout the app — require admin here too.
  const permCheck = await checkPermission(context, "admin");
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

  // Wizard always creates drafts — archived/backdated events are out of scope here.
  // Workers run in UTC; users submit their local date. A user in UTC-12 submitting
  // "today" could be one day behind UTC, so we allow dates >= yesterday (UTC) as a
  // grace window that covers all time zones.
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const cutoffStr = yesterday.toISOString().slice(0, 10);
  if (date < cutoffStr) {
    return validationErrorResponse(
      "Draft events created via the wizard cannot have a past date",
    );
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
    return new Response(
      JSON.stringify({ error: "Invalid request", message: err.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
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
      if (!b?.startTime || !b?.endTime) {
        throw new Error(`Band ${i + 1}: start and end time are required`);
      }
      const startCheck = isValidTime(b.startTime);
      if (!startCheck.valid)
        throw new Error(`Band ${i + 1}: ${startCheck.error}`);
      const endCheck = isValidTime(b.endTime);
      if (!endCheck.valid)
        throw new Error(`Band ${i + 1}: ${endCheck.error}`);
      if (b.startTime && b.endTime) {
        if (b.startTime === b.endTime) {
          throw new Error(
            `Band ${i + 1}: start and end time cannot be the same`,
          );
        }
        const [sh, sm] = b.startTime.split(":").map(Number);
        const [eh, em] = b.endTime.split(":").map(Number);
        const startM = sh * 60 + sm;
        const endM = eh * 60 + em;
        if (endM < startM && 24 * 60 - startM + endM > 8 * 60) {
          throw new Error(`Band ${i + 1}: end time must be after start time`);
        }
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
    return new Response(
      JSON.stringify({ error: "Invalid request", message: err.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Detect time conflicts before touching the DB (new event = no pre-existing performances).
  const conflict = findConflict(sanitizedBands);
  if (conflict) {
    return new Response(
      JSON.stringify({ error: `Schedule conflict: ${conflict}` }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  let event = null;
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
    event = await DB.prepare(
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

    // Compensate: delete the event row if it was created before the failure,
    // so we don't leave an empty draft behind.
    if (event?.id) {
      try {
        await DB.prepare("DELETE FROM events WHERE id = ?").bind(event.id).run();
      } catch (e) {
        console.error("Wizard cleanup failed:", e);
      }
    }

    return new Response(JSON.stringify({ error: "Failed to create event" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
