# Share Schedule — Design Spec

**Date:** 2026-05-07  
**Status:** Approved  
**Branch:** feature/share-schedule-v2

---

## Problem

The current share schedule feature encodes performance IDs directly in the URL as `?s=123,456,789`. This has three problems:

1. Opening the link can silently overwrite a visitor's existing schedule (auto-apply when empty)
2. URLs are long, ugly, and potentially truncated when shared in messages
3. No social link preview (OG tags) when pasted into iMessage, WhatsApp, etc.

## Solution Overview

Replace the URL-based share with server-side snapshot links:

- Sharing creates a D1 record and returns a short slug → `settimes.ca/s/abc12345`
- The slug URL serves a **read-only preview page** — visiting it never touches your schedule
- A CF Pages Function injects OG meta tags server-side so link previews work in messaging apps
- Import is always explicit: the visitor clicks "Add to my route" → navigates to the event page → merge/replace confirmation

Existing `?s=` links continue to work (backward compatibility).

---

## Section 1 — Data Layer

### New table: `share_links`

```sql
CREATE TABLE share_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  event_slug  TEXT    NOT NULL,
  performance_ids TEXT NOT NULL, -- JSON array of integers e.g. [123, 456]
  band_names  TEXT    NOT NULL, -- JSON snapshot e.g. ["Band A", "Band B"]
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_links_slug ON share_links(slug);
```

**Key decisions:**

- `event_slug` is denormalized to avoid a JOIN on the hot GET path
- `band_names` is a snapshot taken at share-creation time — OG descriptions stay accurate even if the lineup is later updated
- `expires_at` = `created_at + 30 days`; checked lazily on every GET (return 404 if expired)
- Periodic cleanup of expired rows added to the existing `_scheduled.js` worker

### Slug format

- 8 characters, base62 alphabet (`a-z`, `A-Z`, `0-9`)
- Generated server-side using `crypto.getRandomValues()` (available in CF Workers)
- 62^8 ≈ 218 trillion combinations — collision probability is negligible at any realistic scale
- Collision handled: if INSERT fails on UNIQUE constraint, retry once with a new slug

---

## Section 2 — API

### `POST /api/schedule/share`

Creates a share link snapshot.

**Request body:**
```json
{
  "event_id": 1,
  "event_slug": "set-times-2026",
  "performance_ids": [123, 456, 789],
  "band_names": ["Band A", "Band B", "Band C"]
}
```

**Response `200`:**
```json
{ "slug": "abc12345" }
```

**Validation:**
- `event_id`: must be a finite integer referencing a valid event
- `performance_ids`: array of integers, max 50 entries, each must be a finite positive integer
- `band_names`: array of strings, same length as `performance_ids`, each ≤ 100 chars
- `event_slug`: non-empty string, alphanumeric + hyphens only

**Rate limit:** 10 requests/minute per IP (D1-backed, fail-closed — prevents link spam)

---

### `GET /api/schedule/share/[slug]`

Fetches a share link by slug.

**Response `200`:**
```json
{
  "slug": "abc12345",
  "event_slug": "set-times-2026",
  "event_name": "SET Times 2026",
  "performance_ids": [123, 456, 789],
  "band_names": ["Band A", "Band B", "Band C"]
}
```

**Response `404`:** slug not found or expired (unified — no 410 distinction)

**Rate limit:** 60 requests/minute per IP (cache-backed)

---

## Section 3 — Server-Side OG Tags

### New file: `functions/s/[slug].js`

CF Pages Function that handles all `/s/*` requests.

**Flow:**
1. Extract slug from `context.params.slug`
2. Query D1: `SELECT sl.slug, sl.event_slug, sl.band_names, sl.performance_ids, e.name AS event_name FROM share_links sl JOIN events e ON e.id = sl.event_id WHERE sl.slug = ? AND sl.expires_at > datetime('now')`
3. If not found/expired: `return env.ASSETS.fetch(context.request)` — SPA loads, shows 404 state
4. If found: fetch `index.html` via `env.ASSETS.fetch(new Request(origin + '/'))`, inject `<meta>` tags before `</head>`, return modified HTML

