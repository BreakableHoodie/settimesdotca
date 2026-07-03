// Public API endpoint for fetching event schedules
// GET /api/schedule?event=current
// GET /api/schedule?event={slug}

import { getPublicDataGateResponse } from "../utils/publicGate.js";
import { normalizeHttpUrl, safeReflectSocialLinks } from "../utils/validation.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const url = new URL(request.url);
  const eventParam = url.searchParams.get("event") || "current";

  try {
    const { DB } = env;
    const configuredTtl = Number.parseInt(env.SCHEDULE_CACHE_TTL_SECONDS || "60", 10);
    const cacheTtl = Number.isFinite(configuredTtl) && configuredTtl >= 0 ? configuredTtl : 60;

    let event;

    if (eventParam === "current") {
      // Get the current or next upcoming published event
      // The -6 hour buffer keeps the event visible during late-night/overnight
      // sets that span past midnight (e.g. 11:30pm-12:30am)
      event = await DB.prepare(
        `
        SELECT id, name, date, end_date, city, slug, status, ticket_url, theme_colors, venue_info, social_links, reveal_mode
        FROM events
        WHERE is_published = 1
          AND date >= date('now', '-6 hours')
        ORDER BY date ASC
        LIMIT 1
      `,
      ).first();
    } else {
      // Get event by slug — includes archived events for read-only history browsing
      event = await DB.prepare(
        `
        SELECT id, name, date, end_date, city, slug, status, ticket_url, theme_colors, venue_info, social_links, reveal_mode
        FROM events
        WHERE slug = ? AND (is_published = 1 OR status = 'archived')
      `,
      )
        .bind(eventParam)
        .first();
    }

    if (!event) {
      return new Response(
        JSON.stringify({
          error: "Event not found",
          message:
            eventParam === "current"
              ? "No published events available"
              : `Event "${eventParam}" not found or not published`,
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get all performances for this event with venue and band information
    // V2 Schema: performances -> band_profiles + venues
    const bandsResult = await DB.prepare(
      `
      SELECT
        p.id as performance_id,
        b.id as band_id,
        b.name,
        p.start_time as startTime,
        p.end_time as endTime,
        b.social_links,
        b.photo_url,
        v.name as venue,
        v.latitude as venue_lat,
        v.longitude as venue_lng
      FROM performances p
      INNER JOIN band_profiles b ON p.band_profile_id = b.id
      LEFT JOIN venues v ON p.venue_id = v.id
      WHERE p.event_id = ?
        AND (? = 0 OR p.is_announced = 1)
      ORDER BY p.start_time, v.name
    `,
    )
      .bind(event.id, event.reveal_mode ?? 0)
      .all();

    const bands = bandsResult.results || [];

    // Format response to match existing bands.json structure
    const formattedBands = bands.map((band) => {
      // Extract time from datetime string or time-only format
      // Handles: "2026-01-17 20:00" -> "20:00" OR "20:00" -> "20:00"
      const extractTime = (datetime) => {
        if (!datetime || datetime === "TBD") return "TBD";
        // If it contains a space, it's a full datetime - extract time part
        if (datetime.includes(" ")) {
          const timePart = datetime.split(" ")[1];
          return timePart ? timePart.substring(0, 5) : "TBD"; // Get HH:MM
        }
        // Otherwise, it's already in time format (HH:MM or HH:MM:SS)
        return datetime.substring(0, 5); // Get HH:MM
      };

      // Parse social links to find a primary URL. A bare handle (e.g. an
      // Instagram handle with no scheme) never worked as an href, so only a
      // real, normalized http(s) URL qualifies here.
      let primaryUrl = null;
      try {
        if (band.social_links) {
          const links = JSON.parse(band.social_links);
          // Prioritize website, then bandcamp, then instagram, etc.
          primaryUrl =
            normalizeHttpUrl(links.website) ||
            normalizeHttpUrl(links.bandcamp) ||
            normalizeHttpUrl(links.instagram) ||
            normalizeHttpUrl(links.facebook) ||
            normalizeHttpUrl(links.spotify) ||
            null;
        }
      } catch (_) {
        // Ignore JSON parse errors
      }

      return {
        id: `${band.name.toLowerCase().replace(/\s+/g, "-")}-${band.performance_id}`,
        performance_id: band.performance_id,
        band_profile_id: band.band_id,
        name: band.name,
        photo_url: band.photo_url ?? null,
        venue: band.venue ?? null,
        venue_lat: typeof band.venue_lat === "number" ? band.venue_lat : null,
        venue_lng: typeof band.venue_lng === "number" ? band.venue_lng : null,
        date: event.date,
        startTime: extractTime(band.startTime),
        endTime: extractTime(band.endTime),
        url: primaryUrl,
      };
    });

    // Include event metadata for frontend display
    const eventMetadata = {
      id: event.id,
      name: event.name,
      date: event.date,
      end_date: event.end_date ?? null,
      city: event.city ?? null,
      slug: event.slug,
      ticket_url: normalizeHttpUrl(event.ticket_url),
      is_archived: event.status === "archived",
      theme_colors: event.theme_colors,
      venue_info: event.venue_info,
      social_links: safeReflectSocialLinks(event.social_links, ["instagram", "x", "tiktok"]),
      reveal_mode: event.reveal_mode ?? 0,
    };

    return new Response(
      JSON.stringify({
        bands: formattedBands,
        event: eventMetadata,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${cacheTtl}`,
        },
      },
    );
  } catch (error) {
    console.error("Error fetching schedule:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch event schedule",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
