import { getPublicDataGateResponse } from "../../utils/publicGate.js";

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
    const line1 = [venue.address_line1, venue.address_line2]
      .filter(Boolean)
      .join(", ");
    const line2 = [venue.city, venue.region].filter(Boolean).join(", ");
    const line3 = [venue.postal_code, venue.country]
      .filter(Boolean)
      .join(" ")
      .trim();
    return [line1, line2, line3].filter(Boolean).join(", ");
  };

  try {
    const url = new URL(request.url);
    const includeNow = url.searchParams.get("now") !== "false"; // default true
    const includeUpcoming = url.searchParams.get("upcoming") !== "false"; // default true
    const includePast = url.searchParams.get("past") !== "false"; // default true
    const includeBands = url.searchParams.get("includeBands") !== "false"; // default true
    const pastLimit = parseInt(url.searchParams.get("pastLimit") || "10", 10);

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
            let url = row.url;
            // Try to extract URL from social_links if url is missing
            if (!url && row.social_links) {
              try {
                const links = JSON.parse(row.social_links);
                url =
                  links.website || links.bandcamp || links.instagram || null;
              } catch (_) {}
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

          // Track venue
          if (!event.venues.has(row.venue_id)) {
            event.venues.set(row.venue_id, {
              id: row.venue_id,
              name: row.venue_name,
              address: row.venue_address || formatVenueAddress(row),
              band_count: 0,
            });
          }
          event.venues.get(row.venue_id).band_count++;
        }
      }

      return Array.from(eventsMap.values()).map((event) => ({
        id: event.id,
        name: event.name,
        slug: event.slug,
        date: event.date,
        ticket_url: event.ticket_url,
        band_count: event.bandIds.size,
        venue_count: event.venues.size,
        bands: includeBands ? event.bands : undefined,
        venues: Array.from(event.venues.values()),
      }));
    }

    // Get "Now" events (events happening today) - OPTIMIZED: Single query with JOIN
    if (includeNow) {
      const nowResult = await DB.prepare(
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
        LEFT JOIN performances p ON p.event_id = e.id
        LEFT JOIN band_profiles b ON p.band_profile_id = b.id
        LEFT JOIN venues v ON p.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date = ?
        ORDER BY e.date DESC, p.start_time, v.name
      `,
      )
        .bind(today)
        .all();

      response.now = groupEventData(nowResult.results || []);
    }

    // Get "Upcoming" events (future events, next 30 days) - OPTIMIZED: Single query with JOIN
    if (includeUpcoming) {
      const upcomingResult = await DB.prepare(
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
        LEFT JOIN performances p ON p.event_id = e.id
        LEFT JOIN band_profiles b ON p.band_profile_id = b.id
        LEFT JOIN venues v ON p.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date > ?
        AND e.date <= date(?, '+30 days')
        AND e.id IN (
          SELECT id FROM events
          WHERE is_published = 1
          AND date > ?
          AND date <= date(?, '+30 days')
          ORDER BY date ASC
          LIMIT 10
        )
        ORDER BY e.date ASC, p.start_time, v.name
      `,
      )
        .bind(today, today, today, today)
        .all();

      response.upcoming = groupEventData(upcomingResult.results || []);
    }

    // Get "Past" events (historical events) - OPTIMIZED: Single query with JOIN
    if (includePast) {
      const pastResult = await DB.prepare(
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
        LEFT JOIN performances p ON p.event_id = e.id
        LEFT JOIN band_profiles b ON p.band_profile_id = b.id
        LEFT JOIN venues v ON p.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date < ?
        AND e.id IN (
          SELECT id FROM events
          WHERE is_published = 1
          AND date < ?
          ORDER BY date DESC
          LIMIT ?
        )
        ORDER BY e.date DESC, p.start_time, v.name
      `,
      )
        .bind(today, today, pastLimit)
        .all();

      response.past = groupEventData(pastResult.results || []);
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
