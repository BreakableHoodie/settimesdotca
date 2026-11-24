import { describe, expect, it } from "vitest";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../test-utils";
import * as bandStats from "../bands/stats/[name].js";
import * as shuffle from "../artists/shuffle.js";
import * as oneOfOne from "../artists/one-of-one.js";
import * as venueDetail from "../venues/[id].js";
import * as stageMates from "../bands/[name]/stage-mates.js";
import * as publicEvents from "../events/public.js";
import * as publicStats from "../stats/public.js";

const FUTURE_DATE = "2099-01-01";

function seedEnv() {
  const { env, rawDb } = createTestEnv();
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  return { env, rawDb };
}

function seedPublishedRevealEvent(rawDb, name, slug) {
  const event = insertEvent(rawDb, {
    name,
    slug,
    date: FUTURE_DATE,
    status: "published",
  });
  rawDb.prepare("UPDATE events SET reveal_mode = 1 WHERE id = ?").run(event.id);
  return event;
}

function hidePerformance(rawDb, performanceId) {
  rawDb.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(performanceId);
}

async function expectSameNotFound(responsePromise, missingResponsePromise, expectedBody) {
  const [response, missingResponse] = await Promise.all([responsePromise, missingResponsePromise]);
  const responseBody = await response.text();
  const missingBody = await missingResponse.text();
  expect(response.status).toBe(404);
  expect(responseBody).toBe(missingBody);
  expect(response.status).toBe(missingResponse.status);
  expect(response.headers.get("Content-Type")).toBe(missingResponse.headers.get("Content-Type"));
  expect(responseBody).toBe(expectedBody);
}

