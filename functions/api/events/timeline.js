import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { normalizeHttpUrl } from "../../utils/validation.js";
import { eventLocalToday, eventLocalClock } from "../../utils/eventDay.js";

/**
 * 24-hour "HH:MM" time regex — mirrors DOORS_TIME_REGEX in validation.js.
 * Kept local (not imported) so a malformed/legacy doors_json or start_time
 * value here is simply treated as "no info" rather than throwing.
 */
const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Sets starting before 06:00 are after-midnight sets that belong to the
 * PREVIOUS evening (the AFTER_MIDNIGHT_THRESHOLD_HOUR = 6 convention, see
 * frontend/src/utils/bandUtils.js and CLAUDE.md). They must never define the
 * first day's start edge — a 1 AM set would otherwise mark the event
 * "started" in the small hours of a morning whose show doesn't begin until
 * evening.
 */
const AFTER_MIDNIGHT_THRESHOLD = "06:00";

/**
 * Normalizes a performances.start_time value ("HH:MM", "HH:MM:SS", or legacy
 * "YYYY-MM-DD HH:MM") to zero-padded "HH:MM"; null when absent/unparseable.
 */
function normalizeStartTime(startTime) {
  if (!startTime || typeof startTime !== "string") return null;
  const timePart = startTime.includes(" ") ? startTime.split(" ")[1] : startTime;
  const hhmm = timePart ? timePart.slice(0, 5) : "";
  return HHMM_REGEX.test(hhmm) ? hhmm : null;
}

/**
 * Start-edge gate (#569): an event's FIRST day isn't "Happening Now" at local
 * midnight. The start edge is, in precedence order: the day's doors/gates
 * time (doors_json) → the first set's start time → local midnight (no gate —
 * pre-#569 behaviour when neither signal exists). The earliest available
 * signal wins, so a set that is already playing is never gated even if
 * doors_json claims a later opening. Only the first day is gated
 * (`info.date === clock.date`); day 2+ of a multi-day event stays "now" from
 * midnight (mid-festival mornings aren't re-gated). Malformed/missing
 * doors_json is treated as absent — this never throws.
 *
 * @param {{ date: string, doors_json: string|null|undefined, firstDayStart: string|null }} info
 * @param {{ date: string, time: string }} clock - eventLocalClock()
 * @returns {boolean} true when the event should be held out of "now" until its start edge
 */
function isGatedBeforeStart(info, clock) {
  if (info.date !== clock.date) {
    return false;
  }

  let doorsTime = null;
  if (info.doors_json) {
    try {
      const parsed = JSON.parse(info.doors_json);
      const value = parsed?.[info.date];
      if (typeof value === "string" && HHMM_REGEX.test(value)) {
        doorsTime = value;
      }
    } catch {
      // Malformed doors_json — treated as absent, fall through to first set.
    }
  }

  const signals = [doorsTime, info.firstDayStart].filter(Boolean);
  if (signals.length === 0) {
    return false; // midnight fallback: never gated (pre-#569 behaviour)
  }
  const startEdge = signals.reduce((a, b) => (a < b ? a : b));
  // Zero-padded HH:MM string compare — same trick used throughout the repo
  // for YYYY-MM-DD (see CLAUDE.md).
  return clock.time < startEdge;
}

