import { describe, it, expect, vi, afterEach } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils";
import * as bandsHandler from "../../bands.js";
import * as bandIdHandler from "../[id].js";
import * as bulkHandler from "../bulk.js";
import * as bulkPreviewHandler from "../bulk-preview.js";

describe("Admin bands API - CRUD operations", () => {
  it("can create a band for an event", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "BandEvent", slug: "band-event" });
    const venue = insertVenue(rawDb, { name: "Main Venue" });
    const body = { eventId: ev.id, venueId: venue.id, name: "New Band", startTime: "18:00", endTime: "19:00" };

    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.band).toHaveProperty("id");
    expect(data.band.name).toBe("New Band");
  });

  it("GET /api/admin/bands?event_id returns bands with venue and event names", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ListEvent", slug: "list-event" });
    const venue = insertVenue(rawDb, { name: "List Venue" });
    insertBand(rawDb, { name: "List Band", event_id: ev.id, venue_id: venue.id });

    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.bands.length).toBeGreaterThan(0);
    expect(list.bands[0]).toHaveProperty("venue_name");
    expect(list.bands[0]).toHaveProperty("event_name");
  });

  it("PUT /api/admin/bands/{id} updates band name", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "UpdateEvent", slug: "update-event" });
    const venue = insertVenue(rawDb, { name: "Update Venue" });
    const band = insertBand(rawDb, { name: "Old Name", event_id: ev.id, venue_id: venue.id });

    const body = { name: "New Name" };
    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.band.name).toBe("New Name");
  });

  it("DELETE /api/admin/bands/{id} removes band", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "DeleteEvent", slug: "delete-event" });
    const venue = insertVenue(rawDb, { name: "Delete Venue" });
    const band = insertBand(rawDb, { name: "Delete Me", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTruthy();
  });

  it("PUT /api/admin/bands/{id} persists photo_alt_text and GET returns it", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "AltEvent", slug: "alt-event" });
    const venue = insertVenue(rawDb, { name: "Alt Venue" });
    const band = insertBand(rawDb, { name: "Alt Band", event_id: ev.id, venue_id: venue.id });

    const body = {
      photo_url: "https://band-photos.settimes.ca/band-photos/x.jpg",
      photo_alt_text: "Alt Band performing under red stage lights",
    };
    const putReq = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const putRes = await bandIdHandler.onRequestPut({ request: putReq, env, data: { user: { role: "editor" } } });
    expect(putRes.status).toBe(200);

    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    const list = await getRes.json();
    const updated = list.bands.find((b) => b.name === "Alt Band");
    expect(updated.photo_alt_text).toBe("Alt Band performing under red stage lights");
  });

  it("PUT /api/admin/bands/{id} allows band-profile edits (is_active) for a performance in an archived event", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ArchivedEdit", slug: "archived-edit", status: "archived" });
    const venue = insertVenue(rawDb, { name: "Archived Edit Venue" });
    const band = insertBand(rawDb, { name: "Filthy Kitty", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ is_active: 0 }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    // Band status is band-wide, not event-specific — must not be blocked by archive.
    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT is_active FROM band_profiles WHERE id = ?").get(band.band_profile_id);
    expect(row.is_active).toBe(0);
  });

  it("GET without event_id includes inactive bands — the lineup-builder picker now filters them client-side (#619)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });

    rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, is_active) VALUES (?, ?, ?)")
      .run("Active Band", "activeband", 1);
    rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, is_active) VALUES (?, ?, ?)")
      .run("Inactive Band", "inactiveband", 0);

    const getReq = new Request("https://example.test/api/admin/bands", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();

    // This endpoint now returns every profile so the admin roster (RosterTab)
    // can see and edit retired ones (#619). LineupTab's ArtistPicker consumes
    // the same response, so it filters `is_active` back out client-side
    // (LineupTab.jsx's `activeBands`) to keep retired bands unschedulable.
    const names = data.bands.map((b) => b.name);
    expect(names).toContain("Active Band");
    expect(names).toContain("Inactive Band");
  });

  it("PUT /api/admin/bands/{id} still rejects set-time edits for a performance in an archived event", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ArchivedTime", slug: "archived-time", status: "archived" });
    const venue = insertVenue(rawDb, { name: "Archived Time Venue" });
    const band = insertBand(rawDb, { name: "Frozen Set", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ startTime: "20:00", endTime: "21:00" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });
});

