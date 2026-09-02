import { describe, expect, test } from "vitest";
import { onRequest } from "../[slug].js";
import { createTestEnv, insertEvent, insertBand, insertVenue } from "../../api/test-utils.js";

// #1063: /event/[slug] JSON-LD reflects age_restriction and presented_by.
//   - presented_by set    -> organizer is the presenting org (SetTimes default replaced)
//   - age_restriction set -> audience.requiredMinAge emitted (NOT typicalAgeRange:
//     schema.org typicalAgeRange means target audience, not a legal entry bar)
//   - all-ages            -> NO audience key at all
//   - neither set         -> SetTimes organizer default, and no audience key
// The last assertion is deliberately an ABSENCE assertion (the bug class is a
// null leaking a key/missing value into structured data), not just presence
// when set.
const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

function makeContext({ env, slug }) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/event/${slug}`),
    env,
    params: { slug },
  };
}

function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return matches.map((m) => JSON.parse(m[1]));
}

function seedEvent(rawDb, slug, overrides = {}) {
  const ev = insertEvent(rawDb, { name: "Vol18", slug, date: "2026-10-11" });
  rawDb.prepare("UPDATE events SET status = 'published' WHERE id = ?").run(ev.id);
  const venue = insertVenue(rawDb, { name: "Roost", city: "Waterloo", region: "ON" });
  insertBand(rawDb, { name: "Test Band", event_id: ev.id, venue_id: venue.id });

  const cols = [];
  const vals = [];
  if (overrides.age_restriction !== undefined) {
    cols.push("age_restriction = ?");
    vals.push(overrides.age_restriction);
  }
  if (overrides.presented_by !== undefined) {
    cols.push("presented_by = ?");
    vals.push(overrides.presented_by);
  }
  if (cols.length) {
    rawDb.prepare(`UPDATE events SET ${cols.join(", ")} WHERE id = ?`).run(...vals, ev.id);
  }
  return ev;
}

function fetchMusicEvent(context) {
  return onRequest(context).then(async (res) => {
    const html = await res.text();
    const [musicEvent] = extractJsonLd(html);
    return { res, musicEvent };
  });
}

describe("/event/[slug] JSON-LD — presenter & age restriction (#1063)", () => {
  test("presented_by replaces the SetTimes organizer", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    seedEvent(rawDb, "organizer-presented", { presented_by: "Oktoberfest KW" });

    const { res, musicEvent } = await fetchMusicEvent(makeContext({ env, slug: "organizer-presented" }));
    expect(res.status).toBe(200);
    expect(musicEvent.organizer).toEqual({ "@type": "Organization", name: "Oktoberfest KW" });
    expect(musicEvent.organizer.name).not.toBe("SetTimes");
  });

  test("age_restriction emits audience.requiredMinAge and no organizer change", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    seedEvent(rawDb, "typical-age", { age_restriction: "19+" });

    const { res, musicEvent } = await fetchMusicEvent(makeContext({ env, slug: "typical-age" }));
    expect(res.status).toBe(200);
    expect(musicEvent.audience).toEqual({ "@type": "PeopleAudience", requiredMinAge: 19 });
    expect(musicEvent.organizer.name).toBe("SetTimes");
  });

  test("neither set: SetTimes organizer, NO audience key", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    seedEvent(rawDb, "neither-set");

    const { res, musicEvent } = await fetchMusicEvent(makeContext({ env, slug: "neither-set" }));
    expect(res.status).toBe(200);
    expect(musicEvent.organizer.name).toBe("SetTimes");
    expect(musicEvent).not.toHaveProperty("audience");
  });
});

// The all-ages branch is the one that would otherwise go untested. "All Ages"
// has no numeric floor, so it must emit NO audience block -- not
// requiredMinAge: 0, which asserts something different and false ("anyone of
// any age, including zero" is not the same claim as "no minimum applies").
describe("SSR /event/[slug] — all-ages emits no audience block (#1063)", () => {
  test('an "All Ages" event emits no audience key', async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, { name: "All Ages Show", slug: "slug-1063-all-ages", date: "2026-10-11" });
    rawDb.prepare("UPDATE events SET status = 'published', age_restriction = 'All Ages' WHERE id = ?").run(event.id);

    const response = await onRequest(makeContext({ env, slug: "slug-1063-all-ages" }));
    const html = await response.text();
    const musicEvent = extractJsonLd(html).find((b) => b["@type"] === "MusicEvent");

    expect(musicEvent).not.toHaveProperty("audience");
  });
});
