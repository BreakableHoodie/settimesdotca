import { expect, test } from "vitest";
import { onRequest } from "../[id].js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../api/test-utils.js";

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

test("fallback description counts only public, revealed, non-cancelled editions", async () => {
  const { env, rawDb } = createTestEnv();
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  const venue = insertVenue(rawDb, { name: "Test Venue" });
  const visibleEvent = insertEvent(rawDb, {
    name: "Visible Edition",
    slug: "visible-edition",
    date: "2099-01-01",
    status: "published",
  });
  const hiddenEvent = insertEvent(rawDb, {
    name: "Hidden Edition",
    slug: "hidden-edition",
    date: "2099-01-02",
    status: "published",
  });
  const cancelledEvent = insertEvent(rawDb, {
    name: "Cancelled Edition",
    slug: "cancelled-edition",
    date: "2099-01-03",
    status: "published",
  });
  rawDb.prepare("UPDATE events SET reveal_mode = 1 WHERE id = ?").run(hiddenEvent.id);

  const visible = insertBand(rawDb, {
    name: "Hamilton Act",
    genre: "punk",
    event_id: visibleEvent.id,
    venue_id: venue.id,
  });
  insertBand(rawDb, { name: "Hamilton Act", event_id: hiddenEvent.id, venue_id: venue.id });
  const cancelled = insertBand(rawDb, { name: "Hamilton Act", event_id: cancelledEvent.id, venue_id: venue.id });
  rawDb
    .prepare("UPDATE performances SET is_announced = 0 WHERE id = ?")
    .run(rawDb.prepare("SELECT id FROM performances WHERE event_id = ?").get(hiddenEvent.id).id);
  rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelled.id);
  // A LATER draft edition with an announced, live set: not public, so it must
  // change neither the count nor the "latest" name (CodeRabbit on #1476).
  const draftEvent = insertEvent(rawDb, {
    name: "Draft Edition",
    slug: "draft-edition",
    date: "2099-02-01",
    status: "draft",
  });
  insertBand(rawDb, { name: "Hamilton Act", event_id: draftEvent.id, venue_id: venue.id });
  rawDb
    .prepare("UPDATE band_profiles SET origin_city = ?, origin_region = ? WHERE id = ?")
    .run("Hamilton", "Ontario", visible.band_profile_id);

  const response = await onRequest(makeContext({ env, id: visible.band_profile_id }));
  const html = await response.text();
  expect(html).toContain(
    '<meta name="description" content="punk from Hamilton. On 1 SetTimes lineup, latest Visible Edition." />',
  );
  expect(html).toContain("<title>Hamilton Act — punk from Hamilton | SetTimes</title>");
});

test("a stored band description still wins over the factual fallback", async () => {
  const { env, rawDb } = createTestEnv();
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  const event = insertEvent(rawDb, { name: "Edition", slug: "edition", date: "2099-01-01", status: "published" });
  const venue = insertVenue(rawDb);
  const band = insertBand(rawDb, {
    name: "Described Act",
    description: "Artist supplied description.",
    event_id: event.id,
    venue_id: venue.id,
  });

  const response = await onRequest(makeContext({ env, id: band.band_profile_id }));
  const html = await response.text();
  expect(html).toContain('<meta name="description" content="Artist supplied description." />');
});
