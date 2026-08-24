import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Fails when a large source file has no test file — and fails again when an
 * allowlisted file gains one, forcing its entry to be deleted.
 *
 * That second half is what makes this a ratchet rather than a TODO list that
 * rots. ALLOWED can only shrink.
 *
 * #905 exists because a human noticed, during a whole-repo audit, that four
 * admin surfaces had no tests. The largest of them owns the show-day controls
 * — cancel, announce, resend, conflict detection — and is the component most
 * likely to be edited under time pressure during an event. That should be a
 * build failure, not a discovery (#919).
 *
 * WHAT THIS DOES NOT DO: it checks that a test file EXISTS, by name. It cannot
 * tell a thorough suite from one that renders a component and asserts nothing.
 * Coverage thresholds in vitest.config.js are the other half of that job, and
 * neither catches an assertion that passes against broken code. Do not read a
 * green run here as "this file is tested well" — only as "somebody started".
 *
 * WHY A SIZE THRESHOLD: a universal rule fails on ~77 files immediately and
 * gets switched off within a day. 400 lines captures the files where an
 * untested regression is most expensive. Lower it as ALLOWED empties — that is
 * the intended direction of travel, and there is no reason to stop at 400.
 *
 * fileURLToPath rather than import.meta.dirname, matching the sibling guards
 * (functions/__tests__/opencodeInstructions.test.js and friends).
 */

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_UNTESTED_LINES = 400

/**
 * Files over the threshold with no test, as of 2026-08-20. Delete an entry the
 * moment its file gains a test — leaving it stale fails this suite on purpose.
 *
 * Do not add to this list to make a build pass. Adding an entry means shipping
 * a large untested file, which is the thing being prevented.
 */
const MAX_ALLOWED = 7

const ALLOWED = new Set([
  'App.jsx',
  'admin/AdminPanel.jsx',
  'admin/components/BandForm.jsx',
  'admin/components/EventFormModal.jsx',
  'admin/LineupTab.jsx',
  'admin/UserManagement.jsx',
  'admin/VenuesTab.jsx',
])

const SKIP_DIRS = new Set(['__tests__', 'test', 'node_modules'])

function walk(dir, onFile) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, onFile)
      continue
    }
    onFile(full, entry.name)
  }
}

// Test files are matched by BASENAME, not by path, because the repo colocates
// them inconsistently: admin/__tests__/EventsTab.test.jsx sits beside the
// component, while utils tests live in utils/__tests__/. A path-based match
// would report false positives for the second shape.
function collectTestBasenames() {
  const names = new Set()
  const visit = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(full)
      } else if (/\.(test|spec)\.jsx?$/.test(entry.name)) {
        names.add(entry.name.replace(/\.(test|spec)\.jsx?$/, ''))
      }
    }
  }
  visit(SRC_ROOT)
  return names
}

function collectSourceFiles() {
  const files = []
  walk(SRC_ROOT, (full, name) => {
    if (!/\.jsx?$/.test(name) || /\.(test|spec)\.jsx?$/.test(name)) return
    files.push({
      rel: relative(SRC_ROOT, full).split('\\').join('/'),
      base: name.replace(/\.jsx?$/, ''),
      lines: readFileSync(full, 'utf-8').split('\n').length,
    })
  })
  return files
}

const testNames = collectTestBasenames()
const sourceFiles = collectSourceFiles()
const untestedLargeFiles = sourceFiles.filter(f => f.lines > MAX_UNTESTED_LINES && !testNames.has(f.base))

describe(`no new source file over ${MAX_UNTESTED_LINES} lines ships without a test`, () => {
  it('the allowlist cannot GROW — it is a debt register, not a bypass', () => {
    // The hole this closes: without a cap, an author could add a new untested
    // file to ALLOWED and both other checks pass. The unlisted-file check skips
    // it because it IS listed, and the stale-entry check accepts it because it
    // genuinely is still an offender. "ALLOWED can only shrink" was therefore
    // false as originally written.
    //
    // MAX_ALLOWED must be lowered whenever an entry is removed, which is the
    // same discipline as the coverage ratchets in vitest.config.js. Raising it
    // means shipping another large untested file — do that deliberately, in a
    // commit that says so, or not at all.
    expect(
      ALLOWED.size,
      `ALLOWED has ${ALLOWED.size} entries but MAX_ALLOWED is ${MAX_ALLOWED}.\n` +
        `Removing an entry? Lower MAX_ALLOWED to match.\n` +
        `Adding one? Don't — write a test instead.`
    ).toBeLessThanOrEqual(MAX_ALLOWED)
  })

  it('the scan finds source and test files at all', () => {
    // Guards the guard. A walk that silently matched nothing would make every
    // assertion below pass while checking nothing.
    expect(sourceFiles.length).toBeGreaterThan(50)
    expect(testNames.size).toBeGreaterThan(20)
  })

  it('no unlisted file is both large and untested', () => {
    const offenders = untestedLargeFiles.filter(f => !ALLOWED.has(f.rel)).map(f => `${f.rel} (${f.lines} lines)`)

    expect(
      offenders,
      `these are over ${MAX_UNTESTED_LINES} lines with no test file:\n${offenders.join('\n')}\n\n` +
        `Add a test rather than an ALLOWED entry. Prefer extracting the pure logic into a\n` +
        `small module and testing that — mounting a large component to raise coverage pulls\n` +
        `its uncovered surface into the denominator and LOWERS the percentage (#905).`
    ).toEqual([])
  })

  it('every ALLOWED entry is still large, untested, and present — the list only shrinks', () => {
    // The ratchet. Without this, entries survive long after their file gained a
    // test, was renamed, or shrank, and the list stops meaning anything.
    const stillOffending = new Set(untestedLargeFiles.map(f => f.rel))
    const stale = [...ALLOWED].filter(rel => !stillOffending.has(rel))

    expect(
      stale,
      `these ALLOWED entries no longer apply — delete them:\n${stale.join('\n')}\n\n` +
        `A file leaves the list when it gains a test, drops under ${MAX_UNTESTED_LINES} lines,\n` +
        `or is renamed. Removing the entry is the point: this list is a debt register.`
    ).toEqual([])
  })
})
