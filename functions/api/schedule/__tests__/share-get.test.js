import { describe, expect, test } from "vitest";
import { onRequestGet } from "../share/[slug].js";
import { createTestEnv, insertEvent, insertShareLink } from "../../test-utils.js";

// RFC 5737 documentation IPs plus a realistic browser UA. These exist to make
// the visitor hash DETERMINISTIC and distinct per test (#705) — not to dodge
// bot classification. A request without them is still counted: isLikelyCrawler
// treats a missing UA as a person, and visitorHash falls back to ip="unknown",
// which would silently collapse every such visitor into one ledger row.
const IP_A = "203.0.113.10";
const IP_B = "203.0.113.11";
const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function callAsVisitor(env, slug, ip, userAgent) {
  return onRequestGet({
    request: new Request(`https://example.test/api/schedule/share/${slug}`, {
      headers: { "CF-Connecting-IP": ip, "User-Agent": userAgent },
    }),
    params: { slug },
    env,
  });
}

describe("GET /api/schedule/share/[slug]", () => {
  function makeRequest(slug) {
    return new Request(`https://example.test/api/schedule/share/${slug}`);
  }

  test("returns share link data for a valid slug", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "abc12345",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10, 20],
      band_names: ["Band A", "Band B"],
    });

    const res = await onRequestGet({
      request: makeRequest("abc12345"),
      params: { slug: "abc12345" },
      env,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("abc12345");
    expect(body.event_slug).toBe("my-fest");
    expect(body.event_name).toBe("My Fest");
    expect(body.performance_ids).toEqual([10, 20]);
    expect(body.band_names).toEqual(["Band A", "Band B"]);
  });

  test("returns 404 for unknown slug", async () => {
    const { env } = createTestEnv();
    const res = await onRequestGet({
      request: makeRequest("notfound"),
      params: { slug: "notfound" },
      env,
    });
    expect(res.status).toBe(404);
  });

  test("returns 404 for expired slug", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb);
    insertShareLink(rawDb, {
      slug: "expired1",
      event_id: event.id,
      performance_ids: [1],
      band_names: ["B"],
      expires_at: "2000-01-01 00:00:00",
    });

    const res = await onRequestGet({
      request: makeRequest("expired1"),
      params: { slug: "expired1" },
      env,
    });
    expect(res.status).toBe(404);
  });

  test("returns 400 for invalid slug format", async () => {
    const { env } = createTestEnv();
    const res = await onRequestGet({
      request: makeRequest("../etc/passwd"),
      params: { slug: "../etc/passwd" },
      env,
    });
    expect(res.status).toBe(400);
  });

  test("counts one view per visitor, not one per fetch (#705)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "view1234",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10],
      band_names: ["Band A"],
    });

    // Same person reloading. This used to record 2 — the bug that made one
    // developer refreshing a preview read as 42 "views".
    await callAsVisitor(env, "view1234", IP_A, CHROME_UA);
    await callAsVisitor(env, "view1234", IP_A, CHROME_UA);

    let row = rawDb.prepare("SELECT view_count FROM share_links WHERE slug = ?").get("view1234");
    expect(row.view_count).toBe(1);

    // A genuinely different visitor still counts, so the dedupe cannot be
    // satisfied by simply never incrementing.
    await callAsVisitor(env, "view1234", IP_B, CHROME_UA);
    row = rawDb.prepare("SELECT view_count FROM share_links WHERE slug = ?").get("view1234");
    expect(row.view_count).toBe(2);

    // The ledger backs the count: one row per distinct visitor.
    const ledger = rawDb.prepare("SELECT COUNT(*) AS n FROM share_link_views WHERE slug = ?").get("view1234");
    expect(ledger.n).toBe(2);
  });

  test("never writes an orphan ledger row when the parent link is gone (#705)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "orphan01",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10],
      band_names: ["Band A"],
    });

    // Production reality: `_middleware.js` skips PRAGMA foreign_keys = ON for
    // GET, so the declared FK does NOT protect this insert. Reproduce that,
    // or the FK would silently do the work and leave the guard untested.
    rawDb.pragma("foreign_keys = OFF");

    // The race must be INTERLEAVED. Deleting the parent before the request
    // proves nothing — the handler's own SELECT would 404 and never reach the
    // counter, so the test would pass for the wrong reason. The window is
    // between that SELECT and the batch, so the expiry sweep is simulated by
    // deleting at the moment batch() is invoked.
    const realBatch = env.DB.batch.bind(env.DB);
    const racingEnv = {
      ...env,
      DB: {
        ...env.DB,
        prepare: env.DB.prepare.bind(env.DB),
        batch: (statements) => {
          rawDb.prepare("DELETE FROM share_links WHERE slug = ?").run("orphan01");
          return realBatch(statements);
        },
      },
    };

    // Must not throw — a counter concern never breaks share retrieval.
    const res = await onRequestGet({
      request: new Request("https://example.test/api/schedule/share/orphan01", {
        headers: { "CF-Connecting-IP": IP_A, "User-Agent": CHROME_UA },
      }),
      params: { slug: "orphan01" },
      env: racingEnv,
    });
    expect(res.status).toBe(200);

    // An orphan here would be permanent: the expiry cron finds ledger rows by
    // joining to slugs that still exist, so it could never sweep this one.
    const orphans = rawDb.prepare("SELECT COUNT(*) AS n FROM share_link_views WHERE slug = ?").get("orphan01");
    expect(orphans.n).toBe(0);
  });

  test("link-preview crawlers never count (#705)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "crawler1",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10],
      band_names: ["Band A"],
    });

    // JS-rendering crawlers are the ones that can actually reach this JSON
    // route — non-JS unfurlers fetch /s/[slug], which counts nothing. The
    // unfurler UAs are included because the filter still lists them.
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
      "Mozilla/5.0 (compatible; Applebot/0.1)",
      "facebookexternalhit/1.1",
      "Twitterbot/1.0",
    ]) {
      const res = await callAsVisitor(env, "crawler1", IP_A, ua);
      // Crawlers must still receive the snapshot — the unfurl card depends on
      // it. They just must not be counted.
      expect(res.status).toBe(200);
    }

    const row = rawDb.prepare("SELECT view_count FROM share_links WHERE slug = ?").get("crawler1");
    expect(row.view_count).toBe(0);
    const ledger = rawDb.prepare("SELECT COUNT(*) AS n FROM share_link_views WHERE slug = ?").get("crawler1");
    expect(ledger.n).toBe(0);
  });

  test("does not increment view_count for an import refetch (?import=1)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "import12",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10],
      band_names: ["Band A"],
    });

    const importFetch = () =>
      onRequestGet({
        request: new Request("https://example.test/api/schedule/share/import12?import=1"),
        params: { slug: "import12" },
        env,
      });

    await importFetch();
    await importFetch();

    const row = rawDb.prepare("SELECT view_count FROM share_links WHERE slug = ?").get("import12");
    expect(row.view_count).toBe(0);
  });

  test("increments import_count for an import refetch (?import=1) but not view_count (#703)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "import99",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10],
      band_names: ["Band A"],
    });

    const importFetch = () =>
      onRequestGet({
        request: new Request("https://example.test/api/schedule/share/import99?import=1"),
        params: { slug: "import99" },
        env,
      });

    await importFetch();
    await importFetch();

    const row = rawDb.prepare("SELECT view_count, import_count FROM share_links WHERE slug = ?").get("import99");
    expect(row.import_count).toBe(2);
    expect(row.view_count).toBe(0);
  });

  test("a normal GET (no ?import=1) increments view_count but not import_count (#703)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "normal01",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10],
      band_names: ["Band A"],
    });

    // Must present as a real visitor: since #705 a UA-less request is treated
    // as a crawler and counts nothing.
    await callAsVisitor(env, "normal01", IP_A, CHROME_UA);

    const row = rawDb.prepare("SELECT view_count, import_count FROM share_links WHERE slug = ?").get("normal01");
    expect(row.view_count).toBe(1);
    expect(row.import_count).toBe(0);
  });

  test("an import-counter write failure still returns the share payload with 200 (#703)", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "My Fest", slug: "my-fest" });
    rawDb.prepare("UPDATE events SET is_published = 1 WHERE id = ?").run(event.id);
    insertShareLink(rawDb, {
      slug: "failimp1",
      event_id: event.id,
      event_slug: "my-fest",
      performance_ids: [10],
      band_names: ["Band A"],
    });

    // Simulate the import_count UPDATE throwing while every other statement
    // (including the row SELECT) works normally -- the best-effort contract
    // means this must never surface to the caller as a failed request.
    const originalPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("UPDATE share_links SET import_count")) {
        return {
          bind: () => ({
            run: () => {
              throw new Error("simulated import-count write failure");
            },
          }),
        };
      }
      return originalPrepare(sql);
    };

    const res = await onRequestGet({
      request: new Request("https://example.test/api/schedule/share/failimp1?import=1"),
      params: { slug: "failimp1" },
      env,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slug).toBe("failimp1");

    const row = rawDb.prepare("SELECT import_count FROM share_links WHERE slug = ?").get("failimp1");
    expect(row.import_count).toBe(0);
  });
});
