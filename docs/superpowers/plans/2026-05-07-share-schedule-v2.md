# Share Schedule v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `?s=` URL-based schedule sharing with server-side snapshot links at `/s/[slug]` — short URLs, OG tag previews for messaging apps, and an explicit import flow that never silently overwrites a visitor's schedule.

**Architecture:** A `share_links` D1 table stores snapshots (performance IDs + band name snapshot + 30-day TTL). A CF Pages Function at `/s/[slug]` injects OG meta tags into `index.html` for social crawlers. A new `SharePreviewPage` React route shows the shared schedule read-only; clicking "Add to my route" navigates to the event page where a `?share=[slug]` param triggers the existing merge/replace modal.

**Tech Stack:** Cloudflare D1 (SQLite), Cloudflare Pages Functions, React 18, React Router v6, Vitest, better-sqlite3 (tests)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `migrations/0037_share_links.sql` | Create | `share_links` table DDL |
| `functions/api/test-utils.js` | Modify | Add `share_links` table and `insertShareLink` helper to test DB |
| `functions/api/schedule/share.js` | Create | `POST /api/schedule/share` — create snapshot, return slug |
| `functions/api/schedule/__tests__/share-create.test.js` | Create | Tests for POST handler |
| `functions/api/schedule/share/[slug].js` | Create | `GET /api/schedule/share/[slug]` — fetch snapshot |
| `functions/api/schedule/__tests__/share-get.test.js` | Create | Tests for GET handler |
| `functions/utils/rateLimit.js` | Modify | Add rate limit entries for new endpoints |
| `functions/scheduled/expire-share-links.js` | Create | Delete expired `share_links` rows |
| `functions/_scheduled.js` | Modify | Wire in `expireShareLinks` |
| `functions/s/[slug].js` | Create | CF Pages Function — inject OG tags into `index.html` |
| `_routes.json` | Modify | Add `/s/*` to `include` |
| `frontend/src/pages/SharePreviewPage.jsx` | Create | Read-only preview page at `/s/:slug` |
| `frontend/src/main.jsx` | Modify | Register `/s/:slug` route |
| `frontend/src/components/MySchedule.jsx` | Modify | Call API in `handleShareSchedule`; add `eventId` prop |
| `frontend/src/App.jsx` | Modify | Add `?share=` handler; pass `eventId` to `MySchedule`; add `pendingSharedBandNames` state |

---

## Task 1: Migration — `share_links` table

**Files:**
- Create: `migrations/0037_share_links.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Migration: 0037_share_links
-- Description: share_links table for server-side schedule snapshot sharing.
--   Each row stores a snapshot of performance IDs and band names for a shared route,
--   with a 30-day TTL enforced lazily on reads and cleaned up by the scheduled worker.
--
-- Apply locally:  npm run migrate:local
-- Apply to prod:  npx wrangler d1 migrations apply settimes-production-db --remote

CREATE TABLE share_links (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT    NOT NULL UNIQUE,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_slug      TEXT    NOT NULL,
  performance_ids TEXT    NOT NULL,
  band_names      TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_slug ON share_links(slug);
```

- [ ] **Step 2: Apply locally**

```bash
npm run migrate:local
```

Expected: migration applies without error.

- [ ] **Step 3: Commit**

```bash
git add migrations/0037_share_links.sql
git commit -m "feat: add share_links migration"
```

---

## Task 2: Update test utilities

**Files:**
- Modify: `functions/api/test-utils.js`

- [ ] **Step 1: Add `share_links` table to `createTestDB()`**

In `createTestDB()`, find the `rate_limits` table definition (the last table in the big SQL string) and add the `share_links` DDL directly after it, before the closing backtick of the SQL template literal:

```sql
    CREATE TABLE share_links (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      slug            TEXT    NOT NULL UNIQUE,
      event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      event_slug      TEXT    NOT NULL,
      performance_ids TEXT    NOT NULL,
      band_names      TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      expires_at      TEXT    NOT NULL
    );
```

- [ ] **Step 2: Add `insertShareLink` helper at the bottom of `test-utils.js`**

Add this function after the existing `createTestEnv` export:

