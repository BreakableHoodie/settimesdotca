import { describe, it, expect } from "vitest";
import { createTestEnv, insertEvent, insertBand, insertVenue } from "../test-utils";
import * as history from "../history.js";

function seedEnv() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
  return { env, rawDb };
}

async function getHistory(env) {
  const res = await history.onRequestGet({ env, request: new Request("http://localhost/api/history") });
  return { res, body: await res.json() };
}

const cancel = (db, perf) => db.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(perf.id);

describe("GET /api/history (#1250)", () => {
  it("lists published and archived editions newest first, never drafts", async () => {
    const { env, rawDb } = seedEnv();
    insertEvent(rawDb, { name: "Vol 1", slug: "vol-1", date: "2022-05-22", status: "archived" });
    insertEvent(rawDb, { name: "Vol 2", slug: "vol-2", date: "2030-07-31", status: "published" });
    insertEvent(rawDb, { name: "Secret", slug: "secret", date: "2029-01-01", status: "draft" });

    const { res, body } = await getHistory(env);
    expect(res.status).toBe(200);
    expect(body.editions.map((e) => e.slug)).toEqual(["vol-2", "vol-1"]);
  });

  it("marks an archived edition concluded and an upcoming published one not", async () => {
    const { env, rawDb } = seedEnv();
    insertEvent(rawDb, { slug: "past", date: "2022-05-22", status: "archived" });
    insertEvent(rawDb, { slug: "future", date: "2030-07-31", status: "published" });

    const { body } = await getHistory(env);
    const bySlug = Object.fromEntries(body.editions.map((e) => [e.slug, e]));
    expect(bySlug.past.concluded).toBe(true);
    expect(bySlug.future.concluded).toBe(false);
  });

  it("counts neither cancelled sets nor a reveal-mode edition's unannounced ones", async () => {
    const { env, rawDb } = seedEnv();
    const roost = insertVenue(rawDb, { name: "Roost" });
    const blue = insertVenue(rawDb, { name: "Blue Room" });
    const ev = insertEvent(rawDb, { slug: "ev", date: "2022-05-22", status: "archived" });
    insertBand(rawDb, { name: "Kept", event_id: ev.id, venue_id: roost.id });
    cancel(rawDb, insertBand(rawDb, { name: "Pulled", event_id: ev.id, venue_id: blue.id }));

    const reveal = insertEvent(rawDb, { slug: "reveal", date: "2022-06-01", status: "archived" });
    rawDb.prepare("UPDATE events SET reveal_mode = 1 WHERE id = ?").run(reveal.id);
    const hidden = insertBand(rawDb, { name: "Hidden", event_id: reveal.id, venue_id: roost.id });
    rawDb.prepare("UPDATE performances SET is_announced = 0 WHERE id = ?").run(hidden.id);

    const { body } = await getHistory(env);
    const bySlug = Object.fromEntries(body.editions.map((e) => [e.slug, e]));
    expect(bySlug.ev).toMatchObject({ sets: 1, venues: 1 });
    expect(bySlug.reveal).toMatchObject({ sets: 0, venues: 0 });
    // Neither the pulled set's venue nor the unannounced band leaks anywhere.
    expect(body.venues.map((v) => v.name)).toEqual(["Roost"]);
    expect(JSON.stringify(body)).not.toContain("Hidden");
  });

  it("counts a regular's DISTINCT editions, from 2 up, most first, with their first edition", async () => {
    const { env, rawDb } = seedEnv();
    const v = insertVenue(rawDb, { name: "Roost" });
    const e1 = insertEvent(rawDb, { name: "Vol 1", slug: "vol-1", date: "2022-05-22", status: "archived" });
    const e2 = insertEvent(rawDb, { name: "Vol 2", slug: "vol-2", date: "2022-07-31", status: "archived" });
    const e3 = insertEvent(rawDb, { name: "Vol 3", slug: "vol-3", date: "2022-10-09", status: "archived" });
    for (const e of [e1, e2, e3]) insertBand(rawDb, { name: "Always", event_id: e.id, venue_id: v.id });
    // Two sets at ONE edition are one edition, not two.
    insertBand(rawDb, { name: "Twice", event_id: e2.id, venue_id: v.id, start_time: "19:00" });
    insertBand(rawDb, { name: "Twice", event_id: e2.id, venue_id: v.id, start_time: "22:00" });
    insertBand(rawDb, { name: "Twice", event_id: e3.id, venue_id: v.id });
    insertBand(rawDb, { name: "Once", event_id: e1.id, venue_id: v.id, start_time: "21:00" });

    const { body } = await getHistory(env);
    expect(body.regulars.map((r) => [r.name, r.editions])).toEqual([
      ["Always", 3],
      ["Twice", 2],
    ]);
    expect(body.regulars[0].first).toEqual({ slug: "vol-1", name: "Vol 1", date: "2022-05-22" });
    expect(body.regulars[1].first.slug).toBe("vol-2");
  });

  it("gives each venue its edition count and its first and last edition date", async () => {
    const { env, rawDb } = seedEnv();
    const roost = insertVenue(rawDb, { name: "Roost" });
    const blue = insertVenue(rawDb, { name: "Blue Room" });
    const e1 = insertEvent(rawDb, { slug: "a", date: "2022-05-22", status: "archived" });
    const e2 = insertEvent(rawDb, { slug: "b", date: "2024-08-04", status: "archived" });
    insertBand(rawDb, { name: "X", event_id: e1.id, venue_id: roost.id });
    insertBand(rawDb, { name: "Y", event_id: e2.id, venue_id: roost.id });
    insertBand(rawDb, { name: "Z", event_id: e2.id, venue_id: blue.id });

    const { body } = await getHistory(env);
    expect(body.venues).toEqual([
      expect.objectContaining({ name: "Roost", editions: 2, first_date: "2022-05-22", last_date: "2024-08-04" }),
      expect.objectContaining({ name: "Blue Room", editions: 1, first_date: "2024-08-04", last_date: "2024-08-04" }),
    ]);
  });

  it("is served on the show-critical cache tier and behind the public-data gate", async () => {
    const { env } = seedEnv();
    const { res } = await getHistory(env);
    expect(res.headers.get("Cache-Control")).toMatch(/max-age=60\b/);

    env.PUBLIC_DATA_PUBLISH_ENABLED = "false";
    const gated = await history.onRequestGet({ env, request: new Request("http://localhost/api/history") });
    expect(gated.status).not.toBe(200);
  });
});
