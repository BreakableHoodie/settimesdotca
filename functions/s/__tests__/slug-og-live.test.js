import { describe, expect, test } from "vitest";
import { onRequest } from "../[slug].js";
import { createTestEnv, insertEvent, insertVenue, insertBand, insertShareLink } from "../../api/test-utils.js";

// #733 follow-up — the OG card built by this route used the STALE band_names
// snapshot taken when the link was shared, so after a performance is
// hard-deleted the iMessage/WhatsApp preview reads "3-stop route ... Featuring
// Kept One, Kept Two, Deleted Band" while the page it opens
// (SharePreviewPage, via GET /api/schedule/share/[slug]) shows "2-stop route"
// with two rows. Resolve the SAME live performances that endpoint now
// resolves, so the card and the page always agree.
const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

function makeContext({ env, slug }) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return {
    request: new Request(`https://settimes.ca/s/${slug}`),
    env,
    params: { slug },
  };
}

// Module-level alongside makeContext so both describe blocks below can use it.
// insertEvent defaults to status 'draft'; seed 'published' explicitly, because
// this route gates the events JOIN on publicEventStatusSql() and a draft-event
// share link cannot arise in production anyway -- share.js only mints links for
// a publicly-visible event.
function seed(status = "published") {
  const { env, rawDb } = createTestEnv();
  const event = insertEvent(rawDb, { name: "Vol. 17", slug: "vol17", status });
  const venue = insertVenue(rawDb, { name: "Blue Room" });
  return { env, rawDb, event, venue };
}

describe("SSR /s/[slug] — OG card resolves live performances (#733)", () => {
  test("drops a hard-deleted performance from the OG card count and Featuring list", async () => {
    const { env, rawDb, event, venue } = seed();
    const kept1 = insertBand(rawDb, { name: "Kept One", event_id: event.id, venue_id: venue.id });
    const kept2 = insertBand(rawDb, { name: "Kept Two", event_id: event.id, venue_id: venue.id });
    const deleted = insertBand(rawDb, { name: "Deleted Band", event_id: event.id, venue_id: venue.id });

    insertShareLink(rawDb, {
      slug: "og3sets",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [kept1.id, kept2.id, deleted.id],
      band_names: ["Kept One", "Kept Two", "Deleted Band"],
    });

    // Hard-delete AFTER the link was created — the exact production shape
    // (#733): the snapshot still says 3, the live table says 2.
    rawDb.prepare("DELETE FROM performances WHERE id = ?").run(deleted.id);

    const response = await onRequest(makeContext({ env, slug: "og3sets" }));
    const html = await response.text();

    // The load-bearing check: the RESOLVED count (2), not the stale
    // band_names.length (3). A broken implementation using band_names
    // directly would emit "3-stop route" here.
    expect(html).toContain('<meta property="og:title" content="2-stop route for Vol. 17" />');
    expect(html).toContain("Featuring Kept One, Kept Two");
    expect(html).not.toContain("Deleted Band");
  });

  test("keeps the full count when nothing was deleted (sibling proof: not just always -1)", async () => {
    const { env, rawDb, event, venue } = seed();
    const one = insertBand(rawDb, { name: "Band One", event_id: event.id, venue_id: venue.id });
    const two = insertBand(rawDb, { name: "Band Two", event_id: event.id, venue_id: venue.id });
    const three = insertBand(rawDb, { name: "Band Three", event_id: event.id, venue_id: venue.id });

    insertShareLink(rawDb, {
      slug: "ogfullset",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [one.id, two.id, three.id],
      band_names: ["Band One", "Band Two", "Band Three"],
    });

    const response = await onRequest(makeContext({ env, slug: "ogfullset" }));
    const html = await response.text();

    expect(html).toContain('<meta property="og:title" content="3-stop route for Vol. 17" />');
    expect(html).toContain("Featuring Band One, Band Two, Band Three");
  });

  test("keeps a CANCELLED-but-not-deleted performance in the OG count and Featuring list", async () => {
    const { env, rawDb, event, venue } = seed();
    const cancelled = insertBand(rawDb, { name: "Cancelled Band", event_id: event.id, venue_id: venue.id });
    const playing = insertBand(rawDb, { name: "Playing Band", event_id: event.id, venue_id: venue.id });
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelled.id);

    insertShareLink(rawDb, {
      slug: "ogcancelled",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [cancelled.id, playing.id],
      band_names: ["Cancelled Band", "Playing Band"],
    });

    const response = await onRequest(makeContext({ env, slug: "ogcancelled" }));
    const html = await response.text();

    // A cancelled set still resolves (only hard-deleted rows are dropped),
    // matching api/schedule/share/[slug].js -- it still counts and still
    // appears in the card.
    expect(html).toContain('<meta property="og:title" content="2-stop route for Vol. 17" />');
    expect(html).toContain("Featuring Cancelled Band, Playing Band");
  });
});

// Three routes serve a share slug and they must agree on event visibility:
// POST /api/schedule/share (mint), GET /api/schedule/share/[slug] (the JSON the
// page renders from), and this OG card. The first two have always gated on
// publicEventStatusSql(); this one did not, so an event unpublished AFTER a
// link was shared would still yield a crawler-facing card naming the event and
// its bands while the page it opens rendered nothing. That split between a meta
// layer and the data behind it is the #787 failure shape.
describe("SSR /s/[slug] — event visibility gate", () => {
  test("serves no OG card when the share link's event is a draft", async () => {
    const { env, rawDb, event, venue } = seed("draft");
    const band = insertBand(rawDb, { name: "Hidden Band", event_id: event.id, venue_id: venue.id });

    insertShareLink(rawDb, {
      slug: "ogdraft",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [band.id],
      band_names: ["Hidden Band"],
    });

    const response = await onRequest(makeContext({ env, slug: "ogdraft" }));
    const html = await response.text();

    // Falls through to the plain SPA shell: no event name, no band name, no
    // route card. Asserting on the leaked VALUES rather than only on the
    // absence of og:title -- a card that omitted the title but still printed
    // "Hidden Band" in the description would be just as much of a leak.
    expect(html).not.toContain("Vol. 17");
    expect(html).not.toContain("Hidden Band");
    expect(html).not.toContain("1-stop route");
    expect(html).toContain("Homepage description");
  });

  test("still serves the card for an ARCHIVED event — concluded is not hidden", async () => {
    const { env, rawDb, event, venue } = seed("archived");
    const band = insertBand(rawDb, { name: "Archived Band", event_id: event.id, venue_id: venue.id });

    insertShareLink(rawDb, {
      slug: "ogarchived",
      event_id: event.id,
      event_slug: "vol17",
      performance_ids: [band.id],
      band_names: ["Archived Band"],
    });

    const response = await onRequest(makeContext({ env, slug: "ogarchived" }));
    const html = await response.text();

    // Sibling proof that the gate narrows on STATUS rather than just rejecting
    // everything -- publicEventStatusSql() is published-or-archived, and a fan
    // reopening last season's shared link must still get a real preview.
    expect(html).toContain('<meta property="og:title" content="1-stop route for Vol. 17" />');
    expect(html).toContain("Featuring Archived Band");
  });
});
