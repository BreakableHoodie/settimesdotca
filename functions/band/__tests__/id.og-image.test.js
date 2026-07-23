/**
 * SSR /band/[id] Tests — default og:image fallback (#644)
 *
 * Band pages without a photo_url previously emitted no og:image at all,
 * so social shares rendered with no preview image. A branded 1200x630
 * fallback (DEFAULT_OG_IMAGE, functions/utils/ssrMeta.js) must be used
 * instead — never omit the tag.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[id].js";
import { createTestEnv } from "../../api/test-utils.js";
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
    request: new Request(`https://settimes.ca/band/${id}`),
    env,
    params: { id: String(id) },
  };
}

describe("SSR /band/[id] — default og:image fallback (#644)", () => {
  test("uses the branded default og:image when the band has no photo_url", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const info = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, photo_url) VALUES (?, ?, NULL)")
      .run("No Photo Band", "nophotoband");

    const response = await onRequest(makeContext({ env, id: info.lastInsertRowid }));
    expect(response.status).toBe(200);
    const html = await response.text();

    expect(html).toContain(`<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  });

  test("still prefers the band's own photo_url when present", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const info = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, photo_url) VALUES (?, ?, ?)")
      .run("Photo Band", "photoband", "https://r2.settimes.ca/bands/photo-band.jpg");

    const response = await onRequest(makeContext({ env, id: info.lastInsertRowid }));
    const html = await response.text();

    expect(html).toContain('<meta property="og:image" content="https://r2.settimes.ca/bands/photo-band.jpg" />');
    expect(html).not.toContain(DEFAULT_OG_IMAGE);
  });

  test("falls back to the branded default for a legacy javascript: photo_url (read-path sanitize)", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const info = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, photo_url) VALUES (?, ?, ?)")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #644-review read-path guard
      .run("Unsafe Photo Band", "unsafephotoband", "javascript:alert(1)");

    const response = await onRequest(makeContext({ env, id: info.lastInsertRowid }));
    const html = await response.text();

    // eslint-disable-next-line no-script-url -- assertion text, not an executed scheme
    expect(html).not.toContain("javascript:");
    expect(html).toContain(`<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const musicGroup = JSON.parse(jsonLdMatch[1]);
    expect(musicGroup.image).toBeUndefined();
  });
});