/**
 * Public API: Get events timeline (now, upcoming, past)
 *
 * GET /api/events/timeline
 *
 * Returns events grouped by time period with bands and venues
 *
 * Performance: Uses JOIN queries to avoid N+1 query pattern
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const { DB } = env;

  const formatOrigin = (band) => {
    if (!band) return null;
    const parts = [band.origin_city, band.origin_region].filter(Boolean);
    return parts.length ? parts.join(", ") : band.origin || null;
  };

  const formatVenueAddress = (venue) => {
    if (!venue) return null;
    const line1 = [venue.address_line1, venue.address_line2].filter(Boolean).join(", ");
    const line2 = [venue.city, venue.region].filter(Boolean).join(", ");
    const line3 = [venue.postal_code, venue.country].filter(Boolean).join(" ").trim();
    return [line1, line2, line3].filter(Boolean).join(", ");
  };

  try {
    const url = new URL(request.url);
    const includeNow = url.searchParams.get("now") !== "false"; // default true
    const includeUpcoming = url.searchParams.get("upcoming") !== "false"; // default true
    const includePast = url.searchParams.get("past") !== "false"; // default true
    const includeBands = url.searchParams.get("includeBands") !== "false"; // default true
    const parsedPastLimit = parseInt(url.searchParams.get("pastLimit") || "10", 10);
    const pastLimit = Number.isFinite(parsedPastLimit) ? Math.min(Math.max(parsedPastLimit, 1), 100) : 10;

    const response = {
      now: [],
      upcoming: [],
      past: [],
    };

    const today = eventLocalToday(); // YYYY-MM-DD, events' local (Toronto) day — not UTC

    // Helper function to group bands by event (processes results from JOIN query)
    function groupEventData(rows) {
      const eventsMap = new Map();

      for (const row of rows) {
        if (!eventsMap.has(row.event_id)) {
          eventsMap.set(row.event_id, {
            id: row.event_id,
            name: row.event_name,
            slug: row.event_slug,
            date: row.event_date,
            // NULL for single-day events. Exposed so clients can pass
            // end_date || date to schedule stale-detection (#542 PR-1) —
            // keying staleness on the start date wipes a fan's saved
            // schedule on day 2 of a multi-day event.
            end_date: row.event_end_date || null,
            status: row.event_status || null,
            ticket_url: normalizeHttpUrl(row.ticket_url),
            // Read-path sanitize (#658, matches the ticket_url precedent
            // above): a pre-#616 legacy poster_url (e.g. a javascript:
            // scheme) must never be reflected to this public, unauthenticated
            // endpoint. Functionally dependent on event_id (one value per
            // event), so any row carries the same value.
            poster_url: normalizeHttpUrl(row.poster_url),
            bands: includeBands ? [] : null,
            bandIds: new Set(),
            venues: new Map(),
          });
        }

        const event = eventsMap.get(row.event_id);

        // Add band if it exists
        if (row.band_id) {
          // A band playing two sets at the same event must only produce one
          // "band" entry — rows are ordered by start_time, so checking
          // membership BEFORE adding to the Set means the first (earliest)
          // set's data wins and is the only one pushed to `event.bands`.
          // Without this, a two-set band shows up as a duplicate chip on the
          // public event card even though band_count (which already used the
          // Set) correctly counted it once.
          const isFirstSetForBand = !event.bandIds.has(row.band_id);
          event.bandIds.add(row.band_id);
          if (includeBands && isFirstSetForBand) {
            let url = normalizeHttpUrl(row.url);
            // Try to extract URL from social_links if url is missing. A bare
            // handle (e.g. an Instagram handle with no scheme) never worked
            // as an href, so it no longer qualifies here — only a real,
            // normalized http(s) URL is reflected.
            if (!url && row.social_links) {
              try {
                const links = JSON.parse(row.social_links);
                url =
                  normalizeHttpUrl(links.website) ||
                  normalizeHttpUrl(links.bandcamp) ||
                  normalizeHttpUrl(links.instagram) ||
                  null;
              } catch (_) {
                /* ignore malformed JSON — url stays null */
              }
            }

            event.bands.push({
              id: row.band_id,
              name: row.band_name,
              start_time: row.start_time,
              end_time: row.end_time,
              url: url,
              genre: row.genre,
              origin: formatOrigin(row),
              photo_url: row.photo_url,
              venue_id: row.venue_id,
              venue_name: row.venue_name,
            });
          }

          // Track venue (guard against NULL venue_id — a performance with no
          // venue assigned must not be counted as a venue; see #479).
          // band_count must be a count of DISTINCT bands playing that venue,
          // not a per-row tally — a band playing the same venue twice (two
          // sets) must count once, so a per-venue `bandIds` Set (stripped
          // from the final response below) gates the increment.
          if (row.venue_id) {
            if (!event.venues.has(row.venue_id)) {
              event.venues.set(row.venue_id, {
                id: row.venue_id,
                name: row.venue_name,
                address: row.venue_address || formatVenueAddress(row),
                band_count: 0,
                bandIds: new Set(),
              });
            }
            const venue = event.venues.get(row.venue_id);
            if (!venue.bandIds.has(row.band_id)) {
              venue.bandIds.add(row.band_id);
              venue.band_count++;
            }
          }
        }
      }

      return Array.from(eventsMap.values()).map((event) => ({
        id: event.id,
        name: event.name,
        slug: event.slug,
        date: event.date,
        end_date: event.end_date,
        status: event.status,
        ticket_url: normalizeHttpUrl(event.ticket_url),
        poster_url: normalizeHttpUrl(event.poster_url),
        band_count: event.bandIds.size,
        venue_count: event.venues.size,
        bands: includeBands ? event.bands : undefined,
        // Strip the internal `bandIds` Set — the public shape stays
        // { id, name, address, band_count } as before.
        venues: Array.from(event.venues.values()).map(({ bandIds: _bandIds, ...venue }) => venue),
      }));
    }

    // Batch all timeline queries into a single D1 round-trip instead of one
    // round-trip per period. Statements are pushed conditionally; `slots` maps
    // each period to its index in the batch results.
    const statements = [];
    const slots = {};

    // "Now" events (happening today) - single JOIN query.
    // e.date <= today AND COALESCE(end_date, date) >= today: today falls within
    // the event's [date, end_date] span, so a multi-day event stays "now" on
    // day 2+ instead of sliding into "past" (#539). NULL end_date collapses
    // this to the original `e.date = today` for single-day events.
    if (includeNow) {
      slots.now = statements.length;
      statements.push(
        DB.prepare(
          `
        SELECT
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          e.end_date as event_end_date,
          e.doors_json as doors_json,
          e.ticket_url as ticket_url,
          e.poster_url as poster_url,
          p.band_profile_id as band_id,
          b.name as band_name,
          p.start_time,
          p.end_time,
          p.performance_date,
          b.social_links,
          b.genre,
          b.origin,
          b.origin_city,
          b.origin_region,
          b.photo_url,
          v.id as venue_id,
          v.name as venue_name,
          v.address as venue_address,
          v.address_line1,
          v.address_line2,
          v.city,
          v.region,
          v.postal_code,
          v.country
        FROM events e
        LEFT JOIN performances p ON p.event_id = e.id AND (e.reveal_mode = 0 OR p.is_announced = 1)
        LEFT JOIN band_profiles b ON p.band_profile_id = b.id
        LEFT JOIN venues v ON p.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date <= ?
        AND COALESCE(e.end_date, e.date) >= ?
        ORDER BY e.date DESC, p.start_time, v.name
      `,
        ).bind(today, today),
      );
    }

    // "Upcoming" events (all future published events, soonest first) - single
    // JOIN query. No fixed day-window cap: a flagship event weeks out (e.g. the
    // Vol-17 crawl ~6 weeks ahead) must be visible the moment it's published, not
    // only once it falls inside an arbitrary 30-day horizon. The LIMIT 10 in the
    // subquery bounds the result size, matching the cap-free /api/events/public.
    if (includeUpcoming) {
      slots.upcoming = statements.length;
      statements.push(
        DB.prepare(
          `
        SELECT
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          e.end_date as event_end_date,
          e.ticket_url as ticket_url,
          e.poster_url as poster_url,
          p.band_profile_id as band_id,
          b.name as band_name,
          p.start_time,
          p.end_time,
          b.social_links,
          b.genre,
          b.origin,
          b.origin_city,
          b.origin_region,
          b.photo_url,
          v.id as venue_id,
          v.name as venue_name,
          v.address as venue_address,
          v.address_line1,
          v.address_line2,
          v.city,
          v.region,
          v.postal_code,
          v.country
        FROM events e
        LEFT JOIN performances p ON p.event_id = e.id AND (e.reveal_mode = 0 OR p.is_announced = 1)
        LEFT JOIN band_profiles b ON p.band_profile_id = b.id
        LEFT JOIN venues v ON p.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date > ?
        AND e.id IN (
          SELECT id FROM events
          WHERE is_published = 1
          AND date > ?
          ORDER BY date ASC
          LIMIT 10
        )
        ORDER BY e.date ASC, p.start_time, v.name
      `,
        ).bind(today, today),
      );
    }

    // "Past" events (historical) - single JOIN query.
    // COALESCE(end_date, date) < today: a multi-day event isn't "past" until
    // its end_date has elapsed, so it doesn't slip out of "now" a day early
    // (#539). NULL end_date collapses this to the original `e.date < today`.
    if (includePast) {
      slots.past = statements.length;
      statements.push(
        DB.prepare(
          `
        SELECT
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          e.end_date as event_end_date,
          e.status as event_status,
          e.ticket_url as ticket_url,
          e.poster_url as poster_url,
          p.band_profile_id as band_id,
          b.name as band_name,
          p.start_time,
          p.end_time,
          b.social_links,
          b.genre,
          b.origin,
          b.origin_city,
          b.origin_region,
          b.photo_url,
          v.id as venue_id,
          v.name as venue_name,
          v.address as venue_address,
          v.address_line1,
          v.address_line2,
          v.city,
          v.region,
          v.postal_code,
          v.country
        FROM events e
        LEFT JOIN performances p ON p.event_id = e.id AND (e.reveal_mode = 0 OR p.is_announced = 1)
        LEFT JOIN band_profiles b ON p.band_profile_id = b.id
        LEFT JOIN venues v ON p.venue_id = v.id
        WHERE (
          (e.is_published = 1 AND COALESCE(e.end_date, e.date) < ?)
          OR e.status = 'archived'
        )
        AND e.id IN (
          SELECT id FROM events
          WHERE (is_published = 1 AND COALESCE(end_date, date) < ?) OR status = 'archived'
          ORDER BY date DESC
          LIMIT ?
        )
        ORDER BY e.date DESC, p.start_time, v.name
      `,
        ).bind(today, today, pastLimit),
      );
    }

    // Execute all timeline queries in a single batched round-trip. Results are
    // returned in the same order statements were pushed (tracked by `slots`).
    if (statements.length > 0) {
      const batchResults = await DB.batch(statements);

      // Events bumped out of "now" by the start-edge gate below, prepended to
      // `upcoming` once it's been computed.
      const gatedToUpcoming = [];

      if (slots.now !== undefined) {
        const nowRows = batchResults[slots.now].results || [];
        const groupedNow = groupEventData(nowRows);

        // Start-edge gate (#569): groupEventData's output carries neither
        // doors_json nor per-set festival days, so derive both per event
        // straight from the raw rows (event-level columns repeat on every
        // row). firstDayStart = earliest FIRST-day set: NULL performance_date
        // inherits the event's own date (#543) so it counts; day-2+ sets
        // never define day 1's edge; sub-06:00 sets are after-midnight sets
        // of the previous evening and are excluded.
        const gateInfoByEventId = new Map();
        for (const row of nowRows) {
          let info = gateInfoByEventId.get(row.event_id);
          if (!info) {
            info = { date: row.event_date, doors_json: row.doors_json, firstDayStart: null };
            gateInfoByEventId.set(row.event_id, info);
          }
          if (row.performance_date == null || row.performance_date === row.event_date) {
            const start = normalizeStartTime(row.start_time);
            if (
              start &&
              start >= AFTER_MIDNIGHT_THRESHOLD &&
              (info.firstDayStart === null || start < info.firstDayStart)
            ) {
              info.firstDayStart = start;
            }
          }
        }

        const clock = eventLocalClock(); // { date, time } in America/Toronto
        const stillNow = [];
        for (const event of groupedNow) {
          const info = gateInfoByEventId.get(event.id);
          if (info && isGatedBeforeStart(info, clock)) {
            gatedToUpcoming.push(event);
          } else {
            stillNow.push(event);
          }
        }
        response.now = stillNow;
      }

      if (slots.upcoming !== undefined) {
        response.upcoming = groupEventData(batchResults[slots.upcoming].results || []);
      }
      if (slots.past !== undefined) {
        response.past = groupEventData(batchResults[slots.past].results || []);
      }

      // Only merge into `upcoming` if the caller actually asked for it
      // (`upcoming=false` means "omit entirely", not "gate into now").
      if (gatedToUpcoming.length > 0 && includeUpcoming) {
        response.upcoming = [...gatedToUpcoming, ...response.upcoming];
      }
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error("Error fetching events timeline:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Events are temporarily unavailable. Please try again.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
