// Tests for PUT /api/admin/events/:id/edit (functions/api/admin/events/[id]/edit.js).
//
// Event identity fields (name/date/slug/ticket_url) via validateId +
// safeReflectSocialLinksString, with audit logging. This handler was at 0%
// execution coverage (see docs/REPORT_CARD_REVIEW.md's follow-up gate) —
// these tests exercise the real exported onRequestPut against the shared
// better-sqlite3 harness rather than a hand-rolled mock DB.

import { describe, expect, test } from "vitest";
import { onRequestPut } from "../[id]/edit.js";
import { createTestEnv, insertEvent } from "../../../test-utils.js";

function authedUser(role, id) {
  return { role, id, userId: id, email: `${role}@test` };
}

function putRequest(eventId, body, { headers = {}, rawBody } = {}) {
  return new Request(`https://example.test/api/admin/events/${eventId}/edit`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

describe("PUT /api/admin/events/:id/edit", () => {
  test("valid PUT updates the event row and writes an audit_log row", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "Old Name", slug: "old-slug", date: "2026-10-01" });

    const res = await onRequestPut({
      request: putRequest(event.id, {
        name: "New Name",
        date: "2026-10-11",
        slug: "new-slug",
        ticket_url: "https://tickets.example.com/new-slug",
      }),
      env,
      params: { id: String(event.id) },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.event.name).toBe("New Name");
    expect(data.event.slug).toBe("new-slug");
    expect(data.event.ticket_url).toBe("https://tickets.example.com/new-slug");

    const row = rawDb.prepare("SELECT * FROM events WHERE id = ?").get(event.id);
    expect(row.name).toBe("New Name");
    expect(row.date).toBe("2026-10-11");
    expect(row.slug).toBe("new-slug");
    expect(row.ticket_url).toBe("https://tickets.example.com/new-slug");

    const audit = rawDb.prepare("SELECT * FROM audit_log WHERE action = 'event.updated'").get();
    expect(audit).toBeTruthy();
    expect(audit.resource_type).toBe("event");
    expect(audit.resource_id).toBe(event.id);
    expect(audit.user_id).toBe(2);
    expect(JSON.parse(audit.details)).toEqual({
      name: "New Name",
      date: "2026-10-11",
      slug: "new-slug",
      ticket_url: "https://tickets.example.com/new-slug",
    });
  });

  test("ticket_url omitted is stored as null, not the empty string", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "Has Ticket", slug: "has-ticket-slug", date: "2026-10-01" });
    rawDb.prepare("UPDATE events SET ticket_url = ? WHERE id = ?").run("https://old.example.com", event.id);

    const res = await onRequestPut({
      request: putRequest(event.id, { name: "Has Ticket", date: "2026-10-01", slug: "has-ticket-slug" }),
      env,
      params: { id: String(event.id) },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT ticket_url FROM events WHERE id = ?").get(event.id);
    expect(row.ticket_url).toBeNull();
  });

  test("non-numeric id is rejected before any DB or auth work (400)", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPut({
      request: putRequest("abc", { name: "N", date: "2026-10-01", slug: "s" }),
      env,
      params: { id: "abc" },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("ID must be a positive integer");
  });

  test("unauthenticated request is refused with 401", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "E", slug: "e-slug", date: "2026-10-01" });

    const res = await onRequestPut({
      request: putRequest(event.id, { name: "New", date: "2026-10-01", slug: "e-slug" }),
      env,
      params: { id: String(event.id) },
      data: {},
    });

    expect(res.status).toBe(401);
  });

  test("viewer role is forbidden (403) and does not write the row", async () => {
    const { env, rawDb } = createTestEnv({ role: "viewer" });
    const event = insertEvent(rawDb, { name: "Untouched", slug: "untouched-slug", date: "2026-10-01" });

    const res = await onRequestPut({
      request: putRequest(event.id, { name: "New", date: "2026-10-01", slug: "untouched-slug" }),
      env,
      params: { id: String(event.id) },
      data: { user: authedUser("viewer", 3) },
    });

    expect(res.status).toBe(403);
    const row = rawDb.prepare("SELECT name FROM events WHERE id = ?").get(event.id);
    expect(row.name).toBe("Untouched");
  });

  test("a JSON `null` body is rejected by parseJsonObjectBody's own check (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "E", slug: "null-body-slug", date: "2026-10-01" });

    const res = await onRequestPut({
      request: putRequest(event.id, null, { rawBody: "null" }),
      env,
      params: { id: String(event.id) },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Request body must be a JSON object");
  });

  // parseJsonObjectBody's `.catch(() => ({}))` means an UNPARSEABLE body resolves to
  // `{}`, not null (functions/utils/request.js's own header comment says so). So a
  // malformed body does NOT hit the "must be a JSON object" 400 above -- it falls
  // through to ordinary required-field validation instead. Pinning that here rather
  // than assuming both malformed-body cases share one response.
  test("a malformed (unparseable) JSON body falls through to field validation, not the JSON-object check", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "E", slug: "malformed-body-slug", date: "2026-10-01" });

    const res = await onRequestPut({
      request: putRequest(event.id, null, { rawBody: "{not valid json" }),
      env,
      params: { id: String(event.id) },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toBe("Name, date, and slug are required");
  });

  test("ticket_url not starting with http(s):// is rejected (400)", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "E", slug: "bad-ticket-slug", date: "2026-10-01" });

    const res = await onRequestPut({
      request: putRequest(event.id, {
        name: "E",
        date: "2026-10-01",
        slug: "bad-ticket-slug",
        ticket_url: "not-a-url",
      }),
      env,
      params: { id: String(event.id) },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/Ticket link must be a valid URL/);
  });

  test("editing a non-existent event returns 404", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPut({
      request: putRequest(999999, { name: "N", date: "2026-10-01", slug: "ghost-slug" }),
      env,
      params: { id: "999999" },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(404);
  });

  test("slug already used by a different event is a 409 conflict, and the row is left unchanged", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const eventA = insertEvent(rawDb, { name: "A", slug: "slug-a", date: "2026-10-01" });
    insertEvent(rawDb, { name: "B", slug: "slug-b", date: "2026-10-02" });

    const res = await onRequestPut({
      request: putRequest(eventA.id, { name: "A renamed", date: "2026-10-01", slug: "slug-b" }),
      env,
      params: { id: String(eventA.id) },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.message).toBe("An event with this slug already exists");

    const row = rawDb.prepare("SELECT name, slug FROM events WHERE id = ?").get(eventA.id);
    expect(row.name).toBe("A");
    expect(row.slug).toBe("slug-a");
  });

  test("keeping the same slug on the same event is not treated as a conflict", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const event = insertEvent(rawDb, { name: "Same Slug", slug: "same-slug", date: "2026-10-01" });

    const res = await onRequestPut({
      request: putRequest(event.id, { name: "Same Slug Renamed", date: "2026-10-01", slug: "same-slug" }),
      env,
      params: { id: String(event.id) },
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const row = rawDb.prepare("SELECT name FROM events WHERE id = ?").get(event.id);
    expect(row.name).toBe("Same Slug Renamed");
  });
});
