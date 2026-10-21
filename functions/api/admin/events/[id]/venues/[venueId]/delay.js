// "Venue running late +N min" (#1249).
// POST   /api/admin/events/{id}/venues/{venueId}/delay  { minutes }  shift remaining sets
// DELETE /api/admin/events/{id}/venues/{venueId}/delay               "back on time": clear the banner
//
// A shift moves every remaining, non-cancelled set at the venue by `minutes`
// and adds them to the venue's cumulative delay (the fan banner). It is ONE
// DB.batch: the first statement claims the venue's delay row by compare-and-
// swap on `revision` and stamps this request's nonce; every set UPDATE and the
// audit row apply only while that nonce is in place. So two simultaneous taps
// can never stack, and the loser writes nothing (migration 0075).
//
// Conflicts are checked on the FINAL arrangement (#1161), never set by set.
// A shift that would push a set across the 06:00 festival-day line is refused:
// that would silently change which festival day the set belongs to.

import { checkPermission } from "../../../../_middleware.js";
import { auditLogStatementWhere } from "../../../../../../utils/auditLogStatement.js";
import { detectDraftConflicts } from "../../../../../../utils/timeConflicts.js";
import { validateId, validateSetTimes } from "../../../../../../utils/validation.js";
import { getClientIP, parseJsonObjectBodyStrict } from "../../../../../../utils/request.js";
import { MAX_SHIFT_MINUTES, MAX_TOTAL_DELAY_MINUTES, planVenueShift } from "../../../../../../utils/venueDelay.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function response(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const CLAIMED_SQL =
  "EXISTS (SELECT 1 FROM event_venue_delays WHERE event_id = ? AND venue_id = ? AND last_shift_id = ?)";

