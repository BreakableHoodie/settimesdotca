import { getPublicDataGateResponse } from "../../../utils/publicGate.js";

/**
 * Public API: Get band profile with rich stats
 *
 * GET /api/bands/stats/:name
 *
 * Returns band profile with performance statistics, upcoming shows, and history
 * Supports both numeric IDs and band names (URL-encoded)
 */

// Normalize band name for lookup against name_normalized
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return gate;
  }
  const { DB } = env;

  try {
    const url = new URL(request.url);
    const parts = url.pathname.split("/");
    const searchParam = decodeURIComponent(parts[parts.length - 1]);

    if (!searchParam) {
      return new Response(
        JSON.stringify({ error: "Band identifier is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check if it's a numeric ID or a name
    let bandId = null;
    let searchName = null;

    if (!isNaN(searchParam) && parseInt(searchParam) > 0) {
      bandId = parseInt(searchParam);
    } else {
      // Normalize name: replace hyphens with spaces
      searchName = searchParam.replace(/-/g, " ").trim();
    }

    // Resolve band profile first (v2 schema)
    let bandProfile = null;
    if (bandId) {
      bandProfile = await DB.prepare(
        `
        SELECT * FROM band_profiles WHERE id = ? LIMIT 1
      `,
      )
        .bind(bandId)
        .first();
    } else {
      const normalized = normalizeName(searchName);
      bandProfile = await DB.prepare(
        `
        SELECT * FROM band_profiles
        WHERE name_normalized = ?
           OR LOWER(TRIM(name)) = LOWER(?)
        LIMIT 1
      `,
      )
        .bind(normalized, searchName)
        .first();
    }

    if (!bandProfile) {
      return new Response(
        JSON.stringify({ error: "Band not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get all performances for this band profile
    const performances = await DB.prepare(
      `
      SELECT
        p.id as performance_id,
        p.start_time,
        p.end_time,
        v.id as venue_id,
        v.name as venue_name,
        v.address as venue_address,
        e.id as event_id,
        e.name as event_name,
        e.slug as event_slug,
        e.date as event_date,
        e.is_published as event_published
      FROM performances p
      LEFT JOIN venues v ON p.venue_id = v.id
      LEFT JOIN events e ON p.event_id = e.id
      WHERE p.band_profile_id = ?
        AND e.is_published = 1
      ORDER BY e.date DESC, p.start_time
    `,
    )
      .bind(bandProfile.id)
      .all();

    const allPerformances = performances.results || [];
    if (allPerformances.length === 0) {
      return new Response(
        JSON.stringify({ error: "Band not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Calculate statistics
    const today = new Date().toISOString().split("T")[0];

    // Separate upcoming and past performances
    const upcomingPerformances = allPerformances.filter(
      (p) => p.event_date >= today,
    );
    const pastPerformances = allPerformances.filter(
      (p) => p.event_date < today,
    );

    // Get unique venues
    const venueMap = new Map();
    allPerformances.forEach((p) => {
      if (p.venue_id) {
        const count = venueMap.get(p.venue_id) || { ...p, count: 0 };
        count.count++;
        venueMap.set(p.venue_id, count);
      }
    });
    const uniqueVenues = Array.from(venueMap.values());

    // Find signature venue (most played)
    const signatureVenue =
      uniqueVenues.length > 0
        ? uniqueVenues.reduce(
            (max, venue) => (venue.count > max.count ? venue : max),
            uniqueVenues[0],
          )
        : null;

    // Get unique events
    const uniqueEvents = new Set(
      allPerformances.map((p) => p.event_id).filter(Boolean),
    );

    // Calculate average set time in minutes
    const setTimes = allPerformances
      .filter((p) => p.start_time && p.end_time)
      .map((p) => {
        const [startH, startM] = p.start_time.split(":").map(Number);
        const [endH, endM] = p.end_time.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        return endMinutes >= startMinutes
          ? endMinutes - startMinutes
          : endMinutes + 24 * 60 - startMinutes;
      })
      .filter((t) => t > 0);

    const averageSetMinutes =
      setTimes.length > 0
        ? Math.round(
            setTimes.reduce((sum, t) => sum + t, 0) / setTimes.length,
          )
        : null;

    // Get debut and latest dates
    const sortedDates = allPerformances
      .map((p) => p.event_date)
      .filter(Boolean)
      .sort();

    const debutDate = sortedDates.length > 0 ? sortedDates[0] : null;
    const latestDate =
      sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

    let socialLinks = {};
    try {
      socialLinks = bandProfile.social_links
        ? JSON.parse(bandProfile.social_links)
        : {};
    } catch (_error) {
      socialLinks = {};
    }

    // Build response
    const responseData = {
      id: bandProfile.id,
      name: bandProfile.name,
      photo_url: bandProfile.photo_url,
      description: bandProfile.description,
      genre: bandProfile.genre,
      origin: bandProfile.origin,
      social: {
        website: socialLinks.website || null,
        instagram: socialLinks.instagram || null,
        bandcamp: socialLinks.bandcamp || null,
        facebook: socialLinks.facebook || null,
      },
      stats: {
        total_performances: allPerformances.length,
        unique_venues: uniqueVenues.length,
        unique_events: uniqueEvents.size,
        debut_date: debutDate,
        latest_date: latestDate,
        signature_venue: signatureVenue
          ? {
              id: signatureVenue.venue_id,
              name: signatureVenue.venue_name,
              count: signatureVenue.count,
            }
          : null,
        average_set_minutes: averageSetMinutes,
      },
      upcoming: upcomingPerformances.map((p) => ({
        id: p.performance_id,
        event_id: p.event_id,
        event_name: p.event_name,
        event_slug: p.event_slug,
        event_date: p.event_date,
        venue_id: p.venue_id,
        venue_name: p.venue_name,
        venue_address: p.venue_address,
        start_time: p.start_time,
        end_time: p.end_time,
      })),
      past: pastPerformances.map((p) => ({
        id: p.performance_id,
        event_id: p.event_id,
        event_name: p.event_name,
        event_slug: p.event_slug,
        event_date: p.event_date,
        venue_id: p.venue_id,
        venue_name: p.venue_name,
        venue_address: p.venue_address,
        start_time: p.start_time,
        end_time: p.end_time,
      })),
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error fetching band stats:", error, error.message, error.stack);

    return new Response(
      JSON.stringify({
        error: "Failed to fetch band stats",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
