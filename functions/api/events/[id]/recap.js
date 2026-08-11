import { getPublicDataGateResponse } from "../../../utils/publicGate.js";
import { normalizeHttpUrl, validateId } from "../../../utils/validation.js";
import { sortableName } from "../../../utils/sortableName.js";
import { concludedEventSql, publicEventStatusSql } from "../../../utils/eventVisibility.js";
import { eventLocalFestivalToday } from "../../../utils/eventDay.js";

// SQLite `ORDER BY` can't strip a leading article inline (#587); the SQL
// query below is a coarse pre-sort and this comparator re-derives the exact
// ordering afterward, swapping the name comparison for the article-stripped
// `sortableName` key. Mirrors SQLite's default NULLS-first-for-ASC handling
// with an explicit NULLS LAST override (matching `... NULLS LAST` in the SQL).
function compareStartTimeNullsLast(a, b) {
  if (a.start_time == null && b.start_time == null) return 0;
  if (a.start_time == null) return 1;
  if (b.start_time == null) return -1;
  return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
}

// (#743) A multi-day event's sets must sort by the DAY they belong to before
// clock time — sorting on start_time alone interleaves days (a Day 3 16:10
// set sorting ahead of a Day 1 20:00 set). `performance_date` is NULL for
// day-1 sets and single-day events (#543 convention), so it falls back to the
// event's own start date. Returns a comparator closed over that fallback.
function comparePerformanceDayThenStartTime(eventDate) {
  return (a, b) => {
    const dayA = a.performance_date || eventDate;
    const dayB = b.performance_date || eventDate;
    if (dayA !== dayB) {
      return dayA < dayB ? -1 : 1;
    }
    return compareStartTimeNullsLast(a, b);
  };
}

/**
 * Public API: Get recap stats and band list for a single archived event
 *
 * GET /api/events/:id/recap
 *
 * Returns 404 if the event is not found or is not archived.
 * Accepts numeric ID or slug in params.id.
 */
export async function onRequestGet(context) {
  const { env, params } = context;

  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }

  const { DB } = env;

  // Resolve event by numeric ID or slug
  const rawId = params.id;
  const numericId = Number(rawId);
  const isNumeric = Number.isFinite(numericId) && String(numericId) === rawId;

  // A value that LOOKS numeric must still clear validateId() before it reaches
  // a query -- the repo-wide contract for Pages `params.id` (matching
  // functions/api/events/[id]/details.js). Number.isFinite() alone accepted
  // "0", "-3" and "1.5" and bound them straight through. Slugs are unaffected:
  // Number("bf2") is NaN, so they take the slug branch below.
  const idCheck = isNumeric ? validateId(rawId) : null;
  if (idCheck && !idCheck.valid) {
    return new Response(JSON.stringify({ error: "Invalid event id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // A recap exists iff the event is publicly visible AND concluded (#787) --
  // NOT `status = 'archived'` alone. Archiving is an admin housekeeping click
  // that can lag the event's real end by days (BF2 sat unarchived for three),
  // and gating on it made this API 404 for a published, finished event whose
  // recap URL the sitemap already advertised and whose SSR meta
  // functions/events/[slug]/recap.js already served -- an indexable soft-404.
  // All three paths now ask the same question the same way.
  //
  // concludedEventSql() embeds one `?`, bound AFTER the id/slug below. The
  // value must be eventLocalFestivalToday(): an event ending at 2 AM is still
  // running, so the festival day steps back below the 6 AM threshold rather
  // than declaring it over at midnight.
  const concludedBy = eventLocalFestivalToday();

  try {
    const event = isNumeric
      ? await DB.prepare(
          `SELECT id, name, slug, date, end_date, poster_url FROM events WHERE id = ? AND ${concludedEventSql()} LIMIT 1`,
        )
          .bind(idCheck.value, concludedBy)
          .first()
      : await DB.prepare(
          `SELECT id, name, slug, date, end_date, poster_url FROM events WHERE slug = ? AND ${concludedEventSql()} LIMIT 1`,
        )
          .bind(rawId, concludedBy)
          .first();

    if (!event) {
      return new Response(JSON.stringify({ error: "Event not found or has not concluded" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Read-path sanitize (#504 convention, #616): never reflect a
    // pre-validation legacy poster_url to public API consumers.
    event.poster_url = normalizeHttpUrl(event.poster_url);

    const bandsResult = await DB.prepare(
      `
      SELECT
        bp.id   AS band_id,
        p.id    AS performance_id,
        bp.name AS band_name,
        bp.genre,
        bp.photo_url,
        p.start_time,
        p.end_time,
        p.performance_date,
        v.id   AS venue_id,
        v.name AS venue_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM performances p2
          JOIN events e2 ON p2.event_id = e2.id
          WHERE p2.band_profile_id = bp.id
            AND p2.event_id != ?
            -- A recap can be generated shortly after an event goes live, before
            -- it's archived — restricting to status='archived' would then miss
            -- prior editions that are only published so far and wrongly call a
            -- returning act a first-timer. published-or-archived covers both.
            AND ${publicEventStatusSql("e2")}
            -- "Returning" means chronologically earlier, not merely "some other
            -- event" (#613): without this, a band that only played a LATER
            -- archived edition counted as returning at an EARLIER one. Same-day
            -- events tie-break on id for a deterministic ordering.
            AND (e2.date < ? OR (e2.date = ? AND e2.id < ?))
        ) THEN 1 ELSE 0 END AS is_returning
      FROM performances p
      JOIN band_profiles bp ON p.band_profile_id = bp.id
      LEFT JOIN venues v ON p.venue_id = v.id
      WHERE p.event_id = ?
      -- p.id is the final, UNIQUE key: bp.name alone still ties when one band
      -- plays two sets in the same slot, and SQLite gives no stable order for
      -- a full tie. Matches details.js and venues/[id].js.
      ORDER BY COALESCE(p.performance_date, ?) ASC, p.start_time NULLS LAST, bp.name, p.id
      `,
    )
      .bind(event.id, event.date, event.date, event.id, event.id, event.date)
      .all();

    const rows = bandsResult.results || [];

    // Aggregate stats from rows
    const venueIds = new Set();
    let firstTimers = 0;
    let returningActs = 0;

    const bands = rows.map((row) => {
      if (row.venue_id) {
        venueIds.add(row.venue_id);
      }
      const isReturning = row.is_returning === 1;
      if (isReturning) {
        returningActs++;
      } else {
        firstTimers++;
      }

      return {
        id: row.band_id,
        performance_id: row.performance_id,
        name: row.band_name,
        genre: row.genre,
        photo_url: row.photo_url,
        start_time: row.start_time,
        end_time: row.end_time,
        // NULL for day-1 sets and single-day events (#543 convention) --
        // exposed raw, not synthesized to event.date, since
        // formatPerformanceDayLabel() already falls back to event_date itself
        // when performance_date is absent.
        performance_date: row.performance_date,
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        is_returning: isReturning,
      };
    });

    const comparePerformanceDay = comparePerformanceDayThenStartTime(event.date);
    bands.sort((a, b) => comparePerformanceDay(a, b) || sortableName(a.name).localeCompare(sortableName(b.name)));

    const stats = {
      total_sets: rows.length, // performance slots; one band playing two sets counts as 2
      venue_count: venueIds.size,
      first_timers: firstTimers,
      returning_acts: returningActs,
    };

    return new Response(JSON.stringify({ event, stats, bands }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching event recap:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch event recap" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
