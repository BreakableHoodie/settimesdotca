/**
 * SSR /venue/[id] Tests — default og:image fallback (#644)
 *
 * Venue pages never had og:image logic at all (venues have no photo column),
 * so every venue share rendered with no preview image. A branded 1200x630
 * fallback (DEFAULT_OG_IMAGE, functions/utils/ssrMeta.js) closes that gap
 * unconditionally.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[id].js";
import { createTestEnv, insertVenue } from "../../api/test-utils.js";
import { DEFAULT_OG_IMAGE } from "../../utils/ssrMeta.js";

const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

function makeContext({ env, id }) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/venue/${id}`),
    env,
    params: { id: String(id) },
  };
}

describe("SSR /venue/[id] — default og:image fallback (#644)", () => {
  test("always uses the branded default og:image", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const venue = insertVenue(rawDb, { name: "Room 47", city: "Waterloo" });

    const response = await onRequest(makeContext({ env, id: venue.id }));
    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).toContain(`<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });
});
