import { describe, expect, it, test } from "vitest";
import { onRequestGet } from "../[id]/recap.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

describe("GET /api/events/:id/recap", () => {
  test("returns 404 for a non-archived event", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Draft Event",
      slug: "draft-event",
      date: "2024-08-03",
      status: "draft",
    });

    const request = new Request(`https://example.test/api/events/${event.slug}/recap`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: event.slug },
    });

    expect(response.status).toBe(404);
  });

  test("returns 200 with stats and bands for an archived event looked up by slug", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "LWBC Vol5",
      slug: "lwbc-vol5",
      date: "2024-08-03",
      status: "archived",
    });

    const venue = insertVenue(rawDb, { name: "Main Stage", city: "Portland" });
    insertBand(rawDb, {
      name: "Band Alpha",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "19:00",
      end_time: "20:00",
    });

    const request = new Request(`https://example.test/api/events/${event.slug}/recap`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: event.slug },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");

    const payload = await response.json();
    expect(payload.event).toMatchObject({
      id: event.id,
      name: "LWBC Vol5",
      slug: "lwbc-vol5",
      date: "2024-08-03",
    });
    expect(payload.stats).toMatchObject({
      total_sets: 1,
      venue_count: 1,
    });
    expect(payload.bands).toHaveLength(1);
    expect(payload.bands[0]).toMatchObject({
      name: "Band Alpha",
      performance_id: expect.any(Number),
      venue_id: venue.id,
      venue_name: "Main Stage",
      start_time: "19:00",
      end_time: "20:00",
    });
  });

  test("returns 200 when looked up by numeric ID", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "LWBC Vol6",
      slug: "lwbc-vol6",
      date: "2024-09-15",
      status: "archived",
    });

    const venue = insertVenue(rawDb, { name: "Side Stage", city: "Portland" });
    insertBand(rawDb, {
      name: "Band Beta",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });

    const request = new Request(`https://example.test/api/events/${event.id}/recap`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: String(event.id) },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.event.id).toBe(event.id);
    expect(payload.bands).toHaveLength(1);
  });

  test("correctly classifies first-timers vs returning acts", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Prior event
    const priorEvent = insertEvent(rawDb, {
      name: "LWBC Vol4",
      slug: "lwbc-vol4",
      date: "2023-08-01",
      status: "archived",
    });

    // Current event (archived)
    const currentEvent = insertEvent(rawDb, {
      name: "LWBC Vol5",
      slug: "lwbc-vol5-ft",
      date: "2024-08-03",
      status: "archived",
    });

    const venue = insertVenue(rawDb, { name: "Main Stage", city: "Portland" });

    // Returning act: appears in prior event (inserted for side effect; return value unused)
    insertBand(rawDb, {
      name: "Returning Band",
      event_id: priorEvent.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    // Add the same band (by name, so same band_profile_id) to the current event
    insertBand(rawDb, {
      name: "Returning Band",
      event_id: currentEvent.id,
      venue_id: venue.id,
      start_time: "19:00",
      end_time: "20:00",
    });

    // First-timer: only appears in the current event
    insertBand(rawDb, {
      name: "New Band",
      event_id: currentEvent.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });

    const request = new Request(`https://example.test/api/events/${currentEvent.slug}/recap`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: currentEvent.slug },
    });

    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.stats.total_sets).toBe(2);
    expect(payload.stats.first_timers).toBe(1);
    expect(payload.stats.returning_acts).toBe(1);

    const returningBand = payload.bands.find((b) => b.name === "Returning Band");
    const newBand = payload.bands.find((b) => b.name === "New Band");
    expect(returningBand.is_returning).toBe(true);
    expect(newBand.is_returning).toBe(false);
  });

  // #613: is_returning must require a STRICTLY EARLIER event, not merely "any
  // other" event. A band that only appears in a later edition must not be
  // "returning" at an earlier one it hasn't played yet.
  test("band playing an earlier and a later archived event is first-timer at the earlier, returning at the later", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const earlierEvent = insertEvent(rawDb, {
      name: "LWBC Vol1",
      slug: "lwbc-vol1",
      date: "2022-05-22",
      status: "archived",
    });
    const laterEvent = insertEvent(rawDb, {
      name: "LWBC Vol3",
      slug: "lwbc-vol3",
      date: "2023-05-21",
      status: "archived",
    });

    const venue = insertVenue(rawDb, { name: "Main Stage" });
    // Same band (same name -> same band_profile_id) plays both events.
    insertBand(rawDb, { name: "Loop Riders", event_id: earlierEvent.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Loop Riders", event_id: laterEvent.id, venue_id: venue.id });

    const earlierRes = await onRequestGet({
      request: new Request(`https://example.test/api/events/${earlierEvent.slug}/recap`),
      env,
      params: { id: earlierEvent.slug },
    });
    const earlierPayload = await earlierRes.json();
    expect(earlierPayload.stats.first_timers).toBe(1);
    expect(earlierPayload.stats.returning_acts).toBe(0);
    expect(earlierPayload.bands[0].is_returning).toBe(false);

    const laterRes = await onRequestGet({
      request: new Request(`https://example.test/api/events/${laterEvent.slug}/recap`),
      env,
      params: { id: laterEvent.slug },
    });
    const laterPayload = await laterRes.json();
    expect(laterPayload.stats.first_timers).toBe(0);
    expect(laterPayload.stats.returning_acts).toBe(1);
    expect(laterPayload.bands[0].is_returning).toBe(true);
  });

  test("band playing only the later event is a first-timer there", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const earlierEvent = insertEvent(rawDb, {
      name: "LWBC Vol1",
      slug: "lwbc-vol1-solo",
      date: "2022-05-22",
      status: "archived",
    });
    const laterEvent = insertEvent(rawDb, {
      name: "LWBC Vol3",
      slug: "lwbc-vol3-solo",
      date: "2023-05-21",
      status: "archived",
    });

    const venue = insertVenue(rawDb, { name: "Main Stage" });
    insertBand(rawDb, { name: "Only At Vol1", event_id: earlierEvent.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Only At Vol3", event_id: laterEvent.id, venue_id: venue.id });

    const laterRes = await onRequestGet({
      request: new Request(`https://example.test/api/events/${laterEvent.slug}/recap`),
      env,
      params: { id: laterEvent.slug },
    });
    const laterPayload = await laterRes.json();
    const onlyAtVol3 = laterPayload.bands.find((b) => b.name === "Only At Vol3");
    expect(onlyAtVol3.is_returning).toBe(false);
    expect(laterPayload.stats.first_timers).toBe(1);
    expect(laterPayload.stats.returning_acts).toBe(0);
  });

  test("same-day events tie-break deterministically on id — returning only at the higher id", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const sameDate = "2024-08-03";
    // Insertion order guarantees lowerIdEvent.id < higherIdEvent.id.
    const lowerIdEvent = insertEvent(rawDb, {
      name: "Same Day A",
      slug: "same-day-a",
      date: sameDate,
      status: "archived",
    });
    const higherIdEvent = insertEvent(rawDb, {
      name: "Same Day B",
      slug: "same-day-b",
      date: sameDate,
      status: "archived",
    });
    expect(higherIdEvent.id).toBeGreaterThan(lowerIdEvent.id);

    const venue = insertVenue(rawDb, { name: "Main Stage" });
    insertBand(rawDb, { name: "Tie Break Band", event_id: lowerIdEvent.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Tie Break Band", event_id: higherIdEvent.id, venue_id: venue.id });

    const lowerRes = await onRequestGet({
      request: new Request(`https://example.test/api/events/${lowerIdEvent.slug}/recap`),
      env,
      params: { id: lowerIdEvent.slug },
    });
    const lowerPayload = await lowerRes.json();
    expect(lowerPayload.bands[0].is_returning).toBe(false);

    const higherRes = await onRequestGet({
      request: new Request(`https://example.test/api/events/${higherIdEvent.slug}/recap`),
      env,
      params: { id: higherIdEvent.slug },
    });
    const higherPayload = await higherRes.json();
    expect(higherPayload.bands[0].is_returning).toBe(true);
  });

  // #613: the earlier event only needs to be published (not yet archived) to
  // count — a recap generated shortly after an event should still recognize
  // acts returning from a prior, still-published (not-yet-archived) edition.
  test("counts a prior published (not archived) event when computing is_returning", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const priorEvent = insertEvent(rawDb, {
      name: "Still Published Vol",
      slug: "still-published-vol",
      date: "2023-06-01",
      status: "published",
    });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(priorEvent.id);

    const currentEvent = insertEvent(rawDb, {
      name: "Archived Vol",
      slug: "archived-vol",
      date: "2024-06-01",
      status: "archived",
    });

    const venue = insertVenue(rawDb, { name: "Main Stage" });
    insertBand(rawDb, { name: "Cross Edition Band", event_id: priorEvent.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Cross Edition Band", event_id: currentEvent.id, venue_id: venue.id });

    const res = await onRequestGet({
      request: new Request(`https://example.test/api/events/${currentEvent.slug}/recap`),
      env,
      params: { id: currentEvent.slug },
    });
    const payload = await res.json();
    expect(payload.bands[0].is_returning).toBe(true);
    expect(payload.stats.returning_acts).toBe(1);
  });

  it("counts only assigned venues (null venue does not increment venue_count)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, { name: "Mixed Venues", slug: "mixed-venues" });
    rawDb.prepare("UPDATE events SET status='archived', is_published=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Stage A" });
    insertBand(rawDb, { name: "Band With Venue", event_id: event.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Band Without Venue", event_id: event.id }); // no venue

    const res = await onRequestGet({
      request: new Request(`https://example.test/api/events/${event.id}/recap`),
      env,
      params: { id: String(event.id) },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.stats.venue_count).toBe(1); // only the one with a venue
    expect(data.stats.total_sets).toBe(2); // both bands appear
  });

  it("returns 500 on DB error", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    env.DB = {
      prepare: () => {
        throw new Error("simulated DB failure");
      },
    };

    const res = await onRequestGet({
      request: new Request("https://example.test/api/events/any-slug/recap"),
      env,
      params: { id: "any-slug" },
    });
    expect(res.status).toBe(500);
  });

  // #616: the recap event payload exposes poster_url (sanitized), so the
  // recap page can render the poster for the archived edition.
  test("includes a sanitized poster_url when set", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Postered Recap",
      slug: "postered-recap",
      date: "2024-08-03",
      status: "archived",
    });
    rawDb
      .prepare("UPDATE events SET poster_url = ? WHERE id = ?")
      .run("https://band-photos.settimes.ca/event-posters/1-recap.jpg", event.id);

    const request = new Request(`https://example.test/api/events/${event.slug}/recap`);
    const response = await onRequestGet({ request, env, params: { id: event.slug } });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.event.poster_url).toBe("https://band-photos.settimes.ca/event-posters/1-recap.jpg");
  });

  test("poster_url is null when unset", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Posterless Recap",
      slug: "posterless-recap",
      date: "2024-08-03",
      status: "archived",
    });

    const request = new Request(`https://example.test/api/events/${event.slug}/recap`);
    const response = await onRequestGet({ request, env, params: { id: event.slug } });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.event.poster_url).toBeNull();
  });

  test("drops a legacy javascript: poster_url (#504-style read-path guard)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Unsafe Poster Recap",
      slug: "unsafe-poster-recap",
      date: "2024-08-03",
      status: "archived",
    });
    rawDb
      .prepare("UPDATE events SET poster_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504-style read-path guard
      .run("javascript:alert(1)", event.id);

    const request = new Request(`https://example.test/api/events/${event.slug}/recap`);
    const response = await onRequestGet({ request, env, params: { id: event.slug } });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.event.poster_url).toBeNull();
  });

  test("returns 503 when PUBLIC_DATA_PUBLISH_ENABLED is not set", async () => {
    const { env, rawDb } = createTestEnv();
    // Do NOT set PUBLIC_DATA_PUBLISH_ENABLED
    const event = insertEvent(rawDb, {
      name: "LWBC Vol5",
      slug: "lwbc-vol5-gate",
      date: "2024-08-03",
      status: "archived",
    });

    const request = new Request(`https://example.test/api/events/${event.slug}/recap`);
    const response = await onRequestGet({
      request,
      env,
      params: { id: event.slug },
    });

    expect(response.status).toBe(503);
  });
});
