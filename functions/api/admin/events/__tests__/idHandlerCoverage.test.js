// Coverage-gap tests for functions/api/admin/events/[id].js (#1042).
//
// events.test.js already covers the archived-event status guard (both
// directions: a status change on an archived event is refused, and a
// non-status edit on an archived event still succeeds) and the four
// concurrent-archive race predicates via the mutation-gate table. This file
// fills the remaining dark branches identified from a real coverage run:
// permission/id/not-found/malformed-body guards on all three handlers, every
// per-field validation branch in PATCH (name, date, end_date, status,
// description, city, ticket_url, poster_url, venue_info, social_links,
// theme_colors), the "no fields to update" short-circuit, PUT's
// non-"/publish" 404 and not-found branch, DELETE's invalid-id/not-found
// branches and its zero-performances success message, and all three
// handlers' catch(error) 500 paths.
//
// Deliberately NOT covered here: functions/api/admin/events/[id].js's own
// header comment (line 4) lists "POST .../duplicate - Duplicate event", but
// that handler actually lives in functions/api/admin/events/[id]/duplicate.js
// and is exercised by events.test.js's "Event duplication atomicity (P0-B2)"
// describe block. There is no duplication/rollback code in this file to test.
//
// Unlike events.test.js, this file does NOT mock ../../_middleware.js — it
// exercises the REAL checkPermission via `data.user`, the same pattern
// [id]/edit.test.js uses, so the 403 tests below are exercising real RBAC
// rather than a test double's approximation of it.

import { describe, expect, it } from "vitest";
import { onRequestPatch, onRequestPut, onRequestDelete } from "../[id].js";
import { createTestEnv, insertEvent } from "../../../test-utils.js";

function authedUser(role, id) {
  return { role, id, userId: id, email: `${role}@test` };
}

