import { getPublicDataGateResponse } from "../../utils/publicGate.js";
import { normalizeHttpUrl } from "../../utils/validation.js";

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

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

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
            status: row.event_status || null,
            ticket_url: row.ticket_url || null,
            bands: includeBands ? [] : null,
            bandIds: new Set(),
            venues: new Map(),
          });
        }

        const event = eventsMap.get(row.event_id);

        // Add band if it exists
        if (row.band_id) {
          event.bandIds.add(row.band_id);
          if (includeBands) {
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
          // venue assigned must not be counted as a venue; see #479)
          if (row.venue_id && !event.venues.has(row.venue_id)) {
            event.venues.set(row.venue_id, {
              id: row.venue_id,
              name: row.venue_name,
              address: row.venue_address || formatVenueAddress(row),
              band_count: 0,
            });
          }
          if (row.venue_id) {
            event.venues.get(row.venue_id).band_count++;
          }
        }
      }

      return Array.from(eventsMap.values()).map((event) => ({
        id: event.id,
        name: event.name,
        slug: event.slug,
        date: event.date,
        status: event.status,
        ticket_url: event.ticket_url,
        band_count: event.bandIds.size,
        venue_count: event.venues.size,
        bands: includeBands ? event.bands : undefined,
        venues: Array.from(event.venues.values()),
      }));
    }

    // Batch all timeline queries into a single D1 round-trip instead of one
    // round-trip per period. Statements are pushed conditionally; `slots` maps
    // each period to its index in the batch results.
    const statements = [];
    const slots = {};

    // "Now" events (happening today) - single JOIN query
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
          e.ticket_url as ticket_url,
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
        AND e.date = ?
        ORDER BY e.date DESC, p.start_time, v.name
      `,
        ).bind(today),
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
          e.ticket_url as ticket_url,
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

    // "Past" events (historical) - single JOIN query
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
          e.status as event_status,
          e.ticket_url as ticket_url,
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
          (e.is_published = 1 AND e.date < ?)
          OR e.status = 'archived'
        )
        AND e.id IN (
          SELECT id FROM events
          WHERE (is_published = 1 AND date < ?) OR status = 'archived'
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
      if (slots.now !== undefined) {
        response.now = groupEventData(batchResults[slots.now].results || []);
      }
      if (slots.upcoming !== undefined) {
        response.upcoming = groupEventData(batchResults[slots.upcoming].results || []);
      }
      if (slots.past !== undefined) {
        response.past = groupEventData(batchResults[slots.past].results || []);
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
        error: "Failed to fetch events timeline",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
