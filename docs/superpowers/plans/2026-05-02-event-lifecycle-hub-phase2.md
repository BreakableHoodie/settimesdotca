# Event Lifecycle Hub — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a post-event recap page at `/events/:slug/recap` and a historical archive backfill admin UI that lets the organizer paste a band list to create archived events.

**Architecture:** The recap API handler at `functions/api/events/[id]/recap.js` accepts slug or numeric ID, uses a correlated EXISTS subquery to classify first-timers vs returning acts, and aggregates stats in JavaScript. The public React page at `frontend/src/pages/EventRecapPage.jsx` is lazy-loaded. The historical import modal at `frontend/src/admin/HistoricalImportModal.jsx` reuses existing `eventsApi.create()` + `bandsApi.create()` — no new API endpoints.

**Tech Stack:** Cloudflare Pages Functions, D1/SQLite, React 19, React Router v7, Vitest

---

### Task 1: Recap API Endpoint

**Files:**
- Create: `functions/api/events/[id]/recap.js`
- Create: `functions/api/events/__tests__/recap.test.js`

- [ ] **Step 1: Write the failing tests**

Create `functions/api/events/__tests__/recap.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { onRequestGet } from '../[id]/recap.js'
import { createTestEnv, insertEvent, insertVenue, insertBand } from '../../test-utils.js'

describe('GET /api/events/:id/recap', () => {
  it('returns 404 for non-archived events', async () => {
    const { env, rawDb } = createTestEnv()
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true'
    const event = insertEvent(rawDb, { name: 'Draft Fest', slug: 'draft-fest' })
    // status defaults to null / not archived

    const res = await onRequestGet({
      request: new Request('https://example.test/api/events/draft-fest/recap'),
      env,
      params: { id: 'draft-fest' },
    })
    expect(res.status).toBe(404)
  })

  it('returns stats and bands for an archived event by slug', async () => {
    const { env, rawDb } = createTestEnv()
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true'
    const event = insertEvent(rawDb, { name: 'LWBC Vol5', slug: 'lwbc-vol5' })
    rawDb.prepare("UPDATE events SET status='archived', is_published=1 WHERE id=?").run(event.id)
    const venue = insertVenue(rawDb, { name: 'The Main Stage' })
    insertBand(rawDb, { name: 'Band A', event_id: event.id, venue_id: venue.id })
    insertBand(rawDb, { name: 'Band B', event_id: event.id, venue_id: venue.id })

    const res = await onRequestGet({
      request: new Request('https://example.test/api/events/lwbc-vol5/recap'),
      env,
      params: { id: 'lwbc-vol5' },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.event.slug).toBe('lwbc-vol5')
    expect(data.stats.total_sets).toBe(2)
    expect(data.stats.venue_count).toBe(1)
    expect(data.bands).toHaveLength(2)
  })

  it('accepts numeric id', async () => {
    const { env, rawDb } = createTestEnv()
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true'
    const event = insertEvent(rawDb, { name: 'LWBC Vol4', slug: 'lwbc-vol4' })
    rawDb.prepare("UPDATE events SET status='archived', is_published=1 WHERE id=?").run(event.id)
    insertBand(rawDb, { name: 'Solo Act', event_id: event.id })

    const res = await onRequestGet({
      request: new Request(`https://example.test/api/events/${event.id}/recap`),
      env,
      params: { id: String(event.id) },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.event.id).toBe(event.id)
  })

  it('classifies first-timers vs returning acts', async () => {
    const { env, rawDb } = createTestEnv()
    env.PUBLIC_DATA_PUBLISH_ENABLED = 'true'

    // Create a prior event and a band that played it
    const priorEvent = insertEvent(rawDb, { name: 'LWBC Vol3', slug: 'lwbc-vol3' })
    rawDb.prepare("UPDATE events SET status='archived', is_published=1 WHERE id=?").run(priorEvent.id)
    const returningBand = insertBand(rawDb, { name: 'Returning Band', event_id: priorEvent.id })

    // Current event with one returning + one new band
    const event = insertEvent(rawDb, { name: 'LWBC Vol4', slug: 'lwbc-vol4b' })
    rawDb.prepare("UPDATE events SET status='archived', is_published=1 WHERE id=?").run(event.id)

    // Reuse same band_profile_id for the returning band
    rawDb.prepare(
      'INSERT INTO performances (event_id, band_profile_id) VALUES (?, ?)'
    ).run(event.id, returningBand.band_profile_id)

    // New band (first timer)
    insertBand(rawDb, { name: 'New Band', event_id: event.id })

    const res = await onRequestGet({
      request: new Request(`https://example.test/api/events/${event.id}/recap`),
      env,
      params: { id: String(event.id) },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.stats.first_timers).toBe(1)
    expect(data.stats.returning_acts).toBe(1)
  })

  it('returns 503 if public gate is off', async () => {
    const { env, rawDb } = createTestEnv()
    // PUBLIC_DATA_PUBLISH_ENABLED not set
    const event = insertEvent(rawDb, { name: 'Gated', slug: 'gated' })
    rawDb.prepare("UPDATE events SET status='archived', is_published=1 WHERE id=?").run(event.id)

    const res = await onRequestGet({
      request: new Request('https://example.test/api/events/gated/recap'),
      env,
      params: { id: 'gated' },
    })
    expect(res.status).toBe(503)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/andrelevesque/Projects/settimesdotca/.worktrees/feat-event-lifecycle-hub
npx vitest run functions/api/events/__tests__/recap.test.js
```

Expected: FAIL — `Cannot find module '../[id]/recap.js'`

- [ ] **Step 3: Implement the endpoint**

Create `functions/api/events/[id]/recap.js`:

```js
import { getPublicDataGateResponse } from "../../../utils/publicGate.js";

export async function onRequestGet(context) {
  const { env, params } = context;
  const gate = getPublicDataGateResponse(env);
  if (gate) return gate;
  const { DB } = env;

  const idOrSlug = params.id;
  let event;
  try {
    if (/^\d+$/.test(idOrSlug)) {
      event = await DB.prepare(
        `SELECT id, name, slug, date, status FROM events WHERE id = ? AND status = 'archived'`
      ).bind(Number(idOrSlug)).first();
    } else {
      event = await DB.prepare(
        `SELECT id, name, slug, date, status FROM events WHERE slug = ? AND status = 'archived'`
      ).bind(idOrSlug).first();
    }
  } catch (err) {
    console.error("[recap] DB error resolving event:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch recap" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!event) {
    return new Response(JSON.stringify({ error: "Recap not available for this event" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { results: rows } = await DB.prepare(`
      SELECT
        bp.id   AS band_id,
        bp.name AS band_name,
        bp.genre,
        bp.photo_url,
        p.start_time,
        p.end_time,
        v.id   AS venue_id,
        v.name AS venue_name,
        CASE WHEN EXISTS (
          SELECT 1 FROM performances p2
          WHERE p2.band_profile_id = bp.id AND p2.event_id != ?
        ) THEN 1 ELSE 0 END AS is_returning
      FROM performances p
      JOIN band_profiles bp ON p.band_profile_id = bp.id
      LEFT JOIN venues v ON p.venue_id = v.id
      WHERE p.event_id = ?
      ORDER BY p.start_time NULLS LAST, bp.name
    `).bind(event.id, event.id).all();

    const venueIds = new Set();
    let firstTimers = 0;
    let returningActs = 0;

    const bands = rows.map((row) => {
      if (row.venue_id) venueIds.add(row.venue_id);
      if (row.is_returning) returningActs++;
      else firstTimers++;
      return {
        id: row.band_id,
        name: row.band_name,
        genre: row.genre,
        photo_url: row.photo_url,
        start_time: row.start_time,
        end_time: row.end_time,
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        is_returning: Boolean(row.is_returning),
      };
    });

    return new Response(
      JSON.stringify({
        event: { id: event.id, name: event.name, slug: event.slug, date: event.date },
        stats: {
          total_sets: bands.length,
          venue_count: venueIds.size,
          first_timers: firstTimers,
          returning_acts: returningActs,
        },
        bands,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      }
    );
  } catch (err) {
    console.error("[recap] Error building recap:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch recap" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run functions/api/events/__tests__/recap.test.js
```

Expected: 5 tests passing

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
npx vitest run
```

Expected: All tests passing

- [ ] **Step 6: Commit**

```bash
git add functions/api/events/\[id\]/recap.js functions/api/events/__tests__/recap.test.js
git commit -m "feat: add GET /api/events/:id/recap endpoint"
```

---

### Task 2: Event Recap Frontend Page

**Files:**
- Create: `frontend/src/pages/EventRecapPage.jsx`
- Modify: `frontend/src/main.jsx` (add lazy import + route)

- [ ] **Step 1: Create the page component**

Create `frontend/src/pages/EventRecapPage.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { Helmet, HelmetProvider } from 'react-helmet-async'
import { Link, useParams } from 'react-router-dom'
import { fetchPublicJson } from '../utils/publicApi'
import { formatTimeRange, parseLocalDate } from '../utils/timeFormat'
import { Loading, Alert } from '../components/ui'

export default function EventRecapPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchPublicJson(`/api/events/${slug}/recap`)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load recap')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [slug])

  if (loading) return <Loading />
  if (error)
    return (
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple flex items-center justify-center p-4">
        <Alert type="error">{error}</Alert>
      </div>
    )
  if (!data) return null

  const { event, stats, bands } = data
  const eventDate = parseLocalDate(event.date)
  const formattedDate = eventDate
    ? eventDate.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
    : event.date

  return (
    <HelmetProvider>
      <Helmet>
        <title>{event.name} — Recap | SetTimes</title>
        <meta name="description" content={`${event.name} recap: ${stats.total_sets} sets across ${stats.venue_count} venues.`} />
      </Helmet>
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple text-white">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Back */}
          <Link
            to="/"
            className="text-accent-400 hover:underline text-sm mb-6 inline-block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
          >
            ← All Events
          </Link>

          {/* Header */}
          <header className="mb-8">
            <p className="text-accent-300 text-sm font-medium uppercase tracking-wider mb-1">
              Event Recap
            </p>
            <h1 className="text-3xl font-bold mb-1">{event.name}</h1>
            <p className="text-gray-400">{formattedDate}</p>
          </header>

          {/* Stats */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8" aria-label="Event statistics">
            <StatCard label="Sets" value={stats.total_sets} />
            <StatCard label="Venues" value={stats.venue_count} />
            <StatCard label="First Timers" value={stats.first_timers} />
            <StatCard label="Returning Acts" value={stats.returning_acts} />
          </section>

          {/* Band list */}
          <section aria-label="Full lineup">
            <h2 className="text-xl font-semibold mb-4">Full Lineup</h2>
            <ul className="space-y-2">
              {bands.map((band) => (
                <li
                  key={band.id}
                  className="bg-white/5 rounded-lg px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <Link
                      to={`/band/${band.id}`}
                      className="font-medium hover:text-accent-400 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                    >
                      {band.name}
                    </Link>
                    {band.venue_name && (
                      <p className="text-gray-400 text-sm">{band.venue_name}</p>
                    )}
                  </div>
                  <div className="text-right text-sm text-gray-300 shrink-0">
                    {band.start_time
                      ? formatTimeRange(band.start_time, band.end_time)
                      : ''}
                    {!band.is_returning && (
                      <span className="ml-2 text-xs bg-accent-500/20 text-accent-300 px-2 py-0.5 rounded-full">
                        First timer
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Subscribe CTA */}
          <div className="mt-10 text-center">
            <p className="text-gray-400 mb-3">Don't miss the next one.</p>
            <Link
              to="/subscribe"
              className="inline-block bg-accent-500 hover:bg-accent-600 text-white font-medium px-6 py-2 rounded-lg transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
            >
              Get notified
            </Link>
          </div>
        </div>
      </div>
    </HelmetProvider>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-gray-400 text-sm">{label}</p>
    </div>
  )
}
```

- [ ] **Step 2: Add lazy import and route to `main.jsx`**

In `frontend/src/main.jsx`, after the `BandProfilePage` lazy import line, add:

```js
const EventRecapPage = lazy(() => import('./pages/EventRecapPage.jsx'))
```

Then add the route before the `/band/:id` route:

```jsx
<Route
  path="/events/:slug/recap"
  element={
    <ErrorBoundary title="Recap Error" message="Unable to load event recap. Please try again.">
      <Suspense fallback={<LoadingFallback />}>
        <EventRecapPage />
      </Suspense>
    </ErrorBoundary>
  }
/>
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /Users/andrelevesque/Projects/settimesdotca/.worktrees/feat-event-lifecycle-hub
npx vitest run
```

Expected: All tests passing (no new tests for the React page — manual QA in browser)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EventRecapPage.jsx frontend/src/main.jsx
git commit -m "feat: add /events/:slug/recap page"
```

---

### Task 3: Historical Import Modal

**Files:**
- Create: `frontend/src/admin/HistoricalImportModal.jsx`

The modal is a two-step wizard:
- Step 1: Event info (name, date — auto-generates slug from name, status will be `archived`)
- Step 2: Band list (textarea, one name per line)

It calls `eventsApi.create()` then loops over band names calling `bandsApi.create()`. No new API endpoints needed — the existing `POST /api/admin/bands` handler already does find-or-create by `name_normalized`.

- [ ] **Step 1: Build the component**

Create `frontend/src/admin/HistoricalImportModal.jsx`:

```jsx
import { useState } from 'react'
import { eventsApi, bandsApi } from '../utils/adminApi'

const buttonFocusClass =
  'border border-transparent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-purple'

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export default function HistoricalImportModal({ onClose, onImported }) {
  const [step, setStep] = useState(1) // 1 = event info, 2 = band list
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [bandListText, setBandListText] = useState('')
  const [createdEvent, setCreatedEvent] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState(null) // { done, total }
  const [errors, setErrors] = useState([])

  async function handleCreateEvent(e) {
    e.preventDefault()
    if (!eventName.trim() || !eventDate) return
    setSubmitting(true)
    setErrors([])
    try {
      const slug = generateSlug(eventName)
      const result = await eventsApi.create({
        name: eventName.trim(),
        date: eventDate,
        slug,
        status: 'archived',
        is_published: 0,
      })
      setCreatedEvent(result.event || result)
      setStep(2)
    } catch (err) {
      setErrors([err.message || 'Failed to create event'])
    } finally {
      setSubmitting(false)
    }
  }

  async function handleImportBands(e) {
    e.preventDefault()
    const names = bandListText
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)
    if (names.length === 0) return

    setSubmitting(true)
    setErrors([])
    setProgress({ done: 0, total: names.length })
    const failed = []

    for (let i = 0; i < names.length; i++) {
      try {
        await bandsApi.create({ eventId: createdEvent.id, name: names[i] })
      } catch (err) {
        failed.push(`${names[i]}: ${err.message || 'unknown error'}`)
      }
      setProgress({ done: i + 1, total: names.length })
    }

    setSubmitting(false)
    if (failed.length > 0) {
      setErrors(failed)
    } else {
      onImported?.()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="bg-bg-purple rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="import-modal-title" className="text-lg font-semibold text-white">
            Import Historical Event{step === 2 ? ` — ${createdEvent?.name}` : ''}
          </h2>
          <button
            onClick={onClose}
            className={`text-gray-400 hover:text-white ${buttonFocusClass} rounded`}
            aria-label="Close modal"
            disabled={submitting}
          >
            ✕
          </button>
        </div>

        {errors.length > 0 && (
          <div className="mb-4 bg-red-900/30 text-red-300 rounded-lg p-3 text-sm">
            {errors.map((err, i) => (
              <p key={i}>{err}</p>
            ))}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="hist-event-name">
                Event Name
              </label>
              <input
                id="hist-event-name"
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                required
                placeholder="Long Weekend Band Crawl Vol. 3"
                className="w-full bg-white/10 text-white rounded-lg px-3 py-2 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="hist-event-date">
                Date
              </label>
              <input
                id="hist-event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
                className="w-full bg-white/10 text-white rounded-lg px-3 py-2 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg ${buttonFocusClass}`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !eventName.trim() || !eventDate}
                className={`px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg ${buttonFocusClass}`}
              >
                {submitting ? 'Creating…' : 'Next: Add Bands →'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleImportBands} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-300 mb-1" htmlFor="hist-band-list">
                Band Names (one per line)
              </label>
              <textarea
                id="hist-band-list"
                value={bandListText}
                onChange={(e) => setBandListText(e.target.value)}
                rows={10}
                placeholder="The Raging Hormones&#10;Velvet Thunder&#10;Disco Apocalypse"
                className="w-full bg-white/10 text-white rounded-lg px-3 py-2 text-sm font-mono focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
              />
              <p className="text-xs text-gray-500 mt-1">
                Existing band profiles will be matched by name. New profiles will be created automatically.
              </p>
            </div>
            {progress && (
              <p className="text-sm text-gray-300">
                Importing… {progress.done} / {progress.total}
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg ${buttonFocusClass}`}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !bandListText.trim()}
                className={`px-4 py-2 text-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg ${buttonFocusClass}`}
              >
                {submitting ? `Importing… ${progress?.done ?? 0}/${progress?.total ?? 0}` : 'Import Bands'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run the full test suite to check for regressions**

```bash
cd /Users/andrelevesque/Projects/settimesdotca/.worktrees/feat-event-lifecycle-hub
npx vitest run
```

Expected: All tests passing

- [ ] **Step 3: Commit**

```bash
git add frontend/src/admin/HistoricalImportModal.jsx
git commit -m "feat: add HistoricalImportModal component for archive backfill"
```

---

### Task 4: Wire Historical Import into EventsTab

**Files:**
- Modify: `frontend/src/admin/EventsTab.jsx`

Add an "Import historical event" button that opens `HistoricalImportModal`. The button should only appear for admin-role users (editors do not have permission to create archived events). Place the button in the header area near the existing "New Event" button.

- [ ] **Step 1: Read the current EventsTab header area to find the button placement**

Read `frontend/src/admin/EventsTab.jsx` lines 1–150 to locate the "New Event" button and the user role check pattern already present in the file.

- [ ] **Step 2: Add the import and state to EventsTab**

At the top of `EventsTab.jsx`, add the import:

```js
import HistoricalImportModal from './HistoricalImportModal'
```

Inside the component, add state:

```js
const [showHistoricalImport, setShowHistoricalImport] = useState(false)
```

- [ ] **Step 3: Add the "Import historical event" button**

Locate the area where the "New Event" button is rendered. Wrap both buttons in the same container. Only show the import button when the current user has admin role.

The `currentUser` is available via `useEventContext()` as `context.user`. The pattern for role checks elsewhere in the admin panel is `currentUser?.role === 'admin'`.

Add the button next to the existing "New Event" button:

```jsx
{currentUser?.role === 'admin' && (
  <button
    onClick={() => setShowHistoricalImport(true)}
    className={`px-3 py-1.5 text-sm text-gray-300 hover:text-white border border-white/20 hover:border-white/40 rounded-lg transition-colors ${buttonFocusClass}`}
  >
    Import historical event
  </button>
)}
```

- [ ] **Step 4: Render the modal**

At the bottom of the EventsTab JSX return, just before the closing `</div>`, add:

```jsx
{showHistoricalImport && (
  <HistoricalImportModal
    onClose={() => setShowHistoricalImport(false)}
    onImported={() => {
      setShowHistoricalImport(false)
      loadEvents()
    }}
  />
)}
```

Where `loadEvents` is the function that refreshes the event list (check the component for its exact name — it may be `fetchEvents`, `refreshEvents`, or `loadData`).

- [ ] **Step 5: Run the full test suite**

```bash
cd /Users/andrelevesque/Projects/settimesdotca/.worktrees/feat-event-lifecycle-hub
npx vitest run
```

Expected: All tests passing

- [ ] **Step 6: Commit**

```bash
git add frontend/src/admin/EventsTab.jsx
git commit -m "feat: add 'Import historical event' button to EventsTab"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| `GET /api/events/:slug/recap` returns stats + band list | Task 1 |
| Recap only for archived events | Task 1 (404 for non-archived) |
| First-timers vs returning acts classification | Task 1 |
| Public gate enforcement | Task 1 |
| `/events/:slug/recap` frontend route | Task 2 |
| Lazy-loaded React page with stats, band list, subscribe CTA | Task 2 |
| Historical import: create archived event | Task 3 |
| Historical import: paste band list, find-or-create profiles | Task 3 |
| Wire import button into EventsTab (admin only) | Task 4 |

### No placeholders found.

### Type consistency

- `event.id` is numeric throughout (recap API returns `id: event.id` not slug)
- `band.id` = `band_profile_id` from the DB (consistent with BandProfilePage which uses `/band/:id`)
- `is_returning` is a boolean in the JS layer (coerced via `Boolean(row.is_returning)` from SQLite 0/1)
- `eventsApi.create()` / `bandsApi.create()` match existing signatures in `adminApi.js`
