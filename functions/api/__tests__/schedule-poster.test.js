import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

// #655: poster_url was never returned from the public schedule read path,
// so an uploaded poster silently did nothing on a live/published event page
// (it only fed the share-preview meta tags). Mirrors the ticket_url
// sanitization coverage in schedule-reveal.test.js.
describe("GET /api/schedule - poster_url (#655)", () => {
  it("returns poster_url for an event that has one", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Buddies Fest 2", slug: "buddiesfest2-poster" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    rawDb
      .prepare("UPDATE events SET poster_url = ? WHERE id = ?")
      .run("https://band-photos.settimes.ca/event-posters/36-buddiesfest2.jpg", ev.id);

    const req = new Request("https://example.test/api/schedule?event=buddiesfest2-poster");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.poster_url).toBe("https://band-photos.settimes.ca/event-posters/36-buddiesfest2.jpg");
  });

  it("returns null when poster_url is absent", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "No Poster Fest", slug: "no-poster-fest" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);

    const req = new Request("https://example.test/api/schedule?event=no-poster-fest");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.poster_url).toBeNull();
  });

  it("nulls out a legacy javascript: poster_url value seeded directly via SQL", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const ev = insertEvent(rawDb, { name: "Unsafe Poster Fest", slug: "unsafe-poster-fest" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    rawDb
      .prepare("UPDATE events SET poster_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #655 read-path guard
      .run("javascript:alert(1)", ev.id);

    const req = new Request("https://example.test/api/schedule?event=unsafe-poster-fest");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.poster_url).toBeNull();
  });

  it("returns poster_url on the event=current lookup path too", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const ev = insertEvent(rawDb, { name: "Current Poster Fest", slug: "current-poster-fest", date: futureDateStr });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(ev.id);
    rawDb
      .prepare("UPDATE events SET poster_url = ? WHERE id = ?")
      .run("https://band-photos.settimes.ca/event-posters/current.jpg", ev.id);

    const req = new Request("https://example.test/api/schedule?event=current");
    const res = await scheduleHandler.onRequestGet({ request: req, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.poster_url).toBe("https://band-photos.settimes.ca/event-posters/current.jpg");
  });
});
