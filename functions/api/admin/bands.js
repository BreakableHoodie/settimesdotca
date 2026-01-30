// Admin bands endpoint
// GET /api/admin/bands?event_id={id} - List bands for an event
// POST /api/admin/bands - Create new band (and performance)

import { checkPermission } from "./_middleware.js";

// Helper to normalize band name
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper to unpack social links
function unpackSocialLinks(band) {
  if (!band) return null;
  let social = {};
  try {
    social = JSON.parse(band.social_links || '{}');
  } catch (_e) {
    social = {};
  }
  return {
    ...band,
    url: social.website || '',
    instagram: social.instagram || '',
    bandcamp: social.bandcamp || '',
    facebook: social.facebook || ''
  };
}

// Helper to check for time conflicts (supports sets that cross midnight)
async function checkConflicts(
  DB,
  eventId,
  venueId,
  startTime,
  endTime,
  excludePerformanceId = null,
) {
  const conflicts = [];

  // Convert HH:MM to minutes for easier comparison
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const normalizeEndMinutes = (startMinutes, endMinutes) => {
    return endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
  };

  const buildIntervals = (start, end) => {
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    const normalizedEnd = normalizeEndMinutes(startMinutes, endMinutes);
    return [
      [startMinutes, normalizedEnd],
      [startMinutes + 24 * 60, normalizedEnd + 24 * 60],
    ];
  };

  // Get all performances at the same venue for the same event
  let query = `
    SELECT p.id, p.start_time, p.end_time, bp.name
    FROM performances p
    JOIN band_profiles bp ON p.band_profile_id = bp.id
    WHERE p.event_id = ? AND p.venue_id = ?
  `;
  const bindings = [eventId, venueId];

  if (excludePerformanceId) {
    query += ` AND p.id != ?`;
    bindings.push(excludePerformanceId);
  }

  const result = await DB.prepare(query)
    .bind(...bindings)
    .all();
  const existingPerformances = result.results || [];

  const intervalsOverlap = (intervalA, intervalB) =>
    intervalA[0] < intervalB[1] && intervalB[0] < intervalA[1];

  const newIntervals = buildIntervals(startTime, endTime);

  for (const perf of existingPerformances) {
    const perfIntervals = buildIntervals(perf.start_time, perf.end_time);
    const hasOverlap = perfIntervals.some((intervalB) =>
      newIntervals.some((intervalA) => intervalsOverlap(intervalA, intervalB)),
    );

    if (hasOverlap) {
      conflicts.push({
        id: perf.id,
        name: perf.name,
        startTime: perf.start_time,
        endTime: perf.end_time,
      });
    }
  }

  return conflicts;
}