describe("Admin bands API - GET without event_id returns one row per profile (#618)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a band whose only performance is on the OLDEST event still appears when total performance rows exceed the requested limit", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const oldEvent = insertEvent(rawDb, { name: "Old Event 618", slug: "old-event-618", date: "2020-01-01" });
    const midEvent = insertEvent(rawDb, { name: "Mid Event 618", slug: "mid-event-618", date: "2024-06-01" });
    const newEvent = insertEvent(rawDb, { name: "New Event 618", slug: "new-event-618", date: "2026-08-01" });
    const venue = insertVenue(rawDb, { name: "Regression Venue 618" });

    // Band whose ONLY performance is on the oldest event — the #618 regression
    // case (Adelleda: sole performance on lwbc07, a 2024 event).
    insertBand(rawDb, {
      name: "Adelleda Regression",
      event_id: oldEvent.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    // A prolific band with many performances on newer events inflates the
    // PERFORMANCE row count well past a small explicit limit, without
    // inflating the PROFILE count (still just 1 profile, 5 performances).
    for (let i = 0; i < 5; i++) {
      insertBand(rawDb, {
        name: "Prolific Band 618",
        event_id: i % 2 === 0 ? midEvent.id : newEvent.id,
        venue_id: venue.id,
        start_time: `${18 + i}:00`,
        end_time: `${19 + i}:00`,
      });
    }

    // Old (buggy) query: LEFT JOIN with no GROUP BY produces 1 (Adelleda) + 5
    // (Prolific) = 6 performance rows, `ORDER BY e.date DESC` + `LIMIT 3`
    // returns the 3 newest-event performance rows — all Prolific Band's — so
    // Adelleda's row never makes the page. Fixed query: GROUP BY bp.id
    // produces exactly 2 rows (one per profile), both well under limit=3.
    const getReq = new Request("https://example.test/api/admin/bands?limit=3", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();

    const names = data.bands.map((b) => b.name);
    expect(names).toContain("Adelleda Regression");
  });

  it("returns exactly one row per profile even when the band has multiple performances, all in the PAST", async () => {
    // Pinned well after every event date below so all three are unambiguously
    // past relative to "today" (#710: next/last must not depend on wall-clock
    // time when the test runs).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev1 = insertEvent(rawDb, { name: "Dedup Event 1", slug: "dedup-event-1", date: "2025-01-01" });
    const ev2 = insertEvent(rawDb, { name: "Dedup Event 2", slug: "dedup-event-2", date: "2025-06-01" });
    const ev3 = insertEvent(rawDb, { name: "Dedup Event 3", slug: "dedup-event-3", date: "2025-12-01" });
    const venue = insertVenue(rawDb, { name: "Dedup Venue" });

    insertBand(rawDb, {
      name: "Triple Booked Band",
      event_id: ev1.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });
    insertBand(rawDb, {
      name: "Triple Booked Band",
      event_id: ev2.id,
      venue_id: venue.id,
      start_time: "19:00",
      end_time: "20:00",
    });
    insertBand(rawDb, {
      name: "Triple Booked Band",
      event_id: ev3.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });

    const getReq = new Request("https://example.test/api/admin/bands", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();

    const matches = data.bands.filter((b) => b.name === "Triple Booked Band");
    expect(matches.length).toBe(1);
    // All three events are past — the LATEST one (ev3) is "last played", not
    // the MAX(e.date)-across-all-time value the old query produced. There is
    // no upcoming booking, so next_event_* stays null/blank.
    expect(matches[0].last_event_name).toBe("Dedup Event 3");
    expect(matches[0].last_event_date).toBe("2025-12-01");
    expect(matches[0].next_event_name ?? null).toBeNull();
    // event_ids exposes every distinct event the profile played, in support
    // of the roster's event filter (#710) — not just the one "last" event.
    const eventIds = (matches[0].event_ids || "")
      .split(",")
      .map(Number)
      .sort((a, b) => a - b);
    expect(eventIds).toEqual([ev1.id, ev2.id, ev3.id].sort((a, b) => a - b));
  });

  // #710 — next_event and last_event must resolve to genuinely different
  // events, not the same MAX()-across-all-time value the old query produced.
  // An assertion that only checks "next_event_name is non-null" would still
  // pass against the broken implementation, since the broken query's single
  // "most recent" column could itself be non-null; asserting the two columns
  // point at DIFFERENT events is what actually distinguishes the fix.
  it("next_event and last_event resolve to different events for a band with one past and one future booking", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z")); // "today" = 2026-01-15

    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const pastEvent = insertEvent(rawDb, { name: "Already Happened", slug: "already-happened", date: "2025-06-01" });
    const futureEvent = insertEvent(rawDb, { name: "Still Coming", slug: "still-coming", date: "2026-03-01" });
    const venue = insertVenue(rawDb, { name: "Timeline Venue" });

    insertBand(rawDb, { name: "Two Timeline Band", event_id: pastEvent.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Two Timeline Band", event_id: futureEvent.id, venue_id: venue.id });

    const getReq = new Request("https://example.test/api/admin/bands", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    const band = data.bands.find((b) => b.name === "Two Timeline Band");

    expect(band.next_event_name).toBe("Still Coming");
    expect(band.next_event_date).toBe("2026-03-01");
    expect(band.last_event_name).toBe("Already Happened");
    expect(band.last_event_date).toBe("2025-06-01");
    expect(band.next_event_name).not.toBe(band.last_event_name);

    // The IDs are what a future exact-event filter will key on, and nothing
    // else asserts them -- they could come back null or swapped and the name
    // and date assertions above would still pass.
    expect(band.next_event_id).toBe(futureEvent.id);
    expect(band.last_event_id).toBe(pastEvent.id);
    expect(band.next_event_id).not.toBe(band.last_event_id);
  });

  // #710 / #568 bug class — the calendar day rolls over at local midnight,
  // but the after-midnight convention (AFTER_MIDNIGHT_THRESHOLD_HOUR = 6)
  // says the FESTIVAL day doesn't roll until 6 AM. At 2 AM Toronto time on
  // the morning after a show opened, an event dated the PREVIOUS calendar day
  // is still current — doors are open, after-midnight sets may still be
  // playing. Using the plain calendar day here would flip this event to
  // "last" while it is still running.
  it("an event still running after midnight stays in Next, not Past, before the 6 AM festival-day boundary", async () => {
    // 2026-08-05T06:00:00Z = 02:00 EDT (America/Toronto is UTC-4 in August).
    // eventLocalToday() (calendar day) = "2026-08-05".
    // eventLocalFestivalToday() (festival day) = "2026-08-04" (hour 2 < 6).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T06:00:00Z"));

    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const tonightsEvent = insertEvent(rawDb, {
      name: "After Midnight Show",
      slug: "after-midnight-show",
      date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "Late Night Venue" });
    insertBand(rawDb, { name: "After Midnight Band", event_id: tonightsEvent.id, venue_id: venue.id });

    const getReq = new Request("https://example.test/api/admin/bands", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    const band = data.bands.find((b) => b.name === "After Midnight Band");

    expect(band.next_event_name).toBe("After Midnight Show");
    expect(band.last_event_name ?? null).toBeNull();
  });

  // #710 — multi-day events must stay "next" through their final day, keyed
  // off COALESCE(end_date, date) rather than the bare start date. On day 2 of
  // a 3-day event, the bare `date` column (day 1) is already in the past, but
  // the event itself is still running.
  it("a multi-day event stays in Next through its final day, not Past on day 2", async () => {
    // Noon UTC in August = 08:00 EDT — safely mid-morning on 2026-08-02,
    // well past the 6 AM festival-day boundary.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00Z"));

    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const multiDayEvent = insertEvent(rawDb, {
      name: "Three Day Fest",
      slug: "three-day-fest",
      date: "2026-08-01",
      end_date: "2026-08-03",
    });
    const venue = insertVenue(rawDb, { name: "Fest Venue" });
    insertBand(rawDb, { name: "Multi Day Band", event_id: multiDayEvent.id, venue_id: venue.id });

    const getReq = new Request("https://example.test/api/admin/bands", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();
    const band = data.bands.find((b) => b.name === "Multi Day Band");

    expect(band.next_event_name).toBe("Three Day Fest");
    expect(band.last_event_name ?? null).toBeNull();
  });

  // #710 / #618 — the fix must not regress to a join that fans out per
  // performance. Three profiles with 5 performances each (15 performances
  // total, across 15 distinct events) must still yield exactly 3 roster rows:
  // row count is bounded by PROFILE count, never performance count.
  it("roster row count is bounded by roster size, not performance count", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const venue = insertVenue(rawDb, { name: "Scale Venue" });
    const profileNames = ["Prolific A", "Prolific B", "Prolific C"];

    let eventCounter = 0;
    for (const name of profileNames) {
      for (let i = 0; i < 5; i++) {
        eventCounter += 1;
        const ev = insertEvent(rawDb, {
          name: `Scale Event ${eventCounter}`,
          slug: `scale-event-${eventCounter}`,
          date: `2024-${String((eventCounter % 12) + 1).padStart(2, "0")}-01`,
        });
        insertBand(rawDb, { name, event_id: ev.id, venue_id: venue.id });
      }
    }

    const getReq = new Request("https://example.test/api/admin/bands", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();

    const matches = data.bands.filter((b) => profileNames.includes(b.name));
    expect(matches.length).toBe(3);
  });

  it("includes inactive profiles in the roster branch with is_active: 0 on the row (#619)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, is_active) VALUES (?, ?, ?)")
      .run("Active Roster Band 618", "activerosterband618", 1);
    rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, is_active) VALUES (?, ?, ?)")
      .run("Retired Roster Band 618", "retiredrosterband618", 0);

    const getReq = new Request("https://example.test/api/admin/bands", { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const data = await getRes.json();

    // The admin roster manages profiles including retired ones (#619), so both
    // rows must be present — with is_active reflecting each profile's real state
    // so the client can badge/filter on it instead of the server hiding rows.
    const active = data.bands.find((b) => b.name === "Active Roster Band 618");
    const retired = data.bands.find((b) => b.name === "Retired Roster Band 618");
    expect(active).toBeDefined();
    expect(active.is_active).toBe(1);
    expect(retired).toBeDefined();
    expect(retired.is_active).toBe(0);
  });
});

describe("Admin bands API - Validation", () => {
  it("create rejects performances for archived events", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ArchivedAdd", slug: "archived-add", status: "archived" });
    const venue = insertVenue(rawDb, { name: "Archive Venue" });

    const body = { eventId: ev.id, venueId: venue.id, name: "Too Late Band", startTime: "18:00", endTime: "19:00" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("create validation fails when name is missing", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ValEvent", slug: "val-event" });
    const venue = insertVenue(rawDb, { name: "Val Venue" });

    const body = { eventId: ev.id, venueId: venue.id, startTime: "18:00", endTime: "19:00" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Missing required fields");
  });

  it("create succeeds for event band without venue or times (TBD lineup)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "MissingEvent", slug: "missing-event" });

    const body = { eventId: ev.id, name: "TBD Band" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.band.name).toBe("TBD Band");
  });

  it("create succeeds for event band with venue but no times", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "NoTimeEvent", slug: "no-time-event" });
    const venue = insertVenue(rawDb, { name: "No Time Venue" });

    const body = { eventId: ev.id, venueId: venue.id, name: "No Time Band" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
  });

  it("GET with event_id returns null-venue performances", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "NullVenueEvent", slug: "null-venue-event" });

    // Insert a band (performance) without a venue or times
    const bandBody = { eventId: ev.id, name: "TBD Venue Band" };
    const postReq = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(bandBody),
    });
    await bandsHandler.onRequestPost({ request: postReq, env, data: { user: { role: "editor" } } });

    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(list.bands.length).toBe(1);
    expect(list.bands[0].venue_name).toBeNull();
    expect(list.bands[0].start_time).toBeNull();
  });

  it("create validation fails with invalid time format", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "TimeEvent", slug: "time-event" });
    const venue = insertVenue(rawDb, { name: "Time Venue" });

    const body = { eventId: ev.id, venueId: venue.id, name: "Bad Time", startTime: "6pm", endTime: "19:00" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain("Time must be in HH:MM format");
  });

  it("create validation fails when end time before start time", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "OrderEvent", slug: "order-event" });
    const venue = insertVenue(rawDb, { name: "Order Venue" });

    const body = { eventId: ev.id, venueId: venue.id, name: "Bad Order", startTime: "19:00", endTime: "18:00" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain("End time must be after start time");
  });

  it("duplicate band name returns 409", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "DupEvent", slug: "dup-event" });
    const venue = insertVenue(rawDb, { name: "Dup Venue" });

    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "SameBand",
      startTime: "18:00",
      endTime: "19:00",
    };
    const req1 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const r1 = await bandsHandler.onRequestPost({ request: req1, env, data: { user: { role: "editor" } } });
    expect(r1.status).toBe(201);

    const req2 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const r2 = await bandsHandler.onRequestPost({ request: req2, env, data: { user: { role: "editor" } } });
    expect(r2.status).toBe(409);
  });

  it("update returns 404 for non-existent band", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const body = { name: "Updated Name" };
    const request = new Request("https://example.test/api/admin/bands/99999", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(404);
  });

  it("update allows band-profile fields (name) for a performance in an archived event", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "ArchivedUpdate",
      slug: "archived-update",
      status: "archived",
    });
    const venue = insertVenue(rawDb, { name: "Archive Update Venue" });
    const band = insertBand(rawDb, { name: "Frozen Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "Renamed Frozen Band" }),
    });

    // Band name is band-wide profile data (one shared band_profiles row) — editable
    // regardless of event archive state. Only event-specific set times are frozen.
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT name FROM band_profiles WHERE id = ?").get(band.band_profile_id);
    expect(row.name).toBe("Renamed Frozen Band");
  });

  it("delete returns 404 for non-existent band", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/bands/99999", {
      method: "DELETE",
      headers: { ...headers },
    });

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(404);
  });

  it("delete rejects performances for archived events", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "ArchivedDelete",
      slug: "archived-delete",
      status: "archived",
    });
    const venue = insertVenue(rawDb, { name: "Archive Delete Venue" });
    const band = insertBand(rawDb, { name: "Protected Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "DELETE",
      headers: { ...headers },
    });

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });
});

