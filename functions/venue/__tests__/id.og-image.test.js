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

// #784 CodeRabbit follow-up: DEFAULT_META_RE (ssrMeta.js) strips
// index.html's baked-in og:site_name for every SSR-injected route, so this
// route must re-emit it or it disappears entirely rather than merely
// de-duplicating. A shell WITHOUT the baked-in default (like STUB_HTML
// above) can't prove that -- it has nothing to strip.
const SHELL_WITH_DEFAULT_SITE_NAME_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <meta property="og:site_name" content="SetTimes" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

function makeContextWithDefaultsShell({ env, id }) {
  env.ASSETS = {
    fetch: async () =>
      new Response(SHELL_WITH_DEFAULT_SITE_NAME_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/venue/${id}`),
    env,
    params: { id: String(id) },
  };
}

describe("SSR /venue/[id] — og:site_name (#784 ownership sweep)", () => {
  test("emits exactly one og:site_name, not a duplicate of the homepage shell's", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const venue = insertVenue(rawDb, { name: "Prohibition", city: "Waterloo" });

    const response = await onRequest(makeContextWithDefaultsShell({ env, id: venue.id }));
    const html = await response.text();

    expect(html.match(/property="og:site_name"/g)?.length).toBe(1);
    expect(html).toContain('<meta property="og:site_name" content="SetTimes" />');
  });
});
