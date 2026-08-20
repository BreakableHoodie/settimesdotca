// Admin API: bulk-import a lineup of bands for an event.
// POST /api/admin/bands/import
// Body: { event_id, bands: [{ name, start_time, end_time, venue, genre, origin }] }
//
// Import is all-or-nothing: every row is validated up front, and if any row is
// invalid nothing is written (400 + per-row errors). During the write phase, any
// unexpected failure triggers a compensating delete of everything this request
// created, so a lineup is never left half-imported.
import { auditLog, checkPermission } from "../_middleware.js";
import { getClientIP } from "../../../utils/request.js";
import { isValidTime, validateSetTimes } from "../../../utils/validation.js";
import { normalizeBandName } from "../../../utils/bandName.js";

const MAX_IMPORT_ROWS = 200;
const MAX_NAME_LENGTH = 200;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: editor or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) return permCheck.response;
  const user = permCheck.user;
  const ipAddress = getClientIP(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventId = Number(body.event_id);
  const rows = Array.isArray(body.bands) ? body.bands : [];

  if (!Number.isInteger(eventId) || eventId <= 0) {
    return json({ error: "Invalid event_id" }, 400);
  }
  if (rows.length === 0) {
    return json({ error: "No bands provided" }, 400);
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return json({ error: `Maximum ${MAX_IMPORT_ROWS} bands per import` }, 400);
  }

  const event = await DB.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) {
    return json({ error: "Event not found" }, 404);
  }

  // Resolve venues by name (case-insensitive) up front.
  const venues = await DB.prepare("SELECT id, name FROM venues").all();
  const venueByName = new Map((venues.results || []).map((v) => [v.name.toLowerCase(), v.id]));

  // Validate every row before writing anything — import is all-or-nothing.
  const errors = [];
  const prepared = rows.map((row, i) => {
    const rowNum = i + 1;
    const name = typeof row?.name === "string" ? row.name.trim() : "";
    if (!name) {
      errors.push(`Row ${rowNum}: name is required`);
      return null;
    }
    if (name.length > MAX_NAME_LENGTH) {
      errors.push(`Row ${rowNum}: name exceeds ${MAX_NAME_LENGTH} characters`);
      return null;
    }
    const startTime = row.start_time ? String(row.start_time).trim() : null;
    const endTime = row.end_time ? String(row.end_time).trim() : null;
    if (startTime && !isValidTime(startTime).valid) {
      errors.push(`Row ${rowNum}: invalid start_time "${startTime}"`);
      return null;
    }
    if (endTime && !isValidTime(endTime).valid) {
      errors.push(`Row ${rowNum}: invalid end_time "${endTime}"`);
      return null;
    }
    const setTimesCheck = validateSetTimes(startTime, endTime);
    if (!setTimesCheck.valid) {
      errors.push(`Row ${rowNum}: ${setTimesCheck.error.toLowerCase()}`);
      return null;
    }
    let venueId = null;
    if (row.venue) {
      const key = String(row.venue).trim().toLowerCase();
      if (!venueByName.has(key)) {
        errors.push(`Row ${rowNum}: venue "${row.venue}" not found`);
        return null;
      }
      venueId = venueByName.get(key);
    }
    return {
      name,
      nameNormalized: normalizeBandName(name),
      genre: row.genre ? String(row.genre).trim() : null,
      origin: row.origin ? String(row.origin).trim() : null,
      startTime,
      endTime,
      venueId,
    };
  });

  if (errors.length > 0) {
    return json({ success: false, error: "Validation failed", errors }, 400);
  }

  // Write phase: find-or-create profile + insert performance per row.
  // Track what we create so we can roll back on any failure.
  const insertedPerformanceIds = [];
  const createdProfileIds = [];
  try {
    for (const p of prepared) {
      let profile = await DB.prepare("SELECT id FROM band_profiles WHERE name_normalized = ?")
        .bind(p.nameNormalized)
        .first();

      if (!profile) {
        profile = await DB.prepare(
          `INSERT INTO band_profiles (name, name_normalized, genre, origin, is_active)
           VALUES (?, ?, ?, ?, 1) RETURNING id`,
        )
          .bind(p.name, p.nameNormalized, p.genre, p.origin)
          .first();
        if (!profile) throw new Error("band_profiles INSERT returned null");
        createdProfileIds.push(profile.id);
      }

      const perf = await DB.prepare(
        `INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(eventId, p.venueId, profile.id, p.startTime, p.endTime)
        .first();
      if (!perf) throw new Error("performances INSERT returned null");
      insertedPerformanceIds.push(perf.id);
    }
  } catch (err) {
    // Compensating delete — undo everything this import created.
    for (const id of insertedPerformanceIds) {
      await DB.prepare("DELETE FROM performances WHERE id = ?").bind(id).run();
    }
    for (const id of createdProfileIds) {
      await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(id).run();
    }
    console.error("Bulk import failed, rolled back:", err);
    return json({ error: "Import failed", message: "No bands were imported" }, 500);
  }

  await auditLog(
    env,
    user.userId,
    "bands.imported",
    "event",
    eventId,
    {
      imported: insertedPerformanceIds.length,
      createdProfiles: createdProfileIds.length,
    },
    ipAddress,
  );

  return json(
    {
      success: true,
      imported: insertedPerformanceIds.length,
      createdProfiles: createdProfileIds.length,
      performance_ids: insertedPerformanceIds,
    },
    201,
  );
}
