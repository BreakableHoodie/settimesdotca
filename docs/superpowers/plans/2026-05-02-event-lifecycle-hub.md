# Event Lifecycle Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three fan-facing features before May 17, 2026 — shareable schedule URLs, pre-event reveal mode, and band following — turning SetTimes.ca from a single-use schedule tool into a site fans return to.

**Architecture:** Feature 1 is pure frontend (no backend changes). Features 2 and 3 each add one D1 migration, follow the existing Cloudflare Pages Functions request-handler pattern, and reuse the existing test-utils.js in-memory DB harness. Each feature is independently mergeable in order: 1 → 2 → 3.

**Tech Stack:** React 19 + React Router 7 (frontend), Cloudflare Pages Functions / D1 (backend), Vitest (unit tests), better-sqlite3 (test DB), existing `createTestEnv` / `insertBand` / `insertEvent` helpers from `functions/api/test-utils.js`.

**Spec:** `docs/superpowers/specs/2026-05-02-event-lifecycle-hub-design.md`

---

## File Map

### Feature 1 — Shareable Schedule URLs (no backend changes)
| Action | File |
|--------|------|
| Modify | `frontend/src/App.jsx` |
| Modify | `frontend/src/components/MySchedule.jsx` |

### Feature 2 — Pre-Event Reveal Mode
| Action | File |
|--------|------|
| Create | `migrations/0033_reveal_mode.sql` |
| Modify | `functions/api/test-utils.js` |
| Modify | `functions/api/schedule.js` |
| Modify | `functions/api/admin/bands/[id].js` |
| Create | `functions/api/admin/events/[id]/reveal-mode.js` |
| Create | `functions/api/admin/bands/__tests__/announce.test.js` |
| Modify | `frontend/src/admin/EventFormModal.jsx` |
| Modify | `frontend/src/admin/LineupTab.jsx` |
| Modify | `frontend/src/App.jsx` |

### Feature 3 — Band Following
| Action | File |
|--------|------|
| Create | `migrations/0034_band_follows.sql` |
| Modify | `functions/api/test-utils.js` |
| Create | `functions/api/bands/[name]/follow.js` |
| Create | `functions/api/bands/__tests__/follow.test.js` |
| Modify | `functions/api/admin/bands/[id].js` (add notification trigger to onRequestPatch) |
| Modify | `frontend/src/pages/BandProfilePage.jsx` |

---

## Prerequisite Reading

Before starting, open these files and understand them:
- `frontend/src/App.jsx` — schedule state, `SELECTED_BANDS_KEY`, `getStoredSelection(slug)`, `toggleBand`, `ConfirmDialog` usage
- `functions/api/schedule.js` — full handler; note the `INNER JOIN venues` bug (venue is optional since migration 0032 but the query still inner-joins)
- `functions/api/admin/bands/[id].js` — `onRequestPut` pattern, `getBandId()`, `checkPermission`, `auditLog`
- `functions/api/admin/events/[id]/publish.js` — action-endpoint pattern to copy for reveal-mode.js
- `functions/api/test-utils.js` — `createTestEnv()`, `insertBand()`, `insertEvent()`, `insertVenue()` signatures

---

## Feature 1 — Shareable Schedule URLs

### Task 1: Add Share button to MySchedule

**Files:**
- Modify: `frontend/src/components/MySchedule.jsx`

**How sharing works:** `selectedBands` is an array of string IDs like `"the-sunset-trio-41"`. The numeric part after the last `-` is the `performance_id`. The URL encodes numeric performance IDs: `?s=41,42,77`. On the receiving end, `App.jsx` maps those numbers back to band string IDs.

- [ ] **Step 1: Add the share button**

Open `frontend/src/components/MySchedule.jsx`. Find the section rendering the "Copy Schedule" button. Add a "Share My Schedule" button immediately after it. The button is only shown when `bands.length > 0`.

The full share URL encodes numeric performance IDs extracted from `band.id` (format: `"name-42"` — the number is the performance ID):

```jsx
// Add near the top of the component, after the existing copyButtonLabel state:
const [shareButtonLabel, setShareButtonLabel] = useState('Share Schedule')

// Add this function before the return statement:
const handleShareSchedule = async () => {
  const performanceIds = bands
    .map(band => {
      const parts = band.id.split('-')
      return parts[parts.length - 1]
    })
    .filter(id => /^\d+$/.test(id))
    .join(',')

  const url = `${window.location.origin}${window.location.pathname}?s=${performanceIds}`
  await copyToClipboard(url)
  setShareButtonLabel('Link Copied!')
  setTimeout(() => setShareButtonLabel('Share Schedule'), 2000)
}
```

Then add the button in JSX next to "Copy Schedule" (copy the exact className from the Copy Schedule button):

```jsx
{bands.length > 0 && (
  <button
    onClick={handleShareSchedule}
    className="..."  {/* copy exact className from Copy Schedule button */}
    aria-label="Copy shareable link to your schedule"
  >
    <FontAwesomeIcon icon={faLink} className="mr-2" />
    {shareButtonLabel}
  </button>
)}
```

Import `faLink` from `@fortawesome/free-solid-svg-icons` at the top of the file.

- [ ] **Step 2: Run unit tests to confirm no regressions**

```bash
npm run test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL|MySchedule"
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MySchedule.jsx
git commit -m "feat: add Share Schedule button to MySchedule"
```

---

### Task 2: Seed selectedBands from URL params in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