describe("Admin bands API - Conflicts", () => {
  it("conflict detection finds overlapping times at the same venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ConflictEvent", slug: "conflict-event" });
    const venue = insertVenue(rawDb, { name: "Conflict Venue" });

    // Existing band (inserted for side effect; return value unused)
    insertBand(rawDb, {
      name: "Band One",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    // Overlapping band
    const body2 = { eventId: ev.id, venueId: venue.id, name: "Band Two", startTime: "18:30", endTime: "19:30" };
    const req2 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body2),
    });
    const r2 = await bandsHandler.onRequestPost({ request: req2, env, data: { user: { role: "editor" } } });
    expect(r2.status).toBe(409);
    const data2 = await r2.json();
    expect(data2.conflicts).toBeDefined();
    expect(data2.conflicts.length).toBeGreaterThan(0);
  });

  it("multi-day: same venue + time on different festival days does NOT conflict (#540)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayConflict",
      slug: "multi-day-conflict",
      date: "2026-08-01",
      end_date: "2026-08-02",
    });
    const venue = insertVenue(rawDb, { name: "Shared Stage" });

    const day1 = insertBand(rawDb, {
      name: "Day One Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-01", day1.id);

    // Same venue, same clock time, but Day 2 — the canonical multi-day pattern.
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Day Two Band",
      startTime: "20:00",
      endTime: "21:00",
      performanceDate: "2026-08-02",
    };
    const req = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandsHandler.onRequestPost({ request: req, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
  });

  it("multi-day: same venue + time on the SAME festival day still conflicts (#540)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "SameDayConflict",
      slug: "same-day-conflict",
      date: "2026-08-01",
      end_date: "2026-08-02",
    });
    const venue = insertVenue(rawDb, { name: "Same Day Stage" });

    const existing = insertBand(rawDb, {
      name: "First Set",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-01", existing.id);

    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Second Set",
      startTime: "20:00",
      endTime: "21:00",
      performanceDate: "2026-08-01",
    };
    const req = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandsHandler.onRequestPost({ request: req, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(409);
  });

  it("multi-day: moving a set to a time used on another day at the same venue does NOT conflict (#540)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayUpdate",
      slug: "multi-day-update",
      date: "2026-08-01",
      end_date: "2026-08-02",
    });
    const venue = insertVenue(rawDb, { name: "Update Stage" });

    const day1 = insertBand(rawDb, {
      name: "Day1 Set",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-01", day1.id);

    const day2 = insertBand(rawDb, {
      name: "Day2 Set",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });
    rawDb.prepare("UPDATE performances SET performance_date=? WHERE id=?").run("2026-08-02", day2.id);

    // Move the Day-2 set onto the Day-1 set's clock time at the same venue.
    // Different festival day → must NOT be a conflict.
    const body = { startTime: "20:00", endTime: "21:00" };
    const req = new Request(`https://example.test/api/admin/bands/${day2.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandIdHandler.onRequestPut({ request: req, env, data: { user: { role: "editor" } } });
    expect(res.status).not.toBe(409);
  });
});

describe("Admin bands API - Bulk operations", () => {
  it("PATCH /api/admin/bands/bulk deletes multiple bands", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "BulkEvent", slug: "bulk-event" });
    const venue = insertVenue(rawDb, { name: "Bulk Venue" });
    const band1 = insertBand(rawDb, { name: "Bulk1", event_id: ev.id, venue_id: venue.id });
    const band2 = insertBand(rawDb, { name: "Bulk2", event_id: ev.id, venue_id: venue.id });

    const body = { band_ids: [band1.id, band2.id], action: "delete" };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTruthy();
    expect(data.updated).toBe(2);
  });

  it("PATCH /api/admin/bands/bulk rejects archived event performances", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "Archived Bulk",
      slug: "archived-bulk",
      status: "archived",
    });
    const venue = insertVenue(rawDb, { name: "Archived Bulk Venue" });
    const band = insertBand(rawDb, { name: "Locked Bulk Band", event_id: ev.id, venue_id: venue.id });

    const body = { band_ids: [band.id], action: "delete" };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("DELETE /api/admin/bands/bulk rejects archived event performances", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "Archived Bulk Delete",
      slug: "archived-bulk-delete",
      status: "archived",
    });
    const venue = insertVenue(rawDb, { name: "Archived Bulk Delete Venue" });
    const band = insertBand(rawDb, { name: "Locked Delete Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [band.id] }),
    });

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("bulk preview returns changes and conflicts", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "PreviewEvent", slug: "preview-event" });
    const venue = insertVenue(rawDb, { name: "Preview Venue" });
    const band1 = insertBand(rawDb, { name: "Preview1", event_id: ev.id, venue_id: venue.id });

    const body = { band_ids: [band1.id], action: "delete" };
    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.changes).toBeDefined();
    expect(data.conflicts).toBeDefined();
  });

  it("bulk preview flags archived event performances as conflicts", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "Archived Preview",
      slug: "archived-preview",
      status: "archived",
    });
    const venue = insertVenue(rawDb, { name: "Archived Preview Venue" });
    const band = insertBand(rawDb, { name: "Preview Locked Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [band.id], action: "delete" }),
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conflicts.some((conflict) => conflict.message.includes("archived event"))).toBe(true);
    expect(data.changes).toHaveLength(0);
  });

  it("bulk preview change_time returns 400 for invalid start_time", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "PreviewValidateEvent", slug: "preview-validate-event" });
    const venue = insertVenue(rawDb, { name: "Preview Validate Venue" });
    const band = insertBand(rawDb, {
      name: "Preview Validate Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [band.id], action: "change_time", start_time: "6pm" }),
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });

  it("bulk change_time preserves duration for after-midnight sets", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "MidnightEvent", slug: "midnight-event" });
    const venue = insertVenue(rawDb, { name: "Midnight Venue" });
    // 23:40–00:10 = 30 minute set crossing midnight
    const band = insertBand(rawDb, {
      name: "Midnight Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "23:40",
      end_time: "00:10",
    });

    const body = { band_ids: [band.id], action: "change_time", start_time: "23:00" };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);

    // Shifting 23:40 → 23:00 should shift end 00:10 → 23:30 (30 min duration preserved)
    const updated = rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(band.id);
    expect(updated.start_time).toBe("23:00");
    expect(updated.end_time).toBe("23:30");
  });

  it("bulk change_time preserves duration for a set that shifts across midnight", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ShiftEvent", slug: "shift-event" });
    const venue = insertVenue(rawDb, { name: "Shift Venue" });
    // 22:00–23:00 = 60 minute same-day set
    const band = insertBand(rawDb, {
      name: "Shift Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });

    const body = { band_ids: [band.id], action: "change_time", start_time: "23:30" };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);

    // Shifting 22:00 → 23:30 should end at 00:30 (60 min duration)
    const updated = rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(band.id);
    expect(updated.start_time).toBe("23:30");
    expect(updated.end_time).toBe("00:30");
  });

  it("bulk change_time rejects invalid start_time format", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ValidateEvent", slug: "validate-event" });
    const venue = insertVenue(rawDb, { name: "Validate Venue" });
    const band = insertBand(rawDb, {
      name: "Validate Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    const body = { band_ids: [band.id], action: "change_time", start_time: "6pm" };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });

  it("bulk move_venue rejects non-existent venue_id", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "VenueCheckEvent", slug: "venue-check-event" });
    const venue = insertVenue(rawDb, { name: "Venue Check" });
    const band = insertBand(rawDb, { name: "Venue Check Band", event_id: ev.id, venue_id: venue.id });

    const body = { band_ids: [band.id], action: "move_venue", venue_id: 99999 };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(404);
  });

  it("bulk PATCH returns 400 for malformed JSON body", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: "not valid json{{{",
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });

  it("conflict detection returns type field distinguishing overlap from exact conflict", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "TypeEvent", slug: "type-event" });
    const venue = insertVenue(rawDb, { name: "Type Venue" });
    insertBand(rawDb, {
      name: "Band Exact",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    // Exact conflict — same time slot
    const exactBody = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Band Exact Copy",
      startTime: "18:00",
      endTime: "19:00",
    };
    const exactReq = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(exactBody),
    });
    const exactRes = await bandsHandler.onRequestPost({ request: exactReq, env, data: { user: { role: "editor" } } });
    expect(exactRes.status).toBe(409);
    const exactData = await exactRes.json();
    expect(exactData.conflicts[0].type).toBe("conflict");

    // Overlap — partial overlap
    const overlapBody = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Band Overlapper",
      startTime: "18:30",
      endTime: "19:30",
    };
    const overlapReq = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(overlapBody),
    });
    const overlapRes = await bandsHandler.onRequestPost({
      request: overlapReq,
      env,
      data: { user: { role: "editor" } },
    });
    expect(overlapRes.status).toBe(409);
    const overlapData = await overlapRes.json();
    expect(overlapData.conflicts[0].type).toBe("overlap");
  });

  it("move_venue preview detects overlap between two batch members moving to the same venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "BatchOverlapEvent", slug: "batch-overlap-event" });
    const sourceA = insertVenue(rawDb, { name: "Source A" });
    const sourceB = insertVenue(rawDb, { name: "Source B" });
    const target = insertVenue(rawDb, { name: "Target Venue" });
    // Two bands at different venues, overlapping times — moving both to the same target venue
    const bandA = insertBand(rawDb, {
      name: "Batch A",
      event_id: ev.id,
      venue_id: sourceA.id,
      start_time: "21:00",
      end_time: "22:00",
    });
    const bandB = insertBand(rawDb, {
      name: "Batch B",
      event_id: ev.id,
      venue_id: sourceB.id,
      start_time: "21:30",
      end_time: "22:30",
    });

    const req = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [bandA.id, bandB.id], action: "move_venue", venue_id: target.id }),
    });
    const res = await bulkPreviewHandler.onRequestPost({ request: req, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();

    // One entry per pair — message must mention both band names
    const overlap = data.conflicts.find((c) => c.type === "overlap");
    expect(overlap).toBeDefined();
    expect(overlap.message).toContain("Batch A");
    expect(overlap.message).toContain("Batch B");
  });

  it("move_venue preview detects exact conflict when two batch members have identical times", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "BatchExactEvent", slug: "batch-exact-event" });
    const sourceA = insertVenue(rawDb, { name: "Exact Source A" });
    const sourceB = insertVenue(rawDb, { name: "Exact Source B" });
    const target = insertVenue(rawDb, { name: "Exact Target" });
    // Same time slot at different venues — should become an exact conflict when co-located
    const bandA = insertBand(rawDb, {
      name: "Exact A",
      event_id: ev.id,
      venue_id: sourceA.id,
      start_time: "21:00",
      end_time: "22:00",
    });
    const bandB = insertBand(rawDb, {
      name: "Exact B",
      event_id: ev.id,
      venue_id: sourceB.id,
      start_time: "21:00",
      end_time: "22:00",
    });

    const req = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [bandA.id, bandB.id], action: "move_venue", venue_id: target.id }),
    });
    const res = await bulkPreviewHandler.onRequestPost({ request: req, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();

    // One entry per pair — message must mention both band names
    const conflict = data.conflicts.find((c) => c.type === "conflict");
    expect(conflict).toBeDefined();
    expect(conflict.message).toContain("Exact A");
    expect(conflict.message).toContain("Exact B");
  });

  it("change_time preview detects overlap between two batch members at the same venue+event after time shift", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ChangeTimeBatchEvent", slug: "change-time-batch-event" });
    const venue = insertVenue(rawDb, { name: "Shared Venue" });
    // Two bands at the same venue+event with different durations — moving both to the same start time
    const bandA = insertBand(rawDb, {
      name: "CT Band A",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    }); // 60 min
    const bandB = insertBand(rawDb, {
      name: "CT Band B",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:30",
    }); // 90 min

    // Both shifted to 23:00 → A: 23:00-00:00, B: 23:00-00:30 → overlap
    const req = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [bandA.id, bandB.id], action: "change_time", start_time: "23:00" }),
    });
    const res = await bulkPreviewHandler.onRequestPost({ request: req, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();

    // One entry per pair — message must mention both band names
    const entry = data.conflicts.find((c) => c.type === "overlap" || c.type === "conflict");
    expect(entry).toBeDefined();
    expect(entry.message).toContain("CT Band A");
    expect(entry.message).toContain("CT Band B");
  });
});

describe("Admin bands API - Atomicity (P0-B1, P1-B6)", () => {
  it("cleans up newly created band_profile if performance insert fails", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "AtomicEvent", slug: "atomic-event" });
    const venue = insertVenue(rawDb, { name: "Atomic Venue" });

    // Make the performance INSERT throw to simulate a DB failure mid-creation
    const originalPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("INSERT INTO performances")) {
        return {
          bind: () => ({
            first: () => {
              throw new Error("simulated D1 constraint failure");
            },
          }),
        };
      }
      return originalPrepare(sql);
    };

    const body = { eventId: ev.id, venueId: venue.id, name: "NewOrphanBand", startTime: "18:00", endTime: "19:00" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(500);

    // The newly created band_profile must have been cleaned up
    const orphan = rawDb.prepare("SELECT id FROM band_profiles WHERE name_normalized = ?").get("neworphanband");
    expect(orphan).toBeUndefined();
  });

  it("does not delete an existing band_profile if performance insert fails", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ExistingProfileEvent", slug: "existing-profile-event" });
    const venue = insertVenue(rawDb, { name: "EP Venue" });

    // Pre-create the band profile so it already exists when the POST runs
    rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("ExistingArtist", "existingartist");

    // Make the performance INSERT throw
    const originalPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("INSERT INTO performances")) {
        return {
          bind: () => ({
            first: () => {
              throw new Error("simulated failure");
            },
          }),
        };
      }
      return originalPrepare(sql);
    };

    const body = { eventId: ev.id, venueId: venue.id, name: "ExistingArtist", startTime: "20:00", endTime: "21:00" };
    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });

    // Pre-existing profile must still be there — we must NOT delete profiles we didn't create
    const profile = rawDb.prepare("SELECT id FROM band_profiles WHERE name_normalized = ?").get("existingartist");
    expect(profile).toBeDefined();
  });
});

describe("Admin bands API - Input validation (P1-S2)", () => {
  it("bulk PATCH rejects non-integer band_ids (string injection)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    insertEvent(rawDb, { name: "InjEvent", slug: "inj-event" });
    insertVenue(rawDb, { name: "InjVenue" });

    const body = { band_ids: ["1; DROP TABLE performances; --"], action: "delete" };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  it("bulk PATCH rejects floating-point band_ids", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const body = { band_ids: [1.5, 2.9], action: "delete" };
    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });

  it("bulk-preview rejects non-integer band_ids", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const body = { band_ids: ["not-an-id"], action: "delete" };
    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });
});

describe("Admin bands API - Bulk DELETE profile IDs (P1-B4, P1-B7)", () => {
  it("bulk DELETE correctly removes a profile that has no performances", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const profileInfo = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Orphan Artist", "orphanartist");
    const profileId = profileInfo.lastInsertRowid;

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [`profile_${profileId}`] }),
    });

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deletedCount).toBe(1);
    expect(rawDb.prepare("SELECT id FROM band_profiles WHERE id = ?").get(profileId)).toBeUndefined();
  });

  it("bulk DELETE blocks profile deletion when it has existing performances", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "HasPerfEvent", slug: "has-perf-event" });
    const band = insertBand(rawDb, { name: "Busy Artist", event_id: ev.id });
    const profileId = band.band_profile_id;

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [`profile_${profileId}`] }),
    });

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deletedCount).toBe(0);
    expect(data.errors).toBeDefined();
    expect(data.errors.length).toBeGreaterThan(0);
    expect(rawDb.prepare("SELECT id FROM band_profiles WHERE id = ?").get(profileId)).toBeDefined();
  });

  it("bulk DELETE with non-integer profile ID reports an error instead of silently succeeding", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: ["profile_not_a_number"] }),
    });

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deletedCount).toBe(0);
    expect(data.errors).toBeDefined();
    expect(data.errors.length).toBeGreaterThan(0);
  });
});

describe("Admin bands API - Bulk POST add profiles (P1-B5)", () => {
  it("POST bulk add correctly adds multiple profiles to a lineup", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "BulkAddEvent", slug: "bulk-add-event" });
    const p1 = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Roster One", "rosterone");
    const p2 = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Roster Two", "rostertwo");

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_profile_ids: [p1.lastInsertRowid, p2.lastInsertRowid], event_id: ev.id }),
    });

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.added.length).toBe(2);
    expect(data.skipped.length).toBe(0);

    const perfs = rawDb.prepare("SELECT id FROM performances WHERE event_id = ?").all(ev.id);
    expect(perfs.length).toBe(2);
  });

  it("POST bulk add skips a profile already in the event and reports it", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "SkipAddEvent", slug: "skip-add-event" });
    const band = insertBand(rawDb, { name: "Already There", event_id: ev.id });

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_profile_ids: [band.band_profile_id], event_id: ev.id }),
    });

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.added.length).toBe(0);
    expect(data.skipped.length).toBe(1);
  });

  it("POST bulk add handles duplicate profile IDs — adds once, skips the second", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "DupAddEvent", slug: "dup-add-event" });
    const profileInfo = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Dup Artist", "dupartist");
    const profileId = profileInfo.lastInsertRowid;

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_profile_ids: [profileId, profileId], event_id: ev.id }),
    });

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.added.length).toBe(1);
    expect(data.skipped.length).toBe(1);

    const perfs = rawDb
      .prepare("SELECT id FROM performances WHERE band_profile_id = ? AND event_id = ?")
      .all(profileId, ev.id);
    expect(perfs.length).toBe(1);
  });
});

describe("Admin bands API - profile_abc integer validation in [id].js (P1-B7)", () => {
  it("PUT /bands/profile_not_a_number returns 400 for non-integer profile ID", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/bands/profile_not_a_number", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "Anything" }),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/bad request/i);
  });

  it("DELETE /bands/profile_not_a_number returns 400 for non-integer profile ID", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/bands/profile_not_a_number", {
      method: "DELETE",
      headers: { ...headers },
    });

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/bad request/i);
  });
});

describe("Admin bands API - Malformed JSON body (P2-B9)", () => {
  it("bulk DELETE returns 400 for malformed JSON body", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...headers },
      body: "not json{{{",
    });

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });

  it("bulk-preview returns 400 for malformed JSON body", async () => {
    const { env, headers } = createTestEnv({ role: "editor" });

    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: "not json{{{",
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/invalid/i);
  });
});

describe("Admin bands API - bulk-preview after-midnight conflict detection (T2/VL-1b)", () => {
  it("move_venue detects overlap with an after-midnight band at the target venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "MidnightConflictEvent", slug: "midnight-conflict" });
    const sourceVenue = insertVenue(rawDb, { name: "Source Venue" });
    const targetVenue = insertVenue(rawDb, { name: "Target Venue" });

    // Existing band at target venue: 23:30–00:30 (crosses midnight)
    insertBand(rawDb, {
      name: "Midnight Resident",
      event_id: ev.id,
      venue_id: targetVenue.id,
      start_time: "23:30",
      end_time: "00:30",
    });

    // Band we want to move to that venue: 23:50–01:00 — overlaps midnight resident
    const movingBand = insertBand(rawDb, {
      name: "Moving Band",
      event_id: ev.id,
      venue_id: sourceVenue.id,
      start_time: "23:50",
      end_time: "01:00",
    });

    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [movingBand.id], action: "move_venue", venue_id: targetVenue.id }),
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    // Must detect the overlap — HH:MM string comparison would miss this entirely
    expect(data.conflicts.length).toBeGreaterThan(0);
    expect(data.conflicts.some((c) => c.message.includes("Midnight Resident"))).toBe(true);
  });

  it("change_time detects overlap with an after-midnight band at same venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ChangeTimeMidnight", slug: "change-time-midnight" });
    const venue = insertVenue(rawDb, { name: "Midnight Venue 2" });

    // Existing band: 23:00–00:00
    insertBand(rawDb, {
      name: "Late Night Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "23:00",
      end_time: "00:00",
    });

    // Band being moved: currently 21:00–22:00, being moved to 23:30 (new end: 00:30)
    const movingBand = insertBand(rawDb, {
      name: "Shifting Band",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "21:00",
      end_time: "22:00",
    });

    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [movingBand.id], action: "change_time", start_time: "23:30" }),
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conflicts.length).toBeGreaterThan(0);
    expect(data.conflicts.some((c) => c.message.includes("Late Night Band"))).toBe(true);
  });
});

describe("Admin bands API - venue-optional PUT (Closes #407)", () => {
  it("PUT with venueId: 0 on a venue-less performance returns 200 and keeps venue NULL", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "NullVenuePut0", slug: "null-venue-put0" });
    // insertBand default: venue_id = null
    const band = insertBand(rawDb, { name: "No Venue Band 0", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        venueId: 0,
        social_links: JSON.stringify({ website: "https://example.com" }),
      }),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(band.id);
    expect(row.venue_id).toBeNull();
  });

  it('PUT with venueId: "" on a venue-less performance returns 200 and keeps venue NULL', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "NullVenuePutEmpty", slug: "null-venue-put-empty" });
    const band = insertBand(rawDb, { name: "No Venue Band Empty", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        venueId: "",
        social_links: JSON.stringify({ instagram: "@testband" }),
      }),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(band.id);
    expect(row.venue_id).toBeNull();
  });

  it("PUT without venueId on a venue-less performance returns 200 and keeps venue NULL", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "NullVenuePutOmit", slug: "null-venue-put-omit" });
    const band = insertBand(rawDb, { name: "No Venue Band Omit", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ social_links: JSON.stringify({ bandcamp: "https://band.bandcamp.com" }) }),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(band.id);
    expect(row.venue_id).toBeNull();
  });

  it("PUT with a positive invalid venueId still returns 404 (guard still fires)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "InvalidVenuePut", slug: "invalid-venue-put" });
    const band = insertBand(rawDb, { name: "Invalid Venue Band", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ venueId: 99999 }),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toBe("Venue not found");
  });

  it("PUT with venueId: null clears an existing venue assignment", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "ClearVenuePut", slug: "clear-venue-put" });
    const venue = insertVenue(rawDb, { name: "Clear Test Venue" });
    const band = insertBand(rawDb, { name: "Clear Venue Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ venueId: null }),
    });

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(band.id);
    expect(row.venue_id).toBeNull();
  });
});

describe("Admin bands API - PUT conflict self-exclusion (T3)", () => {
  it("PUT update does not conflict with the band being updated (self-exclusion)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "SelfExEvent", slug: "self-ex-event" });
    const venue = insertVenue(rawDb, { name: "SelfEx Venue" });
    const bandA = insertBand(rawDb, {
      name: "Band A",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });

    // Update Band A to the exact same time — must not conflict with itself
    const request = new Request(`https://example.test/api/admin/bands/${bandA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ startTime: "22:00", endTime: "23:00" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
  });

  it("PUT update conflicts with a different band at the same venue", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "CrossConflictEvent", slug: "cross-conflict-event" });
    const venue = insertVenue(rawDb, { name: "CrossConflict Venue" });
    insertBand(rawDb, { name: "Band B", event_id: ev.id, venue_id: venue.id, start_time: "23:00", end_time: "00:00" });
    const bandA = insertBand(rawDb, {
      name: "Band A",
      event_id: ev.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });

    // Move Band A to 22:30–23:30 — overlaps with Band B
    const request = new Request(`https://example.test/api/admin/bands/${bandA.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ startTime: "22:30", endTime: "23:30" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(409);
  });
});

describe("Admin bands API - Bulk POST onRequestPost full flow (T6)", () => {
  it("POST bulk add skips archived events and reports it as a conflict", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const archivedEvent = insertEvent(rawDb, {
      name: "Archived Event",
      slug: "archived-event",
      status: "archived",
    });
    const venue = insertVenue(rawDb, { name: "Venue A" });
    const band = insertBand(rawDb, { name: "Archived Band", event_id: archivedEvent.id, venue_id: venue.id });

    const request = new Request("https://example.test/api/admin/bands/bulk-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_ids: [band.id], action: "move_venue", venue_id: venue.id }),
    });

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    // archived band → changes list is empty, conflict reported
    expect(data.changes).toHaveLength(0);
    expect(data.conflicts.some((c) => c.message.includes("archived event"))).toBe(true);
  });

  it("POST bulk add to an event correctly deduplicates and skips already-in-event profiles", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "DedupeFullEvent", slug: "dedupe-full-event" });
    const p1 = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Unique Roster", "uniqueroster");
    // p2 is already in the event
    const p2info = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Already In", "alreadyin");
    rawDb
      .prepare("INSERT INTO performances (band_profile_id, event_id) VALUES (?, ?)")
      .run(p2info.lastInsertRowid, ev.id);

    const request = new Request("https://example.test/api/admin/bands/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ band_profile_ids: [p1.lastInsertRowid, p2info.lastInsertRowid], event_id: ev.id }),
    });

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect([200, 201]).toContain(res.status);
    const data = await res.json();
    expect(data.added.length).toBe(1);
    expect(data.skipped.length).toBe(1);
  });
});

describe("Admin bands API - social_links read-path sanitization (#493)", () => {
  it("GET /api/admin/bands nulls out a javascript: scheme while keeping a legitimate handle and URL", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "SchemeListEvent", slug: "scheme-list-event" });
    const venue = insertVenue(rawDb, { name: "Scheme List Venue" });
    insertBand(rawDb, {
      name: "Scheme List Band",
      event_id: ev.id,
      venue_id: venue.id,
      social_links: JSON.stringify({
        // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #493 admin read-path guard
        website: "javascript:alert(1)",
        instagram: "the_band",
        bandcamp: "https://theband.bandcamp.com",
      }),
    });

    const request = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers });
    const res = await bandsHandler.onRequestGet({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    const band = data.bands.find((b) => b.name === "Scheme List Band");
    expect(band).toBeDefined();

    // Unpacked per-platform fields sanitized.
    expect(band.url).toBe("");
    expect(band.instagram).toBe("the_band");
    expect(band.bandcamp).toBe("https://theband.bandcamp.com/");

    // The raw `social_links` string RosterTab.jsx parses is sanitized too,
    // and stays a JSON string (response shape unchanged).
    expect(typeof band.social_links).toBe("string");
    const parsed = JSON.parse(band.social_links);
    expect(parsed.website).toBeNull();
    expect(parsed.instagram).toBe("the_band");
    expect(parsed.bandcamp).toBe("https://theband.bandcamp.com/");
  });

  it("PUT /api/admin/bands/{id} response nulls out a javascript: scheme in social_links untouched by the request", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "SchemePutEvent", slug: "scheme-put-event" });
    const venue = insertVenue(rawDb, { name: "Scheme Put Venue" });
    const band = insertBand(rawDb, {
      name: "Scheme Put Band",
      event_id: ev.id,
      venue_id: venue.id,
      social_links: JSON.stringify({
        // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #493 admin read-path guard
        website: "javascript:alert(1)",
        instagram: "legit_handle",
      }),
    });

    // Update an unrelated field (genre) — the request never touches social_links.
    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ genre: "Punk" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.band.url).toBe("");
    expect(typeof data.band.social_links).toBe("string");
    const parsed = JSON.parse(data.band.social_links);
    expect(parsed.website).toBeNull();
    expect(parsed.instagram).toBe("legit_handle");
  });
});

describe("Admin bands API - performance_date multi-day validation (#540)", () => {
  it("create persists a performance_date within the event's festival-day span", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayEvent",
      slug: "multi-day-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Venue" });
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Day Two Band",
      startTime: "18:00",
      endTime: "19:00",
      performanceDate: "2026-08-03",
    };

    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);
    const created201 = await res.json();

    const row = rawDb.prepare("SELECT performance_date FROM performances WHERE id = ?").get(created201.band.id);
    expect(row.performance_date).toBe("2026-08-03");

    // Re-fetch via GET to confirm the persisted value round-trips through the API too.
    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    const list = await getRes.json();
    const created = list.bands.find((b) => b.name === "Day Two Band");
    expect(created.performance_date).toBe("2026-08-03");
  });

  it("create rejects a performance_date outside the event's festival-day span", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayRejectEvent",
      slug: "multi-day-reject-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Reject Venue" });
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Out Of Range Band",
      startTime: "18:00",
      endTime: "19:00",
      performanceDate: "2026-08-05",
    };

    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/performance_date/);
  });

  it("create rejects a malformed performance_date", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayMalformedEvent",
      slug: "multi-day-malformed-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Malformed Venue" });
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Malformed Date Band",
      startTime: "18:00",
      endTime: "19:00",
      performanceDate: "08/03/2026",
    };

    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });

  it("create with no performance_date on a multi-day event leaves the column NULL (unassigned is allowed)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayNullEvent",
      slug: "multi-day-null-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Null Venue" });
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "No Date Band",
      startTime: "18:00",
      endTime: "19:00",
    };

    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(201);

    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers });
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: "editor" } } });
    const list = await getRes.json();
    const created = list.bands.find((b) => b.name === "No Date Band");
    expect(created.performance_date).toBeNull();
  });

  it("create on a single-day event rejects any performance_date (no valid days exist)", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "SingleDayEvent", slug: "single-day-event", date: "2026-08-02" });
    const venue = insertVenue(rawDb, { name: "SingleDay Venue" });
    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "Single Day Band",
      startTime: "18:00",
      endTime: "19:00",
      performanceDate: "2026-08-03",
    };

    const request = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });

  it("update persists a new performance_date within range", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayUpdateEvent",
      slug: "multi-day-update-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Update Venue" });
    const band = insertBand(rawDb, { name: "Update Date Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ performanceDate: "2026-08-04" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.band.performance_date).toBe("2026-08-04");
  });

  it("update rejects an out-of-range performance_date", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayUpdateRejectEvent",
      slug: "multi-day-update-reject-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Update Reject Venue" });
    const band = insertBand(rawDb, { name: "Update Reject Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ performanceDate: "2026-08-01" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/performance_date/);
  });

  it("update rejects a malformed performance_date", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayUpdateMalformedEvent",
      slug: "multi-day-update-malformed-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Update Malformed Venue" });
    const band = insertBand(rawDb, { name: "Update Malformed Band", event_id: ev.id, venue_id: venue.id });

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ performanceDate: "not-a-date" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(400);
  });

  it("update with performanceDate omitted leaves an existing performance_date untouched", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayUpdateUntouchedEvent",
      slug: "multi-day-update-untouched-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Update Untouched Venue" });
    const band = insertBand(rawDb, { name: "Update Untouched Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET performance_date = ? WHERE id = ?").run("2026-08-03", band.id);

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ genre: "Punk" }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.band.performance_date).toBe("2026-08-03");
  });

  it("update with performanceDate: null clears an existing performance_date", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "MultiDayClearEvent",
      slug: "multi-day-clear-event",
      date: "2026-08-02",
      end_date: "2026-08-04",
    });
    const venue = insertVenue(rawDb, { name: "MultiDay Clear Venue" });
    const band = insertBand(rawDb, { name: "Clear Date Band", event_id: ev.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET performance_date = ? WHERE id = ?").run("2026-08-03", band.id);

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ performanceDate: null }),
    });
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: "editor" } } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.band.performance_date).toBeNull();
  });

  it("single-day event: create/update without performance_date is byte-identical to pre-#540 behavior", async () => {
    const { env, rawDb, headers } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "SingleDayByteIdenticalEvent",
      slug: "single-day-byte-identical-event",
      date: "2026-08-02",
    });
    const venue = insertVenue(rawDb, { name: "SingleDay ByteIdentical Venue" });
    const body = { eventId: ev.id, venueId: venue.id, name: "Plain Band", startTime: "18:00", endTime: "19:00" };

    const createRequest = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const createRes = await bandsHandler.onRequestPost({
      request: createRequest,
      env,
      data: { user: { role: "editor" } },
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    const updateRequest = new Request(`https://example.test/api/admin/bands/${created.band.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ genre: "Indie" }),
    });
    const updateRes = await bandIdHandler.onRequestPut({
      request: updateRequest,
      env,
      data: { user: { role: "editor" } },
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.band.performance_date).toBeNull();
  });
});