// GET - List bands for an event
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require viewer role or higher
  const permCheck = await checkPermission(context, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event_id");

  try {
    let result;

    if (eventId) {
      // Get bands (performances) for specific event
      result = await DB.prepare(
        `
        SELECT
          p.id,
          p.event_id,
          p.venue_id,
          p.start_time,
          p.end_time,
          p.notes,
          bp.id as band_profile_id,
          bp.name,
          bp.genre,
          bp.origin,
          bp.description,
          bp.photo_url,
          bp.social_links,
          v.name as venue_name,
          e.name as event_name
        FROM performances p
        JOIN band_profiles bp ON p.band_profile_id = bp.id
        JOIN venues v ON p.venue_id = v.id
        JOIN events e ON p.event_id = e.id
        WHERE p.event_id = ?
        ORDER BY p.start_time, v.name
      `,
      )
        .bind(eventId)
        .all();
    } else {
      // List all bands (performances AND profiles without performances)
      // We use a LEFT JOIN starting from band_profiles to include everyone.
      // If a profile has no performance, p.id is null.
      // We construct a synthetic ID for profile-only rows: 'profile_' || bp.id
      result = await DB.prepare(
        `
        SELECT
          COALESCE(p.id, 'profile_' || bp.id) as id,
          p.event_id,
          p.venue_id,
          p.start_time,
          p.end_time,
          p.notes,
          bp.id as band_profile_id,
          bp.name,
          bp.genre,
          bp.origin,
          bp.description,
          bp.photo_url,
          bp.social_links,
          v.name as venue_name,
          e.name as event_name,
          e.date as event_date
        FROM band_profiles bp
        LEFT JOIN performances p ON bp.id = p.band_profile_id
        LEFT JOIN venues v ON p.venue_id = v.id
        LEFT JOIN events e ON p.event_id = e.id
        ORDER BY e.date DESC, p.start_time, bp.name
        LIMIT 200
      `,
      ).all();
    }

    const bands = (result.results || []).map(unpackSocialLinks);

    return new Response(JSON.stringify({ success: true, bands }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to fetch bands:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch bands" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// POST - Create new band (performance + profile)
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const body = await request.json();
    const {
      eventId,
      venueId,
      name,
      startTime,
      endTime,
      url,
      description,
      photo_url,
      genre,
      origin,
      social_links, // JSON string from frontend
    } = body;

    // If we are in global view (no eventId), we just create/update the profile
    const isGlobalAdd = !eventId;

    if (isGlobalAdd) {
      if (!name) {
        return new Response(
          JSON.stringify({ error: "Missing required fields", message: "Band Name is required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      if (!venueId || !name || !startTime || !endTime) {
        return new Response(
          JSON.stringify({ error: "Missing required fields", message: "Event, Venue, Name, Start Time, and End Time are required" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Validate time format (only if schedule is provided)
    if ((startTime && !/^\d{2}:\d{2}$/.test(startTime)) || (endTime && !/^\d{2}:\d{2}$/.test(endTime))) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Time must be in HH:MM format" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate time order (only if schedule is provided)
    if (startTime && endTime && startTime === endTime) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Start and end time cannot be the same" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (startTime && endTime) {
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (endMinutes < startMinutes) {
        // Allow midnight crossover for reasonable set lengths only.
        const duration = 24 * 60 - startMinutes + endMinutes;
        const maxDurationMinutes = 8 * 60;
        if (duration > maxDurationMinutes) {
          return new Response(
            JSON.stringify({ error: "Validation error", message: "End time must be after start time" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Check for conflicts (only if schedule is provided)
    if (!isGlobalAdd) {
      const conflicts = await checkConflicts(
        DB,
        eventId,
        venueId,
        startTime,
        endTime,
      );
      if (conflicts.length > 0) {
        return new Response(
          JSON.stringify({
            error: "Time conflict detected",
            message: "This time overlaps another set at the same venue.",
            conflicts,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // 1. Find or Create Band Profile
    const nameNormalized = normalizeName(name);
    let bandProfile = await DB.prepare(
      "SELECT id FROM band_profiles WHERE name_normalized = ?"
    )
      .bind(nameNormalized)
      .first();

    if (!bandProfile) {
      // Create new profile
      // If social_links is passed as string, use it, otherwise construct it
      let socialLinksJson = social_links;
      if (!socialLinksJson && url) {
         socialLinksJson = JSON.stringify({ website: url });
      }

      bandProfile = await DB.prepare(
        `INSERT INTO band_profiles (name, name_normalized, genre, origin, description, photo_url, social_links)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING id`
      )
        .bind(
          name.trim(),
          nameNormalized,
          genre || null,
          origin || null,
          description || null,
          photo_url || null,
          socialLinksJson || null
        )
        .first();
    }

    // 2. Create Performance (only if eventId is provided)
    let result = { id: `profile_${bandProfile.id}` }; // Default ID if no performance
    
    if (!isGlobalAdd) {
      result = await DB.prepare(
        `INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`
      )
        .bind(eventId, venueId, bandProfile.id, startTime, endTime)
        .first();
    }

    return new Response(
      JSON.stringify({
        success: true,
        band: { id: result.id, ...body }, // Return what was sent + new ID
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Failed to create band:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create band", message: error.message, details: error.stack }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// PUT and DELETE handlers removed as they are handled by [id].js
