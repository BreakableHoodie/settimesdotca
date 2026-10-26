// Public API: every edition, and who and where kept coming back (#1250)
// GET /api/history
//
// Powers the "Every edition" page: a poster wall of every public edition plus
// two aggregate views drawn from data we already hold. No new collection.
//
// PRIVACY: public data only (event, artist and venue names, dates, posters,
// counts). Never a person, a follower or a schedule build.
//
// A "counted" set, everywhere below: its edition passes publicEventStatusSql
// (archived means concluded, not hidden), it is not cancelled, and it passes
// the reveal-mode gate, so an unannounced set on a reveal-mode edition is not
// leaked through a count.

import { getPublicDataGateResponse } from "../utils/publicGate.js";
import { CACHE_SHOW_CRITICAL } from "../utils/cacheHeaders.js";
import { concludedEventSql, publicEventStatusSql } from "../utils/eventVisibility.js";
import { eventLocalFestivalToday } from "../utils/eventDay.js";

// The most-returning artists listed; the page is a highlight, not a directory.
export const REGULARS_LIMIT = 24;
// An artist is a regular once they have played this many distinct editions.
export const REGULARS_MIN_EDITIONS = 2;

const COUNTED_SET = `p.is_cancelled = 0 AND (e.reveal_mode = 0 OR p.is_announced = 1)`;

// Distinct (key, edition) rows -> one entry per key with its edition count and
// the first and last edition, oldest by date.
function byEditions(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key) ?? { row, editions: new Set(), first: row, last: row };
    group.editions.add(row.event_slug);
    if (row.event_date < group.first.event_date) group.first = row;
    if (row.event_date > group.last.event_date) group.last = row;
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function onRequestGet(context) {
  const { env } = context;

  const gate = getPublicDataGateResponse(env);
  if (gate) return gate;

  const { DB } = env;

  try {
    const [editionsRes, bandRowsRes, venueRowsRes] = await DB.batch([
      DB.prepare(
        `SELECT e.slug, e.name, e.date, e.end_date, e.poster_url,
                CASE WHEN ${concludedEventSql("e")} THEN 1 ELSE 0 END AS concluded,
                (SELECT COUNT(*) FROM performances p
                  WHERE p.event_id = e.id AND ${COUNTED_SET}) AS sets,
                (SELECT COUNT(DISTINCT p.venue_id) FROM performances p
                  WHERE p.event_id = e.id AND p.venue_id IS NOT NULL AND ${COUNTED_SET}) AS venues
         FROM events e
         WHERE ${publicEventStatusSql("e")}
         ORDER BY e.date DESC`,
      ).bind(eventLocalFestivalToday()),
      DB.prepare(
        `SELECT DISTINCT bp.id AS band_profile_id, bp.name,
                e.slug AS event_slug, e.name AS event_name, e.date AS event_date
         FROM performances p
         JOIN events e ON e.id = p.event_id
         JOIN band_profiles bp ON bp.id = p.band_profile_id
         WHERE ${publicEventStatusSql("e")} AND bp.is_active = 1 AND ${COUNTED_SET}`,
      ),
      DB.prepare(
        `SELECT DISTINCT v.id AS venue_id, v.name,
                e.slug AS event_slug, e.date AS event_date
         FROM performances p
         JOIN events e ON e.id = p.event_id
         JOIN venues v ON v.id = p.venue_id
         WHERE ${publicEventStatusSql("e")} AND ${COUNTED_SET}`,
      ),
    ]);

    const editions = (editionsRes.results ?? []).map((e) => ({
      slug: e.slug,
      name: e.name,
      date: e.date,
      end_date: e.end_date || null,
      poster_url: e.poster_url || null,
      concluded: e.concluded === 1,
      sets: e.sets,
      venues: e.venues,
    }));

    const regulars = byEditions(bandRowsRes.results ?? [], (r) => r.band_profile_id)
      .filter((g) => g.editions.size >= REGULARS_MIN_EDITIONS)
      .sort((a, b) => b.editions.size - a.editions.size || a.row.name.localeCompare(b.row.name))
      .slice(0, REGULARS_LIMIT)
      .map((g) => ({
        band_profile_id: g.row.band_profile_id,
        name: g.row.name,
        editions: g.editions.size,
        first: { slug: g.first.event_slug, name: g.first.event_name, date: g.first.event_date },
      }));

    const venues = byEditions(venueRowsRes.results ?? [], (r) => r.venue_id)
      .sort((a, b) => b.editions.size - a.editions.size || a.row.name.localeCompare(b.row.name))
      .map((g) => ({
        venue_id: g.row.venue_id,
        name: g.row.name,
        editions: g.editions.size,
        first_date: g.first.event_date,
        last_date: g.last.event_date,
      }));

    return new Response(JSON.stringify({ editions, regulars, venues }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Show-critical, not browse: a set cancelled during a live edition
        // changes its counts (cacheHeaders.js rule for p.is_cancelled).
        "Cache-Control": CACHE_SHOW_CRITICAL,
      },
    });
  } catch (error) {
    console.error("Error fetching edition history:", error);
    return new Response(JSON.stringify({ error: "Database error", message: "Failed to fetch edition history" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
