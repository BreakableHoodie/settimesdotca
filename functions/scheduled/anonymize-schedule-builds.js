// Replaces per-event schedule-build pseudonyms with anonymous sequence labels
// once an event is more than SCHEDULE_BUILD_ANONYMIZATION_DAYS past its last
// day (#1245). Exact pick and distinct-builder counts are preserved; the row
// keeps nothing derived from the client's id.
import { eventLocalFestivalToday } from "../utils/eventDay.js";

export const SCHEDULE_BUILD_ANONYMIZATION_DAYS = 30;

// Statements per DB.batch. Each batch is atomic, and a partial run is safe:
// the next run continues from the event's current maximum label.
const BATCH_SIZE = 50;

function anonNumber(value) {
  const match = /^anon:(\d+)$/.exec(value);
  return match ? Number(match[1]) : 0;
}

async function anonymizeEvent(DB, eventId) {
  const rows = await DB.prepare("SELECT DISTINCT visitor_hash FROM schedule_builds WHERE event_id = ?")
    .bind(eventId)
    .all();
  const values = (rows.results || []).map((row) => row.visitor_hash);
  const pending = values.filter((value) => !value.startsWith("anon:")).sort();
  if (pending.length === 0) return;

  const maxAnonNumber = values.reduce((max, value) => Math.max(max, anonNumber(value)), 0);

  // The NOT EXISTS makes each rewrite collision-proof even if another run
  // labelled rows after our read: a label already in use turns the statement
  // into a no-op, and that value is picked up by the next run instead of
  // being merged with a different builder.
  const statements = pending.map((value, index) => {
    const label = `anon:${maxAnonNumber + index + 1}`;
    return DB.prepare(
      `UPDATE schedule_builds SET visitor_hash = ?
       WHERE event_id = ? AND visitor_hash = ?
         AND NOT EXISTS (SELECT 1 FROM schedule_builds WHERE event_id = ? AND visitor_hash = ?)`,
    ).bind(label, eventId, value, eventId, label);
  });

  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await DB.batch(statements.slice(i, i + BATCH_SIZE));
  }
}

export async function anonymizeScheduleBuilds(_event, env, _ctx) {
  const { DB } = env;
  if (!DB) {
    console.error("[scheduled] Failed to anonymise schedule builds: DB binding is missing");
    return { failures: ["anonymize-schedule-builds"] };
  }

  const failures = [];

  let events;
  try {
    // Keyed on the event's last DATE, not its status: an event moved back to
    // draft after it ran must still be anonymised, or the policy's promise
    // silently stops applying to it.
    events = await DB.prepare(
      `SELECT DISTINCT sb.event_id AS id
       FROM schedule_builds sb
       JOIN events e ON e.id = sb.event_id
       WHERE COALESCE(e.end_date, e.date) < date(?, ?)
         AND sb.visitor_hash NOT LIKE 'anon:%'
       ORDER BY sb.event_id`,
    )
      .bind(eventLocalFestivalToday(), `-${SCHEDULE_BUILD_ANONYMIZATION_DAYS} days`)
      .all();
  } catch (error) {
    console.error("[scheduled] Failed to list events for schedule-build anonymisation", error);
    return { failures: ["anonymize-schedule-builds"] };
  }

  // One event's failure must not skip the rest, every day, indefinitely.
  for (const event of events.results || []) {
    try {
      await anonymizeEvent(DB, event.id);
    } catch (error) {
      console.error("[scheduled] Failed to anonymise schedule builds for event", event.id, error);
      failures.push(`anonymize-schedule-builds(event ${event.id})`);
    }
  }

  return { failures };
}
