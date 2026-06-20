import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDBEnv,
  createTestDB,
  createTestEnv,
  insertBand,
  insertEvent,
} from "../../../test-utils";

// We'll import the handler under test. It expects to be called as
// onRequestPost({ request, env }) and uses env.DB. We also need to mock
// the middleware functions (checkPermission, auditLog) used by the handler.
import * as eventsHandler from "../../events.js";
import * as eventIdHandler from "../[id].js";
import * as archiveHandler from "../[id]/archive.js";
import * as publishHandler from "../[id]/publish.js";

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
        response: new Response(
          JSON.stringify({ error: "Forbidden", message: "Admin required" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
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
  it.todo(
    "POST /api/admin/events/:id/publish - should publish when bands >= 1",
  );
  it.todo("POST /api/admin/events/:id/archive - should archive only for admin");
  it.todo(
    "DELETE /api/admin/events/:id - should delete event and orphan bands",
  );
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

  it("onRequestPatch updates event name", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create an event
    const ev = insertEvent(rawDb, { name: "Old Name", slug: "old-name" });

    const body = { name: "New Name" };
    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.event.name).toBe("New Name");
  });

  it("publish endpoint requires >=1 band and publishes event", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create event and one band
    const ev = insertEvent(rawDb, { name: "Publishable", slug: "publishable" });
    insertBand(rawDb, { name: "Band A", event_id: ev.id });

    const body = { publish: true };
    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

    const res = await publishHandler.onRequestPost({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(
      data.event.is_published === 1 || data.event.is_published === true,
    ).toBeTruthy();
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
    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

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
    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

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
    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

    const res = await eventIdHandler.onRequestPatch({ request, env });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation error");
  });

  it("archive requires admin role", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };
    const ev = insertEvent(rawDb, { name: "Protected", slug: "protected" });

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}/archive`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
      },
    );

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

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
      },
    );

    const res = await eventIdHandler.onRequestDelete({ request, env });
    expect(res.status).toBe(403);
  });

  it("archive endpoint requires admin and archives the event", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create event
    const ev = insertEvent(rawDb, { name: "To Archive", slug: "to-archive" });

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}/archive`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      },
    );

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
    const request = new Request(
      `https://example.test/api/admin/events/${original.id}/duplicate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

    const res = await eventIdHandler.onRequestPost({ request, env });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.event.slug).toBe("original-copy");
    expect(data.bandsCopied).toBeGreaterThanOrEqual(2);
  });

  it("delete endpoint requires admin and deletes event", async () => {
    const rawDb = createTestDB();
    const env = { DB: createDBEnv(rawDb) };

    // Create event with band
    const ev = insertEvent(rawDb, { name: "ToDelete", slug: "to-delete" });
    insertBand(rawDb, { name: "SoloBand", event_id: ev.id });

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-test-role": "admin" },
        body: JSON.stringify({ confirmCascade: true }),
      },
    );

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

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-test-role": "admin" },
        body: JSON.stringify({ confirmCascade: true }),
      },
    );

    const res = await eventIdHandler.onRequestDelete({ request, env });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBeTruthy();

    // Check performance was removed by cascade
    const row = rawDb
      .prepare("SELECT * FROM performances WHERE id = ?")
      .get(b.id);
    expect(row).toBeUndefined();
  });

  it("delete with attached performances requires explicit confirmation", async () => {
    const { env, rawDb } = createTestEnv({ role: "admin" });

    const ev = insertEvent(rawDb, {
      name: "ConfirmDelete",
      slug: "confirm-delete",
    });
    insertBand(rawDb, { name: "NeedsConfirm", event_id: ev.id });

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-test-role": "admin" },
      },
    );

    const res = await eventIdHandler.onRequestDelete({ request, env });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("Confirmation required");
    expect(data.affectedPerformanceCount).toBe(1);
  });

  it("PATCH can update date and status to published", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    const ev = insertEvent(rawDb, {
      name: "PatchDate",
      slug: "patch-date",
      date: "2026-02-02",
    });

    const body = { date: "2026-03-03", status: "published" };
    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

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
    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify(body),
      },
    );

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

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify({ publish: "yes" }),
      },
    );

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

    const request = new Request(
      `https://example.test/api/admin/events/${ev.id}/publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-role": "editor",
        },
        body: JSON.stringify({ publish: 1 }),
      },
    );

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

    const request = new Request(
      `https://example.test/api/admin/events/${original.id}/duplicate`,
      {
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
      },
    );

    const res = await eventIdHandler.onRequestPost({ request, env });
    expect(res.status).toBe(500);

    // The new event must have been cleaned up — no orphan
    const orphan = rawDb
      .prepare("SELECT id FROM events WHERE slug = 'copy-event'")
      .get();
    expect(orphan).toBeUndefined();
  });
});
