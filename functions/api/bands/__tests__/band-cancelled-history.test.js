import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../[name].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";
import { eventLocalToday } from "../../../utils/eventDay.js";

// Seeds a band with a single performance at a published, single-day event
// whose date/end_date is `endDate`, then fetches GET /api/bands/:name.
// Mirrors the seeding pattern in ../profile.test.js and
// ../../__tests__/artists.test.js's seedEnv()/getArtists() helpers.
async function seedAndFetch({ endDate, isCancelled = 0, bandName = "Deer Fang" } = {}) {
  const { env, rawDb } = createTestEnv();
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  const event = insertEvent(rawDb, {
    name: "History Event",
    slug: `history-evt-${Math.random().toString(36).slice(2)}`,
    date: endDate,
    end_date: endDate,
  });
  rawDb.prepare("UPDATE events SET status = 'published' WHERE id = ?").run(event.id);
  const venue = insertVenue(rawDb, { name: "Blue Room" });
  const band = insertBand(rawDb, { name: bandName, event_id: event.id, venue_id: venue.id });
  rawDb.prepare("UPDATE performances SET is_cancelled = ? WHERE id = ?").run(isCancelled, band.id);

  const request = new Request(`https://example.test/api/bands/${encodeURIComponent(bandName)}`);
  const response = await onRequestGet({ request, env, params: {} });
  return { response, event, band };
}

describe("GET /api/bands/[name] — cancelled set lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a cancelled set visible while the event is still current", async () => {
    const today = eventLocalToday();
    const { response } = await seedAndFetch({ endDate: today, isCancelled: 1 });
    const body = await response.json();
    expect(body.performances).toHaveLength(1);
    expect(body.performances[0].is_cancelled).toBe(1);
  });

  it("drops a cancelled set from history once the event is past", async () => {
    const { response } = await seedAndFetch({ endDate: "2020-01-01", isCancelled: 1 });
    const body = await response.json();
    expect(body.performances).toHaveLength(0);
  });

  it("keeps a NON-cancelled set in history after the event is past", async () => {
    // Proves the test above gates on is_cancelled, not merely on the date.
    const { response } = await seedAndFetch({ endDate: "2020-01-01", isCancelled: 0 });
    const body = await response.json();
    expect(body.performances).toHaveLength(1);
  });

  it("classifies a late-evening instant as still today (Toronto, not UTC)", () => {
    // Regression guard for #568: a UTC-sliced "today" flips to tomorrow at
    // 8 PM Eastern, which would classify a live event as past and make the
    // cancelled set vanish on the night it matters most.
    expect(eventLocalToday(new Date("2026-08-07T23:30:00-04:00"))).toBe("2026-08-07");
  });

  // #732 MAJOR 2 (Copilot) — this endpoint gated cancellation visibility on
  // eventLocalToday() (the CALENDAR day), not eventLocalFestivalToday() (the
  // FESTIVAL day, #732's own fix for the identical bug at
  // bands/stats/[name].js). Between local midnight and 06:00 the calendar has
  // already rolled to tomorrow while an after-midnight set is still playing —
  // eventLocalToday() would already call a single-day event whose date was
  // YESTERDAY "past" and drop its cancelled set from history at exactly the
  // moment a fan checks whether it's still on. The two functions only differ
  // inside that six-hour window (see functions/utils/eventDay.js), so the
  // clock MUST be pinned there — an unpinned test passes against either
  // implementation for eighteen hours out of every twenty-four.
  it("keeps a cancelled set visible at 00:15 local for a single-day event dated the PREVIOUS calendar day (festival day, not calendar day)", async () => {
    vi.useFakeTimers();
    // 00:15 EDT on 2026-08-08 -> 2026-08-08T04:15Z (same instant used by the
    // eventDay.js unit suite). Calendar day is already 2026-08-08; festival
    // day is still 2026-08-07 until the 06:00 threshold.
    vi.setSystemTime(new Date("2026-08-08T04:15:00Z"));

    const { response } = await seedAndFetch({ endDate: "2026-08-07", isCancelled: 1 });
    const body = await response.json();
    expect(body.performances).toHaveLength(1);
    expect(body.performances[0].is_cancelled).toBe(1);
  });
});
