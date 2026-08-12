// --- Durable guard: `is_published` must never drive PUBLIC UI ---------------
//
// `events.is_published` is a deprecated column (migration 0005 superseded it
// with `events.status`) that still gets written by the admin archive path for
// rollback safety. Reading it on the SERVER took the public site dark on
// 2026-08-10. The frontend never had that failure mode — it had the quieter
// one: EventTimeline.jsx rendered a "Draft" badge off
// `event.is_published === false`, which is ALWAYS false because the public
// timeline endpoint never projects the column (`event.is_published` is
// `undefined`, and `undefined === false` is `false`). Dead code that looked
// live — and the reason a frontend guard earns its keep: the same deprecated
// column fails silently here rather than loudly. See
// functions/utils/eventVisibility.js for the backend half of this incident
// and functions/utils/__tests__/eventVisibility.test.js for its guard, which
// this test mirrors on the frontend side.
//
// This is a source scan, not a runtime assertion, for the same reason as
// that backend guard and frontend/src/admin/utils/__tests__/bandFields.test.js's
// Tailwind-class scan: the bug is a string baked into JSX/JS at module load
// time (a prop name, an object key, a comparison target). Nothing about
// "does this component read is_published" is observable by rendering the
// component with props that omit the field -- the component just silently
// treats it as undefined, which is exactly how this bug hid in plain sight.
// Only reading the source text catches it.
//
// NO admin exemption as of #799: the admin UI used to read `is_published` as a
// draft/published indicator, so this guard once protected only PUBLIC surfaces.
// The admin surface is now entirely `status`-driven, which puts the whole of
// frontend/src/ in scope -- see the exemption note above the allowlist below.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentFile = fileURLToPath(import.meta.url)
const srcRoot = path.join(path.dirname(currentFile), '../')

// Directories/files exempt from the scan:
//  - any __tests__/** path — test fixtures legitimately seed/assert against
//    the deprecated column (e.g. an impossible-state regression guard).
//  - this file itself — its own header/comments name the column, which
//    would otherwise flag itself.
//
// The admin/** and utils/adminApi.js exemptions are GONE as of #799. They
// existed because the admin events endpoint still projected the column and the
// admin UI read it as a draft/published indicator. Nothing reads it anywhere
// now -- `events.status` is the only source of truth on both sides of the
// build boundary -- so the entire frontend is in scope. Removing those
// exemptions is what PROVES #799 is complete: if any admin file still touched
// the column, this test would fail rather than quietly permit it.
const EXEMPT_EXACT = new Set(['__tests__/isPublishedGuard.test.js'])

function isExempt(relPath) {
  const normalized = relPath.split(path.sep).join('/')
  if (normalized.split('/').includes('__tests__')) return true
  if (EXEMPT_EXACT.has(normalized)) return true
  return false
}

const SCANNED_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx']

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(walk(full))
      // .ts/.tsx are scanned even though this codebase is currently JS-only:
      // a guard that silently stops covering a file type the day someone adds
      // one is the failure mode guards exist to prevent.
    } else if (entry.isFile() && SCANNED_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      files.push(full)
    }
  }
  return files
}

describe('is_published never read outside admin/test infrastructure', () => {
  it('contains no bare is_published reads outside the allowlisted paths', () => {
    const offenders = []
    for (const absPath of walk(srcRoot)) {
      const relPath = path.relative(srcRoot, absPath)
      if (isExempt(relPath)) continue
      const source = readFileSync(absPath, 'utf8')
      if (source.includes('is_published')) {
        offenders.push(relPath)
      }
    }

    expect(
      offenders,
      offenders.length > 0
        ? `is_published is retired (#799) and must not drive ANY UI, admin included ` +
            `(frontend/src/components/EventTimeline.jsx's dead "Draft" badge was this exact bug) — ` +
            `found it in: ${offenders.join(', ')}. Use event.status instead. There is no admin escape hatch: ` +
            `moving the file under frontend/src/admin/** will NOT satisfy this guard. Only __tests__/** and ` +
            `the EXEMPT_EXACT allowlist are exempt.`
        : undefined
    ).toEqual([])
  })
})