describe("round 2 public reveal gates", () => {
  it("C1 hides band stats by numeric id and name, identically to missing bands", async () => {
    const { env, rawDb } = seedEnv();
    const event = seedPublishedRevealEvent(rawDb, "Stats Reveal", "stats-reveal");
    const venue = insertVenue(rawDb, { name: "Stats Venue" });
    const hidden = insertBand(rawDb, { name: "Hidden Stats Band", event_id: event.id, venue_id: venue.id });
    hidePerformance(rawDb, hidden.id);

    const byId = (id) =>
      bandStats.onRequestGet({
        request: new Request(`https://example.test/api/bands/stats/${id}`),
        env,
      });
    const byName = (name) =>
      bandStats.onRequestGet({
        request: new Request(`https://example.test/api/bands/stats/${encodeURIComponent(name)}`),
        env,
      });

    await expectSameNotFound(byId(hidden.band_profile_id), byId(999999), JSON.stringify({ error: "Band not found" }));
    await expectSameNotFound(
      byName("Hidden Stats Band"),
      byName("Missing Stats Band"),
      JSON.stringify({ error: "Band not found" }),
    );
  });

  it("C2 and C3 exclude hidden artists while reveal mode zero remains visible", async () => {
    const { env, rawDb } = seedEnv();
    const hiddenEvent = seedPublishedRevealEvent(rawDb, "Showcase Reveal", "showcase-reveal");
    const openEvent = insertEvent(rawDb, {
      name: "Showcase Open",
      slug: "showcase-open",
      date: FUTURE_DATE,
      status: "published",
    });
    const venue = insertVenue(rawDb, { name: "Showcase Venue" });
    const hidden = insertBand(rawDb, {
      name: "Hidden Showcase Artist",
      event_id: hiddenEvent.id,
      venue_id: venue.id,
      genre: "Secret Showcase Genre",
    });
    hidePerformance(rawDb, hidden.id);
    const open = insertBand(rawDb, {
      name: "Open Showcase Artist",
      event_id: openEvent.id,
      venue_id: venue.id,
      genre: "Open Showcase Genre",
    });
    hidePerformance(rawDb, open.id);

    const shuffleResponse = await shuffle.onRequestGet({
      request: new Request("https://example.test/api/artists/shuffle?limit=20"),
      env,
    });
    expect((await shuffleResponse.json()).map((artist) => artist.name)).toEqual(["Open Showcase Artist"]);

    const oneOfOneResponse = await oneOfOne.onRequestGet({
      request: new Request("https://example.test/api/artists/one-of-one"),
      env,
    });
    const oneOfOneNames = (await oneOfOneResponse.json()).map((entry) => entry.artist.name);
    expect(oneOfOneNames).toContain("Open Showcase Artist");
    expect(oneOfOneNames).not.toContain("Hidden Showcase Artist");
  });

  it("keeps an unannounced performance visible on every round 2 surface when reveal mode is zero", async () => {
    const { env, rawDb } = seedEnv();
    const event = insertEvent(rawDb, {
      name: "Open Reveal Event",
      slug: "open-reveal-event",
      date: FUTURE_DATE,
      status: "published",
    });
    const venue = insertVenue(rawDb, { name: "Open Reveal Venue" });
    const anchor = insertBand(rawDb, {
      name: "Open Reveal Anchor",
      event_id: event.id,
      venue_id: venue.id,
      genre: "Open Reveal Genre",
    });
    const mate = insertBand(rawDb, {
      name: "Open Reveal Mate",
      event_id: event.id,
      venue_id: venue.id,
      genre: "Open Reveal Mate Genre",
    });
    hidePerformance(rawDb, anchor.id);
    hidePerformance(rawDb, mate.id);

    const statsResponse = await bandStats.onRequestGet({
      request: new Request(`https://example.test/api/bands/stats/${anchor.band_profile_id}`),
      env,
    });
    expect(statsResponse.status).toBe(200);

    const shuffleResponse = await shuffle.onRequestGet({
      request: new Request("https://example.test/api/artists/shuffle?limit=20"),
      env,
    });
    expect((await shuffleResponse.json()).map((artist) => artist.name)).toContain("Open Reveal Anchor");

    const oneOfOneResponse = await oneOfOne.onRequestGet({
      request: new Request("https://example.test/api/artists/one-of-one"),
      env,
    });
    expect((await oneOfOneResponse.json()).map((entry) => entry.artist.name)).toContain("Open Reveal Anchor");

    const venueResponse = await venueDetail.onRequestGet({ params: { id: String(venue.id) }, env });
    expect(venueResponse.status).toBe(200);

    const stageMatesResponse = await stageMates.onRequestGet({
      request: new Request(`https://example.test/api/bands/${anchor.band_profile_id}/stage-mates`),
      env,
    });
    expect((await stageMatesResponse.json()).map((band) => band.name)).toContain("Open Reveal Mate");

    const eventsResponse = await publicEvents.onRequestGet({
      request: new Request("https://example.test/api/events/public?genre=reveal"),
      env,
    });
    expect((await eventsResponse.json()).events[0]).toMatchObject({ band_count: 2, venue_count: 1 });

    const statsResponsePublic = await publicStats.onRequestGet({
      request: new Request("https://example.test/api/stats/public"),
      env,
    });
    expect((await statsResponsePublic.json()).top_bands.map((band) => band.name)).toContain("Open Reveal Anchor");
  });

  it("I1 returns the same 404 for an unrevealed venue as for a missing venue", async () => {
    const { env, rawDb } = seedEnv();
    const event = seedPublishedRevealEvent(rawDb, "Venue Reveal", "venue-reveal");
    const hiddenVenue = insertVenue(rawDb, { name: "Hidden Venue" });
    const hidden = insertBand(rawDb, { name: "Hidden Venue Act", event_id: event.id, venue_id: hiddenVenue.id });
    hidePerformance(rawDb, hidden.id);

    const getVenue = (id) => venueDetail.onRequestGet({ params: { id: String(id) }, env });
    await expectSameNotFound(getVenue(hiddenVenue.id), getVenue(999999), JSON.stringify({ error: "Venue not found" }));
  });

  it("I2 returns the same 404 for an unrevealed band stage-mates lookup as for a missing band", async () => {
    const { env, rawDb } = seedEnv();
    const event = seedPublishedRevealEvent(rawDb, "Stage Reveal", "stage-reveal");
    const venue = insertVenue(rawDb, { name: "Stage Venue" });
    const hidden = insertBand(rawDb, { name: "Hidden Stage Act", event_id: event.id, venue_id: venue.id });
    hidePerformance(rawDb, hidden.id);

    const getStageMates = (segment) =>
      stageMates.onRequestGet({
        request: new Request(`https://example.test/api/bands/${segment}/stage-mates`),
        env,
      });
    await expectSameNotFound(
      getStageMates("Hidden-Stage-Act"),
      getStageMates("Missing-Stage-Act"),
      JSON.stringify({ error: "Band not found" }),
    );
    // The numeric branch is a separate lookup: walking ids must not find the act either.
    await expectSameNotFound(
      getStageMates(String(hidden.band_profile_id)),
      getStageMates("999999"),
      JSON.stringify({ error: "Band not found" }),
    );
  });

  it("I3 gates genre filtering and counts only revealed performances", async () => {
    const { env, rawDb } = seedEnv();
    const event = seedPublishedRevealEvent(rawDb, "Event Reveal", "event-reveal");
    const hiddenOnlyEvent = seedPublishedRevealEvent(rawDb, "Hidden Only", "hidden-only");
    const venue = insertVenue(rawDb, { name: "Event Venue" });
    const announced = insertBand(rawDb, {
      name: "Announced Event Act",
      event_id: event.id,
      venue_id: venue.id,
      genre: "Visible Genre",
    });
    const hidden = insertBand(rawDb, {
      name: "Hidden Event Act",
      event_id: event.id,
      venue_id: venue.id,
      genre: "Secret Genre",
    });
    hidePerformance(rawDb, hidden.id);
    rawDb.prepare("UPDATE performances SET is_announced = 1 WHERE id = ?").run(announced.id);
    const hiddenOnly = insertBand(rawDb, {
      name: "Hidden Only Act",
      event_id: hiddenOnlyEvent.id,
      venue_id: venue.id,
      genre: "Only Secret Genre",
    });
    hidePerformance(rawDb, hiddenOnly.id);

    const allResponse = await publicEvents.onRequestGet({
      request: new Request("https://example.test/api/events/public"),
      env,
    });
    const allEvents = (await allResponse.json()).events;
    expect(allEvents.find((entry) => entry.slug === event.slug)).toMatchObject({ band_count: 1, venue_count: 1 });
    expect(allEvents.find((entry) => entry.slug === hiddenOnlyEvent.slug)).toMatchObject({
      band_count: 0,
      venue_count: 0,
    });

    const genreResponse = await publicEvents.onRequestGet({
      request: new Request("https://example.test/api/events/public?genre=secret"),
      env,
    });
    expect((await genreResponse.json()).events).toEqual([]);
  });

  it("L1 excludes hidden-only bands from top_bands and from every aggregate count (#1471)", async () => {
    const { env, rawDb } = seedEnv();
    const event = seedPublishedRevealEvent(rawDb, "Stats Reveal", "stats-reveal-top");
    const venue = insertVenue(rawDb, { name: "Stats Venue" });
    // The hidden act plays a venue nothing else uses, so that venue exists only
    // through an unannounced set and must not count either.
    const secretVenue = insertVenue(rawDb, { name: "Secret Venue" });
    const hidden = insertBand(rawDb, { name: "Hidden Top Band", event_id: event.id, venue_id: secretVenue.id });
    const visible = insertBand(rawDb, { name: "Visible Top Band", event_id: event.id, venue_id: venue.id });
    hidePerformance(rawDb, hidden.id);
    rawDb.prepare("UPDATE band_profiles SET popularity_score = 999 WHERE id = ?").run(hidden.band_profile_id);
    rawDb.prepare("UPDATE band_profiles SET popularity_score = 1 WHERE id = ?").run(visible.band_profile_id);

    const response = await publicStats.onRequestGet({
      request: new Request("https://example.test/api/stats/public"),
      env,
    });
    const body = await response.json();
    expect(body.top_bands.map((band) => band.name)).toEqual(["Visible Top Band"]);
    // Booking a secret act must move no public number.
    expect(body.bands).toBe(1);
    expect(body.venues).toBe(1);
    expect(body.performances).toBe(1);
  });
});
