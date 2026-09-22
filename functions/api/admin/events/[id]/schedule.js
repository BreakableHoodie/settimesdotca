// Atomically update the schedule for several performances.
// PUT /api/admin/events/{id}/schedule

import { checkPermission } from "../../_middleware.js";
import { auditLogStatementForInsertedRow } from "../../../../utils/auditLogStatement.js";
import { detectDraftConflicts } from "../../../../utils/timeConflicts.js";
import { isValidTime, MAX_BULK_BAND_IDS, validateId, validateSetTimes } from "../../../../utils/validation.js";
import { getClientIP, parseJsonObjectBodyStrict } from "../../../../utils/request.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function response(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizeTime(value) {
  return value === "" || value === null ? null : value;
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) return permCheck.response;

  const eventIdCheck = validateId(params?.id);
  if (!eventIdCheck.valid) return response({ error: "Bad request", message: "Invalid event ID" }, 400);
  const eventId = eventIdCheck.value;

  const body = await parseJsonObjectBodyStrict(request);
  if (!body || !Array.isArray(body.changes) || body.changes.length === 0) {
    return response({ error: "Bad request", message: "changes must be a non-empty array" }, 400);
  }
  if (body.changes.length > MAX_BULK_BAND_IDS) {
    return response({ error: "Bad request", message: `Maximum ${MAX_BULK_BAND_IDS} changes allowed per request` }, 400);
  }

  const changes = [];
  const ids = new Set();
  for (let index = 0; index < body.changes.length; index += 1) {
    const row = body.changes[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return response({ error: "Bad request", message: `Invalid change at index ${index}` }, 400);
    }
    for (const key of ["id", "startTime", "endTime", "venueId"]) {
      if (!Object.prototype.hasOwnProperty.call(row, key)) {
        return response({ error: "Bad request", message: `Change ${index + 1} is missing ${key}` }, 400);
      }
    }
    const idCheck = validateId(row.id);
    if (!idCheck.valid)
      return response({ error: "Bad request", message: `Invalid performance ID at row ${index + 1}` }, 400);
    const id = idCheck.value;
    if (ids.has(id)) return response({ error: "Bad request", message: `Duplicate performance ID ${id}` }, 400);
    ids.add(id);

    const startTime = normalizeTime(row.startTime);
    const endTime = normalizeTime(row.endTime);
    for (const [label, value] of [
      ["start", startTime],
      ["end", endTime],
    ]) {
      if (value !== null && (typeof value !== "string" || !isValidTime(value).valid)) {
        return response({ error: "Validation error", message: `Invalid ${label} time at row ${index + 1}` }, 400);
      }
    }
    const timeCheck = validateSetTimes(startTime, endTime);
    if (!timeCheck.valid) return response({ error: "Validation error", message: timeCheck.error }, 400);
    const venueId = !row.venueId || Number(row.venueId) <= 0 ? null : Number(row.venueId);
    changes.push({ id, startTime, endTime, venueId });
  }

  try {
    const event = await env.DB.prepare("SELECT id, date, status FROM events WHERE id = ?").bind(eventId).first();
    if (!event) return response({ error: "Not found", message: "Event not found" }, 404);
    if (event.status === "archived") {
      return response(
        {
          error: "Validation error",
          message: "Archived event set times cannot be edited. Copy the event as a template instead.",
        },
        400,
      );
    }

    const performanceResult = await env.DB.prepare(
      `SELECT p.id, p.start_time, p.end_time, p.venue_id, p.performance_date, bp.name
       FROM performances p JOIN band_profiles bp ON p.band_profile_id = bp.id WHERE p.event_id = ?`,
    )
      .bind(eventId)
      .all();
    const performances = performanceResult.results || [];
    const performanceById = new Map(performances.map((performance) => [performance.id, performance]));
    for (const change of changes) {
      if (!performanceById.has(change.id)) {
        return response(
          { error: "Bad request", message: `Performance ${change.id} does not belong to this event` },
          400,
        );
      }
    }

    const venueIds = [...new Set(changes.map((change) => change.venueId).filter((id) => id !== null))];
    for (let index = 0; index < venueIds.length; index += 100) {
      const chunk = venueIds.slice(index, index + 100);
      const placeholders = chunk.map(() => "?").join(",");
      const venueResult = await env.DB.prepare(`SELECT id FROM venues WHERE id IN (${placeholders})`)
        .bind(...chunk)
        .all();
      const existing = new Set((venueResult.results || []).map((venue) => venue.id));
      const missing = chunk.find((venueId) => !existing.has(venueId));
      if (missing !== undefined) return response({ error: "Not found", message: "Venue not found" }, 404);
    }

    const finalRows = performances.map((performance) => {
      const change = changes.find((candidate) => candidate.id === performance.id);
      return change
        ? { ...performance, start_time: change.startTime, end_time: change.endTime, venue_id: change.venueId }
        : performance;
    });
    const conflicts = detectDraftConflicts(finalRows, { eventDate: event.date, changedIds: ids });
    if (conflicts.length > 0) {
      return response(
        {
          error: "Time conflict detected",
          message: "This time overlaps another set at the same venue.",
          conflicts,
        },
        409,
      );
    }

    const statements = changes.map((change) =>
      env.DB.prepare(
        `UPDATE performances SET start_time = ?, end_time = ?, venue_id = ?
         WHERE id = ? AND event_id = ? AND EXISTS (
           SELECT 1 FROM events WHERE id = ? AND status IN ('draft', 'published')
         )`,
      ).bind(change.startTime, change.endTime, change.venueId, change.id, eventId, eventId),
    );
    statements.push(
      auditLogStatementForInsertedRow(
        env,
        permCheck.user.userId,
        "event.schedule_updated",
        "event",
        // The SAME status predicate as the UPDATEs above. Pinning the status read
        // at request start (`status = ?`) meant a concurrent draft<->published
        // toggle let every UPDATE commit while this insert matched nothing:
        // a schedule change with no audit row (Vera, #1161 review).
        { table: "events", where: { id: eventId, status: ["draft", "published"] } },
        {
          changes: changes.map((change) => {
            const previous = performanceById.get(change.id);
            return {
              id: change.id,
              from: { startTime: previous.start_time, endTime: previous.end_time, venueId: previous.venue_id },
              to: { startTime: change.startTime, endTime: change.endTime, venueId: change.venueId },
            };
          }),
        },
        getClientIP(request),
      ),
    );
    const results = await env.DB.batch(statements);
    // ONLY an explicit 0 counts as "not applied" (same rule as bands/photos.js).
    // D1's `meta` shape is not safe to depend on; treating an ABSENT count as 0
    // would answer 409 "not saved" for a batch that fully committed, and the
    // admin would redo work that already landed. An explicit 0 means the EXISTS
    // guard fired: the event was archived between the read and this write, so
    // every UPDATE and the status-conditioned audit row matched nothing.
    const updateResults = results.slice(0, changes.length);
    if (updateResults.some((result) => result?.meta?.changes === 0)) {
      return response({ error: "Conflict", message: "Event status changed concurrently. Reload and try again." }, 409);
    }
    const updated = changes.length;

    return response(
      {
        success: true,
        updated,
        performances: finalRows
          .filter((row) => ids.has(row.id))
          .map((row) => ({
            id: row.id,
            name: row.name,
            startTime: row.start_time,
            endTime: row.end_time,
            venueId: row.venue_id,
            performanceDate: row.performance_date,
          })),
      },
      200,
    );
  } catch (error) {
    console.error("Error updating event schedule:", error);
    return response({ error: "Database error", message: "Failed to update event schedule" }, 500);
  }
}