**OG tag content:**
- `og:title`: `"5-stop route for SET Times 2026"`
- `og:description`: `"Featuring Band A, Band B, Band C and 2 more"` (first 3 names from snapshot)
- `og:url`: `https://settimes.ca/s/[slug]`
- `og:type`: `website`
- `twitter:card`: `summary` (no dynamic image generation)

**`_routes.json` change:** Add `/s/*` to the `include` array so this function is invoked for all `/s/` paths.

---

## Section 4 — Frontend: Sharing

### `MySchedule.jsx` — `handleShareSchedule`

Replace the local URL-building logic with an API call:

1. POST to `/api/schedule/share` with `{ event_id, event_slug, performance_ids, band_names }` (all available from the `bands` prop)
2. On success: copy `https://settimes.ca/s/[slug]` to clipboard → show "Link Copied!" feedback as today
3. On API failure: fall back to current `?s=` URL approach silently — share still works, just without a pretty URL or OG tags

`MySchedule` already receives `eventSlug` in its prop signature. It needs one new prop: `eventId` (the numeric event ID from `eventData.id` in `App.jsx`) so the POST body can include `event_id`.

---

## Section 5 — Preview Page

### New file: `frontend/src/pages/SharePreviewPage.jsx`

New lazy-loaded route at `/s/:slug`.

**Lifecycle:**
1. On mount: fetch `GET /api/schedule/share/[slug]`
2. Loading state: skeleton (consistent with rest of app)
3. Not found / expired: friendly message — "This route has expired or doesn't exist."
4. Success: render read-only band list + CTA

**Page content:**
- Header: event name + date
- Band list: name, time, venue — using `BandCard` in read-only (non-interactive) mode, or a lighter read-only variant
- CTA button: `"Add [N] stops to my route for [Event Name]"` → `navigate('/event/[eventSlug]?share=[slug]')`

**Route added in `main.jsx`:**
```jsx
<Route path="/s/:slug" element={
  <Suspense fallback={<LoadingFallback />}>
    <SharePreviewPage />
  </Suspense>
} />
```

---

## Section 6 — Import on the Event Page

### `App.jsx` — `?share=[slug]` handler

Add a new `useEffect` that runs alongside the existing `?s=` handler:

1. Detect `?share=[slug]` in search params
2. Fetch `GET /api/schedule/share/[slug]`
3. Remove `?share` param from URL immediately (`replace: true`)
4. **Always show the merge/replace modal** — remove the auto-apply path for empty schedules. Since the visitor has already seen the preview page, the import choice must be explicit.
5. The modal body is enhanced: show the actual band names (not just counts) using `band_names` from the API response

### Backward compatibility

The existing `?s=` handler is kept unchanged. Old share links continue to work.

---

## Error & Edge Cases

| Case | Handling |
|---|---|
| Slug not found | 404 from API; preview page shows expired/not-found message |
| Expired slug | Same as not found (lazy check on `expires_at`) |
| Slug collision on insert | Retry once with a new slug; fail with 500 on second collision |
| API unavailable at share time | Fall back to `?s=` URL silently |
| `band_names` longer than `performance_ids` | Validate lengths match on POST; reject with 400 |
| Max performance IDs exceeded | Reject with 400 if > 50 |

---

## Files Changed / Created

| File | Change |
|---|---|
| `migrations/0037_share_links.sql` | New — `share_links` table |
| `functions/api/schedule/share.js` | New — POST handler |
| `functions/api/schedule/share/[slug].js` | New — GET handler |
| `functions/s/[slug].js` | New — OG tag injection CF Function |
| `_routes.json` | Add `/s/*` to `include` |
| `functions/utils/rateLimit.js` | Add rate limit entries for new endpoints |
| `functions/_scheduled.js` | Add expired share link cleanup |
| `frontend/src/main.jsx` | Add `/s/:slug` route |
| `frontend/src/pages/SharePreviewPage.jsx` | New — preview page |
| `frontend/src/components/MySchedule.jsx` | Update `handleShareSchedule` to call API |
| `frontend/src/App.jsx` | Add `?share=` handler, remove empty-schedule auto-apply |
