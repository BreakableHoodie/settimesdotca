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
});
