/**
 * SSR /events/[slug]/recap Tests
 *
 * /events/:slug/recap had NO Pages Function at all until this fix, so it
 * served the shared shell: og:url = "https://settimes.ca/" FIRST, then
 * EventRecapPage's client-side <Helmet> appended the recap og:url SECOND —
 * exactly the duplicate-canonical bug this branch exists to fix (see CLAUDE.md
 * "<Helmet> APPENDS meta tags"). Recap URLs enter the sitemap once an event's
 * date is past (functions/sitemap.xml.js), so this was live the day after
 * every event. functions/events/[slug]/recap.js closes that gap.
 */
import { describe, expect, test } from "vitest";
import { onRequestGet } from "../[slug]/recap.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../api/test-utils.js";
import { DEFAULT_OG_IMAGE } from "../../utils/ssrMeta.js";

const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <meta property="og:url" content="https://settimes.ca/" />
    <meta property="og:title" content="SetTimes – Live Music Events &amp; Show Schedules" />
    <meta property="og:description" content="Homepage description" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="SetTimes" />
    <meta property="og:image" content="https://settimes.ca/og-default.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="SetTimes – Live Music Events &amp; Show Schedules" />
    <meta name="twitter:description" content="Homepage description" />
    <meta name="twitter:image" content="https://settimes.ca/og-default.png" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

const IDENTITY_TAG_PATTERNS = [
  /rel="canonical"/g,
  /property="og:url"/g,
  /property="og:title"/g,
  /property="og:description"/g,
  /property="og:image"/g,
  /property="og:type"/g,
  /property="og:site_name"/g,
  /name="description"/g,
  /name="twitter:card"/g,
  /name="twitter:title"/g,
  /name="twitter:description"/g,
  /name="twitter:image"/g,
];

