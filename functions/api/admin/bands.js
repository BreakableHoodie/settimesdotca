// Admin bands endpoint
// GET /api/admin/bands?event_id={id} - List bands for an event
// POST /api/admin/bands - Create new band (and performance)

import { checkPermission } from "./_middleware.js";
import {
  FIELD_LIMITS,
  isValidEmail,
  safeReflectSocialLinks,
  safeReflectSocialLinksString,
  sanitizeBandSocialLinks,
  sanitizeOptionalHttpUrl,
  sanitizeOptionalText,
  sanitizeString,
  validatePerformanceDate,
} from "../../utils/validation.js";
import { buildIntervals, intervalsOverlap } from "../../utils/timeConflicts.js";
import { parseOrigin } from "../../utils/parseOrigin.js";
import { normalizeBandName } from "../../utils/bandName.js";
import { sortableName } from "../../utils/sortableName.js";

// SQLite `ORDER BY` can't strip a leading article inline (#587), so the SQL
// in onRequestGet below is a coarse pre-sort (correct on start_time/event_date,
// raw-byte on name) and the exact ordering is re-derived in JS afterward,
// swapping the name comparison for the article-stripped `sortableName` key.
// These mirror the NULL-ordering SQLite applies by default: ASC puts NULLs
// first, DESC puts NULLs last.
function compareStartTimeNullsLast(a, b) {
  if (a.start_time == null && b.start_time == null) return 0;
  if (a.start_time == null) return 1;
  if (b.start_time == null) return -1;
  return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
}

function compareStartTimeNullsFirst(a, b) {
  if (a.start_time == null && b.start_time == null) return 0;
  if (a.start_time == null) return -1;
  if (b.start_time == null) return 1;
  return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
}

function compareEventDateDescNullsLast(a, b) {
  if (a.event_date == null && b.event_date == null) return 0;
  if (a.event_date == null) return 1;
  if (b.event_date == null) return -1;
  if (a.event_date === b.event_date) return 0;
  return a.event_date > b.event_date ? -1 : 1;
}

async function getEventStatus(DB, eventId) {
  if (!eventId) return null;

  const event = await DB.prepare(`SELECT id, status, date, end_date FROM events WHERE id = ?`).bind(eventId).first();

  return event || null;
}

// Helper to unpack social links
function unpackSocialLinks(band) {
  if (!band) return null;
  // Read-path sanitize (#493): `band.social_links` may be a pre-#483 (or
  // otherwise legacy) DB value that was never routed through
  // sanitizeBandSocialLinks on write. Never reflect it verbatim.
  const social = safeReflectSocialLinks(band.social_links || "{}");
  const origin = [band.origin_city, band.origin_region].filter(Boolean).join(", ") || band.origin || "";
  return {
    ...band,
    // Preserve the raw string/null shape — RosterTab.jsx JSON.parses this
    // field directly — while sanitizing its contents.
    social_links: safeReflectSocialLinksString(band.social_links),
    origin,
    url: social.website || "",
    instagram: social.instagram || "",
    bandcamp: social.bandcamp || "",
    facebook: social.facebook || "",
    youtube: social.youtube || "",
    spotify: social.spotify || "",
    apple_music: social.apple_music || "",
    linktree: social.linktree || "",
  };
}

