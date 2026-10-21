// Venue stamp inks and short names (#1248).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STAMP_INKS, pickInkForNewVenue, venueShortName } from "../venueInk.js";
import { createDBEnv, createTestDB, insertVenue } from "../../api/test-utils.js";

const MIGRATION = readFileSync(resolve(__dirname, "../../../migrations/0076_venue_stamp_inks.sql"), "utf8");
// The backfill alone: the test schema already has the column.
const BACKFILL = MIGRATION.slice(MIGRATION.indexOf("UPDATE venues"));

describe("venueShortName", () => {
  it.each([
    ["Blue Room (Inside Revive Karaoke)", "Blue Room"],
    ["The Saloon (Frontier Ghost Town)", "The Saloon"],
    ["The Mill (Main Stage)", "The Mill"],
    ["Prohibition Warehouse", "Prohibition Warehouse"],
    ["Frontier Ghost Town — Outdoors", "Frontier Ghost Town — Outdoors"],
    ["Paddy's Underground", "Paddy's Underground"],
    // Only a TRAILING qualifier goes; a name that is all parenthetical keeps it.
    ["(Secret Venue)", "(Secret Venue)"],
    ["Room (A) Upstairs", "Room (A) Upstairs"],
  ])("%s -> %s", (name, short) => {
    expect(venueShortName(name)).toBe(short);
  });

  it("is null for a missing venue", () => {
    expect(venueShortName(null)).toBeNull();
  });
});

describe("STAMP_INKS", () => {
  it("are eight distinct lowercase #rrggbb inks", () => {
    expect(STAMP_INKS).toHaveLength(8);
    expect(new Set(STAMP_INKS).size).toBe(8);
    for (const ink of STAMP_INKS) expect(ink).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("match the migration's backfill list, in order (two homes, kept in step)", () => {
    const fromMigration = [...BACKFILL.matchAll(/'(#[0-9a-f]{6})'/g)].map((m) => m[1]);
    expect(fromMigration).toEqual([...STAMP_INKS]);
  });
});

describe("migration 0076 backfill", () => {
  it("gives the first eight venues eight different inks, by id rank, on any database", () => {
    const db = createTestDB();
    // Gappy ids, as in production (4, 6, 7, 8, 15, ...): rank, not id, decides.
    const ids = [4, 6, 7, 8, 15, 16, 17, 18, 19].map((id) => {
      db.prepare("INSERT INTO venues (id, name) VALUES (?, ?)").run(id, `Venue ${id}`);
      return id;
    });
    db.exec(BACKFILL);
    const inks = ids.map((id) => db.prepare("SELECT ink_color FROM venues WHERE id = ?").get(id).ink_color);
    expect(inks.slice(0, 8)).toEqual([...STAMP_INKS]);
    expect(inks[8]).toBe(STAMP_INKS[0]); // the ninth wraps
  });

  it("leaves an ink someone already chose", () => {
    const db = createTestDB();
    db.prepare("INSERT INTO venues (id, name, ink_color) VALUES (1, 'Chosen', '#123456')").run();
    db.exec(BACKFILL);
    expect(db.prepare("SELECT ink_color FROM venues WHERE id = 1").get().ink_color).toBe("#123456");
  });

  it("the column refuses anything but lowercase #rrggbb", () => {
    const db = createTestDB();
    for (const bad of ["red", "#FFF", "#ABCDEF", "#12345g", "#1234567"]) {
      expect(() => db.prepare("INSERT INTO venues (name, ink_color) VALUES (?, ?)").run(`V ${bad}`, bad)).toThrow(
        /CHECK/,
      );
    }
  });
});

describe("pickInkForNewVenue", () => {
  it("starts at the first ink on an empty database", async () => {
    expect(await pickInkForNewVenue(createDBEnv(createTestDB()))).toBe(STAMP_INKS[0]);
  });

  it("picks the least-used ink, earliest on a tie", async () => {
    const raw = createTestDB();
    let n = 0;
    const use = (ink, times) => {
      for (let i = 0; i < times; i += 1) {
        n += 1;
        const v = insertVenue(raw, { name: `Venue ${n}` });
        raw.prepare("UPDATE venues SET ink_color = ? WHERE id = ?").run(ink, v.id);
      }
    };
    // Every ink twice, except 3 and 5 once each: 5 is later, so 3 wins the tie.
    STAMP_INKS.forEach((ink, i) => use(ink, i === 3 || i === 5 ? 1 : 2));
    expect(await pickInkForNewVenue(createDBEnv(raw))).toBe(STAMP_INKS[3]);
  });
});