async function loadTarget(context) {
  const { env, params } = context;
  const eventIdCheck = validateId(params?.id);
  if (!eventIdCheck.valid) return { error: response({ error: "Bad request", message: "Invalid event ID" }, 400) };
  const venueIdCheck = validateId(params?.venueId);
  if (!venueIdCheck.valid) return { error: response({ error: "Bad request", message: "Invalid venue ID" }, 400) };
  const eventId = eventIdCheck.value;
  const venueId = venueIdCheck.value;

  const event = await env.DB.prepare("SELECT id, date, status FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return { error: response({ error: "Not found", message: "Event not found" }, 404) };
  if (event.status === "archived") {
    return { error: response({ error: "Validation error", message: "An archived event cannot run late." }, 400) };
  }
  const venue = await env.DB.prepare("SELECT id, name FROM venues WHERE id = ?").bind(venueId).first();
  if (!venue) return { error: response({ error: "Not found", message: "Venue not found" }, 404) };
  const delay = await env.DB.prepare(
    "SELECT delay_minutes, revision FROM event_venue_delays WHERE event_id = ? AND venue_id = ?",
  )
    .bind(eventId, venueId)
    .first();
  return { eventId, venueId, event, venue, delay };
}

// The first statement of every batch here: claim the venue's delay row for
// THIS request. An absent row is created; an existing one is updated only if
// its revision is still the one read (an absent row reads as -1, so a row a
// concurrent request just created is not claimed). The event must still be
// editable, or nothing is claimed at all.
//
// With a `snapshot` (a shift), the claim also requires every set at this
// venue to be EXACTLY as read, and no set added: a per-row edit, a move to or
// from the venue, or a cancel landing between the read and this batch would
// otherwise be overwritten past a conflict check that ran on stale rows
// (Vera and Marlowe, #1249 review). One JSON bind joined with json_each: exact,
// order-independent, and clear of D1's 100-parameter limit.
function claimStatement(env, { eventId, venueId, delay, totalMinutes, nonce, userId, snapshot = null }) {
  const snapshotSql = snapshot
    ? `AND (SELECT COUNT(*) FROM performances WHERE event_id = ? AND venue_id = ?) = ?
       AND (SELECT COUNT(*) FROM performances p JOIN json_each(?) j
              ON p.id = json_extract(j.value, '$.id')
             AND p.start_time IS json_extract(j.value, '$.start')
             AND p.end_time IS json_extract(j.value, '$.end')
             AND p.is_cancelled = json_extract(j.value, '$.cancelled')
            WHERE p.event_id = ? AND p.venue_id = ?) = ?`
    : "";
  const snapshotBinds = snapshot
    ? [eventId, venueId, snapshot.length, JSON.stringify(snapshot), eventId, venueId, snapshot.length]
    : [];
  return env.DB.prepare(
    `INSERT INTO event_venue_delays (event_id, venue_id, delay_minutes, revision, last_shift_id, updated_by)
     SELECT ?, ?, ?, 1, ?, ?
     WHERE EXISTS (SELECT 1 FROM events WHERE id = ? AND status IN ('draft', 'published'))
       ${snapshotSql}
     ON CONFLICT (event_id, venue_id) DO UPDATE SET
       delay_minutes = excluded.delay_minutes,
       revision = event_venue_delays.revision + 1,
       last_shift_id = excluded.last_shift_id,
       updated_at = datetime('now'),
       updated_by = excluded.updated_by
     WHERE event_venue_delays.revision = ?`,
  ).bind(eventId, venueId, totalMinutes, nonce, userId, eventId, ...snapshotBinds, delay ? delay.revision : -1);
}

// Did THIS request's claim land? Only an explicit 0 from the claim means no
// (CLAUDE.md: an absent meta must not decide either way); without a count,
// read the row back and look for this request's nonce.
async function claimLanded(env, result, { eventId, venueId, nonce }) {
  const changes = result?.meta?.changes;
  if (typeof changes === "number") return changes > 0;
  const row = await env.DB.prepare("SELECT last_shift_id FROM event_venue_delays WHERE event_id = ? AND venue_id = ?")
    .bind(eventId, venueId)
    .first();
  return row?.last_shift_id === nonce;
}

const changedConcurrently = () =>
  response(
    {
      error: "Conflict",
      code: "DELAY_CHANGED",
      message: "This venue's delay changed meanwhile. Reload and try again.",
    },
    409,
  );

export async function onRequestPost(context) {
  const { request, env } = context;
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) return permCheck.response;

  const body = await parseJsonObjectBodyStrict(request);
  const minutes = body?.minutes;
  if (!Number.isInteger(minutes) || minutes === 0 || Math.abs(minutes) > MAX_SHIFT_MINUTES) {
    return response(
      {
        error: "Bad request",
        message: `minutes must be a non-zero whole number between -${MAX_SHIFT_MINUTES} and ${MAX_SHIFT_MINUTES}`,
      },
      400,
    );
  }

  try {
    const target = await loadTarget(context);
    if (target.error) return target.error;
    const { eventId, venueId, event, venue, delay } = target;

    const totalMinutes = (delay?.delay_minutes ?? 0) + minutes;
    if (totalMinutes < 0 || totalMinutes > MAX_TOTAL_DELAY_MINUTES) {
      return response(
        {
          error: "Validation error",
          code: "DELAY_OUT_OF_RANGE",
          message: `That would make the venue's delay ${totalMinutes} minutes; it must stay between 0 and ${MAX_TOTAL_DELAY_MINUTES}.`,
        },
        400,
      );
    }

    const performanceResult = await env.DB.prepare(
      `SELECT p.id, p.start_time, p.end_time, p.venue_id, p.performance_date, p.is_cancelled, bp.name
       FROM performances p JOIN band_profiles bp ON p.band_profile_id = bp.id WHERE p.event_id = ?`,
    )
      .bind(eventId)
      .all();
    const performances = performanceResult.results || [];

    const { changes, crossing } = planVenueShift(performances, { venueId, minutes, eventDate: event.date });
    if (crossing.length > 0) {
      return response(
        {
          error: "Conflict",
          code: "SHIFT_CROSSES_FESTIVAL_DAY",
          message: "This shift would move a set across 6 AM, into a different festival day. Edit those sets by hand.",
          sets: crossing,
        },
        409,
      );
    }
    if (changes.length === 0) {
      return response(
        {
          error: "Validation error",
          code: "NO_REMAINING_SETS",
          message: `${venue.name} has no remaining sets to move.`,
        },
        400,
      );
    }

    // The shared set-time rule every write path applies. A shift preserves each
    // set's length, so this should never fire; it is here so it cannot drift.
    for (const change of changes) {
      const timeCheck = validateSetTimes(change.to.startTime, change.to.endTime);
      if (!timeCheck.valid) return response({ error: "Validation error", message: timeCheck.error }, 400);
    }

    const changeById = new Map(changes.map((change) => [change.id, change]));
    const finalRows = performances.map((row) => {
      const change = changeById.get(row.id);
      return change ? { ...row, start_time: change.to.startTime, end_time: change.to.endTime } : row;
    });
    const conflicts = detectDraftConflicts(finalRows, {
      eventDate: event.date,
      changedIds: new Set(changeById.keys()),
    });
    if (conflicts.length > 0) {
      return response(
        { error: "Time conflict detected", message: "The shift overlaps another set at this venue.", conflicts },
        409,
      );
    }

    const nonce = crypto.randomUUID();
    const userId = permCheck.user.userId;
    const snapshot = performances
      .filter((row) => row.venue_id === venueId)
      .map((row) => ({
        id: row.id,
        start: row.start_time ?? null,
        end: row.end_time ?? null,
        cancelled: row.is_cancelled ? 1 : 0,
      }));
    const statements = [claimStatement(env, { eventId, venueId, delay, totalMinutes, nonce, userId, snapshot })];
    for (const change of changes) {
      statements.push(
        env.DB.prepare(
          `UPDATE performances SET start_time = ?, end_time = ?
           WHERE id = ? AND event_id = ? AND venue_id = ? AND ${CLAIMED_SQL}`,
        ).bind(change.to.startTime, change.to.endTime, change.id, eventId, venueId, eventId, venueId, nonce),
      );
    }
    statements.push(
      auditLogStatementWhere(
        env,
        CLAIMED_SQL,
        [eventId, venueId, nonce],
        userId,
        "venue.delay_shifted",
        "event",
        eventId,
        {
          venueId,
          minutes,
          totalMinutes,
          changes: changes.map(({ id, from, to }) => ({ id, from, to })),
        },
        getClientIP(request),
      ),
    );

    const results = await env.DB.batch(statements);
    // The claim lost: a concurrent shift, a set edited or moved meanwhile, or
    // the event archived. Every other statement was gated on it, so nothing
    // was written.
    if (!(await claimLanded(env, results[0], { eventId, venueId, nonce }))) return changedConcurrently();

    return response(
      {
        success: true,
        venueId,
        delayMinutes: totalMinutes,
        shifted: changes.map(({ id, name, to }) => ({ id, name, startTime: to.startTime, endTime: to.endTime })),
      },
      200,
    );
  } catch (error) {
    console.error("Error shifting venue schedule:", {
      eventId: context.params?.id,
      venueId: context.params?.venueId,
      minutes,
      userId: permCheck.user?.userId,
      error: error?.message || error,
    });
    return response({ error: "Database error", message: "Failed to shift the venue's sets" }, 500);
  }
}