async function checkConflicts(
  DB,
  eventId,
  venueId,
  startTime,
  endTime,
  excludePerformanceId = null,
  performanceDate = null,
  eventDate = null,
) {
  let query = `
    SELECT p.id, p.start_time, p.end_time, p.performance_date, bp.name
    FROM performances p
    JOIN band_profiles bp ON p.band_profile_id = bp.id
    WHERE p.event_id = ? AND p.venue_id = ?
  `;
  const bindings = [eventId, venueId];
  if (excludePerformanceId) {
    query += ` AND p.id != ?`;
    bindings.push(excludePerformanceId);
  }

  const { results: existingPerformances } = await DB.prepare(query)
    .bind(...bindings)
    .all();
  const newIntervals = buildIntervals(startTime, endTime);
  // Festival-day scoping (#540): two sets on different festival days never
  // conflict, even at the same venue and clock time (a Day-1 8 PM and a Day-2
  // 8 PM set at the same venue are distinct slots). Falls back to eventDate for
  // NULL performance_date, so single-day events (both sides NULL → same day)
  // keep conflicting exactly as before. Mirrors detectConflicts in
  // frontend/src/admin/utils/timeUtils.js (#538).
  const candidateDay = performanceDate || eventDate;
  const conflicts = [];

  for (const perf of existingPerformances) {
    if (!perf.start_time || !perf.end_time) continue;
    const otherDay = perf.performance_date || eventDate;
    if (candidateDay && otherDay && candidateDay !== otherDay) continue;
    const perfIntervals = buildIntervals(perf.start_time, perf.end_time);
    const hasOverlap = perfIntervals.some((b) => newIntervals.some((a) => intervalsOverlap(a, b)));
    if (hasOverlap) {
      conflicts.push({
        id: perf.id,
        name: perf.name,
        startTime: perf.start_time,
        endTime: perf.end_time,
        type: perf.start_time === startTime && perf.end_time === endTime ? "conflict" : "overlap",
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
  // limit/offset only apply to the no-event_id (roster) branch below — the
  // event_id branch returns a single event's full lineup, unpaginated.
  // Default is 500 (the existing cap), not 200: since #618, this branch
  // returns one row per active band_profile, and prod already has ~220
  // active profiles — a 200 default would silently truncate the roster
  // again. Callers (RosterTab, LineupTab's ArtistPicker) request no limit,
  // so they get whatever the default is.
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "500", 10);
  const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 500;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

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
          p.performance_date,
          p.notes,
          p.is_announced,
          bp.id as band_profile_id,
          bp.name,
          bp.genre,
          bp.origin,
          bp.origin_city,
          bp.origin_region,
          bp.contact_email,
          bp.is_active,
          bp.description,
          bp.photo_url,
          bp.photo_alt_text,
          bp.social_links,
          (SELECT COUNT(*) FROM band_follows bf WHERE bf.band_profile_id = bp.id AND bf.verified = 1) AS follower_count,
          v.name as venue_name,
          e.name as event_name
        FROM performances p
        JOIN band_profiles bp ON p.band_profile_id = bp.id
        LEFT JOIN venues v ON p.venue_id = v.id
        JOIN events e ON p.event_id = e.id
        WHERE p.event_id = ?
        ORDER BY p.start_time NULLS LAST, bp.name
      `,
      )
        .bind(eventId)
        .all();
    } else {
      // List all active band PROFILES (roster view), one row per profile (#618).
      // A profile can have zero, one, or many performances across many events;
      // the old query LEFT JOINed to performances with no GROUP BY, so a band
      // with N performances produced N rows. Combined with `ORDER BY e.date
      // DESC` + `LIMIT`, any profile whose only performances were on older
      // events could sort past the limit and vanish entirely (#618 — Adelleda,
      // whose sole performance was a 2024 event, was missing from the roster).
      // GROUP BY bp.id collapses that back to one row per profile, so the
      // LIMIT now bounds roster size (~220 active profiles in prod), not
      // performance-row count.
      //
      // The per-performance columns (event/venue name, event date, etc.) are
      // kept for a "last played" display, sourced from the band's MOST RECENT
      // performance: SQLite's bare-column-with-MAX() semantics say that when a
      // query has exactly one MAX() aggregate, bare columns in the same result
      // row are pulled from the input row that produced the max — including
      // per GROUP BY group, not just whole-table aggregates. So MAX(e.date)
      // plus the bare v.name/e.name/p.* columns below consistently resolve to
      // the same (most recent) performance row, without a subquery or window
      // function. Profiles with zero performances get NULLs throughout (LEFT
      // JOIN), same as before.
      // We construct a synthetic ID: 'profile_' || bp.id (unique per profile —
      // no consumer in this branch reads `id` as a real performance id; both
      // RosterTab and LineupTab's ArtistPicker key off `band_profile_id`).
      result = await DB.prepare(
        `
        SELECT
          'profile_' || bp.id as id,
          p.event_id,
          p.venue_id,
          p.start_time,
          p.end_time,
          p.performance_date,
          p.notes,
          bp.id as band_profile_id,
          bp.name,
          bp.genre,
          bp.origin,
          bp.origin_city,
          bp.origin_region,
          bp.contact_email,
          bp.is_active,
          bp.description,
          bp.photo_url,
          bp.photo_alt_text,
          bp.social_links,
          (SELECT COUNT(*) FROM band_follows bf WHERE bf.band_profile_id = bp.id AND bf.verified = 1) AS follower_count,
          v.name as venue_name,
          e.name as event_name,
          MAX(e.date) as event_date
        FROM band_profiles bp
        LEFT JOIN performances p ON bp.id = p.band_profile_id
        LEFT JOIN venues v ON p.venue_id = v.id
        LEFT JOIN events e ON p.event_id = e.id
        WHERE bp.is_active = 1
        GROUP BY bp.id
        ORDER BY event_date DESC, bp.name
        LIMIT ?
        OFFSET ?
      `,
      )
        .bind(limit, offset)
        .all();
    }

    const bands = (result.results || []).map(unpackSocialLinks);

    // Re-derive the exact ordering in JS with the article-stripped sort key
    // (#587) — see the comparator helpers above. Pagination-boundary
    // guarantee: the eventId branch has no LIMIT/OFFSET (one event's full
    // lineup). The no-eventId branch is GROUP BY bp.id (#618) — exactly one
    // row per active band_profile — so its row count is bounded by roster
    // size, not by how many performances a band has; the JS re-sort below
    // never has to worry about a truncated LIMIT window splitting a single
    // band across pages.
    if (eventId) {
      bands.sort((a, b) => compareStartTimeNullsLast(a, b) || sortableName(a.name).localeCompare(sortableName(b.name)));
    } else {
      bands.sort(
        (a, b) =>
          compareEventDateDescNullsLast(a, b) ||
          compareStartTimeNullsFirst(a, b) ||
          sortableName(a.name).localeCompare(sortableName(b.name)),
      );
    }

    return new Response(JSON.stringify({ success: true, bands }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to fetch bands:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch bands" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
      performanceDate,
      url,
      description,
      photo_url,
      genre,
      origin,
      origin_city,
      origin_region,
      contact_email,
      is_active,
      social_links, // JSON string from frontend
      notes,
    } = body;

    const resolvedName = sanitizeString(name || "");
    const resolvedVenueId = venueId ? Number(venueId) : null;
    const resolvedDescription = description !== undefined ? sanitizeString(description) || null : null;
    const resolvedGenre = genre !== undefined ? sanitizeString(genre) || null : null;
    let resolvedPhotoUrl;
    let resolvedWebsite;
    let resolvedNotes;

    try {
      resolvedPhotoUrl = sanitizeOptionalHttpUrl(photo_url, FIELD_LIMITS.bandUrl.max, "Photo URL");
      resolvedWebsite = sanitizeOptionalHttpUrl(url, FIELD_LIMITS.bandUrl.max, "Website URL");
      resolvedNotes = sanitizeOptionalText(notes, FIELD_LIMITS.performanceNotes.max, "Notes");
    } catch (error) {
      return new Response(JSON.stringify({ error: "Validation error", message: error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (contact_email && !isValidEmail(contact_email)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Contact email must be a valid email address",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // If we are in global view (no eventId), we just create/update the profile
    const isGlobalAdd = !eventId;
    let event = null;

    if (isGlobalAdd) {
      if (!resolvedName) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields",
            message: "Band Name is required",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      if (!resolvedName) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields",
            message: "Band Name is required",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      event = await getEventStatus(DB, eventId);
      if (!event) {
        return new Response(JSON.stringify({ error: "Not found", message: "Event not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (event.status === "archived") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Cannot add performances to an archived event. Copy it as a template instead.",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Validate performance_date (#540): must fall within the event's festival-day
    // span [event.date, event.end_date]. Only applies when scheduling into an
    // event — global-add (profile-only) rows have no performance to date.
    let resolvedPerformanceDate = null;
    if (!isGlobalAdd) {
      const performanceDateCheck = validatePerformanceDate(performanceDate, event);
      if (!performanceDateCheck.valid) {
        return new Response(JSON.stringify({ error: "Validation error", message: performanceDateCheck.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      resolvedPerformanceDate = performanceDateCheck.value;
    }

    // Validate time format (only if schedule is provided)
    if ((startTime && !/^\d{2}:\d{2}$/.test(startTime)) || (endTime && !/^\d{2}:\d{2}$/.test(endTime))) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Time must be in HH:MM format",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate time order (only if schedule is provided)
    if (startTime && endTime && startTime === endTime) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Start and end time cannot be the same",
        }),
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
            JSON.stringify({
              error: "Validation error",
              message: "End time must be after start time",
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Check for conflicts (only if times are provided)
    if (!isGlobalAdd && resolvedVenueId && startTime && endTime) {
      const conflicts = await checkConflicts(
        DB,
        eventId,
        resolvedVenueId,
        startTime,
        endTime,
        null,
        resolvedPerformanceDate,
        event.date,
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
    const nameNormalized = normalizeBandName(resolvedName);
    const parsedOrigin = parseOrigin(origin?.trim());
    const trimmedOriginCity = origin_city ? origin_city.trim() : parsedOrigin.city;
    const trimmedOriginRegion = origin_region ? origin_region.trim() : parsedOrigin.region;
    const computedOrigin =
      origin?.trim() || [trimmedOriginCity, trimmedOriginRegion].filter(Boolean).join(", ") || null;
    const resolvedIsActive = is_active === undefined ? 1 : Number(is_active) === 1 ? 1 : 0;
    const existingProfile = await DB.prepare("SELECT id FROM band_profiles WHERE name_normalized = ?")
      .bind(nameNormalized)
      .first();

    let bandProfile = existingProfile;
    const createdNewProfile = !existingProfile;

    if (!bandProfile) {
      // Create new profile
      let socialLinksJson;
      try {
        socialLinksJson = sanitizeBandSocialLinks(
          social_links || (resolvedWebsite ? { website: resolvedWebsite } : null),
        );
      } catch (error) {
        return new Response(JSON.stringify({ error: "Validation error", message: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      bandProfile = await DB.prepare(
        `INSERT INTO band_profiles (
          name,
          name_normalized,
          genre,
          origin,
          origin_city,
          origin_region,
          contact_email,
          is_active,
          description,
          photo_url,
          social_links
        )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id`,
      )
        .bind(
          resolvedName,
          nameNormalized,
          resolvedGenre,
          computedOrigin,
          trimmedOriginCity,
          trimmedOriginRegion,
          contact_email || null,
          resolvedIsActive,
          resolvedDescription,
          resolvedPhotoUrl,
          socialLinksJson || null,
        )
        .first();

      if (!bandProfile) {
        throw new Error("band_profiles INSERT returned null");
      }
    }

    // 2. Create Performance (only if eventId is provided)
    let result = { id: `profile_${bandProfile.id}` };

    if (!isGlobalAdd) {
      let perfResult;
      try {
        perfResult = await DB.prepare(
          `INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time, performance_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
          .bind(
            eventId,
            resolvedVenueId,
            bandProfile.id,
            startTime || null,
            endTime || null,
            resolvedPerformanceDate,
            resolvedNotes,
          )
          .first();
      } catch (perfError) {
        // Compensating delete: only undo profiles we just created, not pre-existing ones
        if (createdNewProfile) {
          await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(bandProfile.id).run();
        }
        throw perfError;
      }

      if (!perfResult) {
        if (createdNewProfile) {
          await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(bandProfile.id).run();
        }
        throw new Error("performances INSERT returned null");
      }

      result = perfResult;
    }

    return new Response(
      JSON.stringify({
        success: true,
        band: { id: result.id, ...body },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Failed to create band:", error);
    return new Response(JSON.stringify({ success: false, error: "Failed to create band" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// PUT and DELETE handlers removed as they are handled by [id].js
