import { describe, expect, it } from "vitest";
import { onRequestGet as timelineHandler } from "../timeline.js";
import { createTestEnv, insertEvent } from "../../test-utils.js";

// Regression guard for how `status = 'archived'` interacts with the timeline's
// now / upcoming / past bucketing.
//
// Bucket membership is a LIFECYCLE question before it is a date question:
// archiving an event means "this edition is concluded", so it must outrank the
// calendar. An admin who closes out an event on its own final day (or on day 2
// of a multi-day run, or early by mistake) must not leave it advertised as
// "Happening Now".
//
//   now      = published AND the festival window covers today
//   upcoming = published AND dated in the future
//   past     = archived OR (published AND concluded by date)
//
// The two halves are load-bearing together. Narrowing now/upcoming to
// published-only WITHOUT `archived OR` in past would make an archived event
// with a live or future date match no bucket at all and disappear from the
// timeline entirely — which is why the fifth test here exists.
//
// These run against the real better-sqlite3 harness rather than the mocked
// query-string matcher in timeline.test.js: the whole point is which rows the
// SQL actually returns, which a mock keyed on WHERE-clause substrings cannot
// demonstrate.

function isoDaysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function getTimeline(env) {
  const res = await timelineHandler({
    request: new Request("https://example.test/api/events/timeline"),
    env,
  });
  expect(res.status).toBe(200);
  return res.json();
}

const slugsOf = (bucket) => (bucket || []).map((e) => e.slug ?? e.event_slug);

describe("GET /api/events/timeline — archived events never appear as live", () => {
  it("keeps an archived event off 'now' even while its date window is open", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Spans yesterday → tomorrow, so the date filter alone puts it squarely in
    // the "now" window. Only the status gate can exclude it.
    insertEvent(rawDb, {
      name: "Closed Out Early",
      slug: "closed-out-early",
      date: isoDaysFromNow(-1),
      end_date: isoDaysFromNow(1),
      status: "archived",
    });

    const body = await getTimeline(env);

    expect(slugsOf(body.now)).not.toContain("closed-out-early");
    expect(slugsOf(body.upcoming)).not.toContain("closed-out-early");
  });

  it("keeps an archived event off 'upcoming' even when it is future-dated", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    insertEvent(rawDb, {
      name: "Archived But Future Dated",
      slug: "archived-future",
      date: isoDaysFromNow(30),
      status: "archived",
    });

    const body = await getTimeline(env);

    expect(slugsOf(body.upcoming)).not.toContain("archived-future");
    expect(slugsOf(body.now)).not.toContain("archived-future");
  });

  it("still shows a published event in 'now' — the gate narrows status, not dates", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    insertEvent(rawDb, {
      name: "Running Tonight",
      slug: "running-tonight",
      date: isoDaysFromNow(-1),
      end_date: isoDaysFromNow(1),
      status: "published",
    });

    const body = await getTimeline(env);

    // Without this, "exclude archived" could be satisfied by a gate that
    // excludes everything — the exact failure mode of the P0 this branch fixes.
    expect(slugsOf(body.now)).toContain("running-tonight");
  });

  it("still shows a published future event in 'upcoming'", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    insertEvent(rawDb, {
      name: "Long Weekend Band Crawl Vol. 18",
      slug: "lwbc18",
      date: isoDaysFromNow(60),
      status: "published",
    });

    const body = await getTimeline(env);

    expect(slugsOf(body.upcoming)).toContain("lwbc18");
  });

  it("routes an archived event to 'past' regardless of its date, so it is never lost", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Both of these are excluded from now/upcoming by the tests above. If the
    // past bucket were gated on date alone they would match NO bucket and
    // silently vanish from the timeline — the regression that narrowing
    // now/upcoming without `archived OR` in past would introduce.
    insertEvent(rawDb, {
      name: "Closed Out Early",
      slug: "closed-out-early",
      date: isoDaysFromNow(-1),
      end_date: isoDaysFromNow(1),
      status: "archived",
    });
    insertEvent(rawDb, {
      name: "Archived But Future Dated",
      slug: "archived-future",
      date: isoDaysFromNow(30),
      status: "archived",
    });

    const body = await getTimeline(env);
    const past = slugsOf(body.past);

    expect(past).toContain("closed-out-early");
    expect(past).toContain("archived-future");
  });

  it("keeps a genuinely concluded published event in 'past'", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Published and over, but nobody has archived it yet — the default state of
    // every event between "show ended" and an admin clicking Archive.
    insertEvent(rawDb, {
      name: "Finished Not Yet Archived",
      slug: "finished-unarchived",
      date: isoDaysFromNow(-10),
      end_date: isoDaysFromNow(-9),
      status: "published",
    });

    const body = await getTimeline(env);

    expect(slugsOf(body.past)).toContain("finished-unarchived");
  });

  it("never shows a draft event in any bucket", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    insertEvent(rawDb, {
      name: "Unannounced",
      slug: "unannounced-draft",
      date: isoDaysFromNow(20),
      status: "draft",
    });

    const body = await getTimeline(env);

    expect(slugsOf(body.now)).not.toContain("unannounced-draft");
    expect(slugsOf(body.upcoming)).not.toContain("unannounced-draft");
    expect(slugsOf(body.past)).not.toContain("unannounced-draft");
  });
});