When a fan opens a share link like `/event/lwbc-vol6?s=41,42,77`, we map the numeric performance IDs back to string band IDs and seed localStorage.

- [ ] **Step 1: Add useSearchParams import**

At the top of `frontend/src/App.jsx`, add `useSearchParams` to the react-router-dom import:

```js
import { Link, useParams, useSearchParams } from 'react-router-dom'
```

- [ ] **Step 2: Destructure searchParams in the App component**

Inside the `App()` function, after the `useParams()` call:

```js
const [searchParams, setSearchParams] = useSearchParams()
```

- [ ] **Step 3: Add the URL seeding effect**

Add a new `useEffect` that runs after `bands` loads. Place it after the effect that syncs `selectedBands` to `localStorage` (around line 240 in the current file):

```js
useEffect(() => {
  const sParam = searchParams.get('s')
  if (!sParam || bands.length === 0) return

  const requestedIds = new Set(
    sParam.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s))
  )

  // Map numeric performance IDs back to band string IDs
  const matchedStringIds = bands
    .filter(band => {
      const parts = band.id.split('-')
      const perfId = parts[parts.length - 1]
      return requestedIds.has(perfId)
    })
    .map(band => band.id)

  if (matchedStringIds.length === 0) return

  const existing = getStoredSelection(slug)

  const applySelection = () => {
    setSelectedBands(matchedStringIds)
    setView('mine')
    // Remove the ?s= param from the URL without a page reload
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('s')
      return next
    }, { replace: true })
  }

  if (existing.length === 0) {
    applySelection()
  } else {
    // Show confirmation before overwriting existing picks
    setPendingSharedBands(matchedStringIds)
    setSharedScheduleConfirmOpen(true)
  }
}, [bands, searchParams]) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Add the new state variables and confirmation dialog**

At the top of the `App()` function, add two new state vars after `clearConfirmOpen`:

```js
const [sharedScheduleConfirmOpen, setSharedScheduleConfirmOpen] = useState(false)
const [pendingSharedBands, setPendingSharedBands] = useState([])
```

At the bottom of the JSX, add a second `ConfirmDialog` after the existing clear dialog:

```jsx
<ConfirmDialog
  isOpen={sharedScheduleConfirmOpen}
  title="Load Shared Schedule?"
  message="Loading this shared schedule will replace your current picks."
  confirmText="Load"
  onConfirm={() => {
    setSharedScheduleConfirmOpen(false)
    setSelectedBands(pendingSharedBands)
    setView('mine')
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('s')
      return next
    }, { replace: true })
    setPendingSharedBands([])
  }}
  onCancel={() => {
    setSharedScheduleConfirmOpen(false)
    setPendingSharedBands([])
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('s')
      return next
    }, { replace: true })
  }}
/>
```

- [ ] **Step 5: Fix the LEFT JOIN bug in schedule.js while you're here**

Open `functions/api/schedule.js`. Find the band query (around line 80). Change `INNER JOIN venues v ON p.venue_id = v.id` to `LEFT JOIN venues v ON p.venue_id = v.id`. Also update the venue field in the formatted response to handle null:

```js
venue: band.venue ?? null,  // was: band.venue (would be null for TBD bands already)
```

This is a correctness fix — since migration 0032 made venue optional, the INNER JOIN silently drops bands with no venue from the public schedule.

- [ ] **Step 6: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit Feature 1**

```bash
git add frontend/src/App.jsx frontend/src/components/MySchedule.jsx functions/api/schedule.js
git commit -m "feat: shareable schedule URLs via ?s= query param

Fans can now share their MySchedule picks via a URL. Numeric performance
IDs are encoded into ?s= and mapped back to band string IDs on load.
Also fixes schedule.js INNER JOIN bug that dropped venue-less performers."
```

---

## Feature 2 — Pre-Event Reveal Mode

### Task 3: Create migration 0033

**Files:**
- Create: `migrations/0033_reveal_mode.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: 0033_reveal_mode
-- Description: Add reveal_mode to events (when true, only announced performances
--   appear on the public schedule) and is_announced to performances (toggle per band).
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote
--
-- Safe defaults: reveal_mode=0 means existing events show all bands (no change).
--   is_announced=1 means existing performances are visible by default.

ALTER TABLE events ADD COLUMN reveal_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE performances ADD COLUMN is_announced INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_performances_announced
  ON performances(event_id, is_announced);
```

- [ ] **Step 2: Apply locally**

```bash
npm run migrate:local
```

Expected output: migration applied successfully, no errors.

---

### Task 4: Update test-utils.js schema

**Files:**
- Modify: `functions/api/test-utils.js`

The in-memory test DB must match the real schema for tests to pass.

- [ ] **Step 1: Add the two new columns**

In `functions/api/test-utils.js`, find the `CREATE TABLE events` statement and add `reveal_mode`:

```sql
-- In the events CREATE TABLE, add after `updated_at TEXT DEFAULT (datetime('now'))`:
reveal_mode INTEGER NOT NULL DEFAULT 0
```

Find the `CREATE TABLE performances` statement and add `is_announced`:

```sql
-- In the performances CREATE TABLE, add after `updated_at TEXT DEFAULT (datetime('now'))`:
is_announced INTEGER NOT NULL DEFAULT 1
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass (new columns have safe defaults so nothing breaks).

---

### Task 5: Write failing tests for schedule reveal filter

**Files:**
- Create: `functions/api/__tests__/schedule-reveal.test.js`

