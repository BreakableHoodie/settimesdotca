import { describe, expect, it } from "vitest";
import { createTestEnv, insertEvent, insertVenue, insertBand } from "../../../test-utils";
import * as bandIdHandler from "../[id].js";
import * as bandsHandler from "../../bands.js";

async function seedEditorContext() {
  const { env, rawDb } = createTestEnv({ role: "editor" });
  const ev = insertEvent(rawDb, { name: "CancelToggle Event", slug: "cancel-toggle-event" });
  const venue = insertVenue(rawDb, { name: "Cancel Venue" });
  const band = insertBand(rawDb, { name: "Cancel Band", event_id: ev.id, venue_id: venue.id });

  const patchAs = (role, userId) => async (body) => {
    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role, id: userId } },
    });
  };

  const getListForEvent = async () => {
    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`);
    const res = await bandsHandler.onRequestGet({
      request: getReq,
      env,
      data: { user: { role: "editor", id: 2 } },
    });
    return (await res.json()).bands;
  };

  return {
    db: rawDb,
    eventId: ev.id,
    performanceId: band.id,
    patch: patchAs("editor", 2),
    patchAsViewer: patchAs("viewer", 3),
    getListForEvent,
  };
}

describe("admin single-band handler — is_cancelled", () => {
  it("cancels a performance and reverses it", async () => {
    const { db, performanceId, patch } = await seedEditorContext();
    const read = () => db.prepare("SELECT is_cancelled FROM performances WHERE id = ?").get(performanceId).is_cancelled;

    await patch({ is_cancelled: true });
    expect(read()).toBe(1);

    // Reversibility is the whole point -- a one-way flag would be a DELETE
    // with extra steps.
    await patch({ is_cancelled: false });
    expect(read()).toBe(0);
  });

  // #732 MINOR 4 — matches the existing is_announced validation (line ~732):
  // `body.is_cancelled !== undefined` alone accepts ANY defined value, and the
  // handler then coerces it with a bare truthy check (`body.is_cancelled ? 1
  // : 0`), so `1`, `"false"` (a non-empty string, truthy), and `{}` all
  // silently become is_cancelled = 1 in the DB instead of being rejected.
  // A cancelled set frees its slot (owner decision 2026-09-22), so restoring
  // one is the transition that can double-book. Both halves are needed: the
  // control proves the refusal is about the CLASH, not about un-cancelling.
  describe("un-cancelling into a slot a replacement now holds", () => {
    async function withReplacement(replacementStart, replacementEnd) {
      const ctx = await seedEditorContext();
      const { db, eventId, performanceId, patch } = ctx;
      const { venue_id } = db.prepare("SELECT venue_id FROM performances WHERE id = ?").get(performanceId);
      db.prepare("UPDATE performances SET start_time = '20:00', end_time = '21:00' WHERE id = ?").run(performanceId);
      expect((await patch({ is_cancelled: true })).status).toBe(200);
      insertBand(db, {
        name: "Replacement Act",
        event_id: eventId,
        venue_id,
        start_time: replacementStart,
        end_time: replacementEnd,
      });
      return ctx;
    }
    const isCancelled = (db, id) =>
      db.prepare("SELECT is_cancelled FROM performances WHERE id = ?").get(id).is_cancelled;

    it("refuses to restore, names the replacement, and leaves the set cancelled", async () => {
      const { db, performanceId, patch } = await withReplacement("20:00", "21:00");
      const res = await patch({ is_cancelled: false });
      expect(res.status).toBe(409);
      expect((await res.json()).message).toContain("Replacement Act");
      expect(isCancelled(db, performanceId)).toBe(1);
    });

    it("restores normally when the replacement is in a different slot (control)", async () => {
      const { db, performanceId, patch } = await withReplacement("22:00", "23:00");
      const res = await patch({ is_cancelled: false });
      expect(res.status).toBe(200);
      expect(isCancelled(db, performanceId)).toBe(0);
    });
  });

  it("rejects a non-boolean is_cancelled value", async () => {
    const { db, performanceId, patch } = await seedEditorContext();
    const read = () => db.prepare("SELECT is_cancelled FROM performances WHERE id = ?").get(performanceId).is_cancelled;

    for (const badValue of [1, "false", {}]) {
      const res = await patch({ is_cancelled: badValue });
      expect(res.status).toBe(400);
      // Bad request must not mutate the row -- the string "false" is the
      // sharpest case: truthy as a JS value, but its intent is obviously
      // "not cancelled", so silently accepting it would flip the flag the
      // wrong way instead of merely the wrong TYPE.
      expect(read()).toBe(0);
    }
  });

  it("rejects a viewer", async () => {
    const { patchAsViewer } = await seedEditorContext();
    const res = await patchAsViewer({ is_cancelled: true });
    expect(res.status).toBe(403);
  });

  it("surfaces is_cancelled through the admin lineup list the LineupTab toggle reads", async () => {
    // The toggle button in LineupTab decides its label ("Cancel" vs "Restore")
    // from band.is_cancelled on the row returned by GET /api/admin/bands?event_id.
    // If that SELECT doesn't project the column, the toggle can never reflect
    // reality after a page reload.
    const { performanceId, patch, getListForEvent } = await seedEditorContext();

    const before = await getListForEvent();
    expect(before.find((b) => b.id === performanceId).is_cancelled).toBe(0);

    await patch({ is_cancelled: true });

    const after = await getListForEvent();
    expect(after.find((b) => b.id === performanceId).is_cancelled).toBe(1);
  });

  // #732 MAJOR 1 hygiene — cancelling a performance must sweep its own
  // pending band_announce_queue rows, so the queue doesn't accumulate dead
  // entries for a set that will never be sent (the digest itself also
  // re-checks is_cancelled at send time as a second layer of defense — see
  // functions/api/admin/bands/__tests__/announce-digest-cancelled.test.js).
  it("deletes the performance's own pending band_announce_queue rows when cancelled", async () => {
    const { db, eventId, performanceId, patch } = await seedEditorContext();
    const bandProfileId = db
      .prepare("SELECT band_profile_id FROM performances WHERE id = ?")
      .get(performanceId).band_profile_id;

    const followId = db
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("hygiene@example.com", bandProfileId, "tok-hygiene").lastInsertRowid;
    db.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(followId, performanceId, eventId, "Cancel Band", "CancelToggle Event", "cancel-toggle-event", bandProfileId);

    await patch({ is_cancelled: true });

    const remaining = db.prepare("SELECT * FROM band_announce_queue WHERE performance_id = ?").all(performanceId);
    expect(remaining).toHaveLength(0);
  });

  it("only sweeps the cancelled performance's own queue rows, leaving a sibling performance's rows untouched", async () => {
    const { db, eventId, performanceId, patch } = await seedEditorContext();
    const venue = insertVenue(db, { name: "Sibling Venue" });
    const sibling = insertBand(db, { name: "Sibling Band", event_id: eventId, venue_id: venue.id });

    const bandProfileId = db
      .prepare("SELECT band_profile_id FROM performances WHERE id = ?")
      .get(performanceId).band_profile_id;

    const followId = db
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("hygiene-scope@example.com", bandProfileId, "tok-hygiene-scope").lastInsertRowid;
    const siblingFollowId = db
      .prepare("INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)")
      .run("hygiene-scope@example.com", sibling.band_profile_id, "tok-hygiene-scope-2").lastInsertRowid;

    db.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(followId, performanceId, eventId, "Cancel Band", "CancelToggle Event", "cancel-toggle-event", bandProfileId);
    db.prepare(
      `INSERT INTO band_announce_queue
       (band_follow_id, performance_id, event_id, band_name, event_name, event_slug, band_profile_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      siblingFollowId,
      sibling.id,
      eventId,
      "Sibling Band",
      "CancelToggle Event",
      "cancel-toggle-event",
      sibling.band_profile_id,
    );

    await patch({ is_cancelled: true });

    expect(db.prepare("SELECT * FROM band_announce_queue WHERE performance_id = ?").all(performanceId)).toHaveLength(0);
    expect(db.prepare("SELECT * FROM band_announce_queue WHERE performance_id = ?").all(sibling.id)).toHaveLength(1);
  });
});
