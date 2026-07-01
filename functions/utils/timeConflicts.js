// Shared time-conflict utilities for scheduling operations.
// Handles sets that cross midnight by building mirrored intervals.

export function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function normalizeEndMinutes(startMinutes, endMinutes) {
  return endMinutes <= startMinutes ? endMinutes + 24 * 60 : endMinutes;
}

export function buildIntervals(start, end) {
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const normalizedEnd = normalizeEndMinutes(startMinutes, endMinutes);
  return [
    [startMinutes, normalizedEnd],
    [startMinutes + 24 * 60, normalizedEnd + 24 * 60],
  ];
}

export function intervalsOverlap(a, b) {
  return a[0] < b[1] && b[0] < a[1];
}

// Shifts start_time while preserving set duration. Handles midnight crossing.
export function computeNewEndTime(oldStart, oldEnd, newStart) {
  const fromMins = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  let dur = toMinutes(oldEnd) - toMinutes(oldStart);
  if (dur < 0) dur += 24 * 60;
  return fromMins((toMinutes(newStart) + dur) % (24 * 60));
}

/**
 * Detect scheduling conflicts for a bulk move_venue or change_time operation.
 *
 * Encapsulates the DB queries, existing-performance checks, and within-batch
 * pair checks. Handles after-midnight sets correctly via buildIntervals.
 * Archived-event conflicts are NOT included — callers handle those separately.
 *
 * @param {Object} env - Cloudflare env with DB binding
 * @param {Object} opts
 * @param {string} opts.action - "move_venue" or "change_time"
 * @param {number[]} opts.bandIds - Validated integer performance IDs (non-empty)
 * @param {Object} opts.params - { venue_id } for move_venue, { start_time } for change_time
 * @returns {Promise<Array>} Array of conflict objects ({ band_id, type, message, severity })
 */
