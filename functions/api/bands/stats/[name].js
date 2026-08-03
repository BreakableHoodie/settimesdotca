import { getPublicDataGateResponse } from "../../../utils/publicGate.js";
import { normalizeBandName } from "../../../utils/bandName.js";
import { safeReflectSocialLinks } from "../../../utils/validation.js";
import { eventLocalToday } from "../../../utils/eventDay.js";

/**
 * Public API: Get band profile with rich stats
 *
 * GET /api/bands/stats/:name
 *
 * Returns band profile with performance statistics, upcoming shows, and history
 * Supports both numeric IDs and band names (URL-encoded)
 */

function formatOrigin(profile) {
  if (!profile) return null;
  const parts = [profile.origin_city, profile.origin_region].filter(Boolean);
  return parts.length ? parts.join(", ") : profile.origin || null;
}

function formatVenueAddress(venue) {
  if (!venue) return null;
  const line1 = [venue.address_line1, venue.address_line2].filter(Boolean).join(", ");
  const line2 = [venue.city, venue.region].filter(Boolean).join(", ");
  const line3 = [venue.postal_code, venue.country].filter(Boolean).join(" ").trim();
  return [line1, line2, line3].filter(Boolean).join(", ");
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
      return new Response(JSON.stringify({ error: "Band identifier is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
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
    // #484: explicit column list so future band_profiles columns don't
    // silently join the public payload.
    let bandProfile = null;
    if (bandId) {
      bandProfile = await DB.prepare(
        `
        SELECT id, name, origin, origin_city, origin_region, social_links,
               photo_url, photo_alt_text, description, genre
        FROM band_profiles WHERE id = ? LIMIT 1
      `,
      )
        .bind(bandId)
        .first();
    } else {
      const normalized = normalizeBandName(searchName);
      bandProfile = await DB.prepare(
        `
        SELECT id, name, origin, origin_city, origin_region, social_links,
               photo_url, photo_alt_text, description, genre
        FROM band_profiles
        WHERE name_normalized = ?
           OR LOWER(TRIM(name)) = LOWER(?)
        LIMIT 1
      `,
      )
        .bind(normalized, searchName)
        .first();
    }

    if (!bandProfile) {
      return new Response(JSON.stringify({ error: "Band not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Get all performances for this band profile. A cancelled set is excluded
    // unconditionally (unlike bands/[name].js's history endpoint, which keeps
    // a cancelled set visible until its event is past) -- a set that never
    // happened must never inflate total_performances, unique_venues, or the
    // debut/latest date range (#732).
    const performances = await DB.prepare(
      `
      SELECT
        p.id as performance_id,
        p.start_time,
        p.end_time,
        p.performance_date,
        p.notes,
        v.id as venue_id,
        v.name as venue_name,
        v.address as venue_address,
        v.address_line1,
        v.address_line2,
        v.city,
        v.region,
        v.postal_code,
        v.country,
        e.id as event_id,
        e.name as event_name,
        e.slug as event_slug,
        e.date as event_date,
        e.end_date as event_end_date,
        e.status as event_status
      FROM performances p
      LEFT JOIN venues v ON p.venue_id = v.id
      LEFT JOIN events e ON p.event_id = e.id
      WHERE p.band_profile_id = ?
        AND e.status IN ('published', 'archived')
        AND (e.reveal_mode = 0 OR p.is_announced = 1)
        AND p.is_cancelled = 0
      ORDER BY e.date DESC, COALESCE(p.performance_date, e.date) ASC, p.start_time
    `,
    )
      .bind(bandProfile.id)
      .all();

    const allPerformances = performances.results || [];

    // Calculate statistics
    const today = eventLocalToday();

    // Separate upcoming and past performances — per-performance (#603), not
    // per-event: on a multi-day event, each set's OWN day decides its bucket,
    // so a band's day-1 set can already be "past" while its day-3 set is
    // still "upcoming" mid-festival. NULL performance_date inherits the
    // event's start date (the #543 convention: day-1 sets and single-day
    // events store NULL). Archived events always go to past regardless of date.
    const upcomingPerformances = allPerformances.filter(
      (p) => (p.performance_date || p.event_date) >= today && p.event_status !== "archived",
    );
    const pastPerformances = allPerformances.filter(
      (p) => (p.performance_date || p.event_date) < today || p.event_status === "archived",
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
        ? uniqueVenues.reduce((max, venue) => (venue.count > max.count ? venue : max), uniqueVenues[0])
        : null;

    // Get unique events
    const uniqueEvents = new Set(allPerformances.map((p) => p.event_id).filter(Boolean));

    // Calculate average set time in minutes
    const setTimes = allPerformances
      .filter((p) => p.start_time && p.end_time)
      .map((p) => {
        const [startH, startM] = p.start_time.split(":").map(Number);
        const [endH, endM] = p.end_time.split(":").map(Number);
        const startMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        return endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
      })
      .filter((t) => t > 0);

    const averageSetMinutes =
      setTimes.length > 0 ? Math.round(setTimes.reduce((sum, t) => sum + t, 0) / setTimes.length) : null;

    // Get debut and latest dates
    const sortedDates = allPerformances
      .map((p) => p.event_date)
      .filter(Boolean)
      .sort();

    const debutDate = sortedDates.length > 0 ? sortedDates[0] : null;
    const latestDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;

    const socialLinks = safeReflectSocialLinks(bandProfile.social_links);

    // Build response
    const responseData = {
      id: bandProfile.id,
      name: bandProfile.name,
      photo_url: bandProfile.photo_url,
      photo_alt_text: bandProfile.photo_alt_text,
      description: bandProfile.description,
      genre: bandProfile.genre,
      origin: formatOrigin(bandProfile),
      social: {
        website: socialLinks.website || null,
        instagram: socialLinks.instagram || null,
        bandcamp: socialLinks.bandcamp || null,
        facebook: socialLinks.facebook || null,
        youtube: socialLinks.youtube || null,
        spotify: socialLinks.spotify || null,
        apple_music: socialLinks.apple_music || null,
        linktree: socialLinks.linktree || null,
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
        // NULL for single-day events. Clients key schedule stale-detection
        // on event_end_date || event_date (#542 PR-1) so a multi-day
        // event's saved schedule isn't wiped as stale on day 2.
        event_end_date: p.event_end_date || null,
        event_status: p.event_status,
        // The evening this SET belongs to (#739) — distinct from event_date
        // on day 2+ of a multi-day event. NULL for day-1 sets and
        // single-day events (the #543 convention); clients fall back to
        // event_date themselves.
        performance_date: p.performance_date || null,
        notes: p.notes || null,
        venue_id: p.venue_id,
        venue_name: p.venue_name,
        venue_address: p.venue_address || formatVenueAddress(p),
        start_time: p.start_time,
        end_time: p.end_time,
      })),
      past: pastPerformances.map((p) => ({
        id: p.performance_id,
        event_id: p.event_id,
        event_name: p.event_name,
        event_slug: p.event_slug,
        event_date: p.event_date,
        event_end_date: p.event_end_date || null,
        event_status: p.event_status,
        performance_date: p.performance_date || null,
        notes: p.notes || null,
        venue_id: p.venue_id,
        venue_name: p.venue_name,
        venue_address: p.venue_address || formatVenueAddress(p),
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
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
