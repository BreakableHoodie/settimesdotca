// Band and venue pages carry server-rendered crawlable links (#1494).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test, vi } from "vitest";

import { onRequest as bandPage } from "../band/[id].js";
import { onRequest as venuePage } from "../venue/[id].js";
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
  const older = insertEvent(db, { name: "Old Fest", slug: "old-fest", date: "2024-05-01", status: "archived" });
  const newer = insertEvent(db, { name: "Newer <Fest>", slug: "newer-fest", date: "2025-09-12", status: "archived" });
  const draft = insertEvent(db, { name: "Secret Draft", slug: "secret-draft", date: "2099-01-01", status: "draft" });
  const reveal = insertEvent(db, { name: "Reveal Fest", slug: "reveal-fest", date: "2025-06-01", status: "archived" });
  db.prepare("UPDATE events SET reveal_mode = 1 WHERE id = ?").run(reveal.id);
  const hall = insertVenue(db, { name: "Rock & Roll Hall", city: "Kitchener", address: "1 King St" });
  const other = insertVenue(db, { name: "Other Room", city: "Waterloo" });
  const draftOnly = insertVenue(db, { name: "Draft Only Room" });
  const star = insertBand(db, { name: "Star Act", event_id: older.id, venue_id: hall.id });
  insertBand(db, { name: "Star Act", event_id: newer.id, venue_id: other.id });
  // Same artist, also in a draft event and an unannounced reveal slot.
  insertBand(db, { name: "Star Act", event_id: draft.id, venue_id: draftOnly.id });
  const hidden = insertBand(db, { name: "Star Act", event_id: reveal.id, venue_id: draftOnly.id });
  db.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(hidden.id);
  const plain = insertBand(db, { name: "Plain Band", event_id: newer.id, venue_id: hall.id });
  const draftBand = insertBand(db, { name: "Draft Band", event_id: draft.id, venue_id: hall.id });
  const unannounced = insertBand(db, { name: "Unannounced Band", event_id: reveal.id, venue_id: hall.id });
  db.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(unannounced.id);
  return { env, db, hall, other, draftOnly, star, plain, draftBand, unannounced };
}

const run = (handler, env, url, id) => handler({ request: new Request(url), env, params: { id: String(id) } });
const hrefs = (html) => [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
const description = (html) => html.match(/<meta name="description" content="([^"]*)"/)[1];

describe("/band/<id> links its editions and venues", () => {
  test("public editions newest first, public venues, nothing hidden", async () => {
    const s = setup();
    const html = await (await run(bandPage, s.env, "https://settimes.ca/band/x", s.star.band_profile_id)).text();
    const links = hrefs(html).filter((h) => /^\/(event|venue)\//.test(h));
    expect(links.filter((h) => h.startsWith("/event/"))).toEqual(["/event/newer-fest", "/event/old-fest"]);
    expect(links).toContain(`/venue/${s.hall.id}`);
    expect(links).toContain(`/venue/${s.other.id}`);
    expect(links).not.toContain(`/venue/${s.draftOnly.id}`);
    expect(html).not.toContain("secret-draft");
    expect(html).not.toContain("reveal-fest");
    expect(html).toContain("Newer &lt;Fest&gt;");
    expect(html).not.toContain("page-links");
  });

  test("a failed link read serves the page with no links, logged at error", async () => {
    const s = setup();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const real = s.env.DB;
    const env = {
      ...s.env,
      DB: {
        prepare: (sql) => {
          // The page's own lookup works; only the link queries throw.
          if (sql.includes("GROUP BY")) throw new Error("D1 down");
          return real.prepare(sql);
        },
      },
    };
    const res = await run(bandPage, env, "https://settimes.ca/band/x", s.star.band_profile_id);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<title>");
    expect(hrefs(html).filter((h) => /^\/(event|venue)\//.test(h))).toHaveLength(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe("/venue/<id> links its editions and artists", () => {
  test("public editions newest first, public artists only, escaped", async () => {
    const s = setup();
    const html = await (await run(venuePage, s.env, "https://settimes.ca/venue/x", s.hall.id)).text();
    expect(hrefs(html).filter((h) => h.startsWith("/event/"))).toEqual(["/event/newer-fest", "/event/old-fest"]);
    const bands = hrefs(html).filter((h) => h.startsWith("/band/"));
    expect(bands).toContain(`/band/${s.star.band_profile_id}`);
    expect(bands).toContain(`/band/${s.plain.band_profile_id}`);
    expect(bands).not.toContain(`/band/${s.draftBand.band_profile_id}`);
    expect(bands).not.toContain(`/band/${s.unannounced.band_profile_id}`);
    expect(html).not.toContain("secret-draft");
    expect(html).not.toContain("reveal-fest");
  });

  test("description carries city, edition count, latest edition and address", async () => {
    const s = setup();
    const html = await (await run(venuePage, s.env, "https://settimes.ca/venue/x", s.hall.id)).text();
    expect(description(html)).toBe(
      "Rock &amp; Roll Hall in Kitchener: 2 SetTimes editions, most recently Newer &lt;Fest&gt; (Sep 2025). 1 King St",
    );
    expect(description(html).length).toBeLessThanOrEqual(220); // escaped form; raw text is capped at 160
  });

  test("a failed link read keeps the name + address description and no links", async () => {
    const s = setup();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const real = s.env.DB;
    const env = {
      ...s.env,
      DB: {
        prepare: (sql) => {
          if (sql.includes("GROUP BY")) throw new Error("D1 down");
          return real.prepare(sql);
        },
      },
    };
    const res = await run(venuePage, env, "https://settimes.ca/venue/x", s.hall.id);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(description(html)).toBe("Rock &amp; Roll Hall — 1 King St");
    expect(hrefs(html).filter((h) => /^\/(event|band)\//.test(h))).toHaveLength(0);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
