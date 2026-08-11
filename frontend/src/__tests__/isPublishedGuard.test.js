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
// EXEMPT admin/**: unlike the public timeline, the admin events list
// (`GET /api/admin/events`, via `functions/api/admin/events/index.js`) DOES
// still project `is_published`, and the admin UI legitimately reads it as a
// draft/published indicator until it's migrated onto `status` (#799). This
// guard protects PUBLIC surfaces, where the column is never projected and
// any read of it is necessarily dead or wrong -- not the admin surface,
// where it's still live data.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentFile = fileURLToPath(import.meta.url)
const srcRoot = path.join(path.dirname(currentFile), '../')

// Directories/files exempt from the scan:
//  - admin/**        — the admin surface legitimately still reads
//    is_published from admin endpoints that still project it (#799 tracks
//    the eventual migration onto `status`).
//  - any __tests__/** path — test fixtures legitimately seed/assert against
//    the deprecated column (e.g. HistoricalImportModal's write, or an
//    impossible-state regression guard).
//  - utils/adminApi.js — not under admin/ by directory, but functionally
//    part of the admin surface: it's the admin API client, imported
//    exclusively by admin/** components (plus EventContext.jsx, itself an
//    admin-panel-context provider) to normalize the same still-projected
//    admin endpoint response as EventFormModal.jsx and AdminPanel.jsx above.
//    Same justification as admin/**, just organized in utils/ as a shared
//    client module rather than nested under admin/. Mirrors how the backend
//    guard's EXEMPT_EXACT carves out utils/eventVisibility.js and
//    api/test-utils.js for the same "right behaviour, wrong directory for
//    the path-prefix rule" reason.
//  - this file itself — its own header/comments name the column, which
//    would otherwise flag itself.
const EXEMPT_EXACT = new Set(['utils/adminApi.js', '__tests__/isPublishedGuard.test.js'])

function isExempt(relPath) {
  const normalized = relPath.split(path.sep).join('/')
  if (normalized.startsWith('admin/')) return true
  if (normalized.split('/').includes('__tests__')) return true
  if (EXEMPT_EXACT.has(normalized)) return true
  return false
}

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files = files.concat(walk(full))
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
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
        ? `is_published must never drive public UI (frontend/src/components/EventTimeline.jsx's dead "Draft" ` +
            `badge was this exact bug) — found it in: ${offenders.join(', ')}. Use event.status instead, or add ` +
            `the file to frontend/src/admin/**, a __tests__/** path, or the EXEMPT_EXACT allowlist in this guard ` +
            `if it's genuinely admin infrastructure.`
        : undefined
    ).toEqual([])
  })
})
