/**
 * SSR /band/[id] — a slug 301s to its canonical /band/<id> (#983)
 *
 * Every public link to an artist is built by buildBandProfileHref(), which emits
 * /band/<slug> -- ArtistsPage, StatsPage, EventRecapPage, EventTimeline and
 * BandCard all use it. The handler used to serve the un-injected SPA shell for
 * any non-numeric id, so those URLs answered 200 with the HOMEPAGE title and no
 * canonical. Fourteen of them reached Google's index as duplicates of their own
 * /band/<id> page (one at position 49) while BandProfilePage corrected the URL
 * only client-side, after JS ran.
 *
 * These assertions target the REDIRECT. A suite that only checked /band/<id>
 * still renders would have passed for the entire life of the bug -- the
 * canonical page was never broken; the duplicate beside it was.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[id].js";
import { createTestEnv } from "../../api/test-utils.js";

const STUB_HTML = `<!doctype html><html><head>
    <title>SetTimes – Live Music Events &amp; Show Schedules</title>
  </head><body><div id="root"></div></body></html>`;

function makeContext({ env, id, search = "" }) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/band/${id}${search}`),
    env,
    params: { id: String(id) },
  };
}

function seedBand(rawDb, name, normalized) {
  return rawDb.prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)").run(name, normalized)
    .lastInsertRowid;
}

describe("SSR /band/[id] — slug URLs redirect to the canonical id (#983)", () => {
  test("a slug 301s to /band/<id>", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const id = seedBand(rawDb, "Mixed Feelings", "mixedfeelings");

    const response = await onRequest(makeContext({ env, id: "mixed-feelings" }));

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`/band/${id}`);
  });

  test("punctuation in the name still resolves, because slugify and normalize agree", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    // "B.A. Johnston" slugifies to "b-a-johnston" and normalizes to "bajohnston".
    // Reversing the slug by replacing "-" with " " and re-normalizing has to land
    // on the same key, or every punctuated artist name silently stops redirecting.
    const id = seedBand(rawDb, "B.A. Johnston", "bajohnston");

    const response = await onRequest(makeContext({ env, id: "b-a-johnston" }));

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`/band/${id}`);
  });

  test("the query string survives the redirect", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    // ?fromEvent drives the "back to event" context. The client-side redirect
    // this replaces preserved location.search; dropping it here would be a
    // silent regression no status-code assertion would catch.
    const id = seedBand(rawDb, "Cory Branan", "corybranan");

    const response = await onRequest(makeContext({ env, id: "cory-branan", search: "?fromEvent=buddiesfest2" }));

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(`/band/${id}?fromEvent=buddiesfest2`);
  });

  test("the Location is relative, so preview and www deploys are not bounced to production", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    seedBand(rawDb, "Kingfisher", "kingfisher");

    const response = await onRequest(makeContext({ env, id: "kingfisher" }));

    expect(response.headers.get("Location")).toMatch(/^\/band\/\d+$/);
    expect(response.headers.get("Location")).not.toContain("settimes.ca");
  });

  test("an unresolvable slug falls through to the shell rather than redirecting or 404ing", async () => {
    const { env } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    const response = await onRequest(makeContext({ env, id: "not-a-real-band" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  test("a gated env serves the shell without revealing that the band exists", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "false";
    seedBand(rawDb, "Blackout", "blackout");

    const response = await onRequest(makeContext({ env, id: "blackout" }));

    // A redirect that fires only for real slugs is an existence oracle even
    // though it leaks no field values -- so the gate has to precede the lookup.
    expect(response.status).toBe(200);
    expect(response.headers.get("Location")).toBeNull();
  });

  test("a numeric id is still server-rendered, not redirected", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const id = seedBand(rawDb, "Ghost Factory", "ghostfactory");

    const response = await onRequest(makeContext({ env, id }));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Ghost Factory");
    expect(html).toContain(`<link rel="canonical" href="https://settimes.ca/band/${id}" />`);
  });
});
