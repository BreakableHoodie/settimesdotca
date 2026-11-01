// Hub and event pages must carry server-rendered crawlable links (#1447).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { onRequestGet as artists } from "../artists.js";
import { onRequestGet as venues } from "../venues.js";
import { onRequestGet as history } from "../history.js";
import { onRequest as eventPage } from "../event/[slug].js";
import { onRequestGet as recapPage } from "../events/[slug]/recap.js";
import { createTestEnv, insertBand, insertEvent, insertVenue } from "../api/test-utils.js";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SHELL = readFileSync(path.join(REPO_ROOT, "frontend", "index.html"), "utf8");

function setup() {
  const t = createTestEnv();
  const env = {
    ...t.env,
    PUBLIC_DATA_PUBLISH_ENABLED: "true",
    ASSETS: { fetch: async () => new Response(SHELL, { status: 200 }) },
  };
  const db = t.rawDb;
  const archived = insertEvent(db, { name: "Old Fest", slug: "old-fest", date: "2024-05-01", status: "archived" });
  const draft = insertEvent(db, { name: "Secret Draft", slug: "secret-draft", date: "2099-01-01", status: "draft" });
  // A published, UPCOMING edition: linked as an event, but it has no recap yet.
  insertEvent(db, { name: "Next Fest", slug: "next-fest", date: "2099-06-01", status: "published" });
  const reveal = insertEvent(db, { name: "Reveal Fest", slug: "reveal-fest", date: "2024-06-01", status: "archived" });
  db.prepare("UPDATE events SET reveal_mode = 1 WHERE id = ?").run(reveal.id);
  const v = insertVenue(db, { name: "Rock & <Roll> Hall" });
  const hiddenVenue = insertVenue(db, { name: "Draft Venue" });
  const bad = insertBand(db, { name: "Evil <script>alert(1)</script> & Co", event_id: archived.id, venue_id: v.id });
  const plain = insertBand(db, { name: "Plain Band", event_id: archived.id, venue_id: v.id });
  const draftBand = insertBand(db, { name: "Draft Band", event_id: draft.id, venue_id: hiddenVenue.id });
  const unannounced = insertBand(db, { name: "Unannounced Band", event_id: reveal.id, venue_id: hiddenVenue.id });
  db.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(unannounced.id);
  return { env, archived, v, bad, plain, draftBand, unannounced };
}

const run = (handler, env, url, params = {}) => handler({ request: new Request(url), env, params });
const hrefs = (html) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);

describe("hub pages server-render entity links", () => {
  test("/artists links public artists only, escaped", async () => {
    const s = setup();
    const html = await (await run(artists, s.env, "https://settimes.ca/artists")).text();
    expect(html).toContain(`href="/band/${s.plain.band_profile_id}"`);
    expect(html).toContain(`href="/band/${s.bad.band_profile_id}"`);
    expect(html).not.toContain(`href="/band/${s.draftBand.band_profile_id}"`);
    expect(html).not.toContain(`href="/band/${s.unannounced.band_profile_id}"`);
    expect(html).toContain("Evil &lt;script&gt;alert(1)&lt;/script&gt; &amp; Co");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("page-links");
  });

  test("/venues links public venues only, escaped", async () => {
    const s = setup();
    const html = await (await run(venues, s.env, "https://settimes.ca/venues")).text();
    expect(html).toContain(`href="/venue/${s.v.id}"`);
    expect(html).toContain("Rock &amp; &lt;Roll&gt; Hall");
    expect(hrefs(html).filter((h) => h.startsWith("/venue/"))).toHaveLength(1);
  });

  test("/history links public editions and recaps, never a draft", async () => {
    const s = setup();
    const html = await (await run(history, s.env, "https://settimes.ca/history")).text();
    expect(html).toContain('href="/event/old-fest"');
    expect(html).toContain('href="/events/old-fest/recap"');
    expect(html).not.toContain("secret-draft");
    expect(html).toContain('href="/event/next-fest"');
    expect(html).not.toContain('href="/events/next-fest/recap"');
  });

  test("event page links its lineup and venues, reveal-gated", async () => {
    const s = setup();
    const html = await (await run(eventPage, s.env, "https://settimes.ca/event/old-fest", { slug: "old-fest" })).text();
    expect(html).toContain(`href="/band/${s.plain.band_profile_id}"`);
    expect(html).toContain(`href="/venue/${s.v.id}"`);
    const reveal = await (
      await run(eventPage, s.env, "https://settimes.ca/event/reveal-fest", { slug: "reveal-fest" })
    ).text();
    expect(reveal).not.toContain(`href="/band/${s.unannounced.band_profile_id}"`);
  });

  test("recap page links its lineup and venues, reveal-gated", async () => {
    const s = setup();
    const html = await (
      await run(recapPage, s.env, "https://settimes.ca/events/old-fest/recap", { slug: "old-fest" })
    ).text();
    expect(html).toContain(`href="/band/${s.plain.band_profile_id}"`);
    expect(html).toContain(`href="/venue/${s.v.id}"`);
    const reveal = await (
      await run(recapPage, s.env, "https://settimes.ca/events/reveal-fest/recap", { slug: "reveal-fest" })
    ).text();
    expect(reveal).not.toContain(`href="/band/${s.unannounced.band_profile_id}"`);
  });
});

describe("a failed D1 read still serves the page, without links", () => {
  for (const [name, handler, url] of [
    ["artists", artists, "https://settimes.ca/artists"],
    ["venues", venues, "https://settimes.ca/venues"],
    ["history", history, "https://settimes.ca/history"],
  ]) {
    test(name, async () => {
      const s = setup();
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const env = {
        ...s.env,
        DB: {
          prepare: () => {
            throw new Error("D1 down");
          },
        },
      };
      const res = await run(handler, env, url);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain("<title>");
      expect(hrefs(html).filter((h) => /^\/(band|venue|event|events)\//.test(h))).toHaveLength(0);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  }
});