```js
export function insertShareLink(
  db,
  {
    slug = 'testslug',
    event_id,
    event_slug = 'test-event',
    performance_ids = [1],
    band_names = ['Test Band'],
    expires_at = null,
  } = {}
) {
  const expiresAt =
    expires_at ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '')

  const stmt = db.prepare(
    `INSERT INTO share_links (slug, event_id, event_slug, performance_ids, band_names, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  const info = stmt.run(
    slug,
    event_id,
    event_slug,
    JSON.stringify(performance_ids),
    JSON.stringify(band_names),
    expiresAt
  )
  return db.prepare('SELECT * FROM share_links WHERE id = ?').get(info.lastInsertRowid)
}
```

- [ ] **Step 3: Run existing tests to confirm no regression**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add functions/api/test-utils.js
git commit -m "test: add share_links table and insertShareLink helper to test utils"
```

---

## Task 3: POST `/api/schedule/share` endpoint

**Files:**
- Create: `functions/api/schedule/share.js`
- Create: `functions/api/schedule/__tests__/share-create.test.js`

- [ ] **Step 1: Write failing tests**

Create `functions/api/schedule/__tests__/share-create.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { onRequestPost } from '../share.js'
import { createTestEnv, insertEvent, insertBand, insertVenue } from '../../test-utils.js'

describe('POST /api/schedule/share', () => {
  function makeRequest(body) {
    return new Request('https://example.test/api/schedule/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  test('creates a share link and returns a slug', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb, { slug: 'my-event' })
    rawDb.prepare('UPDATE events SET is_published = 1 WHERE id = ?').run(event.id)
    const venue = insertVenue(rawDb)
    const perf = insertBand(rawDb, { event_id: event.id, venue_id: venue.id })

    const res = await onRequestPost({
      request: makeRequest({
        event_id: event.id,
        event_slug: 'my-event',
        performance_ids: [perf.id],
        band_names: [perf.name],
      }),
      env,
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.slug).toMatch(/^[a-zA-Z0-9]{8}$/)

    const row = rawDb.prepare('SELECT * FROM share_links WHERE slug = ?').get(body.slug)
    expect(row).not.toBeNull()
    expect(JSON.parse(row.performance_ids)).toEqual([perf.id])
    expect(JSON.parse(row.band_names)).toEqual([perf.name])
    expect(row.event_slug).toBe('my-event')
  })

  test('rejects missing event_id', async () => {
    const { env } = createTestEnv()
    const res = await onRequestPost({
      request: makeRequest({ event_slug: 'e', performance_ids: [1], band_names: ['B'] }),
      env,
    })
    expect(res.status).toBe(400)
  })

  test('rejects invalid event_slug characters', async () => {
    const { env } = createTestEnv()
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: '<script>',
        performance_ids: [1],
        band_names: ['B'],
      }),
      env,
    })
    expect(res.status).toBe(400)
  })

  test('rejects empty performance_ids', async () => {
    const { env } = createTestEnv()
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: 'e',
        performance_ids: [],
        band_names: [],
      }),
      env,
    })
    expect(res.status).toBe(400)
  })

  test('rejects performance_ids exceeding 50', async () => {
    const { env } = createTestEnv()
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: 'e',
        performance_ids: Array.from({ length: 51 }, (_, i) => i + 1),
        band_names: Array.from({ length: 51 }, (_, i) => `Band ${i}`),
      }),
      env,
    })
    expect(res.status).toBe(400)
  })

  test('rejects mismatched band_names length', async () => {
    const { env } = createTestEnv()
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: 'e',
        performance_ids: [1, 2],
        band_names: ['Only One'],
      }),
      env,
    })
    expect(res.status).toBe(400)
  })

  test('rejects band name exceeding 100 chars', async () => {
    const { env } = createTestEnv()
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 1,
        event_slug: 'e',
        performance_ids: [1],
        band_names: ['x'.repeat(101)],
      }),
      env,
    })
    expect(res.status).toBe(400)
  })

  test('returns 404 for unknown event_id', async () => {
    const { env } = createTestEnv()
    const res = await onRequestPost({
      request: makeRequest({
        event_id: 9999,
        event_slug: 'ghost',
        performance_ids: [1],
        band_names: ['B'],
      }),
      env,
    })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- share-create
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the POST handler**

Create `functions/api/schedule/share.js`:

```js
// Public API: Create a schedule share link
// POST /api/schedule/share
// Body: { event_id, event_slug, performance_ids[], band_names[] }