export async function detectBulkConflicts(env, { action, bandIds, params }) {
  if (!bandIds || bandIds.length === 0) return [];

  const conflicts = [];
  const placeholders = bandIds.map(() => "?").join(",");

  // Fetch performance data for the batch (non-archived only).
  // Archived-event filtering is intentionally skipped here; callers that need
  // archived-event error messages (bulk-preview) handle that themselves.
  const bands = await env.DB.prepare(
    `SELECT p.id, p.start_time, p.end_time, p.venue_id, p.event_id, bp.name, e.status AS event_status
     FROM performances p
     JOIN band_profiles bp ON p.band_profile_id = bp.id
     JOIN events e ON p.event_id = e.id
     WHERE p.id IN (${placeholders})`,
  )
    .bind(...bandIds)
    .all();

  const bandResults = (bands.results || []).filter((b) => b.event_status !== "archived");

  if (action === "move_venue") {
    const { venue_id } = params;

    const venue = await env.DB.prepare("SELECT name FROM venues WHERE id = ?").bind(venue_id).first();
    // Venue existence is validated by callers before this function runs; if
    // somehow absent just return no conflicts rather than throwing.
    if (!venue) return [];

    // Fetch existing performances at the target venue per event, excluding all
    // batch members so they are invisible to the per-band check below (they are
    // handled pairwise instead to avoid double-reporting).
    const eventIds = [...new Set(bandResults.map((b) => b.event_id))];
    const venuePerformancesByEvent = new Map();
    for (const eventId of eventIds) {
      const rows = await env.DB.prepare(
        `SELECT p.id, p.start_time, p.end_time, bp.name
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         WHERE p.venue_id = ? AND p.event_id = ? AND p.id NOT IN (${placeholders})`,
      )
        .bind(venue_id, eventId, ...bandIds)
        .all();
      venuePerformancesByEvent.set(eventId, rows.results || []);
    }

    // Check each batch member against existing performances at the target venue.
    for (const band of bandResults) {
      if (!band.start_time || !band.end_time) continue;
      const bandIntervals = buildIntervals(band.start_time, band.end_time);
      const existing = venuePerformancesByEvent.get(band.event_id) || [];
      for (const other of existing) {
        if (!other.start_time || !other.end_time) continue;
        const otherIntervals = buildIntervals(other.start_time, other.end_time);
        if (bandIntervals.some((a) => otherIntervals.some((b) => intervalsOverlap(a, b)))) {
          const isExact = other.start_time === band.start_time && other.end_time === band.end_time;
          conflicts.push({
            band_id: band.id,
            type: isExact ? "conflict" : "overlap",
            message: isExact
              ? `"${band.name}" has the exact same time as "${other.name}" at the new venue (${other.start_time}-${other.end_time})`
              : `"${band.name}" overlaps with "${other.name}" at new venue (${other.start_time}-${other.end_time})`,
            severity: "error",
          });
        }
      }
    }

    // Pairwise check within the batch (same event). Batch members are excluded
    // from the existing-performances query above, so they are invisible to each
    // other there; we must compare them here. One entry per pair to avoid
    // duplicates.
    for (let i = 0; i < bandResults.length; i++) {
      const bandA = bandResults[i];
      if (!bandA.start_time || !bandA.end_time) continue;
      const intervalsA = buildIntervals(bandA.start_time, bandA.end_time);

      for (let j = i + 1; j < bandResults.length; j++) {
        const bandB = bandResults[j];
        if (!bandB.start_time || !bandB.end_time) continue;
        if (bandA.event_id !== bandB.event_id) continue;

        const intervalsB = buildIntervals(bandB.start_time, bandB.end_time);
        if (!intervalsA.some((a) => intervalsB.some((b) => intervalsOverlap(a, b)))) continue;

        const isExact = bandA.start_time === bandB.start_time && bandA.end_time === bandB.end_time;
        conflicts.push({
          band_id: bandA.id,
          type: isExact ? "conflict" : "overlap",
          message: isExact
            ? `"${bandA.name}" and "${bandB.name}" have the exact same time (both being moved to ${venue.name})`
            : `"${bandA.name}" and "${bandB.name}" overlap (both being moved to ${venue.name})`,
          severity: "error",
        });
      }
    }
  } else if (action === "change_time") {
    const { start_time } = params;

    // Cache existing performances per (venue, event) pair so we query each
    // unique combination at most once.
    const changeTimeVenueKey = (venueId, eventId) => `${venueId}:${eventId}`;
    const changeTimeCache = new Map();

    for (const band of bandResults) {
      if (!band.start_time || !band.end_time || !band.venue_id) continue;

      const newEndTime = computeNewEndTime(band.start_time, band.end_time, start_time);
      const cacheKey = changeTimeVenueKey(band.venue_id, band.event_id);

      if (!changeTimeCache.has(cacheKey)) {
        const rows = await env.DB.prepare(
          `SELECT p.id, p.start_time, p.end_time, bp.name
           FROM performances p
           JOIN band_profiles bp ON p.band_profile_id = bp.id
           WHERE p.venue_id = ? AND p.event_id = ? AND p.id NOT IN (${placeholders})`,
        )
          .bind(band.venue_id, band.event_id, ...bandIds)
          .all();
        changeTimeCache.set(cacheKey, rows.results || []);
      }

      const existing = changeTimeCache.get(cacheKey);
      const bandIntervals = buildIntervals(start_time, newEndTime);

      for (const other of existing) {
        if (!other.start_time || !other.end_time) continue;
        const otherIntervals = buildIntervals(other.start_time, other.end_time);
        if (bandIntervals.some((a) => otherIntervals.some((b) => intervalsOverlap(a, b)))) {
          const isExact = other.start_time === start_time && other.end_time === newEndTime;
          conflicts.push({
            band_id: band.id,
            type: isExact ? "conflict" : "overlap",
            message: isExact
              ? `"${band.name}" has the exact same time as "${other.name}" at venue (${other.start_time}-${other.end_time})`
              : `"${band.name}" overlaps with "${other.name}" at venue (${other.start_time}-${other.end_time})`,
            severity: "error",
          });
        }
      }
    }

    // Pairwise check for batch members that share venue + event. All receive the
    // same new start_time so any pair at the same venue/event will overlap at
    // minimum. One entry per pair to avoid duplicates.
    for (let i = 0; i < bandResults.length; i++) {
      const bandA = bandResults[i];
      if (!bandA.start_time || !bandA.end_time || !bandA.venue_id) continue;

      for (let j = i + 1; j < bandResults.length; j++) {
        const bandB = bandResults[j];
        if (!bandB.start_time || !bandB.end_time || !bandB.venue_id) continue;
        if (bandA.venue_id !== bandB.venue_id || bandA.event_id !== bandB.event_id) continue;

        const newEndA = computeNewEndTime(bandA.start_time, bandA.end_time, start_time);
        const newEndB = computeNewEndTime(bandB.start_time, bandB.end_time, start_time);
        const intervalsA = buildIntervals(start_time, newEndA);
        const intervalsB = buildIntervals(start_time, newEndB);
        if (!intervalsA.some((a) => intervalsB.some((b) => intervalsOverlap(a, b)))) continue;

        const isExact = newEndA === newEndB;
        conflicts.push({
          band_id: bandA.id,
          type: isExact ? "conflict" : "overlap",
          message: isExact
            ? `"${bandA.name}" and "${bandB.name}" have the exact same time at venue after time change`
            : `"${bandA.name}" and "${bandB.name}" overlap at venue after time change`,
          severity: "error",
        });
      }
    }
  }

  return conflicts;
}
