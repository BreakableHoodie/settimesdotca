// Executable regression guards for the prod-breaking invariants documented in
// CLAUDE.md. Prose + the pre-PR review hook only catch NEW violations in a
// diff; these assertions are a deterministic, permanent guard against the
// same bug classes recurring silently.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { AFTER_MIDNIGHT_THRESHOLD_HOUR } from '../festivalDays'
import { AFTER_MIDNIGHT_THRESHOLD_MINUTES } from '../../admin/utils/timeUtils'

describe('after-midnight threshold invariant (#550, CLAUDE.md "After-midnight band sorting")', () => {
  it('AFTER_MIDNIGHT_THRESHOLD_HOUR stays 6 — never remove or lower', () => {
    // Bands starting before 6 AM belong to the previous evening's lineup.
    // Lowering/removing this threshold resurrects the recurring bug where
    // after-midnight sets sort to the TOP of the schedule instead of the end.
    expect(AFTER_MIDNIGHT_THRESHOLD_HOUR).toBe(6)
  })

  it('AFTER_MIDNIGHT_THRESHOLD_MINUTES stays derived from the canonical hour, never a separate literal', () => {
    // frontend/src/admin/utils/timeUtils.js derives its minutes-based
    // threshold from festivalDays.js's AFTER_MIDNIGHT_THRESHOLD_HOUR rather
    // than re-encoding its own literal. Pins the derivation so the two
    // constants can never silently drift apart if one file is edited without
    // the other.
    expect(AFTER_MIDNIGHT_THRESHOLD_MINUTES).toBe(AFTER_MIDNIGHT_THRESHOLD_HOUR * 60)
  })

  it('bandUtils.js imports the threshold from festivalDays.js rather than re-encoding a literal 6', () => {
    // CLAUDE.md: "every consumer imports it rather than re-encoding `6`" —
    // festivalDays.js is the single canonical location (#550). A source-read
    // check (rather than a value check) is the only way to catch a future
    // edit that keeps the numeric behavior correct today but re-hardcodes the
    // literal instead of importing, silently reopening the drift risk.
    // Resolved via node:path rather than `new URL(relative, import.meta.url)`:
    // jsdom's test environment overrides the global `URL` with its own WHATWG
    // implementation, which Node's `fileURLToPath` rejects ("must be of
    // scheme file") since it isn't `instanceof` Node's own URL class.
    const currentFile = fileURLToPath(import.meta.url)
    const bandUtilsPath = path.join(path.dirname(currentFile), '../bandUtils.js')
    const source = readFileSync(bandUtilsPath, 'utf8')

    expect(source).toMatch(/import\s*{[^}]*AFTER_MIDNIGHT_THRESHOLD_HOUR[^}]*}\s*from\s*['"][^'"]*festivalDays['"]/)
    // Guards against shadowing the import with a locally re-encoded literal,
    // e.g. `const AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`, which would silently
    // defeat the import assertion above while still "importing" the name.
    expect(source).not.toMatch(/(?:const|let|var)\s+AFTER_MIDNIGHT_THRESHOLD_HOUR\s*=\s*6\b/)
  })

  it('EventsTab.jsx imports the threshold from festivalDays.js rather than re-encoding a literal 6 (#669)', () => {
    // #669: EventsTab.jsx had re-encoded the canonical threshold as its own
    // `EARLY_MORNING_CUTOFF_HOUR = 6` local constant instead of importing
    // AFTER_MIDNIGHT_THRESHOLD_HOUR from festivalDays.js — exactly the drift
    // this guard exists to catch, and it didn't (no guard covered this file
    // before this test). Same source-read technique as the bandUtils.js
    // check above, extended to this file.
    const currentFile = fileURLToPath(import.meta.url)
    const eventsTabPath = path.join(path.dirname(currentFile), '../../admin/EventsTab.jsx')
    const source = readFileSync(eventsTabPath, 'utf8')

    expect(source).toMatch(/import\s*{[^}]*AFTER_MIDNIGHT_THRESHOLD_HOUR[^}]*}\s*from\s*['"][^'"]*festivalDays['"]/)
    // Guards against a locally re-encoded cutoff constant under any name
    // (e.g. the original `EARLY_MORNING_CUTOFF_HOUR = 6`) reappearing
    // alongside or instead of the import.
    expect(source).not.toMatch(/(?:const|let|var)\s+\w*CUTOFF\w*\s*=\s*6\b/i)
    expect(source).not.toMatch(/(?:const|let|var)\s+AFTER_MIDNIGHT_THRESHOLD_HOUR\s*=\s*6\b/)
  })
})
