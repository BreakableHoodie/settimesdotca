import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDBEnv, createTestDB, createTestEnv, insertBand, insertEvent } from "../../../test-utils";

// We'll import the handler under test. It expects to be called as
// onRequestPost({ request, env }) and uses env.DB. We also need to mock
// the middleware functions (checkPermission, auditLog) used by the handler.
import * as eventsHandler from "../../events.js";
import * as eventIdHandler from "../[id].js";
import * as archiveHandler from "../[id]/archive.js";
import * as publishHandler from "../[id]/publish.js";
import * as duplicateHandler from "../[id]/duplicate.js";

// Mock the middleware module used by the handler
vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context, level) => {
    const { request } = context;
    // Read a header we set in tests to control the role
    const role = request.headers.get("x-test-role") || "editor";
    const userId = role === "admin" ? 1 : role === "editor" ? 2 : 3;

    // Enforce minimal RBAC semantics for tests
    if (level === "admin" && role !== "admin") {
      return {
        error: true,
        response: new Response(JSON.stringify({ error: "Forbidden", message: "Admin required" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }

    // Allow editors/viewers for non-admin checks (tests assume editors can create/update/publish)
    return { error: false, user: { userId, role }, userId };
  },
  auditLog: async () => {
    // no-op
  },
}));

/**
 * events.test.js
 * Starter test file for the event management endpoints.
 * Replace the TODO sections with real imports that call your Cloudflare worker handlers
 * or refactor your API functions to be testable directly (recommended).
 */

let db;

beforeEach(() => {
  db = createTestDB();
});

describe("Event API - smoke tests", () => {
  it("can create an event in the test DB (helper)", () => {
    const event = insertEvent(db);
    expect(event).toBeTruthy();
    expect(event.name).toBe("Test Event");
    expect(event.slug).toBe("test-event");
  });

  // TODO: Replace the following placeholder tests with real endpoint tests.
  // Option A (recommended): Export handler functions from your worker files
  // so they accept an object `{ request, env }` and call them here with a mocked request + env.DB = db

  // Example placeholder structure:
  // import { onRequestPost as createEventHandler } from '../../../../functions/api/admin/events.js'
  // it('POST /api/admin/events - creates event', async () => { ... })

  it.todo("POST /api/admin/events - should create event with valid data");
  it.todo("POST /api/admin/events - should validate required fields");
  it.todo("PATCH /api/admin/events/:id - should update event fields");
  it.todo("POST /api/admin/events/:id/publish - should publish when bands >= 1");
  it.todo("POST /api/admin/events/:id/archive - should archive only for admin");
  it.todo("DELETE /api/admin/events/:id - should delete event and orphan bands");
});

describe("Event API - handler integration", () => {
  it("onRequestPost creates an event and returns 201", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Use today's local date (computed dynamically) so the test never ages into
    // a hardcoded "past" date, and so it exercises the timezone-robust past-date
    // check: an event dated *today* must not be rejected as being in the past.
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const body = {
      name: "Integration Event",
      slug: "integration-event",
      date: todayStr,
    };
    const request = new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Call the handler
    const res = await eventsHandler.onRequestPost({ request, env });
    expect(res).toBeInstanceOf(Response);
    const data = await res.json();
    expect(res.status).toBe(201);
    expect(data).toHaveProperty("event");
    expect(data.event.slug).toBe("integration-event");
  });

  it("accepts an event dated the Toronto-local today even after UTC has rolled over", async () => {
    // Regression for the #568 bug class in the create path: the past-date guard
    // must use the events' Toronto-local day, not the Worker's UTC day. At
    // 2026-07-11T01:00:00Z it is 9:00 PM EDT on 2026-07-10 — UTC says "today"
    // is the 11th, Toronto says the 10th. An event dated the 10th (the admin's
    // actual today) must be accepted; the old UTC-based check rejected it as
    // "in the past" every evening after 8 PM Eastern.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T01:00:00Z"));
    try {
      const rawDb = createTestDB();
      const env = { DB: createDBEnv(rawDb) };
      const request = new Request("https://example.test/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tonight Event", slug: "tonight-event", date: "2026-07-10" }),
      });

      const res = await eventsHandler.onRequestPost({ request, env });
      expect(res.status).toBe(201);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still rejects an event dated before the Toronto-local today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T01:00:00Z")); // 2026-07-10 21:00 EDT
    try {
      const rawDb = createTestDB();
      const env = { DB: createDBEnv(rawDb) };
      const request = new Request("https://example.test/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Yesterday Event", slug: "yesterday-event", date: "2026-07-09" }),
      });

      const res = await eventsHandler.onRequestPost({ request, env });
      expect(res.status).toBe(400);
    } finally {
      vi.useRealTimers();
    }
  });

  it("onRequestPatch updates event name", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create an event
    const ev = insertEvent(rawDb, { name: "Old Name", slug: "old-name" });

    const body = { name: "New Name" };
    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.name).toBe("New Name");
  });

  // ---------------------------------------------------------------------
  // #569 — events.doors_json create/update wiring, end-to-end through the
  // admin handlers (the validateDoorsJson unit tests in validation.test.js
  // cover the pure-function rules; these confirm the handlers actually call
  // it and persist/reflect the result).
  // ---------------------------------------------------------------------
  it("onRequestPost persists a valid doors_json map", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const body = {
      name: "BLR3",
      slug: "blr3-doors",
      date: "2099-07-10",
      end_date: "2099-07-11",
      doors_json: JSON.stringify({ "2099-07-10": "16:00", "2099-07-11": "10:00" }),
    };
    const request = new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify(body),
    });

    const res = await eventsHandler.onRequestPost({ request, env });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(JSON.parse(data.event.doors_json)).toEqual({ "2099-07-10": "16:00", "2099-07-11": "10:00" });

    const stored = rawDb.prepare("SELECT doors_json FROM events WHERE id = ?").get(data.event.id);
    expect(JSON.parse(stored.doors_json)).toEqual({ "2099-07-10": "16:00", "2099-07-11": "10:00" });
  });

  it("onRequestPost rejects doors_json with a date key outside the event span", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const body = {
      name: "Bad Doors Event",
      slug: "bad-doors-event",
      date: "2099-07-10",
      doors_json: JSON.stringify({ "2099-07-15": "16:00" }),
    };
    const request = new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify(body),
    });

    const res = await eventsHandler.onRequestPost({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toMatch(/between/);

    // Nothing was written — the whole request was rejected up front.
    const stored = rawDb.prepare("SELECT id FROM events WHERE slug = ?").get("bad-doors-event");
    expect(stored).toBeUndefined();
  });

  it("onRequestPatch updates doors_json, validated against the event's existing span", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const ev = insertEvent(rawDb, { name: "LWBC", slug: "lwbc-doors", date: "2099-08-02" });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify({ doors_json: JSON.stringify({ "2099-08-02": "18:30" }) }),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(JSON.parse(data.event.doors_json)).toEqual({ "2099-08-02": "18:30" });
  });

  it("onRequestPatch rejects a doors_json value with a bad HH:MM time format", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const ev = insertEvent(rawDb, { name: "LWBC", slug: "lwbc-doors-bad-time", date: "2099-08-02" });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify({ doors_json: JSON.stringify({ "2099-08-02": "6:30 PM" }) }),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(400);
  });

  it("onRequestPatch validates doors_json against a simultaneously-updated end_date (multi-day)", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Single-day at creation; this request both extends it to a 2nd day AND
    // sets doors for that new day in the same call — must validate against
    // the NEW span, not the stale single-day one.
    const ev = insertEvent(rawDb, { name: "BLR3", slug: "blr3-extend", date: "2099-07-10" });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify({
        end_date: "2099-07-11",
        doors_json: JSON.stringify({ "2099-07-10": "16:00", "2099-07-11": "10:00" }),
      }),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(JSON.parse(data.event.doors_json)).toEqual({ "2099-07-10": "16:00", "2099-07-11": "10:00" });
  });

  it("onRequestPatch response sanitizes a javascript: scheme in social_links untouched by the request (#493)", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const ev = insertEvent(rawDb, { name: "Scheme Event", slug: "scheme-event" });
    rawDb.prepare("UPDATE events SET social_links = ? WHERE id = ?").run(
      JSON.stringify({
        // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #493 admin read-path guard
        instagram: "javascript:alert(1)",
        x: "legit_handle",
        website: "https://example.com",
      }),
      ev.id,
    );

    // Update an unrelated field (city) — the request never touches social_links.
    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify({ city: "Kitchener" }),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.event.social_links).toBe("string");
    const parsed = JSON.parse(data.event.social_links);
    expect(parsed.instagram).toBeNull();
    expect(parsed.x).toBe("legit_handle");
    expect(parsed.website).toBe("https://example.com/");
  });

  it("GET /api/admin/events sanitizes a javascript: scheme in social_links across the list", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const ev = insertEvent(rawDb, { name: "Scheme List Event", slug: "scheme-list-event" });
    rawDb.prepare("UPDATE events SET social_links = ? WHERE id = ?").run(
      JSON.stringify({
        // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #493 admin read-path guard
        tiktok: "javascript:alert(1)",
        instagram: "legit_handle",
      }),
      ev.id,
    );

    const request = new Request("https://example.test/api/admin/events", {
      headers: { "x-test-role": "viewer" },
    });
    const res = await eventsHandler.onRequestGet({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    const found = data.events.find((e) => e.id === ev.id);
    expect(found).toBeDefined();
    expect(typeof found.social_links).toBe("string");
    const parsed = JSON.parse(found.social_links);
    expect(parsed.tiktok).toBeNull();
    expect(parsed.instagram).toBe("legit_handle");
  });

  it("publish endpoint requires >=1 band and publishes event", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create event and one band
    const ev = insertEvent(rawDb, { name: "Publishable", slug: "publishable" });
    insertBand(rawDb, { name: "Band A", event_id: ev.id });

    const body = { publish: true };
    const request = new Request(`https://example.test/api/admin/events/${ev.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await publishHandler.onRequestPost({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.is_published === 1 || data.event.is_published === true).toBeTruthy();
  });

  // Negative / validation cases
  it("create validation fails when required fields missing", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const body = { name: "", slug: "bad-slug" }; // missing date, name too short
    const request = new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify(body),
    });

    const res = await eventsHandler.onRequestPost({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("create validation fails for past dates and bad slug", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const pastBody = {
      name: "Past Event",
      slug: "past-event",
      date: "2000-01-01",
    };
    const reqPast = new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify(pastBody),
    });
    const rPast = await eventsHandler.onRequestPost({ request: reqPast, env });
    expect(rPast.status).toBe(400);

    const badSlugBody = {
      name: "Bad Slug",
      slug: "Invalid Slug!",
      date: "2026-01-01",
    };
    const reqSlug = new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify(badSlugBody),
    });
    const rSlug = await eventsHandler.onRequestPost({ request: reqSlug, env });
    expect(rSlug.status).toBe(400);
  });

  it("publish without bands returns 400", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const ev = insertEvent(rawDb, { name: "NoBands", slug: "nobands" });
    const body = { publish: true };
    const request = new Request(`https://example.test/api/admin/events/${ev.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await publishHandler.onRequestPost({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("create archived event requires admin role", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const body = {
      name: "Historical Event",
      slug: "historical-event",
      date: "2025-01-01",
      status: "archived",
    };
    const request = new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify(body),
    });

    const res = await eventsHandler.onRequestPost({ request, env });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Forbidden");
  });

  it("publish endpoint rejects archived events", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const ev = insertEvent(rawDb, {
      name: "ArchivedEvent",
      slug: "archived-event",
      status: "archived",
      is_published: 0,
    });

    const body = { publish: false };
    const request = new Request(`https://example.test/api/admin/events/${ev.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await publishHandler.onRequestPost({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("PATCH cannot change slug", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const ev = insertEvent(rawDb, {
      name: "NoSlugChange",
      slug: "no-slug-change",
    });
    const body = { slug: "new-slug" };
    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("archive requires admin role", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };
    const ev = insertEvent(rawDb, { name: "Protected", slug: "protected" });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}/archive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
    });

    const res = await archiveHandler.onRequestPost({ request, env });
    expect(res.status).toBe(403);
  });

  it("delete requires admin role", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };
    const ev = insertEvent(rawDb, {
      name: "ProtectedDelete",
      slug: "protected-delete",
    });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
    });

    const res = await eventIdHandler.onRequestDelete({ request, env });
    expect(res.status).toBe(403);
  });

  it("archive endpoint requires admin and archives the event", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create event
    const ev = insertEvent(rawDb, { name: "To Archive", slug: "to-archive" });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "admin" },
    });

    const res = await archiveHandler.onRequestPost({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.status).toBe("archived");
  });

  it("duplicate endpoint copies bands and creates new event", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Original event with bands
    const original = insertEvent(rawDb, { name: "Original", slug: "original" });
    insertBand(rawDb, { name: "CopyBand1", event_id: original.id });
    insertBand(rawDb, { name: "CopyBand2", event_id: original.id });

    const body = {
      name: "Copy of Original",
      date: "2026-01-01",
      slug: "original-copy",
    };
    const request = new Request(`https://example.test/api/admin/events/${original.id}/duplicate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await duplicateHandler.onRequestPost({
      request,
      env,
      params: { id: String(original.id) },
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.event.slug).toBe("original-copy");
    expect(data.bands_copied).toBeGreaterThanOrEqual(2);
  });

  it("duplicate endpoint does NOT copy doors_json to the new event (#569)", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const original = insertEvent(rawDb, {
      name: "BLR3 Source",
      slug: "blr3-doors-source",
      date: "2099-07-10",
      end_date: "2099-07-11",
      doors_json: JSON.stringify({ "2099-07-10": "16:00", "2099-07-11": "10:00" }),
    });

    // New event has a different date span — the source's date-keyed doors
    // times would no longer fall within it.
    const body = { name: "BLR4", date: "2100-07-09", slug: "blr4-doors-copy" };
    const request = new Request(`https://example.test/api/admin/events/${original.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-role": "editor" },
      body: JSON.stringify(body),
    });

    const res = await duplicateHandler.onRequestPost({
      request,
      env,
      params: { id: String(original.id) },
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.event.doors_json).toBeNull();

    const stored = rawDb.prepare("SELECT doors_json FROM events WHERE id = ?").get(data.event.id);
    expect(stored.doors_json).toBeNull();
  });

  it("duplicate endpoint sanitizes a legacy javascript: social_links value at the write path (#499)", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Original event, with a malicious social_links value seeded directly via
    // SQL (bypassing write-path validation) to simulate a pre-#483 legacy row
    // that never went through sanitizeEventSocialLinks.
    const original = insertEvent(rawDb, { name: "Legacy Source", slug: "legacy-source" });
    rawDb.prepare("UPDATE events SET social_links = ? WHERE id = ?").run(
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #499 write-path guard
      JSON.stringify({ instagram: "javascript:alert(1)", website: "javascript:alert(1)", x: "someHandle" }),
      original.id,
    );

    const body = {
      name: "Copy of Legacy Source",
      date: "2026-01-01",
      slug: "legacy-source-copy",
    };
    const request = new Request(`https://example.test/api/admin/events/${original.id}/duplicate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await duplicateHandler.onRequestPost({
      request,
      env,
      params: { id: String(original.id) },
    });
    expect(res.status).toBe(201);
    const data = await res.json();

    // Response echo is sanitized (defense-in-depth, unchanged behaviour).
    // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #499 write-path guard
    expect(data.event.social_links).not.toContain("javascript:");

    // The core assertion: the row actually stored in the DB is sanitized too,
    // not just the response. Query it directly rather than trusting the echo.
    const stored = rawDb.prepare("SELECT social_links FROM events WHERE id = ?").get(data.event.id);
    // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #499 write-path guard
    expect(stored.social_links).not.toContain("javascript:");
    const storedParsed = JSON.parse(stored.social_links);
    expect(storedParsed.instagram).toBeNull();
    expect(storedParsed.website).toBeNull();
    expect(storedParsed.x).toBe("someHandle");
  });

  it("duplicate endpoint sanitizes a legacy javascript: ticket_url value at the write path (#504)", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Original event, with a malicious ticket_url value seeded directly via
    // SQL (bypassing write-path validation) to simulate a pre-guard legacy
    // row that never went through the ticket_url URL validator.
    const original = insertEvent(rawDb, { name: "Legacy Ticket Source", slug: "legacy-ticket-source" });
    rawDb
      .prepare("UPDATE events SET ticket_url = ? WHERE id = ?")
      // eslint-disable-next-line no-script-url -- test fixture: intentional unsafe scheme, exercises the #504 write-path guard
      .run("javascript:alert(1)", original.id);

    const body = {
      name: "Copy of Legacy Ticket Source",
      date: "2026-01-01",
      slug: "legacy-ticket-source-copy",
    };
    const request = new Request(`https://example.test/api/admin/events/${original.id}/duplicate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await duplicateHandler.onRequestPost({
      request,
      env,
      params: { id: String(original.id) },
    });
    expect(res.status).toBe(201);
    const data = await res.json();

    // Response echo is sanitized (defense-in-depth, unchanged behaviour).
    expect(data.event.ticket_url).toBeNull();

    // The core assertion: the row actually stored in the DB is sanitized too,
    // not just the response. Query it directly rather than trusting the echo.
    const stored = rawDb.prepare("SELECT ticket_url FROM events WHERE id = ?").get(data.event.id);
    expect(stored.ticket_url).toBeNull();
  });

  it("delete endpoint requires admin and deletes event", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create event with band
    const ev = insertEvent(rawDb, { name: "ToDelete", slug: "to-delete" });
    insertBand(rawDb, { name: "SoloBand", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ confirmCascade: true }),
    });

    const res = await eventIdHandler.onRequestDelete({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTruthy();
  });

  it("delete cascades performances for the event", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });

    // Create event with band
    const ev = insertEvent(rawDb, {
      name: "OrphanEvent",
      slug: "orphan-event",
    });
    const b = insertBand(rawDb, { name: "OrphanBand", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      body: JSON.stringify({ confirmCascade: true }),
    });

    const res = await eventIdHandler.onRequestDelete({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTruthy();

    // Check performance was removed by cascade
    const row = rawDb.prepare("SELECT * FROM performances WHERE id = ?").get(b.id);
    expect(row).toBeUndefined();
  });

  it("delete with attached performances requires explicit confirmation", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });

    const ev = insertEvent(rawDb, {
      name: "ConfirmDelete",
      slug: "confirm-delete",
    });
    insertBand(rawDb, { name: "NeedsConfirm", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-test-role": "admin" },
    });

    const res = await eventIdHandler.onRequestDelete({ request, env });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("Confirmation required");
    expect(data.affected_performance_count).toBe(1);
  });

  it("PATCH can update date and status to published", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "PatchDate",
      slug: "patch-date",
      date: "2026-02-02",
    });

    const body = { date: "2026-03-03", status: "published" };
    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.date).toBe("2026-03-03");
    expect(data.event.status).toBe("published");
  });

  it("PATCH rejects archived status changes and requires archive endpoint", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "PatchArchive",
      slug: "patch-archive",
      date: "2026-02-02",
    });

    const body = { status: "archived" };
    const request = new Request(`https://example.test/api/admin/events/${ev.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify(body),
    });

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("publish endpoint rejects non-boolean publish field (string 'yes')", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };
    const ev = insertEvent(rawDb, {
      name: "TypeCheckEvent",
      slug: "type-check-event",
    });
    insertBand(rawDb, { name: "A Band", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify({ publish: "yes" }),
    });

    const res = await publishHandler.onRequestPost({ request, env });
    expect(res.status).toBe(400);
  });

  it("publish endpoint rejects non-boolean publish field (number 1)", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };
    const ev = insertEvent(rawDb, {
      name: "TypeCheckEvent2",
      slug: "type-check-event-2",
    });
    insertBand(rawDb, { name: "A Band 2", event_id: ev.id });

    const request = new Request(`https://example.test/api/admin/events/${ev.id}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify({ publish: 1 }),
    });

    const res = await publishHandler.onRequestPost({ request, env });
    expect(res.status).toBe(400);
  });
});

describe("Event duplication atomicity (P0-B2)", () => {
  it("cleans up newly created event if performance copy fails", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    const original = insertEvent(rawDb, {
      name: "SourceEvent",
      slug: "source-event",
    });
    insertBand(rawDb, { name: "BandA", event_id: original.id });

    // Make the performances INSERT...SELECT throw after the event INSERT succeeds
    const originalPrepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = (sql) => {
      if (sql.includes("INSERT INTO performances") && sql.includes("SELECT")) {
        return {
          bind: () => ({
            run: () => {
              throw new Error("simulated performances copy failure");
            },
          }),
        };
      }
      return originalPrepare(sql);
    };

    const request = new Request(`https://example.test/api/admin/events/${original.id}/duplicate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-role": "editor",
      },
      body: JSON.stringify({
        name: "Copy",
        date: "2027-01-01",
        slug: "copy-event",
      }),
    });

    const res = await duplicateHandler.onRequestPost({
      request,
      env,
      params: { id: String(original.id) },
    });
    expect(res.status).toBe(500);

    // The new event must have been cleaned up — no orphan
    const orphan = rawDb.prepare("SELECT id FROM events WHERE slug = 'copy-event'").get();
    expect(orphan).toBeUndefined();
  });
});
