import { describe, expect, it } from "vitest";
import { onRequestGet as sitemapHandler } from "../sitemap.xml.js";
import { onRequestGet as recapApiHandler } from "../api/events/[id]/recap.js";
import { onRequestGet as recapSsrHandler } from "../events/[slug]/recap.js";
import { createTestEnv, insertEvent } from "../api/test-utils.js";
import { eventLocalToday } from "../utils/eventDay.js";

// #787 — three paths decide whether an event's recap page exists, and they used
// to disagree:
//
//   sitemap.xml.js            publicEventStatusSql() + a JS `date < today` compare
//   events/[slug]/recap.js    publicEventStatusSql() -- no date check at all
//   api/events/[id]/recap.js  archivedEventStatusSql() -- narrower than both
//
// A published, past, NOT-YET-ARCHIVED event therefore got a sitemap URL and full
// SSR identity meta while the data API behind the page 404'd: an indexable
// soft-404. Archiving is an admin housekeeping click that lags the event's real
// end -- Buddies Fest 2 sat unarchived for three days after it finished.
//
// THE DRIFT IS THE BUG, so a per-path test cannot catch it: each path was
// self-consistent and individually defensible. Every case below drives all
// three handlers against one seeded database and asserts they return the same
// answer. That is the only assertion shape that fails when they diverge.

const SLUG = "gatecheck";

// Anchored on the Toronto-local event day, never `new Date().toISOString()`,
// which is UTC-sliced and runs a day ahead of the handlers between local 20:00
// and midnight (the #568 invariant). Offsetting from a UTC-midnight Date built
// out of those Y/M/D parts keeps the arithmetic pure calendar days. Same
// approach as functions/api/events/__tests__/timeline-archived-buckets.test.js.
function isoDaysFromNow(days) {
  const [year, month, day] = eventLocalToday().split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

const STUB_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <title>SetTimes</title>
  </head><body><div id="root"></div></body></html>`;

function withAssets(env) {
  env.ASSETS = {
    fetch: async () => new Response(STUB_HTML, { status: 200, headers: { "content-type": "text/html" } }),
  };
  return env;
}

/** Does the sitemap advertise this event's recap URL? */
async function sitemapAdvertisesRecap(env) {
  const res = await sitemapHandler({ request: new Request("https://settimes.ca/sitemap.xml"), env });
  const xml = await res.text();
  return xml.includes(`https://settimes.ca/events/${SLUG}/recap`);
}

/** Does SSR inject real recap meta, or fall through to the bare SPA shell? */
async function ssrServesRecapMeta(env) {
  const res = await recapSsrHandler({
    request: new Request(`https://settimes.ca/events/${SLUG}/recap`),
    env,
    params: { slug: SLUG },
  });
  const html = await res.text();
  // The stub shell carries the homepage description and no recap canonical; an
  // injected response strips that default and adds the recap URL.
  return html.includes(`https://settimes.ca/events/${SLUG}/recap`) && !html.includes("Homepage description");
}

/** Does the JSON API the page renders from return the recap? */
async function apiServesRecap(env) {
  const res = await recapApiHandler({
    request: new Request(`https://settimes.ca/api/events/${SLUG}/recap`),
    env,
    params: { id: SLUG },
  });
  return res.status === 200;
}

async function allThree(env) {
  return {
    sitemap: await sitemapAdvertisesRecap(env),
    ssr: await ssrServesRecapMeta(env),
    api: await apiServesRecap(env),
  };
}

function seed(overrides) {
  const { env, rawDb } = createTestEnv();
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  insertEvent(rawDb, { name: "Gate Check", slug: SLUG, ...overrides });
  return withAssets(env);
}

describe("#787 — sitemap, SSR and the recap API agree on whether a recap exists", () => {
  it("published and concluded: all three serve it", async () => {
    // THE #787 CASE. Ended 10 days ago and nobody has archived it yet -- the
    // default state of every event between "show over" and an admin clicking
    // Archive. Against the unfixed code the API alone said no.
    const env = seed({ date: isoDaysFromNow(-11), end_date: isoDaysFromNow(-10), status: "published" });

    expect(await allThree(env)).toEqual({ sitemap: true, ssr: true, api: true });
  });

  it("archived and concluded: all three serve it", async () => {
    // Today's normal case. Present so the fix cannot be "make everything no".
    const env = seed({ date: isoDaysFromNow(-11), end_date: isoDaysFromNow(-10), status: "archived" });

    expect(await allThree(env)).toEqual({ sitemap: true, ssr: true, api: true });
  });

  it("published but still in the future: none of the three serve it", async () => {
    const env = seed({ date: isoDaysFromNow(30), status: "published" });

    expect(await allThree(env)).toEqual({ sitemap: false, ssr: false, api: false });
  });

  it("draft and concluded: none of the three serve it", async () => {
    // Concluded by date, but never public. Visibility still gates everything.
    const env = seed({ date: isoDaysFromNow(-11), end_date: isoDaysFromNow(-10), status: "draft" });

    expect(await allThree(env)).toEqual({ sitemap: false, ssr: false, api: false });
  });

  it("multi-day event mid-festival: none of the three serve it", async () => {
    // Started yesterday, ends tomorrow. The sitemap used to compare the START
    // date, so it advertised a recap for a festival still in progress -- BLR3
    // (Jul 10-12) would have had a live recap URL on the 11th and 12th.
    // COALESCE(end_date, date) is what makes this false.
    const env = seed({ date: isoDaysFromNow(-1), end_date: isoDaysFromNow(1), status: "published" });

    expect(await allThree(env)).toEqual({ sitemap: false, ssr: false, api: false });
  });

  it("single-day event running today: none of the three serve it", async () => {
    // NULL end_date, so COALESCE falls back to `date`. Guards that fallback --
    // an event is not "concluded" on the day it runs.
    const env = seed({ date: isoDaysFromNow(0), status: "published" });

    expect(await allThree(env)).toEqual({ sitemap: false, ssr: false, api: false });
  });
});