function makeContext({ env, slug }) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/events/${slug}/recap`),
    env,
    params: { slug },
  };
}

describe("SSR /events/[slug]/recap", () => {
  test("injects the recap's own canonical + og:url, and strips the homepage's", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Recap Event",
      slug: "recap-event",
      date: "2026-08-02",
      status: "archived",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequestGet(makeContext({ env, slug: "recap-event" }));
    expect(response.status).toBe(200);
    const html = await response.text();

    const expectedUrl = "https://settimes.ca/events/recap-event/recap";
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
    const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]+)"/);
    expect(canonicalMatch?.[1]).toBe(expectedUrl);
    expect(ogUrlMatch?.[1]).toBe(expectedUrl);

    expect(html).not.toContain('content="https://settimes.ca/"');
  });

  test("exactly one of every identity tag — no duplicate from the homepage shell", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Single Tag Event",
      slug: "single-tag-event",
      date: "2026-08-02",
      status: "archived",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequestGet(makeContext({ env, slug: "single-tag-event" }));
    const html = await response.text();

    for (const pattern of IDENTITY_TAG_PATTERNS) {
      expect(html.match(pattern) || [], `pattern ${pattern} should match exactly once`).toHaveLength(1);
    }
  });

  test("title and description match EventRecapPage.jsx's own Helmet formula", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Long Weekend Band Crawl Vol. 16",
      slug: "lwbc-vol16",
      date: "2025-08-03",
      status: "archived",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Main Stage" });
    insertBand(rawDb, { name: "Band A", event_id: event.id, venue_id: venue.id });
    insertBand(rawDb, { name: "Band B", event_id: event.id, venue_id: venue.id });

    const response = await onRequestGet(makeContext({ env, slug: "lwbc-vol16" }));
    const html = await response.text();

    expect(html).toContain("<title>Long Weekend Band Crawl Vol. 16 — Event Recap | SetTimes.ca</title>");
    // 2 sets, 1 distinct venue — same COUNT(*)/COUNT(DISTINCT venue_id) shape
    // as EventRecapPage.jsx's stats.total_sets / stats.venue_count.
    expect(html).toContain(
      '<meta name="description" content="Recap for Long Weekend Band Crawl Vol. 16 on August 3, 2025. 2 sets across 1 venues." />',
    );
  });

  test("falls back to the branded default og:image when the event has no poster", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "No Poster Event",
      slug: "no-poster-event",
      date: "2026-08-02",
      status: "archived",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequestGet(makeContext({ env, slug: "no-poster-event" }));
    const html = await response.text();

    expect(html).toContain(`<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`);
  });

  test("uses the event's own poster_url when set", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Postered Event",
      slug: "postered-event",
      date: "2026-08-02",
      status: "archived",
    });
    rawDb
      .prepare("UPDATE events SET is_published=1, poster_url = ? WHERE id = ?")
      .run("https://band-photos.settimes.ca/event-posters/recap.jpg", event.id);

    const response = await onRequestGet(makeContext({ env, slug: "postered-event" }));
    const html = await response.text();

    expect(html).toContain(
      '<meta property="og:image" content="https://band-photos.settimes.ca/event-posters/recap.jpg" />',
    );
  });

  test("falls back to the plain shell for an unknown slug", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const response = await onRequestGet(makeContext({ env, slug: "does-not-exist" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    // The raw shell, untouched — none of the recap-specific injection ran.
    expect(html).toBe(STUB_HTML);
  });

  test("falls back to the plain shell for an unpublished, non-archived event", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    insertEvent(rawDb, {
      name: "Draft Event",
      slug: "draft-event-recap",
      date: "2026-08-02",
      status: "draft",
    });
    // is_published stays 0 (default) and status stays 'draft' -- matches
    // neither half of the (is_published = 1 OR status = 'archived') gate.

    const response = await onRequestGet(makeContext({ env, slug: "draft-event-recap" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(STUB_HTML);
  });

  // CodeRabbit Major (#784 follow-up): this route claims to be the ARCHIVE
  // recap, reachable once an event's date is past -- but the published/
  // archived gate alone says nothing about timing. A published event dated
  // in the future must still fall back to the plain shell, not get
  // recap-specific meta for a show that hasn't happened.
  test("falls back to the plain shell for a published event whose date is in the future", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Future Event",
      slug: "future-event-recap",
      date: "2999-01-01",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequestGet(makeContext({ env, slug: "future-event-recap" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(STUB_HTML);
  });

  // Multi-day events: the last day (end_date), not the first (date), is what
  // decides whether the event is over -- mirrors the end_date || date
  // convention documented in CLAUDE.md (scheduleStorage stale-detection).
  // A multi-day event whose START date has passed but END date hasn't must
  // still fall back to the plain shell.
  test("falls back to the plain shell for a multi-day event still in progress (end_date in the future)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "In-Progress Multiday Event",
      slug: "in-progress-multiday-recap",
      date: "2026-08-02",
    });
    rawDb.prepare("UPDATE events SET is_published=1, end_date='2999-01-01' WHERE id=?").run(event.id);

    const response = await onRequestGet(makeContext({ env, slug: "in-progress-multiday-recap" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(STUB_HTML);
  });

  // CodeRabbit Minor (#784 follow-up): `date`/`end_date` are TEXT columns
  // with no DB-level format constraint. A legacy row can hold a
  // syntactically-YYYY-MM-DD but calendar-invalid value (Feb 30 doesn't
  // exist). A plain typeof/string check doesn't catch that; this proves the
  // real calendar-date validator (validateDate(), validation.js) does.
  test("falls back to the plain shell for a calendar-invalid legacy date (Feb 30)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, {
      name: "Bad Legacy Date Event",
      slug: "bad-legacy-date-recap",
      date: "2026-02-30",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequestGet(makeContext({ env, slug: "bad-legacy-date-recap" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(STUB_HTML);
  });

  test("falls back to the plain shell when the public-data gate is closed", async () => {
    const { env, rawDb } = createTestEnv();
    // PUBLIC_DATA_PUBLISH_ENABLED intentionally left unset.
    const event = insertEvent(rawDb, {
      name: "Gated Event",
      slug: "gated-event",
      date: "2026-08-02",
      status: "archived",
    });
    rawDb.prepare("UPDATE events SET is_published=1 WHERE id=?").run(event.id);

    const response = await onRequestGet(makeContext({ env, slug: "gated-event" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(STUB_HTML);
  });

  test("falls back to the plain shell on a malformed slug", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const response = await onRequestGet(makeContext({ env, slug: "not valid!" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(STUB_HTML);
  });

  test("falls back to the plain shell on a DB error", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    env.DB = {
      prepare: () => {
        throw new Error("simulated DB failure");
      },
    };

    const response = await onRequestGet(makeContext({ env, slug: "any-slug" }));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toBe(STUB_HTML);
  });
});