// "Back on time": clears the banner. Set times are left exactly as they are.
export async function onRequestDelete(context) {
  const { request, env } = context;
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) return permCheck.response;

  try {
    const target = await loadTarget(context);
    if (target.error) return target.error;
    const { eventId, venueId, delay } = target;
    if (!delay || delay.delay_minutes === 0) {
      return response({ success: true, venueId, delayMinutes: 0 }, 200);
    }

    const nonce = crypto.randomUUID();
    const userId = permCheck.user.userId;
    const results = await env.DB.batch([
      claimStatement(env, { eventId, venueId, delay, totalMinutes: 0, nonce, userId }),
      auditLogStatementWhere(
        env,
        CLAIMED_SQL,
        [eventId, venueId, nonce],
        userId,
        "venue.delay_cleared",
        "event",
        eventId,
        { venueId, previousMinutes: delay.delay_minutes },
        getClientIP(request),
      ),
    ]);
    if (!(await claimLanded(env, results[0], { eventId, venueId, nonce }))) return changedConcurrently();
    return response({ success: true, venueId, delayMinutes: 0 }, 200);
  } catch (error) {
    console.error("Error clearing venue delay:", {
      eventId: context.params?.id,
      venueId: context.params?.venueId,
      userId: permCheck.user?.userId,
      error: error?.message || error,
    });
    return response({ error: "Database error", message: "Failed to clear the venue's delay" }, 500);
  }
}
