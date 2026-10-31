import { describe, expect, test } from "vitest";
import { onRequestGet } from "../ical.js";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../test-utils.js";

// `?band=<id>` is the per-artist "Add to my calendar" subscription. It filters
// the existing feed, so these tests pin only what the filter adds; the calendar
// rules themselves are covered in ical.test.js.
describe("GET /api/feeds/ical?band= — one artist's calendar", () => {
  const seed = () => {
    const { env, rawDb } = createTestEnv();
    env.PUBLIC_DATA_PUBLISH_ENABLED = "true";
    const event = insertEvent(rawDb, { name: "Band Feed Fest", slug: "band-feed-fest", date: "2099-07-04" });
    rawDb.prepare("UPDATE events SET status = 'published' WHERE id=?").run(event.id);
    const venue = insertVenue(rawDb, { name: "Blue Room" });
    const a = insertBand(rawDb, {
      name: "Deer, Fang",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    const b = insertBand(rawDb, {
      name: "Sam Nabi",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "21:30",
      end_time: "22:30",
    });
    return { env, rawDb, event, venue, a: a.band_profile_id, b: b.band_profile_id };
  };

  const get = (env, qs) => onRequestGet({ request: new Request(`https://example.test/api/feeds/ical${qs}`), env });

  test("returns only that band's sets, while the unfiltered feed still carries both", async () => {
    const { env, a } = seed();

    const filtered = await (await get(env, `?band=${a}`)).text();
    expect(filtered.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(filtered).toContain("SUMMARY:Deer\\, Fang");
    expect(filtered).not.toContain("Sam Nabi");

    const all = await (await get(env, "")).text();
    expect(all.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(all).toContain("X-WR-CALNAME:settimes.ca");
  });

  test("names the calendar and the download after the band", async () => {
    const { env, b } = seed();
    const res = await get(env, `?band=${b}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain('filename="sam-nabi.ics"');
    expect(await res.text()).toContain("X-WR-CALNAME:Sam Nabi on settimes.ca");
  });

  test("escapes the band name in the calendar name", async () => {
    const { env, a } = seed();
    expect(await (await get(env, `?band=${a}`)).text()).toContain("X-WR-CALNAME:Deer\\, Fang on settimes.ca");
  });

  test("a band with no upcoming sets is a valid, named, empty calendar", async () => {
    const { env, rawDb, venue } = seed();
    // Public (it played a past, archived edition) but nothing upcoming: the
    // off-season state every band is in between editions.
    const past = insertEvent(rawDb, { name: "Last Year", slug: "last-year", date: "2020-07-04" });
    rawDb.prepare("UPDATE events SET status = 'archived' WHERE id=?").run(past.id);
    const idle = insertBand(rawDb, {
      name: "Off Season",
      event_id: past.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });

    const res = await get(env, `?band=${idle.band_profile_id}`);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("BEGIN:VTIMEZONE");
    expect(text).toContain("END:VCALENDAR");
    expect(text).toContain("X-WR-CALNAME:Off Season on settimes.ca");
    expect(text).not.toContain("BEGIN:VEVENT");
  });

  test("keeps the calendar rules: a cancelled set is STATUS:CANCELLED and an unscheduled one is omitted", async () => {
    const { env, rawDb, event, venue, a } = seed();
    rawDb.prepare("UPDATE performances SET is_cancelled = 1 WHERE band_profile_id = ?").run(a);
    insertBand(rawDb, { name: "Deer, Fang", event_id: event.id, venue_id: venue.id, start_time: null, end_time: null });

    const text = await (await get(env, `?band=${a}`)).text();
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(text).toContain("STATUS:CANCELLED");
  });

  test("combines with the genre filter", async () => {
    const { env, rawDb, a } = seed();
    rawDb.prepare("UPDATE band_profiles SET genre = 'Punk' WHERE id = ?").run(a);
    expect(await (await get(env, `?band=${a}&genre=punk`)).text()).toContain("BEGIN:VEVENT");
    expect(await (await get(env, `?band=${a}&genre=jazz`)).text()).not.toContain("BEGIN:VEVENT");
  });

  // The band page's rule: an artist booked only on a draft event is not public
  // yet, so the feed must not name them in X-WR-CALNAME either.
  test("a band booked only on a draft event is a 404, not a named calendar", async () => {
    const { env, rawDb, venue } = seed();
    const draft = insertEvent(rawDb, { name: "Unannounced", slug: "unannounced", date: "2099-08-01" });
    rawDb.prepare("UPDATE events SET status = 'draft' WHERE id=?").run(draft.id);
    const secret = insertBand(rawDb, {
      name: "Secret Headliner",
      event_id: draft.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });

    const res = await get(env, `?band=${secret.band_profile_id}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Secret Headliner");
  });

  test("a band whose only set is unannounced on a reveal-mode event is a 404", async () => {
    const { env, rawDb, venue } = seed();
    const reveal = insertEvent(rawDb, { name: "Reveal Fest", slug: "reveal-fest", date: "2099-09-01" });
    rawDb.prepare("UPDATE events SET status = 'published', reveal_mode = 1 WHERE id=?").run(reveal.id);
    const hidden = insertBand(rawDb, {
      name: "Not Yet Revealed",
      event_id: reveal.id,
      venue_id: venue.id,
      start_time: "22:00",
      end_time: "23:00",
    });
    rawDb.prepare("UPDATE performances SET is_announced = 0 WHERE id=?").run(hidden.id);

    const res = await get(env, `?band=${hidden.band_profile_id}`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Not Yet Revealed");
  });

  test("a band with no sets at all is a 404", async () => {
    const { env, rawDb } = seed();
    const bare = rawDb
      .prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)")
      .run("Never Booked", "never booked");
    expect((await get(env, `?band=${bare.lastInsertRowid}`)).status).toBe(404);
  });

  test("an unknown band id is a 404 and writes no calendar", async () => {
    const { env } = seed();
    const res = await get(env, "?band=999999");
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
  });

  test.each(["0", "-1", "abc", "1.5", "99999999999", "", "01"])("malformed band id %j is a 400", async (bad) => {
    const { env } = seed();
    const res = await get(env, `?band=${encodeURIComponent(bad)}`);
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("Invalid band id");
  });
});
