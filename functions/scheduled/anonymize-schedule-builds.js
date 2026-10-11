import { eventLocalFestivalToday } from "../utils/eventDay.js";
import { concludedEventSql } from "../utils/eventVisibility.js";

export const SCHEDULE_BUILD_ANONYMIZATION_DAYS = 30;

function anonNumber(value) {
  const match = /^anon:(\d+)$/.exec(value);
  return match ? Number(match[1]) : 0;
}

export async function anonymizeScheduleBuilds(_event, env, _ctx) {
  const { DB } = env;
  if (!DB) return;

  try {
    const today = eventLocalFestivalToday();
    const events = await DB.prepare(
      `SELECT e.id
       FROM events e
       WHERE ${concludedEventSql("e")}
         AND COALESCE(e.end_date, e.date) < date(?, '-${SCHEDULE_BUILD_ANONYMIZATION_DAYS} days')`,
    )
      .bind(today, today)
      .all();

    for (const event of events.results || []) {
      const rows = await DB.prepare("SELECT DISTINCT visitor_hash FROM schedule_builds WHERE event_id = ?")
        .bind(event.id)
        .all();
      const values = rows.results || [];
      const nonAnonValues = [
        ...new Set(values.map((row) => row.visitor_hash).filter((value) => !value.startsWith("anon:"))),
      ].sort();
      const maxAnonNumber = values.reduce((max, row) => Math.max(max, anonNumber(row.visitor_hash)), 0);
      const statements = nonAnonValues.map((value, index) =>
        DB.prepare("UPDATE schedule_builds SET visitor_hash = ? WHERE event_id = ? AND visitor_hash = ?").bind(
          `anon:${maxAnonNumber + index + 1}`,
          event.id,
          value,
        ),
      );

      if (statements.length > 0) {
        // Existing anon labels remain unchanged; new labels start after the
        // largest numeric label, so no event-local unique key can collide.
        await DB.batch(statements);
      }
    }
  } catch (error) {
    console.error("[scheduled] Failed to anonymize schedule builds", error);
  }
}
