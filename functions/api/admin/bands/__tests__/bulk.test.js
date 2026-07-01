// Bulk band operations endpoint tests
// DELETE /api/admin/bands/bulk   – existing coverage
// PATCH  /api/admin/bands/bulk   – conflict-gating coverage (issue #474)
import { describe, expect, test, vi } from "vitest";

vi.mock("../../_middleware.js", () => ({
  checkPermission: async (context) => {
    const role = context?.data?.user?.role || context?.request?.headers?.get("x-test-role");
    if (!role) {
      return {
        error: true,
        response: new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
    return { error: false, user: { userId: 1, email: "a@b.c", role }, userId: 1 };
  },
  auditLog: vi.fn(async () => {}),
}));

import { onRequestDelete, onRequestPatch } from "../bulk.js";
import { createTestEnv, insertBand, insertVenue, insertEvent } from "../../../test-utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deleteRequest(env, bandIds) {
  return onRequestDelete({
    request: new Request("https://example.test/api/admin/bands/bulk", {
      method: "DELETE",
      headers: { "x-test-role": "editor", "content-type": "application/json" },
      body: JSON.stringify({ band_ids: bandIds }),
    }),
    env,
    data: { user: { userId: 1, email: "a@b.c", role: "editor" } },
  });
}

function patchRequest(env, body, role = "editor") {
  return onRequestPatch({
    request: new Request("https://example.test/api/admin/bands/bulk", {
      method: "PATCH",
      headers: { "x-test-role": role, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    data: { user: { userId: 1, email: "a@b.c", role } },
  });
}

// ---------------------------------------------------------------------------
// DELETE tests (existing)
// ---------------------------------------------------------------------------

describe("DELETE /api/admin/bands/bulk", () => {
  test("reports success:false when some ids could not be deleted", async () => {
    const { env } = createTestEnv();
    const res = await deleteRequest(env, ["profile_abc"]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toBeTruthy();
    expect(body.deletedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PATCH – conflict-gating tests (issue #474)
// ---------------------------------------------------------------------------

describe("PATCH /api/admin/bands/bulk – change_time conflict gating", () => {
  // Scenario:
  //   Venue V1, Event E1
  //   Band A: 18:00-19:00 at V1 (the band being changed, 1-hr set)
  //   Band B: 20:00-21:00 at V1 (existing, NOT in batch)
  //   Change A's start to 20:30 → new slot 20:30-21:30 → overlaps B (20:00-21:00)

  function makeChangeTimeConflictFixture() {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Conflict Event", slug: "conflict-event", status: "draft" });
    const venue = insertVenue(rawDb, { name: "Main Stage" });
    const bandA = insertBand(rawDb, {
      name: "Band Alpha",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });
    // Band B is at the same venue/event but NOT in the batch
    insertBand(rawDb, {
      name: "Band Beta",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "20:00",
      end_time: "21:00",
    });
    return { env, rawDb, bandA };
  }

  test("returns 409 with conflicts when ignore_conflicts is absent", async () => {
    const { env, bandA } = makeChangeTimeConflictFixture();
    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "change_time",
      start_time: "20:30",
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflicts");
    expect(Array.isArray(body.conflicts)).toBe(true);
    expect(body.conflicts.length).toBeGreaterThan(0);
    expect(body.conflicts[0].severity).toBe("error");
  });

  test("returns 409 with conflicts when ignore_conflicts is false", async () => {
    const { env, bandA } = makeChangeTimeConflictFixture();
    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "change_time",
      start_time: "20:30",
      ignore_conflicts: false,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflicts");
    expect(body.conflicts.length).toBeGreaterThan(0);
  });

  test("leaves DB unchanged when returning 409 (no partial apply)", async () => {
    const { env, rawDb, bandA } = makeChangeTimeConflictFixture();
    const resBefore = rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(bandA.id);

    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "change_time",
      start_time: "20:30",
    });
    expect(res.status).toBe(409);

    const resAfter = rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(bandA.id);
    expect(resAfter.start_time).toBe(resBefore.start_time);
    expect(resAfter.end_time).toBe(resBefore.end_time);
  });

  test("applies change when ignore_conflicts is true, even with conflicts", async () => {
    const { env, rawDb, bandA } = makeChangeTimeConflictFixture();
    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "change_time",
      start_time: "20:30",
      ignore_conflicts: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify DB was updated
    const updated = rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(bandA.id);
    expect(updated.start_time).toBe("20:30");
    // Duration was 1 hr, so new end = 21:30
    expect(updated.end_time).toBe("21:30");
  });

  test("applies change with no conflicts regardless of ignore_conflicts flag", async () => {
    // Band A alone — no other band at the venue — there is no conflict
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Clean Event", slug: "clean-event", status: "draft" });
    const venue = insertVenue(rawDb, { name: "Solo Stage" });
    const bandA = insertBand(rawDb, {
      name: "Solo Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "change_time",
      start_time: "22:00",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const updated = rawDb.prepare("SELECT start_time, end_time FROM performances WHERE id = ?").get(bandA.id);
    expect(updated.start_time).toBe("22:00");
    expect(updated.end_time).toBe("23:00");
  });
});

describe("PATCH /api/admin/bands/bulk – move_venue conflict gating", () => {
  // Scenario:
  //   Venue V1, Venue V2, Event E1
  //   Band A: 18:00-19:00 at V1 (being moved to V2)
  //   Band B: 18:30-19:30 at V2 (existing at V2, NOT in batch)
  //   Moving A to V2 → A(18:00-19:00) overlaps B(18:30-19:30)

  function makeMoveVenueConflictFixture() {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Venue Move Event", slug: "venue-move-event", status: "draft" });
    const venueA = insertVenue(rawDb, { name: "Original Venue" });
    const venueB = insertVenue(rawDb, { name: "Target Venue" });
    const bandA = insertBand(rawDb, {
      name: "Moving Band",
      event_id: event.id,
      venue_id: venueA.id,
      start_time: "18:00",
      end_time: "19:00",
    });
    // Existing band already at target venue — creates a conflict
    insertBand(rawDb, {
      name: "Resident Band",
      event_id: event.id,
      venue_id: venueB.id,
      start_time: "18:30",
      end_time: "19:30",
    });
    return { env, rawDb, bandA, venueBId: venueB.id };
  }

  test("returns 409 with conflicts when ignore_conflicts is absent", async () => {
    const { env, bandA, venueBId } = makeMoveVenueConflictFixture();
    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "move_venue",
      venue_id: venueBId,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflicts");
    expect(Array.isArray(body.conflicts)).toBe(true);
    expect(body.conflicts.length).toBeGreaterThan(0);
    expect(body.conflicts[0].severity).toBe("error");
  });

  test("leaves DB unchanged when returning 409 (no partial apply)", async () => {
    const { env, rawDb, bandA, venueBId } = makeMoveVenueConflictFixture();
    const originalVenueId = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(bandA.id).venue_id;

    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "move_venue",
      venue_id: venueBId,
    });
    expect(res.status).toBe(409);

    const afterVenueId = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(bandA.id).venue_id;
    expect(afterVenueId).toBe(originalVenueId);
  });

  test("applies move when ignore_conflicts is true, even with conflicts", async () => {
    const { env, rawDb, bandA, venueBId } = makeMoveVenueConflictFixture();
    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "move_venue",
      venue_id: venueBId,
      ignore_conflicts: true,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const updated = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(bandA.id);
    expect(updated.venue_id).toBe(venueBId);
  });

  test("applies move with no conflict regardless of ignore_conflicts flag", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Empty Target Event", slug: "empty-target-event", status: "draft" });
    const venueA = insertVenue(rawDb, { name: "Source Venue" });
    const venueC = insertVenue(rawDb, { name: "Empty Target Venue" });
    const bandA = insertBand(rawDb, {
      name: "Uncontested Band",
      event_id: event.id,
      venue_id: venueA.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "move_venue",
      venue_id: venueC.id,
    });
    expect(res.status).toBe(200);
    const updated = rawDb.prepare("SELECT venue_id FROM performances WHERE id = ?").get(bandA.id);
    expect(updated.venue_id).toBe(venueC.id);
  });
});

describe("PATCH /api/admin/bands/bulk – after-midnight conflict detection", () => {
  // Ensure buildIntervals handles midnight-crossing sets correctly in the gating path.
  // Band A: 23:30-00:30 at V1 (crosses midnight; being moved)
  // Band B: 23:45-01:00 at V2 (crosses midnight; existing at target)
  // The sets overlap in the post-midnight window.

  test("detects conflict between after-midnight sets on move_venue", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Late Night Event", slug: "late-night-event", status: "draft" });
    const venueA = insertVenue(rawDb, { name: "Source Late Venue" });
    const venueB = insertVenue(rawDb, { name: "Target Late Venue" });

    const bandA = insertBand(rawDb, {
      name: "Midnight Mover",
      event_id: event.id,
      venue_id: venueA.id,
      start_time: "23:30",
      end_time: "00:30",
    });
    insertBand(rawDb, {
      name: "Midnight Resident",
      event_id: event.id,
      venue_id: venueB.id,
      start_time: "23:45",
      end_time: "01:00",
    });

    const res = await patchRequest(env, {
      band_ids: [bandA.id],
      action: "move_venue",
      venue_id: venueB.id,
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("conflicts");
    expect(body.conflicts.length).toBeGreaterThan(0);
  });
});

describe("PATCH /api/admin/bands/bulk – delete action", () => {
  // delete has no conflict check; must still work normally.
  test("delete action is unaffected by conflict-gating logic", async () => {
    const { env, rawDb } = createTestEnv();
    const event = insertEvent(rawDb, { name: "Delete Event", slug: "delete-event", status: "draft" });
    const venue = insertVenue(rawDb, { name: "Delete Venue" });
    const band = insertBand(rawDb, {
      name: "Doomed Band",
      event_id: event.id,
      venue_id: venue.id,
      start_time: "18:00",
      end_time: "19:00",
    });

    const res = await patchRequest(env, {
      band_ids: [band.id],
      action: "delete",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const row = rawDb.prepare("SELECT id FROM performances WHERE id = ?").get(band.id);
    expect(row).toBeUndefined();
  });
});