function patchRequest(eventId, body, { rawBody } = {}) {
  return new Request(`https://example.test/api/admin/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

function putRequest(eventId, body = {}, { path = "publish" } = {}) {
  const suffix = path ? `/${path}` : "";
  return new Request(`https://example.test/api/admin/events/${eventId}${suffix}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(eventId, { query = "" } = {}) {
  return new Request(`https://example.test/api/admin/events/${eventId}${query}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
  });
}

// Wraps env.DB.prepare so the FIRST statement whose SQL contains `match`
// throws instead of running. Used to force a handler's catch(error) branch
// without needing a real D1 failure.
function throwOnStatement(env, match) {
  const originalPrepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => {
    if (sql.includes(match)) {
      throw new Error("simulated DB failure");
    }
    return originalPrepare(sql);
  };
}

describe("PATCH /api/admin/events/:id — guard and validation branches", () => {
  it("viewer role is forbidden (403) and does not write", async () => {
    const { env, rawDb } = createTestEnv({ role: "viewer" });
    const ev = insertEvent(rawDb, { name: "Untouched", slug: "patch-forbidden" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { name: "Renamed" }),
      env,
      data: { user: authedUser("viewer", 3) },
    });

    expect(res.status).toBe(403);
    const row = rawDb.prepare("SELECT name FROM events WHERE id = ?").get(ev.id);
    expect(row.name).toBe("Untouched");
  });

  it("non-numeric event id is rejected (400)", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPatch({
      request: patchRequest("abc", { name: "Renamed" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Invalid event ID");
  });

  it("a nonexistent event returns 404", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPatch({
      request: patchRequest(999999, { name: "Renamed" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toBe("Event not found");
  });

  it("a JSON array body is rejected as not an object (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-array-body" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, null, { rawBody: "[]" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Request body must be a JSON object");
  });

  it("an empty body updates nothing and is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-empty-body" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, {}),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("No fields to update");
  });

  it("ticketLink is accepted as a fallback when ticket_url is absent, and persists", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-ticketlink-fallback" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { ticketLink: "https://tickets.example.com/show" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.ticket_url).toBe("https://tickets.example.com/show");
    const row = rawDb.prepare("SELECT ticket_url FROM events WHERE id = ?").get(ev.id);
    expect(row.ticket_url).toBe("https://tickets.example.com/show");
  });

  it("name shorter than 3 characters is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-name-too-short" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { name: "ab" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Name must be at least 3 characters");
  });

  it("an invalid date format is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-bad-date" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { date: "not-a-date" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Date must be in YYYY-MM-DD format");
  });

  it("an invalid end_date format is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-bad-end-date" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { end_date: "nope" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Date must be in YYYY-MM-DD format");
  });

  it("an end_date before the event's start date is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-end-before-start", date: "2026-10-15" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { end_date: "2026-06-01" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("End date must be on or after the event start date");
  });

  it("doors_json validates against a simultaneously-updated START date", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-date-and-doors", date: "2099-08-02" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, {
        date: "2099-08-05",
        doors_json: JSON.stringify({ "2099-08-05": "18:00" }),
      }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.date).toBe("2099-08-05");
    expect(JSON.parse(data.event.doors_json)).toEqual({ "2099-08-05": "18:00" });
  });

  it("an invalid status value is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-bad-status" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { status: "bogus" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Status must be: draft, published, or archived");
  });

  it("a non-string description is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-desc-not-string" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { description: 12345 }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Description must be a string");
  });

  it("a description over the length limit is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-desc-too-long" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { description: "x".repeat(5001) }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Description must be no more than 5000 characters");
  });

  it("a non-string city is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-city-not-string" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { city: 12345 }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("City must be a string");
  });

  it("a city over the length limit is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-city-too-long" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { city: "x".repeat(101) }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("City must be no more than 100 characters");
  });

  it("a non-string ticket_url is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-ticket-not-string" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { ticket_url: 12345 }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Ticket link must be a string");
  });

  it("a ticket_url that isn't a valid URL is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-ticket-invalid-url" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { ticket_url: "not a url" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Ticket link must be a valid URL");
  });

  it("a ticket_url over the length limit is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-ticket-too-long" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { ticket_url: "https://example.com/" + "a".repeat(490) }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Ticket link must be no more than 500 characters");
  });

  it("a non-string poster_url is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-poster-not-string" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { poster_url: 12345 }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Poster image must be a string");
  });

  it("a poster_url over the length limit is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-poster-too-long" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { poster_url: "https://example.com/" + "a".repeat(490) }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Poster image must be no more than 500 characters");
  });

  it("a valid venue_info array is sanitized and persisted", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-venue-info-valid" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, {
        venue_info: JSON.stringify([{ name: "Main Stage", address: "123 King St N" }]),
      }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(JSON.parse(data.event.venue_info)).toEqual([
      { name: "Main Stage", address: "123 King St N", note: null, googleMaps: null },
    ]);
    const row = rawDb.prepare("SELECT venue_info FROM events WHERE id = ?").get(ev.id);
    expect(JSON.parse(row.venue_info)).toEqual([
      { name: "Main Stage", address: "123 King St N", note: null, googleMaps: null },
    ]);
  });

  it("a venue_info value that isn't a JSON array is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-venue-info-not-array" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { venue_info: { note: "not an array" } }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Venue info must be a JSON array");
  });

  it("a venue_info array over the aggregate length limit is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-venue-info-too-long" });

    const venues = Array.from({ length: 40 }, (_, i) => ({
      name: `Venue ${i}`,
      address: "A".repeat(180),
    }));

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { venue_info: JSON.stringify(venues) }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Venue info must be no more than 5000 characters");
  });

  it("a valid social_links object is sanitized and persisted", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-social-links-valid" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { social_links: JSON.stringify({ website: "https://example.com" }) }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT social_links FROM events WHERE id = ?").get(ev.id);
    expect(JSON.parse(row.social_links).website).toBe("https://example.com/");
  });

  it("a malformed social_links value is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-social-links-malformed" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { social_links: "{not valid json" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Social links must be valid JSON");
  });

  it("a social_links object over the aggregate length limit is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-social-links-too-long" });

    const pad = "x".repeat(470);
    const res = await onRequestPatch({
      request: patchRequest(ev.id, {
        social_links: JSON.stringify({
          website: `https://example.com/${pad}`,
          instagram: `https://instagram.com/${pad}`,
          facebook: `https://facebook.com/${pad}`,
          x: `https://x.com/${pad}`,
          tiktok: `https://tiktok.com/${pad}`,
          youtube: `https://youtube.com/${pad}`,
          bandcamp: `https://bandcamp.com/${pad}`,
        }),
      }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Social links must be no more than 2000 characters");
  });

  it("theme_colors as a valid JSON string is accepted verbatim", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-theme-colors-string" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { theme_colors: '{"primary":"#123456"}' }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT theme_colors FROM events WHERE id = ?").get(ev.id);
    expect(row.theme_colors).toBe('{"primary":"#123456"}');
  });

  it("theme_colors as a plain object is stringified and accepted", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-theme-colors-object" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { theme_colors: { primary: "#654321" } }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT theme_colors FROM events WHERE id = ?").get(ev.id);
    expect(JSON.parse(row.theme_colors)).toEqual({ primary: "#654321" });
  });

  it("theme_colors as an invalid JSON string is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-theme-colors-bad-json" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { theme_colors: "{not valid" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Theme colors must be valid JSON");
  });

  it("theme_colors of a type that is neither string nor object is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-theme-colors-wrong-type" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { theme_colors: 42 }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Theme colors must be valid JSON");
  });

  it("theme_colors explicitly set to null clears the column", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-theme-colors-null" });
    rawDb.prepare("UPDATE events SET theme_colors = ? WHERE id = ?").run('{"primary":"#000"}', ev.id);

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { theme_colors: null }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT theme_colors FROM events WHERE id = ?").get(ev.id);
    expect(row.theme_colors).toBeNull();
  });

  it("a theme_colors object over the length limit is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-theme-colors-too-long" });

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { theme_colors: { note: "x".repeat(1200) } }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Theme colors must be no more than 1000 characters");
  });

  // Simulates a concurrent DELETE landing between the initial existence read
  // and the (unguarded, because this is a non-status edit) UPDATE. Unlike the
  // status-guard races in events.test.js, a non-status PATCH carries no
  // `AND status IN (...)` predicate, so the only way its UPDATE can match zero
  // rows is the row itself vanishing in that window -- exercising the OTHER
  // arm of the `patchesStatus ? 409 : 404` branch (only the 409 arm had a test
  // before this file).
  it("a non-status PATCH returns 404 when the row is deleted concurrently", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-race-delete" });

    const originalPrepare = env.DB.prepare.bind(env.DB);
    let fired = false;
    env.DB.prepare = (sql) => {
      if (!fired && sql.includes("UPDATE events SET")) {
        fired = true;
        rawDb.prepare("DELETE FROM events WHERE id = ?").run(ev.id);
      }
      return originalPrepare(sql);
    };

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { description: "Never lands" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
    expect(data.message).toBe("Event not found");
  });

  it("returns 500 and a generic message when the UPDATE statement throws", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "patch-db-explodes" });
    throwOnStatement(env, "UPDATE events SET");

    const res = await onRequestPatch({
      request: patchRequest(ev.id, { name: "New Name" }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Database error");
    expect(data.message).toBe("Failed to update event");

    // Nothing was written -- the throw happened inside the UPDATE itself.
    const row = rawDb.prepare("SELECT name FROM events WHERE id = ?").get(ev.id);
    expect(row.name).toBe("E");
  });
});