- [ ] **Step 1: Create the test file**

```js
import { describe, it, expect } from 'vitest'
import { createTestEnv, insertEvent, insertVenue, insertBand } from '../test-utils'
import * as scheduleHandler from '../schedule.js'

describe('GET /api/schedule - reveal mode', () => {
  it('returns all bands when reveal_mode is off', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6', status: 'draft', is_published: 1 })
    rawDb.prepare('UPDATE events SET is_published=1 WHERE id=?').run(ev.id)
    const venue = insertVenue(rawDb, { name: 'Venue A' })
    insertBand(rawDb, { name: 'Announced Band', event_id: ev.id, venue_id: venue.id })
    // Insert unannounced band
    const unannounced = insertBand(rawDb, { name: 'Hidden Band', event_id: ev.id, venue_id: venue.id })
    rawDb.prepare('UPDATE performances SET is_announced=0 WHERE id=?').run(unannounced.id)

    const req = new Request('https://example.test/api/schedule?event=vol6')
    const res = await scheduleHandler.onRequestGet({ request: req, env })
    expect(res.status).toBe(200)
    const data = await res.json()
    // reveal_mode=0: all bands returned regardless of is_announced
    expect(data.bands.length).toBe(2)
    expect(data.event.reveal_mode).toBe(0)
  })

  it('filters unannounced bands when reveal_mode is on', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-reveal' })
    rawDb.prepare('UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?').run(ev.id)
    const venue = insertVenue(rawDb, { name: 'Venue B' })
    const announced = insertBand(rawDb, { name: 'Visible Band', event_id: ev.id, venue_id: venue.id })
    rawDb.prepare('UPDATE performances SET is_announced=1 WHERE id=?').run(announced.id)
    const hidden = insertBand(rawDb, { name: 'Hidden Band', event_id: ev.id, venue_id: venue.id })
    rawDb.prepare('UPDATE performances SET is_announced=0 WHERE id=?').run(hidden.id)

    const req = new Request('https://example.test/api/schedule?event=vol6-reveal')
    const res = await scheduleHandler.onRequestGet({ request: req, env })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.bands.length).toBe(1)
    expect(data.bands[0].name).toBe('Visible Band')
    expect(data.event.reveal_mode).toBe(1)
  })

  it('includes reveal_mode in event metadata', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-meta' })
    rawDb.prepare('UPDATE events SET is_published=1, reveal_mode=1 WHERE id=?').run(ev.id)

    const req = new Request('https://example.test/api/schedule?event=vol6-meta')
    const res = await scheduleHandler.onRequestGet({ request: req, env })
    const data = await res.json()
    expect(data.event.reveal_mode).toBe(1)
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm run test -- functions/api/__tests__/schedule-reveal.test.js --reporter=verbose
```

