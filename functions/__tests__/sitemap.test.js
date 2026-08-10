/**
 * Dynamic sitemap tests (#555) — recap URLs for past editions.
 *
 * The recap page (/events/:slug/recap) is content-rich but was reachable only
 * by typing the URL. The sitemap now lists it for every PAST published event;
 * future events must not get a recap entry (the recap doesn't exist yet), and
 * unpublished events must not appear at all.
 */
import { describe, expect, test } from "vitest";
import { onRequestGet } from "../sitemap.xml.js";
import { createTestEnv, insertEvent } from "../api/test-utils.js";

async function fetchSitemap(env) {
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  const res = await onRequestGet({ env });
  expect(res.status).toBe(200);
  return res.text();
}

function publish(rawDb, eventId) {
  rawDb.prepare("UPDATE events SET status = 'published' WHERE id = ?").run(eventId);
}

describe("GET /sitemap.xml — recap entries (#555)", () => {
  test("past published event gets both an /event/ and a recap URL", async () => {
    const { env, rawDb } = createTestEnv();
    const past = insertEvent(rawDb, { name: "Past Fest", slug: "past-fest", date: "2020-01-01" });
    publish(rawDb, past.id);

    const xml = await fetchSitemap(env);
    expect(xml).toContain("<loc>https://settimes.ca/event/past-fest</loc>");
    expect(xml).toContain("<loc>https://settimes.ca/events/past-fest/recap</loc>");
  });

  test("future published event gets an /event/ URL but NO recap URL", async () => {
    const { env, rawDb } = createTestEnv();
    const future = insertEvent(rawDb, { name: "Future Fest", slug: "future-fest", date: "2099-01-01" });
    publish(rawDb, future.id);

    const xml = await fetchSitemap(env);
    expect(xml).toContain("<loc>https://settimes.ca/event/future-fest</loc>");
    expect(xml).not.toContain("/events/future-fest/recap");
  });

  test("unpublished past event appears nowhere", async () => {
    const { env, rawDb } = createTestEnv();
    insertEvent(rawDb, { name: "Draft Fest", slug: "draft-fest", date: "2020-01-01" });
    // deliberately not published

    const xml = await fetchSitemap(env);
    expect(xml).not.toContain("draft-fest");
  });
});
