// Event Wizard endpoint — single-request event creation
// POST /api/admin/events/wizard
//
// Accepts { event, venues, bands } and creates all three entity types.
// Requires editor role; editors may create venues while existing venue records remain admin-only.
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
  validateSetTimes,
} from "../../../utils/validation.js";
import { getClientIP, parseJsonObjectBody } from "../../../utils/request.js";
import { detectDraftConflicts } from "../../../utils/timeConflicts.js";
import { eventLocalFestivalToday } from "../../../utils/eventDay.js";
import { normalizeBandName } from "../../../utils/bandName.js";
import { inkForNewVenueOrNull } from "../../../utils/venueInk.js";

// The wizard's whole lineup is new, so every row counts as changed. It goes
// through detectDraftConflicts, the one home for "conflicts on the final
// arrangement" (CLAUDE.md #1161), so a rule change there reaches the wizard too.
function findConflict(bands, eventDate) {
  const rows = bands.map((b, i) => ({
    id: i,
    name: b.name,
    venue_id: b.venueIndex,
    start_time: b.startTime,
    end_time: b.endTime,
  }));
  const [first] = detectDraftConflicts(rows, { eventDate, changedIds: new Set(rows.map((r) => r.id)) });
  return first ? `"${first.a.name}" and "${first.b.name}" have overlapping times at the same venue` : null;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) return permCheck.response;
  const currentUser = permCheck.user;

  const body = await parseJsonObjectBody(request);
  if (body === null) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { event: eventInput = {}, venues: venuesInput = [], bands: bandsInput = [] } = body;

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
  // "Past" is judged on the Toronto festival day (CLAUDE.md "Server-side today/now
  // is Toronto-local"): organisers are in Toronto, and at 1 AM tonight's show is
  // still today, so the festival day, not the calendar day, is the cutoff.
  const cutoffStr = eventLocalFestivalToday();
  if (date < cutoffStr) {
    return validationErrorResponse("Draft events created via the wizard cannot have a past date");
  }

  // --- Validate venues ---
  if (!Array.isArray(venuesInput) || venuesInput.length > 50) {
    return new Response(JSON.stringify({ error: "venues must be an array of up to 50 items" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  let sanitizedVenues;
  try {
    sanitizedVenues = venuesInput.map((v, i) => {
      const venueName = sanitizeString(String(v?.name || ""));
      if (!venueName || venueName.length > FIELD_LIMITS.venueName.max) {
        throw new Error(`Venue ${i + 1}: name is required (max ${FIELD_LIMITS.venueName.max} chars)`);
      }
      return {
        name: venueName,
        address: sanitizeString(String(v?.address || "")).slice(0, FIELD_LIMITS.venueAddress.max) || null,
      };
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid request", message: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- Validate bands ---
  if (!Array.isArray(bandsInput) || bandsInput.length > 200) {
    return new Response(JSON.stringify({ error: "bands must be an array of up to 200 items" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  let sanitizedBands;
  try {
    sanitizedBands = bandsInput.map((b, i) => {
      const bandName = sanitizeString(String(b?.name || ""));
      if (!bandName || bandName.length > FIELD_LIMITS.bandName.max) {
        throw new Error(`Band ${i + 1}: name is required (max ${FIELD_LIMITS.bandName.max} chars)`);
      }
      const venueIndex = Number(b?.venueIndex);
      if (!Number.isInteger(venueIndex) || venueIndex < 0 || venueIndex >= sanitizedVenues.length) {
        throw new Error(`Band ${i + 1}: venueIndex ${venueIndex} is out of range`);
      }
      if (!b?.startTime || !b?.endTime) {
        throw new Error(`Band ${i + 1}: start and end time are required`);
      }
      const startCheck = isValidTime(b.startTime);
      if (!startCheck.valid) throw new Error(`Band ${i + 1}: ${startCheck.error}`);
      const endCheck = isValidTime(b.endTime);
      if (!endCheck.valid) throw new Error(`Band ${i + 1}: ${endCheck.error}`);
      const setTimesCheck = validateSetTimes(b.startTime, b.endTime);
      if (!setTimesCheck.valid) {
        throw new Error(`Band ${i + 1}: ${setTimesCheck.error.toLowerCase()}`);
      }
      const [sh, sm] = b.startTime.split(":").map(Number);
      const [eh, em] = b.endTime.split(":").map(Number);
      const startM = sh * 60 + sm;
      const endM = eh * 60 + em;
      if (endM < startM && 24 * 60 - startM + endM > 8 * 60) {
        throw new Error(`Band ${i + 1}: end time must be after start time`);
      }
      let url;
      try {
        url = sanitizeOptionalHttpUrl(b?.url, FIELD_LIMITS.bandUrl.max, "Website URL");
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
    return new Response(JSON.stringify({ error: "Invalid request", message: err.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Detect time conflicts before touching the DB (new event = no pre-existing performances).
  const conflict = findConflict(sanitizedBands, date);
  if (conflict) {
    return new Response(JSON.stringify({ error: `Schedule conflict: ${conflict}` }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event = null;
  try {
    // --- Check for duplicate slug ---
    const existing = await DB.prepare("SELECT id FROM events WHERE slug = ?").bind(slug).first();
    if (existing) {
      return new Response(JSON.stringify({ error: "An event with this slug already exists" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    // --- Create event ---
    event = await DB.prepare(
      `INSERT INTO events (name, date, slug, status, description, created_by_user_id)
       VALUES (?, ?, ?, 'draft', ?, ?)
       RETURNING *`,
    )
      .bind(name, date, slug, description || null, currentUser.userId)
      .first();

    // --- Find or create venues (reuses existing venue if name already taken) ---
    const venueIds = [];
    for (const v of sanitizedVenues) {
      // A new venue gets its stamp ink here too (#1248): the wizard is how
      // editions are usually built, so its venues must not stay uncoloured.
      const existing = await DB.prepare(`SELECT id FROM venues WHERE name = ?`).bind(v.name).first();
      if (!existing) {
        const inkColor = await inkForNewVenueOrNull(DB, v.name);
        await DB.prepare(`INSERT OR IGNORE INTO venues (name, address, ink_color) VALUES (?, ?, ?)`)
          .bind(v.name, v.address, inkColor)
          .run();
      }
      const venue = await DB.prepare(`SELECT id FROM venues WHERE name = ?`).bind(v.name).first();
      venueIds.push(venue.id);
    }

    // --- Upsert band_profiles, then batch-create performances ---
    if (sanitizedBands.length > 0) {
      // Resolve each band profile (find or create) sequentially — dedup by normalized name
      const profileIds = [];
      for (const band of sanitizedBands) {
        const normalized = normalizeBandName(band.name);
        let profile = await DB.prepare("SELECT id FROM band_profiles WHERE name_normalized = ?")
          .bind(normalized)
          .first();
        if (!profile) {
          const socialLinksJson = band.url ? JSON.stringify({ website: band.url }) : null;
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
          ).bind(event.id, venueIds[band.venueIndex], profileIds[i], band.startTime, band.endTime),
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
