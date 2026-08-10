/**
 * SSR /band/[id] Tests — JSON-LD description must not truncate to SERP length (#790)
 *
 * musicGroup.description previously reused the same 200-char value computed
 * for <meta name="description">/og:description/twitter:description. That
 * length is a SERP-snippet convention -- schema.org's MusicGroup.description
 * has no such limit -- so any bio over 200 chars silently lost content in the
 * emitted schema. 44 of 62 production artist bios exceed 200 chars (longest
 * 2521), so this wasn't an edge case.
 */
import { describe, expect, test } from "vitest";
import { onRequest } from "../[id].js";
import { createTestEnv } from "../../api/test-utils.js";

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

describe("SSR /band/[id] — JSON-LD description is not SERP-truncated (#790)", () => {
  test("meta description truncates at 200 chars but musicGroup.description carries the full bio", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    // Plain repeated text, no markdown/whitespace -- isolates the truncation
    // LENGTH being asserted, not toPlainText's markdown-stripping behavior
    // (already covered elsewhere).
    const longBio = "A".repeat(250);
    const info = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, description) VALUES (?, ?, ?)")
      .run("Long Bio Band", "longbioband", longBio);

    const response = await onRequest(makeContext({ env, id: info.lastInsertRowid }));
    const html = await response.text();

    const metaMatch = html.match(/<meta name="description" content="([^"]*)" \/>/);
    expect(metaMatch).not.toBeNull();
    const metaDescription = metaMatch[1];
    // toPlainText(x, 200) slices to 199 chars + an ellipsis for anything over 200.
    expect(metaDescription.length).toBe(200);
    expect(metaDescription.endsWith("…")).toBe(true);
    expect(metaDescription).not.toBe(longBio);

    // musicGroup is the first schema in jsonLd: [musicGroup, breadcrumb], so
    // the first <script type="application/ld+json"> block in document order
    // is always musicGroup -- same assumption the #644 og-image test makes.
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(jsonLdMatch).not.toBeNull();
    const musicGroup = JSON.parse(jsonLdMatch[1]);
    expect(musicGroup["@type"]).toBe("MusicGroup");
    expect(musicGroup.description).toBe(longBio);
    expect(musicGroup.description.length).toBe(250);
  });

  test("musicGroup.description is still capped, at JSONLD_DESCRIPTION_MAX_LENGTH", async () => {
    // The point of the fix is a LONGER limit, not an absent one -- without a
    // cap a pathological bio would inflate every crawler's payload. Production's
    // longest bio is 2521 chars, so nothing hits this today; the test exists so
    // that stays a deliberate headroom choice rather than an accident.
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const hugeBio = "A".repeat(5001);
    const info = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, description) VALUES (?, ?, ?)")
      .run("Huge Bio Band", "hugebioband", hugeBio);

    const response = await onRequest(makeContext({ env, id: info.lastInsertRowid }));
    const html = await response.text();

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const musicGroup = JSON.parse(jsonLdMatch[1]);
    expect(musicGroup.description).toHaveLength(5000);
    expect(musicGroup.description.endsWith("…")).toBe(true);
  });

  test("a bio under 200 chars is identical (untruncated) in both places", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const shortBio = "A punk band from Waterloo Region.";
    const info = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized, description) VALUES (?, ?, ?)")
      .run("Short Bio Band", "shortbioband", shortBio);

    const response = await onRequest(makeContext({ env, id: info.lastInsertRowid }));
    const html = await response.text();

    const metaMatch = html.match(/<meta name="description" content="([^"]*)" \/>/);
    expect(metaMatch[1]).toBe(shortBio);

    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const musicGroup = JSON.parse(jsonLdMatch[1]);
    expect(musicGroup.description).toBe(shortBio);
  });
});
