import { getPublicDataGateResponse } from "../../utils/publicGate.js";

/**
 * Public API: Get band profile by name
 *
 * GET /api/bands/:name
 *
 * Returns band profile with performance history
 */

// Normalize band name for lookup against name_normalized
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
      // Normalize name: replace hyphens with spaces and trim
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
        v.name as venue_name,
        v.address as venue_address,
        v.address_line1,
        v.address_line2,
        v.city,
        v.region,
        v.postal_code,
        v.country,
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

    const history = performances.results || [];
    if (history.length === 0) {
      return new Response(
        JSON.stringify({ error: "Band not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    let socialLinks = {};
    try {
      socialLinks = bandProfile.social_links
        ? JSON.parse(bandProfile.social_links)
        : {};
    } catch (_error) {
      socialLinks = {};
    }

    const profileData = {
      id: bandProfile.id,
      name: bandProfile.name,
      origin: formatOrigin(bandProfile),
      social: {
        website: socialLinks.website || null,
        instagram: socialLinks.instagram || null,
        bandcamp: socialLinks.bandcamp || null,
        facebook: socialLinks.facebook || null,
      },
      performances: history.map((p) => ({
        id: p.performance_id,
        event_name: p.event_name,
        event_slug: p.event_slug,
        event_date: p.event_date,
        venue_name: p.venue_name,
        venue_address: p.venue_address || formatVenueAddress(p),
        start_time: p.start_time,
        end_time: p.end_time,
      })),
    };

    return new Response(JSON.stringify(profileData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(
      "Error fetching band profile:",
      error,
      error.message,
      error.stack,
    );

    return new Response(
      JSON.stringify({
        error: "Failed to fetch band profile",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
