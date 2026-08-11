import { describe, expect, it } from "vitest";
import { createTestEnv, insertEvent } from "../test-utils";
import * as scheduleHandler from "../schedule.js";

// Regression guard for the `?event=current` visibility narrowing.
//
// `?event=current` and `?event=<slug>` deliberately have DIFFERENT gates:
//   - the slug branch is publicEventStatusSql() — archived editions are the
//     site's browsable back catalogue,
//   - the current branch is publishedEventStatusSql() — archived must be
//     excluded.
//
// The two are easy to conflate, and a sweep that unified them would look like
// a tidy-up. It isn't: the handler's `-6 hours` buffer means an event archived
// on its own final day STILL satisfies
// `COALESCE(end_date, date) >= date('now','-6 hours')`, so the broader
// predicate hands a fan the archived edition as tonight's live schedule.
//
// These tests fail if `publishedEventStatusSql()` in functions/api/schedule.js
// is ever widened back to `publicEventStatusSql()`.

function isoDaysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("GET /api/schedule?event=current — archived events are excluded", () => {
  it("404s when the only date-eligible event is archived", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // Archived, but ending TODAY — still inside the -6h buffer, so the date
    // filter alone does not exclude it. Only the status gate does.
    insertEvent(rawDb, {
      name: "Buddies Fest 2",
      slug: "bf2-archived-today",
      date: isoDaysFromNow(0),
      end_date: isoDaysFromNow(0),
      status: "archived",
    });

    const res = await scheduleHandler.onRequestGet({
      request: new Request("https://example.test/api/schedule?event=current"),
      env,
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe("No published events available");
  });

  it("returns the published event, not an earlier-dated archived one", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    // The archived event sorts FIRST under `ORDER BY date ASC`, so if the gate
    // ever admits archived rows this assertion catches it on ordering alone —
    // it does not depend on the archived row being absent from the table.
    insertEvent(rawDb, {
      name: "Buddies Fest 2",
      slug: "bf2-archived-today",
      date: isoDaysFromNow(0),
      end_date: isoDaysFromNow(0),
      status: "archived",
    });
    insertEvent(rawDb, {
      name: "Long Weekend Band Crawl Vol. 18",
      slug: "lwbc18-published",
      date: isoDaysFromNow(30),
      status: "published",
    });

    const res = await scheduleHandler.onRequestGet({
      request: new Request("https://example.test/api/schedule?event=current"),
      env,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.slug).toBe("lwbc18-published");
    expect(body.event.is_archived).toBe(false);
  });

  it("still serves an archived event by slug — the other branch is unchanged", async () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";

    insertEvent(rawDb, {
      name: "Buddies Fest 2",
      slug: "bf2-archived-today",
      date: isoDaysFromNow(0),
      end_date: isoDaysFromNow(0),
      status: "archived",
    });

    const res = await scheduleHandler.onRequestGet({
      request: new Request("https://example.test/api/schedule?event=bf2-archived-today"),
      env,
    });

    // Asserting the slug branch here is what keeps the fix honest: narrowing
    // `current` must not be achieved by narrowing event visibility globally,
    // which would re-break history browsing — the original incident.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.slug).toBe("bf2-archived-today");
    expect(body.event.is_archived).toBe(true);
  });
});