describe("PUT /api/admin/events/:id/publish — guard and error branches", () => {
  it("viewer role is forbidden (403)", async () => {
    const { env, rawDb } = createTestEnv({ role: "viewer" });
    const ev = insertEvent(rawDb, { name: "E", slug: "put-forbidden", status: "draft" });

    const res = await onRequestPut({
      request: putRequest(ev.id),
      env,
      data: { user: authedUser("viewer", 3) },
    });

    expect(res.status).toBe(403);
    const row = rawDb.prepare("SELECT status FROM events WHERE id = ?").get(ev.id);
    expect(row.status).toBe("draft");
  });

  it("non-numeric event id is rejected (400)", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPut({
      request: putRequest("abc"),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Invalid event ID");
  });

  it("a nonexistent event returns 404", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPut({
      request: putRequest(999999),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toBe("Event not found");
  });

  // The path does not end in "/publish" -- this handler's only other
  // operation, and it is a plain 404 rather than routing anywhere. Nothing
  // about the event needs to exist for this branch: it returns before any
  // DB read.
  it("a path that does not end in /publish returns 404 Unknown operation", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPut({
      request: putRequest(1, {}, { path: null }),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.message).toBe("Unknown operation");
  });

  it("returns 500 and a generic message when the UPDATE statement throws", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, { name: "E", slug: "put-db-explodes", status: "draft" });
    throwOnStatement(env, "UPDATE events");

    const res = await onRequestPut({
      request: putRequest(ev.id),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Database error");
    expect(data.message).toBe("Failed to update event");

    const row = rawDb.prepare("SELECT status FROM events WHERE id = ?").get(ev.id);
    expect(row.status).toBe("draft");
  });
});

describe("DELETE /api/admin/events/:id — guard and error branches", () => {
  it("non-numeric event id is rejected (400)", async () => {
    const { env } = createTestEnv({ role: "admin" });

    const res = await onRequestDelete({
      request: deleteRequest("abc"),
      env,
      data: { user: authedUser("admin", 1) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid event ID");
  });

  it("a nonexistent event returns 404", async () => {
    const { env } = createTestEnv({ role: "admin" });

    const res = await onRequestDelete({
      request: deleteRequest(999999),
      env,
      data: { user: authedUser("admin", 1) },
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Event not found");
  });

  it("deleting an event with zero performances succeeds without the cascade note", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const ev = insertEvent(rawDb, { name: "NoBandsEvent", slug: "delete-no-bands" });

    const res = await onRequestDelete({
      request: deleteRequest(ev.id),
      env,
      data: { user: authedUser("admin", 1) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).not.toMatch(/performance record/);

    const row = rawDb.prepare("SELECT id FROM events WHERE id = ?").get(ev.id);
    expect(row).toBeUndefined();
  });

  it("returns 500 and writes nothing when the batch throws", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });
    const ev = insertEvent(rawDb, { name: "ExplodeDelete", slug: "delete-db-explodes" });
    env.DB.batch = () => {
      throw new Error("simulated batch failure");
    };

    const res = await onRequestDelete({
      request: deleteRequest(ev.id),
      env,
      data: { user: authedUser("admin", 1) },
    });

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Database operation failed");

    const row = rawDb.prepare("SELECT id FROM events WHERE id = ?").get(ev.id);
    expect(row).toBeTruthy();
  });
});