const MAX_PERFORMANCE_IDS = 50
const MAX_BAND_NAME_LENGTH = 100
const SLUG_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

function generateSlug(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, b => SLUG_CHARS[b % SLUG_CHARS.length]).join('')
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env

  const body = await request.json().catch(() => ({}))
  const { event_id, event_slug, performance_ids, band_names } = body

  if (!Number.isFinite(Number(event_id))) {
    return json({ error: 'Invalid event_id' }, 400)
  }

  if (typeof event_slug !== 'string' || !/^[a-z0-9-]+$/.test(event_slug)) {
    return json({ error: 'Invalid event_slug' }, 400)
  }

  if (
    !Array.isArray(performance_ids) ||
    performance_ids.length === 0 ||
    performance_ids.length > MAX_PERFORMANCE_IDS
  ) {
    return json(
      { error: `performance_ids must be a non-empty array of up to ${MAX_PERFORMANCE_IDS} integers` },
      400
    )
  }

  if (!Array.isArray(band_names) || band_names.length !== performance_ids.length) {
    return json({ error: 'band_names must be an array matching performance_ids length' }, 400)
  }

  const ids = performance_ids.map(Number)
  if (ids.some(id => !Number.isFinite(id) || id <= 0)) {
    return json({ error: 'All performance_ids must be positive integers' }, 400)
  }

  const names = band_names.map(String)
  if (names.some(n => n.length > MAX_BAND_NAME_LENGTH)) {
    return json({ error: `Band names must not exceed ${MAX_BAND_NAME_LENGTH} characters` }, 400)
  }

  const event = await DB.prepare('SELECT id FROM events WHERE id = ?')
    .bind(Number(event_id))
    .first()
  if (!event) {
    return json({ error: 'Event not found' }, 404)
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '')

  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = generateSlug()
    try {
      await DB.prepare(
        `INSERT INTO share_links (slug, event_id, event_slug, performance_ids, band_names, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(slug, Number(event_id), event_slug, JSON.stringify(ids), JSON.stringify(names), expiresAt)
        .run()
      return json({ slug })
    } catch (err) {
      if (attempt === 1 || !String(err).includes('UNIQUE')) throw err
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- share-create
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add functions/api/schedule/share.js functions/api/schedule/__tests__/share-create.test.js
git commit -m "feat: add POST /api/schedule/share endpoint"
```

---

## Task 4: GET `/api/schedule/share/[slug]` endpoint

**Files:**
- Create: `functions/api/schedule/share/[slug].js`
- Create: `functions/api/schedule/__tests__/share-get.test.js`

- [ ] **Step 1: Write failing tests**

Create `functions/api/schedule/__tests__/share-get.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { onRequestGet } from '../share/[slug].js'
import { createTestEnv, insertEvent, insertShareLink } from '../../test-utils.js'

describe('GET /api/schedule/share/[slug]', () => {
  function makeRequest(slug) {
    return new Request(`https://example.test/api/schedule/share/${slug}`)
  }

  test('returns share link data for a valid slug', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb, { name: 'My Fest', slug: 'my-fest' })
    insertShareLink(rawDb, {
      slug: 'abc12345',
      event_id: event.id,
      event_slug: 'my-fest',
      performance_ids: [10, 20],
      band_names: ['Band A', 'Band B'],
    })

    const res = await onRequestGet({
      request: makeRequest('abc12345'),
      params: { slug: 'abc12345' },
      env,
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.slug).toBe('abc12345')
    expect(body.event_slug).toBe('my-fest')
    expect(body.event_name).toBe('My Fest')
    expect(body.performance_ids).toEqual([10, 20])
    expect(body.band_names).toEqual(['Band A', 'Band B'])
  })

  test('returns 404 for unknown slug', async () => {
    const { env } = createTestEnv()
    const res = await onRequestGet({
      request: makeRequest('notfound'),
      params: { slug: 'notfound' },
      env,
    })
    expect(res.status).toBe(404)
  })

  test('returns 404 for expired slug', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb)
    insertShareLink(rawDb, {
      slug: 'expired1',
      event_id: event.id,
      performance_ids: [1],
      band_names: ['B'],
      expires_at: '2000-01-01 00:00:00',
    })

    const res = await onRequestGet({
      request: makeRequest('expired1'),
      params: { slug: 'expired1' },
      env,
    })
    expect(res.status).toBe(404)
  })

  test('returns 400 for invalid slug format', async () => {
    const { env } = createTestEnv()
    const res = await onRequestGet({
      request: makeRequest('../etc/passwd'),
      params: { slug: '../etc/passwd' },
      env,
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- share-get
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the directory and implement the GET handler**

```bash
mkdir -p functions/api/schedule/share
```

Create `functions/api/schedule/share/[slug].js`:

```js
// Public API: Fetch a schedule share link snapshot
// GET /api/schedule/share/[slug]

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function onRequestGet(context) {
  const { params, env } = context
  const { DB } = env
  const { slug } = params

  if (!slug || !/^[a-zA-Z0-9]{1,16}$/.test(slug)) {
    return json({ error: 'Invalid slug' }, 400)
  }

  const row = await DB.prepare(
    `SELECT sl.slug, sl.event_slug, sl.performance_ids, sl.band_names, e.name AS event_name
     FROM share_links sl
     JOIN events e ON e.id = sl.event_id
     WHERE sl.slug = ? AND sl.expires_at > datetime('now')`
  )
    .bind(slug)
    .first()

  if (!row) {
    return json({ error: 'Share link not found or expired' }, 404)
  }

  return json({
    slug: row.slug,
    event_slug: row.event_slug,
    event_name: row.event_name,
    performance_ids: JSON.parse(row.performance_ids),
    band_names: JSON.parse(row.band_names),
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- share-get
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add functions/api/schedule/share/ functions/api/schedule/__tests__/share-get.test.js
git commit -m "feat: add GET /api/schedule/share/[slug] endpoint"
```

---

## Task 5: Rate limits

**Files:**
- Modify: `functions/utils/rateLimit.js`

- [ ] **Step 1: Add rate limit entries for the new endpoints**

In `RATE_LIMITS`, find the existing `'/api/schedule'` entry and add two more-specific entries **before** it (prefix matching is first-match; more-specific patterns must appear first):

```js
  // Share link endpoints — GET is read-only (generous), POST creates rows (tight)
  '/api/schedule/share/': { requests: 60, window: 60 }, // GET /api/schedule/share/[slug]
  '/api/schedule/share':  { requests: 10, window: 60 }, // POST /api/schedule/share
  '/api/schedule': { requests: 30, window: 60 },        // existing entry — keep unchanged
```

The trailing slash on `/api/schedule/share/` means only paths with a slug segment match the 60/min rule. The POST path `/api/schedule/share` (no trailing slash) falls through to the 10/min rule.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add functions/utils/rateLimit.js
git commit -m "feat: add rate limits for share link endpoints"
```

---

## Task 6: Scheduled cleanup for expired share links

**Files:**
- Create: `functions/scheduled/expire-share-links.js`
- Modify: `functions/_scheduled.js`

- [ ] **Step 1: Create the cleanup task**

Create `functions/scheduled/expire-share-links.js`:

```js
export async function expireShareLinks(_event, env, _ctx) {
  const { DB } = env
  if (!DB) return

  try {
    await DB.prepare(`DELETE FROM share_links WHERE expires_at < datetime('now')`).run()
  } catch (err) {
    console.error('[scheduled] Failed to clean up expired share links', err)
  }
}
```

- [ ] **Step 2: Wire into `_scheduled.js`**

Replace the contents of `functions/_scheduled.js`:

```js
import { scheduled as aggregateStats } from './scheduled/aggregate-stats.js'
import { expireShareLinks } from './scheduled/expire-share-links.js'

export async function scheduled(event, env, ctx) {
  await aggregateStats(event, env, ctx)
  await expireShareLinks(event, env, ctx)
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add functions/scheduled/expire-share-links.js functions/_scheduled.js
git commit -m "feat: scheduled cleanup for expired share links"
```

---

## Task 7: OG tag injection CF Pages Function

**Files:**
- Create: `functions/s/[slug].js`
- Modify: `_routes.json`

- [ ] **Step 1: Update `_routes.json`**

```json
{
  "version": 1,
  "include": ["/api/*", "/s/*"],
  "exclude": []
}
```

- [ ] **Step 2: Create the CF Pages Function**

Create `functions/s/[slug].js`:

```js
// CF Pages Function: serve /s/[slug] with OG meta tags injected into index.html.
// Social crawlers (iMessage, WhatsApp, Twitter) hit this URL and need server-rendered
// meta tags — React Helmet only runs client-side and crawlers won't see it.

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function onRequest(context) {
  const { params, env, request } = context
  const { slug } = params
  const { DB } = env

  if (!slug || !/^[a-zA-Z0-9]{1,16}$/.test(slug)) {
    return env.ASSETS.fetch(request)
  }

  let row = null
  try {
    row = await DB.prepare(
      `SELECT sl.slug, sl.band_names, e.name AS event_name
       FROM share_links sl
       JOIN events e ON e.id = sl.event_id
       WHERE sl.slug = ? AND sl.expires_at > datetime('now')`
    )
      .bind(slug)
      .first()
  } catch (_err) {
    return env.ASSETS.fetch(request)
  }

  if (!row) {
    return env.ASSETS.fetch(request)
  }

  const bandNames = JSON.parse(row.band_names)
  const count = bandNames.length
  const ogTitle = `${count}-stop route for ${row.event_name}`
  const featured = bandNames.slice(0, 3).join(', ')
  const remainder = count > 3 ? ` and ${count - 3} more` : ''
  const ogDescription = `Featuring ${featured}${remainder}`
  const ogUrl = `https://settimes.ca/s/${slug}`

  const origin = new URL(request.url).origin
  const indexResponse = await env.ASSETS.fetch(new Request(`${origin}/`))
  const html = await indexResponse.text()

  const metaTags = [
    `<meta property="og:title" content="${escapeAttr(ogTitle)}" />`,
    `<meta property="og:description" content="${escapeAttr(ogDescription)}" />`,
    `<meta property="og:url" content="${escapeAttr(ogUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeAttr(ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(ogDescription)}" />`,
  ].join('\n    ')

  const injected = html.replace('</head>', `    ${metaTags}\n  </head>`)

  return new Response(injected, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
```

- [ ] **Step 3: Smoke test locally**

```bash
npm run pages:dev
```

Open `http://localhost:8788/s/anyslug` in the browser. Expected: the SPA loads (no DB entry → falls through to ASSETS, SPA shows 404 state). No JS errors in the console.

- [ ] **Step 4: Commit**

```bash
git add functions/s/ _routes.json
git commit -m "feat: CF Pages Function for OG tag injection at /s/[slug]"
```

---

## Task 8: `SharePreviewPage` and route

**Files:**
- Create: `frontend/src/pages/SharePreviewPage.jsx`
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: Create `SharePreviewPage.jsx`**

```jsx
import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BandCardSkeleton } from '../components/ui'
import { fetchPublicJson } from '../utils/publicApi'

export default function SharePreviewPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [shareData, setShareData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetchPublicJson(`/api/schedule/share/${encodeURIComponent(slug)}`)
      .then(setShareData)
      .catch(err => {
        if (err.status === 404) setNotFound(true)
      })
      .finally(() => setLoading(false))
  }, [slug])

  const handleImport = () => {
    navigate(`/event/${shareData.event_slug}?share=${slug}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {Array.from({ length: 4 }, (_, i) => (
            <BandCardSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-bg-navy to-bg-purple px-4 text-center">
        <Helmet>
          <title>Route Not Found | SetTimes</title>
        </Helmet>
        <p className="text-2xl font-semibold text-white">This route has expired or doesn&apos;t exist.</p>
        <p className="mt-2 text-text-secondary">Share links are valid for 30 days.</p>
        <Link to="/" className="mt-6 text-accent-400 hover:underline">
          Browse events
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-bg-navy to-bg-purple">
      <Helmet>
        <title>Shared Route — {shareData.event_name} | SetTimes</title>
      </Helmet>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          to={`/event/${shareData.event_slug}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-white"
        >
          <ArrowLeft size={14} />
          Back to {shareData.event_name}
        </Link>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {shareData.band_names.length}-stop route
          </h1>
          <p className="mt-1 text-text-secondary">{shareData.event_name}</p>
        </div>

        <div className="mb-8 space-y-3">
          {shareData.band_names.map((name, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
            >
              <p className="font-semibold text-white">{name}</p>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleImport}
          className="w-full min-h-[48px] rounded-xl bg-accent-500 px-6 py-3 font-semibold text-bg-navy transition-colors hover:brightness-110"
        >
          Add {shareData.band_names.length} stop{shareData.band_names.length !== 1 ? 's' : ''} to my route for {shareData.event_name}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register the route in `main.jsx`**

Add the import near the top with the other lazy imports:

```jsx
const SharePreviewPage = lazy(() => import('./pages/SharePreviewPage.jsx'))
```

Add the route inside `<Routes>`, after the `/band/:id` route and before the admin route:

```jsx
<Route
  path="/s/:slug"
  element={
    <ErrorBoundary title="Share Preview Error" message="Unable to load this shared route.">
      <Suspense fallback={<LoadingFallback />}>
        <SharePreviewPage />
      </Suspense>
    </ErrorBoundary>
  }
/>
```

- [ ] **Step 3: Start dev server and test the preview page**

```bash
npm run pages:dev
```

Navigate to `http://localhost:8788/s/anyslug`. Expected:
- Loading skeletons appear briefly
- "This route has expired or doesn't exist." message renders (no real slug in local DB)
- No console errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SharePreviewPage.jsx frontend/src/main.jsx
git commit -m "feat: add SharePreviewPage and /s/:slug route"
```

---

## Task 9: Update `MySchedule` share button

**Files:**
- Modify: `frontend/src/components/MySchedule.jsx`

- [ ] **Step 1: Add `eventId` to the prop destructuring**

Find the function signature (line ~28) and add `eventId`:

```jsx
function MySchedule({
  bands,
  onToggleBand,
  onClearSchedule,
  showPast,
  onToggleShowPast,
  nowOverride,
  onBrowseAll,
  eventSlug,
  eventId,
}) {
```

- [ ] **Step 2: Replace `handleShareSchedule`**

Find the existing `handleShareSchedule` function (around line 327) and replace it entirely:

```jsx
const handleShareSchedule = async () => {
  const performanceIds = bands
    .map(band => {
      const parts = band.id.split('-')
      return parseInt(parts[parts.length - 1], 10)
    })
    .filter(id => Number.isFinite(id) && id > 0)

  if (performanceIds.length === 0) return

  const bandNames = bands.map(band => band.name || '')

  try {
    const res = await fetch('/api/schedule/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: eventId,
        event_slug: eventSlug,
        performance_ids: performanceIds,
        band_names: bandNames,
      }),
    })

    if (res.ok) {
      const { slug } = await res.json()
      const url = `${window.location.origin}/s/${slug}`
      const success = await copyToClipboard(url)
      if (success) {
        setShareButtonLabel('Link Copied!')
        setTimeout(() => setShareButtonLabel('Share Schedule'), 2000)
      }
      return
    }
  } catch (_err) {
    // fall through to legacy ?s= URL
  }

  const legacyIds = performanceIds.join(',')
  const fallbackUrl = `${window.location.origin}${window.location.pathname}?s=${legacyIds}`
  const success = await copyToClipboard(fallbackUrl)
  if (success) {
    setShareButtonLabel('Link Copied!')
    setTimeout(() => setShareButtonLabel('Share Schedule'), 2000)
  }
}
```

- [ ] **Step 3: Start dev server and test share button**

```bash
npm run pages:dev
```

Navigate to a local event, add bands to your schedule, open "My Schedule", click "Share Schedule". Expected:
- Button changes to "Link Copied!"
- Clipboard contains `http://localhost:8788/s/[8-char-slug]`
- Verify a row exists: `npx wrangler d1 execute settimes-dev-db --local --command "SELECT slug, event_slug FROM share_links ORDER BY id DESC LIMIT 1"`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MySchedule.jsx
git commit -m "feat: update share button to generate server-side /s/ links"
```

---

## Task 10: `App.jsx` — `?share=` import handler

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add `pendingSharedBandNames` state**

Find the existing state declarations (around line 168):

```jsx
const [sharedScheduleConfirmOpen, setSharedScheduleConfirmOpen] = useState(false)
const [pendingSharedBands, setPendingSharedBands] = useState([])
```

Add directly after:

```jsx
const [pendingSharedBandNames, setPendingSharedBandNames] = useState([])
```

- [ ] **Step 2: Pass `eventId` to `MySchedule`**

Find the `<MySchedule` JSX (around line 768) and add the `eventId` prop:

```jsx
<MySchedule
  bands={myBands}
  onToggleBand={toggleBand}
  onClearSchedule={clearSchedule}
  showPast={showPast}
  onToggleShowPast={toggleShowPast}
  nowOverride={debugTime}
  onBrowseAll={() => setView('all')}
  eventSlug={slug || eventData?.slug}
  eventId={eventData?.id}
/>
```

- [ ] **Step 3: Add the `?share=` useEffect**

Find the existing `?s=` useEffect (starts with `const sParam = searchParams.get('s')`). Add a new separate `useEffect` directly after it:

```jsx
useEffect(() => {
  const shareSlug = searchParams.get('share')
  if (!shareSlug || bands.length === 0) return

  setSearchParams(
    prev => {
      const next = new URLSearchParams(prev)
      next.delete('share')
      return next
    },
    { replace: true }
  )

  fetch(`/api/schedule/share/${encodeURIComponent(shareSlug)}`)
    .then(res => (res.ok ? res.json() : Promise.reject(res.status)))
    .then(data => {
      const matchedIds = bands
        .filter(band => {
          const parts = band.id.split('-')
          const perfId = Number(parts[parts.length - 1])
          return data.performance_ids.includes(perfId)
        })
        .map(band => band.id)

      if (matchedIds.length === 0) return

      setPendingSharedBands(matchedIds)
      setPendingSharedBandNames(data.band_names)
      setSharedScheduleConfirmOpen(true)
    })
    .catch(err => {
      console.warn('[App] Failed to load share link', err)
    })
}, [bands, searchParams, setSearchParams])
```

- [ ] **Step 4: Clear `pendingSharedBandNames` in all three dismiss paths**

There are three places that call `setPendingSharedBands([])`. Add `setPendingSharedBandNames([])` alongside each one:

**In `applySharedSchedule`** (around line 456):
```jsx
setSharedScheduleConfirmOpen(false)
setSelectedBands(nextSelectedBands)
setView('mine')
setPendingSharedBands([])
setPendingSharedBandNames([])
```

**In the modal `onClose`** (around line 794):
```jsx
onClose={() => {
  setSharedScheduleConfirmOpen(false)
  setPendingSharedBands([])
  setPendingSharedBandNames([])
}}
```

**In the Cancel button `onClick`** (around line 804):
```jsx
onClick={() => {
  setSharedScheduleConfirmOpen(false)
  setPendingSharedBands([])
  setPendingSharedBandNames([])
}}
```

- [ ] **Step 5: Show band names in the modal when available**

Find the modal body (the `<div className="space-y-4 text-sm text-text-secondary">` block around line 829). Add a band name list after the stats grid:

```jsx
{pendingSharedBandNames.length > 0 && (
  <ul className="space-y-1 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
    {pendingSharedBandNames.slice(0, 5).map((name, i) => (
      <li key={i}>{name}</li>
    ))}
    {pendingSharedBandNames.length > 5 && (
      <li className="text-white/50">and {pendingSharedBandNames.length - 5} more…</li>
    )}
  </ul>
)}
```

- [ ] **Step 6: End-to-end test the full share flow**

```bash
npm run pages:dev
```

1. Add 3 bands to your schedule
2. Click "Share Schedule" → confirm "Link Copied!" and the clipboard URL is `http://localhost:8788/s/[slug]`
3. Open incognito tab, paste the URL → confirm preview page loads with band names
4. Click "Add X stops to my route" → confirm you land on the event page
5. Confirm the merge/replace modal appears with band names listed
6. Test both "Merge" and "Replace"
7. Confirm that visiting an old `?s=` URL still works and auto-applies for empty schedules

- [ ] **Step 7: Run full test suite and lint**

```bash
npm test && npm run lint
```

Expected: all tests pass, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat: handle ?share= param with merge/replace modal and band name display"
```

---

## Final: Production migration

After the PR is merged and deployed:

- [ ] **Apply migration to production**

```bash
npx wrangler d1 migrations apply settimes-production-db --remote
```

Expected: `0037_share_links` applied successfully.