Expected: all 3 tests FAIL (reveal_mode column doesn't exist yet in the query).

---

### Task 6: Update schedule.js for reveal mode

**Files:**
- Modify: `functions/api/schedule.js`

- [ ] **Step 1: Add reveal_mode to the events SELECT**

Find both event queries (the `current` branch and the slug branch). Add `reveal_mode` to each SELECT:

```sql
-- current event query:
SELECT id, name, date, slug, status, ticket_url, theme_colors, venue_info, social_links, reveal_mode
FROM events
WHERE is_published = 1
  AND date >= date('now', '-6 hours')
ORDER BY date ASC
LIMIT 1

-- slug event query:
SELECT id, name, date, slug, status, ticket_url, theme_colors, venue_info, social_links, reveal_mode
FROM events
WHERE slug = ? AND (is_published = 1 OR status = 'archived')
```

- [ ] **Step 2: Add reveal mode filter to the performances query**

Replace the performances query SQL with:

```sql
SELECT
  p.id as performance_id,
  b.id as band_id,
  b.name,
  p.start_time as startTime,
  p.end_time as endTime,
  b.social_links,
  v.name as venue
FROM performances p
INNER JOIN band_profiles b ON p.band_profile_id = b.id
LEFT JOIN venues v ON p.venue_id = v.id
WHERE p.event_id = ?
  AND (? = 0 OR p.is_announced = 1)
ORDER BY p.start_time, v.name
```

Bind both `event.id` and `event.reveal_mode`:

```js
const bandsResult = await DB.prepare(`...sql above...`)
  .bind(event.id, event.reveal_mode)
  .all()
```

- [ ] **Step 3: Add reveal_mode to the event metadata response**

In the `eventMetadata` object:

```js
const eventMetadata = {
  id: event.id,
  name: event.name,
  date: event.date,
  slug: event.slug,
  ticket_url: event.ticket_url,
  is_archived: event.status === 'archived',
  reveal_mode: event.reveal_mode ?? 0,   // ← add this line
  theme_colors: event.theme_colors,
  venue_info: event.venue_info,
  social_links: event.social_links,
}
```

- [ ] **Step 4: Run the reveal mode tests**

```bash
npm run test -- functions/api/__tests__/schedule-reveal.test.js --reporter=verbose
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

---

### Task 7: Write failing tests for the announce PATCH endpoint

**Files:**
- Create: `functions/api/admin/bands/__tests__/announce.test.js`

- [ ] **Step 1: Create the test file**

```js
import { describe, it, expect } from 'vitest'
import { createTestEnv, insertEvent, insertVenue, insertBand } from '../../../test-utils'
import * as bandIdHandler from '../[id].js'

describe('PATCH /api/admin/bands/:id - announce toggle', () => {
  it('announces a performance (sets is_announced=1)', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-announce' })
    const venue = insertVenue(rawDb, { name: 'Venue X' })
    const band = insertBand(rawDb, { name: 'Test Band', event_id: ev.id, venue_id: venue.id })
    rawDb.prepare('UPDATE performances SET is_announced=0 WHERE id=?').run(band.id)

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.performance.is_announced).toBe(1)

    const row = rawDb.prepare('SELECT is_announced FROM performances WHERE id=?').get(band.id)
    expect(row.is_announced).toBe(1)
  })

  it('unannounces a performance (sets is_announced=0)', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-unannounce' })
    const venue = insertVenue(rawDb, { name: 'Venue Y' })
    const band = insertBand(rawDb, { name: 'Visible Band', event_id: ev.id, venue_id: venue.id })

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: false }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.performance.is_announced).toBe(0)
  })

  it('returns 400 if is_announced is missing from body', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-bad' })
    const band = insertBand(rawDb, { name: 'Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ unrelated: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(400)
  })

  it('requires at least editor role', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'viewer' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-auth' })
    const band = insertBand(rawDb, { name: 'Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'viewer', id: 3 } },
    })

    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm run test -- functions/api/admin/bands/__tests__/announce.test.js --reporter=verbose
```

Expected: all 4 tests FAIL (`onRequestPatch is not a function`).

---

### Task 8: Add onRequestPatch to bands/[id].js

**Files:**
- Modify: `functions/api/admin/bands/[id].js`

- [ ] **Step 1: Add the handler at the bottom of the file**

At the end of `functions/api/admin/bands/[id].js`, after `onRequestDelete`, add:

```js
// PATCH - Toggle is_announced for a performance
export async function onRequestPatch(context) {
  const { request, env } = context
  const { DB } = env

  const permCheck = await checkPermission(context, 'editor')
  if (permCheck.error) {
    return permCheck.response
  }

  const performanceId = getBandId(request)
  if (!performanceId || isNaN(performanceId)) {
    return new Response(
      JSON.stringify({ error: 'Bad request', message: 'Invalid performance ID' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const body = await request.json().catch(() => ({}))
  if (typeof body.is_announced !== 'boolean') {
    return new Response(
      JSON.stringify({ error: 'Bad request', message: 'is_announced (boolean) is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const performance = await DB.prepare(
    'SELECT id, is_announced FROM performances WHERE id = ?'
  ).bind(performanceId).first()

  if (!performance) {
    return new Response(
      JSON.stringify({ error: 'Not found', message: 'Performance not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const newValue = body.is_announced ? 1 : 0
  await DB.prepare(
    'UPDATE performances SET is_announced = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(newValue, performanceId).run()

  return new Response(
    JSON.stringify({
      success: true,
      performance: { id: Number(performanceId), is_announced: newValue },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
```

- [ ] **Step 2: Run announce tests**

```bash
npm run test -- functions/api/admin/bands/__tests__/announce.test.js --reporter=verbose
```

Expected: all 4 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

---

### Task 9: Create reveal-mode toggle endpoint

**Files:**
- Create: `functions/api/admin/events/[id]/reveal-mode.js`

This follows the same pattern as `functions/api/admin/events/[id]/publish.js`.

- [ ] **Step 1: Create the file**

```js
// Admin event reveal-mode endpoint
// POST /api/admin/events/{id}/reveal-mode
// Body: { reveal_mode: boolean }
// Returns: { success: true, event: { id, reveal_mode } }

import { checkPermission, auditLog } from '../../_middleware.js'
import { getClientIP } from '../../../../utils/request.js'

export async function onRequestPost(context) {
  const { request, env, params } = context
  const { DB } = env
  const eventId = params.id
  const ipAddress = getClientIP(request)

  try {
    const auth = await checkPermission(context, 'editor')
    if (auth.error) {
      return auth.response
    }

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({ error: 'Bad request', message: 'Invalid event ID' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const body = await request.json().catch(() => ({}))
    if (typeof body.reveal_mode !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'Bad request', message: 'reveal_mode (boolean) is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const event = await DB.prepare('SELECT id FROM events WHERE id = ?')
      .bind(eventId)
      .first()

    if (!event) {
      return new Response(
        JSON.stringify({ error: 'Not found', message: 'Event not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const newValue = body.reveal_mode ? 1 : 0
    await DB.prepare(
      "UPDATE events SET reveal_mode = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(newValue, eventId).run()

    await auditLog(DB, {
      action: newValue ? 'event_reveal_mode_on' : 'event_reveal_mode_off',
      success: true,
      ipAddress,
      details: JSON.stringify({ event_id: eventId }),
    })

    return new Response(
      JSON.stringify({
        success: true,
        event: { id: Number(eventId), reveal_mode: newValue },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[reveal-mode] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Commit Feature 2 backend**

```bash
git add migrations/0033_reveal_mode.sql \
  functions/api/test-utils.js \
  functions/api/schedule.js \
  "functions/api/admin/bands/[id].js" \
  "functions/api/admin/events/[id]/reveal-mode.js" \
  functions/api/admin/bands/__tests__/announce.test.js \
  "functions/api/__tests__/schedule-reveal.test.js"
git commit -m "feat: reveal mode backend — migration, schedule filter, announce toggle, reveal-mode endpoint"
```

---

### Task 10: Admin UI — Reveal Mode toggle in EventFormModal

**Files:**
- Modify: `frontend/src/admin/EventFormModal.jsx`

- [ ] **Step 1: Read the current EventFormModal**

Open `frontend/src/admin/EventFormModal.jsx`. Find where `is_published` is handled — you'll see a toggle or checkbox for it. The reveal mode toggle goes directly below it.

- [ ] **Step 2: Add reveal_mode to form state**

Find the `useState` for form fields. Add `reveal_mode: event?.reveal_mode ?? false` to the initial state object (or wherever `is_published` is tracked).

- [ ] **Step 3: Add the toggle in JSX**

After the `is_published` toggle section, add:

```jsx
<div className="flex items-center justify-between py-3 border-t border-white/10">
  <div>
    <label className="text-sm font-medium text-text-primary" htmlFor="reveal-mode">
      Reveal mode
    </label>
    <p className="text-xs text-text-secondary mt-0.5">
      When on, only announced bands appear on the public schedule.
    </p>
  </div>
  <button
    id="reveal-mode"
    type="button"
    role="switch"
    aria-checked={formData.reveal_mode}
    onClick={() => setFormData(prev => ({ ...prev, reveal_mode: !prev.reveal_mode }))}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500 ${
      formData.reveal_mode ? 'bg-accent-500' : 'bg-white/20'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        formData.reveal_mode ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
</div>
```

- [ ] **Step 4: Include reveal_mode in the save handler**

Find where the form calls `fetch` or a save function. Include `reveal_mode: formData.reveal_mode` in the request body alongside the existing fields. After the event saves, if `reveal_mode` changed, call the reveal-mode endpoint:

```js
// After saving the event fields, toggle reveal_mode if it changed:
if (formData.reveal_mode !== (event?.reveal_mode ?? false)) {
  await fetch(`/api/admin/events/${event.id}/reveal-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ reveal_mode: formData.reveal_mode }),
  })
}
```

(Use the same `csrfToken` already used in the form's save call.)

- [ ] **Step 5: Verify no type errors**

```bash
npm --prefix frontend run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

---

### Task 11: Admin UI — Announce toggle in LineupTab

**Files:**
- Modify: `frontend/src/admin/LineupTab.jsx`

- [ ] **Step 1: Read LineupTab**

Open `frontend/src/admin/LineupTab.jsx`. Find the table/list row where each band is rendered. You'll add an eye icon toggle at the end of each row.

- [ ] **Step 2: Add a toggleAnnounced handler**

Near the other handler functions (edit, delete), add:

```js
const toggleAnnounced = async (performanceId, currentValue) => {
  try {
    const res = await fetch(`/api/admin/bands/${performanceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ is_announced: !currentValue }),
    })
    if (!res.ok) throw new Error('Failed to toggle announcement')
    // Refresh the lineup list
    await loadBands()
  } catch (err) {
    console.error('[LineupTab] toggleAnnounced error:', err)
  }
}
```

(Use the same `csrfToken` and `loadBands` already in the component.)

- [ ] **Step 3: Add toggle button to each row**

In the row JSX, add the toggle button (use `faEye` / `faEyeSlash` from FontAwesome):

```jsx
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'

// In the row:
{selectedEvent?.reveal_mode === 1 && (
  <button
    onClick={() => toggleAnnounced(band.id, band.is_announced)}
    title={band.is_announced ? 'Announced — click to hide' : 'Hidden — click to announce'}
    className={`p-1.5 rounded transition-colors ${
      band.is_announced
        ? 'text-green-400 hover:text-green-300'
        : 'text-white/30 hover:text-white/60'
    }`}
    aria-label={band.is_announced ? `Unannounce ${band.name}` : `Announce ${band.name}`}
  >
    <FontAwesomeIcon icon={band.is_announced ? faEye : faEyeSlash} />
  </button>
)}
```

The button only shows when `selectedEvent?.reveal_mode === 1` so it doesn't clutter normal events.

Note: the `band.is_announced` field must be included in the lineup API response. Check `functions/api/admin/bands.js` GET handler and add `p.is_announced` to the SELECT if it isn't already there.

- [ ] **Step 4: Ensure is_announced is returned by the lineup GET**

Open `functions/api/admin/bands.js`. Find the GET query that lists bands for an event. Add `p.is_announced` to the SELECT list if absent:

```sql
SELECT
  p.id,
  p.start_time,
  p.end_time,
  p.notes,
  p.is_announced,   -- ← add this
  ...
```

- [ ] **Step 5: Build check**

```bash
npm --prefix frontend run build 2>&1 | tail -20
```

Expected: no errors.

---

### Task 12: Public UI — Reveal mode teaser banner in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

When `eventData.reveal_mode === 1`, show a teaser banner below the onboarding hint.

- [ ] **Step 1: Add the banner JSX**

In `App.jsx`, find the `/* First-time onboarding hint */` section. After it, add:

```jsx
{/* Reveal mode teaser — more bands dropping soon */}
{!isArchived && eventData?.reveal_mode === 1 && (
  <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-accent-500/10 border border-accent-500/20 text-sm">
    <FontAwesomeIcon icon={faBell} className="text-accent-400 shrink-0" aria-hidden="true" />
    <p className="text-accent-300">
      <span className="font-semibold">More bands dropping soon.</span>{' '}
      <a href="/subscribe" className="underline hover:text-accent-200 transition-colors">
        Subscribe for updates
      </a>{' '}
      or follow individual bands on their profile pages.
    </p>
  </div>
)}
```

Import `faBell` from `@fortawesome/free-solid-svg-icons` (it may already be imported).

- [ ] **Step 2: Build and run tests**

```bash
npm --prefix frontend run build 2>&1 | tail -5
npm run test 2>&1 | tail -10
```

Expected: build succeeds, all tests pass.

- [ ] **Step 3: Commit Feature 2 frontend**

```bash
git add frontend/src/admin/EventFormModal.jsx \
  frontend/src/admin/LineupTab.jsx \
  frontend/src/App.jsx \
  functions/api/admin/bands.js
git commit -m "feat: reveal mode admin UI — toggle in EventFormModal, announce toggle in LineupTab, teaser banner on public schedule"
```

---

## Feature 3 — Band Following

### Task 13: Create migration 0034

**Files:**
- Create: `migrations/0034_band_follows.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: 0034_band_follows
-- Description: New band_follows table (token-based email follows for individual bands)
--   and band_follow_notified column on performances to prevent duplicate notifications
--   when a band is announced multiple times.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

CREATE TABLE band_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  band_profile_id INTEGER NOT NULL REFERENCES band_profiles(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT UNIQUE,
  unsubscribe_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email, band_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_band_follows_band ON band_follows(band_profile_id);
CREATE INDEX IF NOT EXISTS idx_band_follows_email ON band_follows(email);

ALTER TABLE performances ADD COLUMN band_follow_notified INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply locally**

```bash
npm run migrate:local
```

Expected: migration applied successfully.

---

### Task 14: Update test-utils.js for band_follows

**Files:**
- Modify: `functions/api/test-utils.js`

- [ ] **Step 1: Add band_follows table to the in-memory schema**

In `functions/api/test-utils.js`, after the `email_subscriptions` CREATE TABLE block, add:

```sql
CREATE TABLE band_follows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  band_profile_id INTEGER NOT NULL REFERENCES band_profiles(id) ON DELETE CASCADE,
  verified INTEGER NOT NULL DEFAULT 0,
  verification_token TEXT UNIQUE,
  unsubscribe_token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email, band_profile_id)
);
```

- [ ] **Step 2: Add band_follow_notified to performances**

In the `CREATE TABLE performances` block, add:

```sql
band_follow_notified INTEGER NOT NULL DEFAULT 0
```

- [ ] **Step 3: Run existing tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

---

### Task 15: Write failing tests for the band follow endpoint

**Files:**
- Create: `functions/api/bands/__tests__/follow.test.js`

- [ ] **Step 1: Create the test file**

```js
import { describe, it, expect } from 'vitest'
import { createTestEnv, insertBand, insertEvent } from '../../test-utils'
import * as followHandler from '../[name]/follow.js'

describe('POST /api/bands/:name/follow', () => {
  it('creates a band follow for a valid email and band', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-follow' })
    const band = insertBand(rawDb, { name: 'Follow Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: String(band.band_profile_id) } })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    const row = rawDb.prepare('SELECT * FROM band_follows WHERE email=? AND band_profile_id=?')
      .get('fan@example.com', band.band_profile_id)
    expect(row).toBeTruthy()
    expect(row.verified).toBe(0)
    expect(row.unsubscribe_token).toBeTruthy()
  })

  it('returns 400 for an invalid email', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-bad-email' })
    const band = insertBand(rawDb, { name: 'Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: String(band.band_profile_id) } })
    expect(res.status).toBe(400)
  })

  it('returns 200 silently if email already follows the band (no duplicate row)', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-dup' })
    const band = insertBand(rawDb, { name: 'Dup Band', event_id: ev.id })

    // Insert existing follow
    rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)'
    ).run('fan@example.com', band.band_profile_id, 'existing-token')

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: String(band.band_profile_id) } })
    expect(res.status).toBe(200)

    // Still only one row
    const rows = rawDb.prepare('SELECT * FROM band_follows WHERE email=? AND band_profile_id=?')
      .all('fan@example.com', band.band_profile_id)
    expect(rows.length).toBe(1)
  })

  it('returns 404 if band does not exist', async () => {
    const { env } = createTestEnv()

    const req = new Request('https://example.test/api/bands/99999/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: '99999' } })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npm run test -- "functions/api/bands/__tests__/follow.test.js" --reporter=verbose
```

Expected: all 4 tests FAIL (file doesn't exist yet).

---

### Task 16: Create the band follow endpoint

**Files:**
- Create: `functions/api/bands/[name]/follow.js`

First, check if `functions/api/bands/[name]/` directory exists. If not, create it (it likely exists since `bands/{name}.js` or `bands/[name].js` handles the public band profile).

- [ ] **Step 1: Create the file**

```js
// POST /api/bands/:name/follow
// Body: { email: string }
// Stores a band follow. Email confirmation is skipped for MVP; follows are
// stored unverified and notifications fire when the band is announced.

import { isValidEmail } from '../../../utils/validation.js'
import { generateToken } from '../../../utils/tokens.js'
import { sendEmail, isEmailConfigured } from '../../../utils/email.js'

const MAX_EMAIL_LENGTH = 320

export async function onRequestPost(context) {
  const { request, env, params } = context
  const { DB } = env

  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email || email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Resolve band profile — params.name may be numeric ID or normalized name
    const nameOrId = params.name
    let band
    if (/^\d+$/.test(nameOrId)) {
      band = await DB.prepare('SELECT id, name FROM band_profiles WHERE id = ?')
        .bind(Number(nameOrId)).first()
    } else {
      const normalized = nameOrId.toLowerCase().replace(/[^a-z0-9]/g, '')
      band = await DB.prepare('SELECT id, name FROM band_profiles WHERE name_normalized = ?')
        .bind(normalized).first()
    }

    if (!band) {
      return new Response(
        JSON.stringify({ error: 'Band not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check for duplicate
    const existing = await DB.prepare(
      'SELECT id FROM band_follows WHERE email = ? AND band_profile_id = ?'
    ).bind(email, band.id).first()

    if (existing) {
      // Return 200 silently — avoid email enumeration
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const unsubscribeToken = generateToken()

    await DB.prepare(
      `INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token)
       VALUES (?, ?, 1, ?)`
    ).bind(email, band.id, unsubscribeToken).run()
    // verified=1 immediately (no email confirmation for MVP; reduce friction)

    // Optional: send a confirmation email
    if (isEmailConfigured(env)) {
      const publicUrl = env.PUBLIC_URL || 'https://settimes.ca'
      const unsubUrl = `${publicUrl}/api/bands/${band.id}/unfollow?token=${unsubscribeToken}`
      await sendEmail(env, {
        to: email,
        subject: `You're following ${band.name} on SetTimes`,
        text: `You'll be notified when ${band.name} joins a lineup.\n\nUnfollow: ${unsubUrl}`,
        html: `<p>You'll be notified when <strong>${band.name}</strong> joins a lineup.</p>
               <p><a href="${unsubUrl}">Unfollow</a></p>`,
      }).catch(() => {}) // fire-and-forget
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[band-follow] Error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

- [ ] **Step 2: Run the follow tests**

```bash
npm run test -- "functions/api/bands/__tests__/follow.test.js" --reporter=verbose
```

Expected: all 4 tests PASS.

- [ ] **Step 3: Run full test suite**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

---

### Task 17: Add notification trigger to announce PATCH handler

**Files:**
- Modify: `functions/api/admin/bands/[id].js`

When `is_announced` flips from 0 → 1, email all verified followers of that band.

- [ ] **Step 1: Write failing tests for notification trigger**

Add to `functions/api/admin/bands/__tests__/announce.test.js`:

```js
it('sets band_follow_notified=1 when band is announced and followers exist', async () => {
  const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
  const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-notify' })
  rawDb.prepare('UPDATE events SET reveal_mode=1 WHERE id=?').run(ev.id)
  const venue = insertVenue(rawDb, { name: 'Venue N' })
  const band = insertBand(rawDb, { name: 'Notify Band', event_id: ev.id, venue_id: venue.id })
  rawDb.prepare('UPDATE performances SET is_announced=0 WHERE id=?').run(band.id)

  // Insert a verified follower
  rawDb.prepare(
    'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
  ).run('follower@example.com', band.band_profile_id, 'unsub-token-1')

  const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ is_announced: true }),
  })
  await bandIdHandler.onRequestPatch({
    request: req,
    env,
    data: { user: { role: 'editor', id: 2 } },
  })

  // Email sending is fire-and-forget and skipped in test env (no EMAIL_FROM configured).
  // What we can assert is the DB flag that prevents re-notification.
  const row = rawDb.prepare('SELECT band_follow_notified FROM performances WHERE id=?').get(band.id)
  expect(row.band_follow_notified).toBe(1)
})

it('does not re-notify followers if band was already notified', async () => {
  const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
  const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-renotify' })
  const band = insertBand(rawDb, { name: 'Already Notified', event_id: ev.id })
  // Set is_announced=0 but band_follow_notified=1 (was announced then un-announced)
  rawDb.prepare('UPDATE performances SET is_announced=0, band_follow_notified=1 WHERE id=?').run(band.id)
  rawDb.prepare(
    'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
  ).run('follower2@example.com', band.band_profile_id, 'unsub-token-2')

  const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ is_announced: true }),
  })
  const res = await bandIdHandler.onRequestPatch({
    request: req,
    env,
    data: { user: { role: 'editor', id: 2 } },
  })

  expect(res.status).toBe(200)
  // band_follow_notified should still be 1, no second notification sent
  const row = rawDb.prepare('SELECT band_follow_notified FROM performances WHERE id=?').get(band.id)
  expect(row.band_follow_notified).toBe(1)
})
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
npm run test -- functions/api/admin/bands/__tests__/announce.test.js --reporter=verbose
```

Expected: the 2 new tests FAIL, the original 4 still PASS.

- [ ] **Step 3: Update onRequestPatch to trigger notifications**

In `functions/api/admin/bands/[id].js`, first add a static import at the top of the file (alongside the existing imports):

```js
import { sendEmail, isEmailConfigured } from '../../utils/email.js'
```

Then update the `onRequestPatch` handler. After the UPDATE statement, add:

```js
// Only notify on 0 → 1 transition, and only if not already notified
if (newValue === 1 && performance.is_announced === 0) {
  const alreadyNotified = await DB.prepare(
    'SELECT band_follow_notified FROM performances WHERE id = ?'
  ).bind(performanceId).first()

  if (!alreadyNotified?.band_follow_notified) {
    // Get band_profile_id for this performance
    const perf = await DB.prepare(
      'SELECT p.band_profile_id, bp.name as band_name, e.name as event_name FROM performances p JOIN band_profiles bp ON p.band_profile_id = bp.id JOIN events e ON p.event_id = e.id WHERE p.id = ?'
    ).bind(performanceId).first()

    if (perf) {
      const { results: followers } = await DB.prepare(
        'SELECT email, unsubscribe_token FROM band_follows WHERE band_profile_id = ? AND verified = 1'
      ).bind(perf.band_profile_id).all()

      if (followers.length > 0) {
        // sendEmail and isEmailConfigured are imported statically at the top of [id].js
        // (add: import { sendEmail, isEmailConfigured } from '../../utils/email.js')
        const publicUrl = env.PUBLIC_URL || 'https://settimes.ca'

        if (isEmailConfigured(env)) {
          await Promise.allSettled(
            followers.map(follower => {
              const unsubUrl = `${publicUrl}/api/bands/${perf.band_profile_id}/unfollow?token=${follower.unsubscribe_token}`
              return sendEmail(env, {
                to: follower.email,
                subject: `${perf.band_name} just joined the lineup!`,
                text: `${perf.band_name} is now on the lineup for ${perf.event_name}.\n\nUnfollow: ${unsubUrl}`,
                html: `<p><strong>${perf.band_name}</strong> is now on the lineup for <strong>${perf.event_name}</strong>.</p><p><a href="${unsubUrl}">Unfollow this band</a></p>`,
              })
            })
          )
        }

        // Mark as notified so re-announcing doesn't re-send
        await DB.prepare(
          'UPDATE performances SET band_follow_notified = 1 WHERE id = ?'
        ).bind(performanceId).run()
      }
    }
  }
}
```

Also update the response to include `band_follow_notified`:

```js
return new Response(
  JSON.stringify({
    success: true,
    performance: {
      id: Number(performanceId),
      is_announced: newValue,
      band_follow_notified: newValue === 1 ? 1 : (performance.band_follow_notified ?? 0),
    },
  }),
  { status: 200, headers: { 'Content-Type': 'application/json' } }
)
```

- [ ] **Step 4: Run announce tests**

```bash
npm run test -- functions/api/admin/bands/__tests__/announce.test.js --reporter=verbose
```

Expected: all 6 tests PASS.

---

### Task 18: Follow button on BandProfilePage

**Files:**
- Modify: `frontend/src/pages/BandProfilePage.jsx`

- [ ] **Step 1: Add follow state**

Near the top of the `BandProfilePage` component, add:

```js
const [followEmail, setFollowEmail] = useState('')
const [followStatus, setFollowStatus] = useState('idle') // 'idle' | 'loading' | 'success' | 'error'
const [followError, setFollowError] = useState('')
```

- [ ] **Step 2: Add submitFollow handler**

```js
const submitFollow = async e => {
  e.preventDefault()
  if (!followEmail.trim()) return
  setFollowStatus('loading')
  setFollowError('')
  try {
    const res = await fetch(`/api/bands/${bandData.id}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: followEmail.trim() }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Something went wrong')
    }
    setFollowStatus('success')
  } catch (err) {
    setFollowStatus('error')
    setFollowError(err.message)
  }
}
```

- [ ] **Step 3: Add follow section JSX**

Find the section with social links or "Upcoming Shows". Add the follow form below it:

```jsx
<div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
  <h3 className="text-sm font-semibold text-text-primary mb-1">
    Follow {bandData.name}
  </h3>
  <p className="text-xs text-text-secondary mb-3">
    Get notified when they join a new lineup.
  </p>
  {followStatus === 'success' ? (
    <p className="text-sm text-green-400">
      <FontAwesomeIcon icon={faCheck} className="mr-1.5" />
      You&apos;re following {bandData.name}!
    </p>
  ) : (
    <form onSubmit={submitFollow} className="flex gap-2">
      <input
        type="email"
        value={followEmail}
        onChange={e => setFollowEmail(e.target.value)}
        placeholder="your@email.com"
        required
        className="flex-1 px-3 py-2 rounded bg-bg-navy text-white border border-white/20 focus:border-accent-500 focus:outline-none text-sm"
        aria-label={`Email to follow ${bandData.name}`}
      />
      <Button type="submit" disabled={followStatus === 'loading'} size="sm">
        {followStatus === 'loading' ? 'Saving…' : 'Follow'}
      </Button>
    </form>
  )}
  {followStatus === 'error' && (
    <p className="text-xs text-red-400 mt-1">{followError}</p>
  )}
</div>
```

`faCheck` is already imported in `BandProfilePage.jsx`.

- [ ] **Step 4: Build**

```bash
npm --prefix frontend run build 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 6: Commit Feature 3**

```bash
git add migrations/0034_band_follows.sql \
  functions/api/test-utils.js \
  "functions/api/bands/[name]/follow.js" \
  "functions/api/bands/__tests__/follow.test.js" \
  "functions/api/admin/bands/[id].js" \
  frontend/src/pages/BandProfilePage.jsx
git commit -m "feat: band following — follow endpoint, notification trigger on announce, Follow button on band profiles"
```

---

## Apply Migrations to Production

After all three features are merged to main:

```bash
npx wrangler d1 migrations apply settimes-production-db --remote
```

Verify with:

```bash
npx wrangler d1 execute settimes-production-db --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Expected: `band_follows` appears in the list.

---

## Phase 2 Reminder (post May 17)

- Post-event recap page: `GET /api/events/:slug/recap` + `frontend/src/pages/EventRecapPage.jsx`
- Historical archive backfill admin UI: streamlined band-only lineup entry in `EventsTab.jsx`

These have their own plan to be written separately.
