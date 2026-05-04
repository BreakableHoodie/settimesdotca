# Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add loading skeletons to all three public pages, a pulsing "Starts in Xm" pill badge on schedule cards, and a days-until countdown chip in the event header.

**Architecture:** Three independent improvements. (1) Shimmer-animated skeleton screens replace bare "Loading…" spinners on the schedule, events listing, and band profile pages — built from existing skeleton components in `ui/Skeleton.jsx` that just need to be wired up. (2) A new `isStartingSoon` utility drives an amber pill badge on `BandCard`, with `currentTime` propagated from `App.jsx` through `ScheduleView`. (3) The countdown chip is an additive render to `LiveContextBar` when the event lifecycle label is "Upcoming".

**Tech Stack:** React 19, Tailwind CSS (existing class conventions), Vitest for unit tests. No new dependencies.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `frontend/src/index.css` | Modify | Add `@keyframes pulse-soon` and `.soon-pill` class |
| `frontend/src/components/ui/Skeleton.jsx` | Modify | Switch `SkeletonBlock` to shimmer; add `BandProfileSkeleton` |
| `frontend/src/components/ui/index.js` | Modify | Export skeleton components |
| `frontend/src/components/ScheduleSkeleton.jsx` | Create | Full-page skeleton for the schedule/lineup loading state |
| `frontend/src/components/EventsPageSkeleton.jsx` | Create | Skeleton for the events listing page |
| `frontend/src/utils/timeFilter.js` | Modify | Add `isStartingSoon` export |
| `frontend/src/utils/__tests__/timeFilter.test.js` | Create | Unit tests for `isStartingSoon` |
| `frontend/src/components/BandCard.jsx` | Modify | Accept `currentTime` prop; render "Starts in Xm" pill |
| `frontend/src/components/ScheduleView.jsx` | Modify | Pass `currentTime` to all three `BandCard` render sites |
| `frontend/src/components/LiveContextBar.jsx` | Modify | Render days-until chip when lifecycle label is "Upcoming" |
| `frontend/src/App.jsx` | Modify | Replace "Loading…" div with `<ScheduleSkeleton />` |
| `frontend/src/components/EventTimeline.jsx` | Modify | Replace `<Loading>` with `<EventsPageSkeleton />` |
| `frontend/src/pages/BandProfilePage.jsx` | Modify | Replace `<Loading>` with `<BandProfileSkeleton />` |

---

## Task 1: `isStartingSoon` utility — tests first

**Files:**
- Create: `frontend/src/utils/__tests__/timeFilter.test.js`
- Modify: `frontend/src/utils/timeFilter.js`

- [ ] **Step 1: Create the failing test file**

```js
// frontend/src/utils/__tests__/timeFilter.test.js
import { describe, it, expect } from 'vitest'
import { isStartingSoon } from '../timeFilter.js'

const NOW = 1_000_000_000_000 // fixed timestamp, 2001-09-08T21:46:40Z

describe('isStartingSoon', () => {
  it('returns false when startMs is 0', () => {
    expect(isStartingSoon({ startMs: 0 }, NOW)).toBe(false)
  })

  it('returns false when startMs is undefined', () => {
    expect(isStartingSoon({ startMs: undefined }, NOW)).toBe(false)
  })

  it('returns false when start is already past (1 ms ago)', () => {
    expect(isStartingSoon({ startMs: NOW - 1 }, NOW)).toBe(false)
  })

  it('returns false when start is more than 30 min away (31 min)', () => {
    expect(isStartingSoon({ startMs: NOW + 31 * 60_000 }, NOW)).toBe(false)
  })

  it('returns false exactly at 30 min + 1 ms boundary', () => {
    expect(isStartingSoon({ startMs: NOW + 30 * 60_000 + 1 }, NOW)).toBe(false)
  })

  it('returns true when exactly 30 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 30 * 60_000 }, NOW)).toBe(true)
  })

  it('returns true when 29 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 29 * 60_000 }, NOW)).toBe(true)
  })

  it('returns true when 1 min away', () => {
    expect(isStartingSoon({ startMs: NOW + 1 * 60_000 }, NOW)).toBe(true)
  })

  it('respects custom thresholdMinutes', () => {
    expect(isStartingSoon({ startMs: NOW + 10 * 60_000 }, NOW, 5)).toBe(false)
    expect(isStartingSoon({ startMs: NOW + 4 * 60_000 }, NOW, 5)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/utils/__tests__/timeFilter.test.js
```

Expected: FAIL with "isStartingSoon is not a function" (or similar import error).

- [ ] **Step 3: Add `isStartingSoon` to `timeFilter.js`**

Append this export to the end of `frontend/src/utils/timeFilter.js`:

```js
export function isStartingSoon(band, currentTime, thresholdMinutes = 30) {
  if (!band.startMs) return false
  const nowMs = +currentTime
  const diff = band.startMs - nowMs
  return diff > 0 && diff <= thresholdMinutes * 60_000
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/utils/__tests__/timeFilter.test.js
```

Expected: 9 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/timeFilter.js frontend/src/utils/__tests__/timeFilter.test.js
git commit -m "feat: add isStartingSoon utility with unit tests"
```

---

## Task 2: CSS — add `pulse-soon` animation and `.soon-pill` class

**Files:**
- Modify: `frontend/src/index.css`

Context: `@keyframes shimmer` and `.animate-shimmer` already exist in this file (around line 410). Only the "starts soon" pill styles are missing.

- [ ] **Step 1: Add keyframe and class after the existing shimmer block**

Open `frontend/src/index.css`. Find the `.animate-shimmer` block (around line 435). After the closing brace of that block (after `animation: shimmer 1.5s infinite;`), insert:

```css
@keyframes pulse-soon {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.55; }
}

.soon-pill {
  display: inline-block;
  background: rgba(251,191,36,0.15);
  border: 1px solid rgba(251,191,36,0.45);
  color: #fbbf24;
  border-radius: 9999px;
  padding: 2px 10px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  animation: pulse-soon 2s ease-in-out infinite;
  margin-bottom: 6px;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat: add pulse-soon keyframe and soon-pill CSS class"
```

---

## Task 3: Update `Skeleton.jsx` — shimmer animation + `BandProfileSkeleton` + exports

**Files:**
- Modify: `frontend/src/components/ui/Skeleton.jsx`
- Modify: `frontend/src/components/ui/index.js`

Context: `Skeleton.jsx` already has `BandCardSkeleton`, `BandCardSkeletonGrid`, `EventCardSkeleton`, `EventCardSkeletonList`. None are exported from `index.js`. `SkeletonBlock` currently uses `animate-pulse bg-white/10` (Tailwind pulse); we switch it to `bg-white/8 animate-shimmer` for the left-to-right shimmer sweep.

- [ ] **Step 1: Replace `Skeleton.jsx` with the updated version**

```jsx
// frontend/src/components/ui/Skeleton.jsx
function SkeletonBlock({ className = '' }) {
  return <div className={`bg-white/8 animate-shimmer rounded ${className}`} aria-hidden="true" />
}

export function BandCardSkeleton() {
  return (
    <div className="w-full p-4 rounded-xl bg-gradient-card border border-white/10 relative">
      <SkeletonBlock className="absolute top-2 right-2 h-11 w-11 rounded-full" />
      <div className="flex flex-col items-center gap-2 pr-10">
        <SkeletonBlock className="h-6 w-32 rounded-lg" />
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-4 w-28" />
      </div>
    </div>
  )
}

export function BandCardSkeletonGrid({ count = 6 }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6"
      role="status"
      aria-label="Loading lineup"
    >
      {Array.from({ length: count }, (_, i) => (
        <BandCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function EventCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/3 p-6" role="status" aria-label="Loading event">
      <SkeletonBlock className="h-7 w-48 mb-3" />
      <SkeletonBlock className="h-4 w-36 mb-4" />
      <div className="flex gap-6 mb-4">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-4 w-20" />
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-10 w-32 rounded-lg" />
        <SkeletonBlock className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  )
}

export function EventCardSkeletonList({ count = 3 }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading events">
      {Array.from({ length: count }, (_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function BandProfileSkeleton() {
  return (
    <div className="min-h-screen py-8 px-4" role="status" aria-label="Loading band profile">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-6">
          <SkeletonBlock className="w-24 h-24 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-3">
            <SkeletonBlock className="h-8 w-48" />
            <SkeletonBlock className="h-5 w-32" />
          </div>
        </div>
        <SkeletonBlock className="h-32 w-full" />
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-48 w-full" />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add skeleton exports to `ui/index.js`**

Append to `frontend/src/components/ui/index.js`:

```js
export { BandCardSkeleton, BandCardSkeletonGrid, EventCardSkeleton, EventCardSkeletonList, BandProfileSkeleton } from './Skeleton'
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/Skeleton.jsx frontend/src/components/ui/index.js
git commit -m "feat: update Skeleton to shimmer animation, add BandProfileSkeleton, export from ui"
```

---

## Task 4: Create `ScheduleSkeleton.jsx` + wire into `App.jsx`

**Files:**
- Create: `frontend/src/components/ScheduleSkeleton.jsx`
- Modify: `frontend/src/App.jsx`

Context: The schedule page loading state is in `App.jsx` around line 395–401:
```jsx
if (shouldShowLoading) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-accent-400 text-xl">Loading...</div>
    </div>
  )
}
```

- [ ] **Step 1: Create `ScheduleSkeleton.jsx`**

```jsx
// frontend/src/components/ScheduleSkeleton.jsx
import { BandCardSkeleton } from './ui/Skeleton'

export default function ScheduleSkeleton() {
  return (
    <div className="min-h-screen py-8 px-4" role="status" aria-label="Loading schedule">
      <div className="w-full max-w-6xl mx-auto">
        {/* Fake section banner */}
        <div className="flex items-center mb-6">
          <div className="bg-white/8 animate-shimmer h-10 w-36 rounded-lg" aria-hidden="true" />
          <div className="flex-1 h-1 bg-white/10 ml-4" aria-hidden="true" />
        </div>
        {/* Fake time-group pill */}
        <div className="flex items-center mb-4">
          <div className="bg-white/8 animate-shimmer h-9 w-28 rounded-lg" aria-hidden="true" />
          <div className="flex-1 h-0.5 bg-white/10 ml-4" aria-hidden="true" />
        </div>
        {/* 5 fake band cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {Array.from({ length: 5 }, (_, i) => (
            <BandCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Import `ScheduleSkeleton` in `App.jsx`**

In `frontend/src/App.jsx`, add this import at the top (near other component imports):

```js
import ScheduleSkeleton from './components/ScheduleSkeleton'
```

- [ ] **Step 3: Replace the "Loading..." div with `<ScheduleSkeleton />`**

Find this block in `App.jsx` (around line 395):
```jsx
  if (shouldShowLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-accent-400 text-xl">Loading...</div>
      </div>
    )
  }
```

Replace with:
```jsx
  if (shouldShowLoading) {
    return <ScheduleSkeleton />
  }
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ScheduleSkeleton.jsx frontend/src/App.jsx
git commit -m "feat: ScheduleSkeleton replaces loading spinner on schedule page"
```

---

## Task 5: Create `EventsPageSkeleton.jsx` + wire into `EventTimeline.jsx`

**Files:**
- Create: `frontend/src/components/EventsPageSkeleton.jsx`
- Modify: `frontend/src/components/EventTimeline.jsx`

Context: The events listing loading state is inside `EventTimeline.jsx` around line 209–211:
```jsx
  if (loading) {
    return <Loading size="lg" text="Loading events..." fullScreen={false} />
  }
```

- [ ] **Step 1: Create `EventsPageSkeleton.jsx`**

```jsx
// frontend/src/components/EventsPageSkeleton.jsx
import { EventCardSkeletonList } from './ui/Skeleton'

export default function EventsPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Fake header */}
      <div className="mb-8">
        <div className="bg-white/8 animate-shimmer h-10 w-40 mb-2 rounded" aria-hidden="true" />
        <div className="bg-white/8 animate-shimmer h-5 w-72 rounded" aria-hidden="true" />
      </div>
      <EventCardSkeletonList count={3} />
    </div>
  )
}
```

- [ ] **Step 2: Import `EventsPageSkeleton` in `EventTimeline.jsx`**

In `frontend/src/components/EventTimeline.jsx`, add this import at the top (near other imports):

```js
import EventsPageSkeleton from './EventsPageSkeleton'
```

- [ ] **Step 3: Replace `<Loading>` with `<EventsPageSkeleton />`**

Find in `EventTimeline.jsx` (around line 209):
```jsx
  if (loading) {
    return <Loading size="lg" text="Loading events..." fullScreen={false} />
  }
```

Replace with:
```jsx
  if (loading) {
    return <EventsPageSkeleton />
  }
```

- [ ] **Step 4: Verify `Loading` import can be removed if unused**

Check whether `Loading` is still used elsewhere in `EventTimeline.jsx`:
```bash
grep -n "Loading" frontend/src/components/EventTimeline.jsx
```

If the only remaining use was on line 209 (now replaced), remove `Loading` from the import on line 19:
```js
// Before:
import { Alert, Badge, Button, Card, Loading } from './ui'
// After:
import { Alert, Badge, Button, Card } from './ui'
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/EventsPageSkeleton.jsx frontend/src/components/EventTimeline.jsx
git commit -m "feat: EventsPageSkeleton replaces loading spinner on events page"
```

---

## Task 6: Wire `BandProfileSkeleton` into `BandProfilePage.jsx`

**Files:**
- Modify: `frontend/src/pages/BandProfilePage.jsx`

Context: `BandProfilePage.jsx` loading state is around line 387–391:
```jsx
  if (loading) {
    return (
      <Loading size="lg" text="Loading band profile..." />
    )
  }
```

- [ ] **Step 1: Import `BandProfileSkeleton` in `BandProfilePage.jsx`**

In `frontend/src/pages/BandProfilePage.jsx`, add to the existing import from `'../components/ui'`:

```js
// Find this existing import line (around line 23):
import { Alert, Badge, Button, Card, Loading } from '../components/ui'
// Change to:
import { Alert, Badge, Button, Card, Loading, BandProfileSkeleton } from '../components/ui'
```

- [ ] **Step 2: Replace the `<Loading>` block**

Find in `BandProfilePage.jsx` (around line 387):
```jsx
  if (loading) {
    return (
      <Loading size="lg" text="Loading band profile..." />
    )
  }
```

Replace with:
```jsx
  if (loading) {
    return <BandProfileSkeleton />
  }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/BandProfilePage.jsx
git commit -m "feat: BandProfileSkeleton replaces loading spinner on band profile page"
```

---

## Task 7: `BandCard.jsx` — `currentTime` prop + "Starts in Xm" pill

**Files:**
- Modify: `frontend/src/components/BandCard.jsx`

Context: `BandCard` currently imports `isHappeningNow` from `timeFilter`. We add `isStartingSoon` to the same import. `currentTime` defaults to `Date.now()` so all existing callers continue to work without changes.

- [ ] **Step 1: Update the import line**

In `frontend/src/components/BandCard.jsx`, find line 6:
```js
import { getTimeDescription, isHappeningNow } from '../utils/timeFilter'
```

Replace with:
```js
import { getTimeDescription, isHappeningNow, isStartingSoon } from '../utils/timeFilter'
```

- [ ] **Step 2: Add `currentTime` prop and compute pill values**

Find the destructured props block (lines 8–17):
```js
function BandCard({
  band,
  isSelected,
  onToggle,
  showVenue = true,
  clickable = true,
  onRemove,
  warningType,
  warningText,
}) {
```

Replace with:
```js
function BandCard({
  band,
  isSelected,
  onToggle,
  showVenue = true,
  clickable = true,
  onRemove,
  warningType,
  warningText,
  currentTime = Date.now(),
}) {
```

Then find line 37:
```js
  const isPlaying = isHappeningNow(band)
```

Replace with:
```js
  const isPlaying = isHappeningNow(band)
  const nowMs = +currentTime
  const startingSoon = isStartingSoon(band, currentTime)
  const minutesUntil = startingSoon ? Math.ceil((band.startMs - nowMs) / 60_000) : 0
```

- [ ] **Step 3: Render the pill above the band name**

Find in the JSX the name block (around line 74–88):
```jsx
        <div className="flex flex-col items-center gap-2 pr-10">
          <div className={`inline-block px-3 py-1.5 rounded-lg mb-1 ${isSelected ? 'bg-white/20' : 'bg-bg-navy/60'}`}>
            {band.name ? (
```

Insert the pill between the outer flex div opening and the name block div:
```jsx
        <div className="flex flex-col items-center gap-2 pr-10">
          {startingSoon && !isPlaying && (
            <span className="soon-pill" aria-label={`Starts in ${minutesUntil} minutes`}>
              Starts in {minutesUntil}m
            </span>
          )}
          <div className={`inline-block px-3 py-1.5 rounded-lg mb-1 ${isSelected ? 'bg-white/20' : 'bg-bg-navy/60'}`}>
            {band.name ? (
```

- [ ] **Step 4: Run the full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: All tests pass (no regressions; `isStartingSoon` tests from Task 1 still pass).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BandCard.jsx
git commit -m "feat: BandCard shows 'Starts in Xm' pill for bands starting within 30 min"
```

---

## Task 8: `ScheduleView.jsx` — pass `currentTime` to all `BandCard` instances

**Files:**
- Modify: `frontend/src/components/ScheduleView.jsx`

Context: `ScheduleView` already receives `currentTime` as a prop (line 14) and uses it for time-group bucketing. It renders `BandCard` at three locations but does not pass `currentTime`. Without this task, the pill will always evaluate against `Date.now()` (harmless but inconsistent during debug-time overrides).

- [ ] **Step 1: Find the three `BandCard` render sites**

```bash
grep -n "BandCard" frontend/src/components/ScheduleView.jsx
```

Expected output: three lines, approximately 282, 314, and 347.

- [ ] **Step 2: Add `currentTime={currentTime}` to each `BandCard`**

**Site 1 — nowPlaying section (≈ line 282):**

Find:
```jsx
                  <BandCard
                    key={band.id}
                    band={band}
                    isSelected={selectedBands.includes(band.id)}
                    onToggle={onToggleBand}
                    clickable={!!onToggleBand}
                    showVenue={true}
                  />
```

Replace with:
```jsx
                  <BandCard
                    key={band.id}
                    band={band}
                    isSelected={selectedBands.includes(band.id)}
                    onToggle={onToggleBand}
                    clickable={!!onToggleBand}
                    showVenue={true}
                    currentTime={currentTime}
                  />
```

**Site 2 — upcomingByTime section (≈ line 314):**

Find:
```jsx
                      <BandCard
                        key={band.id}
                        band={band}
                        isSelected={selectedBands.includes(band.id)}
                        onToggle={onToggleBand}
                        showVenue={true}
                      />
```

Replace with:
```jsx
                      <BandCard
                        key={band.id}
                        band={band}
                        isSelected={selectedBands.includes(band.id)}
                        onToggle={onToggleBand}
                        showVenue={true}
                        currentTime={currentTime}
                      />
```

**Site 3 — pastByTime section (≈ line 347):**

Find:
```jsx
                      <BandCard
                        key={band.id}
                        band={band}
                        isSelected={selectedBands.includes(band.id)}
                        onToggle={onToggleBand}
                        showVenue={true}
                      />
```

Replace with:
```jsx
                      <BandCard
                        key={band.id}
                        band={band}
                        isSelected={selectedBands.includes(band.id)}
                        onToggle={onToggleBand}
                        showVenue={true}
                        currentTime={currentTime}
                      />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ScheduleView.jsx
git commit -m "feat: pass currentTime through ScheduleView to BandCard"
```

---

## Task 9: `LiveContextBar.jsx` — days-until countdown chip

**Files:**
- Modify: `frontend/src/components/LiveContextBar.jsx`

Context: `LiveContextBar` already computes `lifecycle` via `getLifecycleLabel()`. That function returns `{ label: 'Upcoming', ... }` when the event is in a future day. We render the amber countdown chip only when `lifecycle.label === 'Upcoming'` (not on the event day, not post-event). `getEventState` is already imported but we use the derived `lifecycle` variable — no new imports needed.

The countdown parses `eventData.date` (YYYY-MM-DD) as start-of-day in local time (same pattern used throughout the codebase).

- [ ] **Step 1: Add daysUntil computation inside the component**

In `frontend/src/components/LiveContextBar.jsx`, find the `useMemo` for `lifecycle` (around line 62):
```js
  const lifecycle = useMemo(() => getLifecycleLabel(eventData?.date, currentTime), [currentTime, eventData?.date])
```

Immediately after it, add:
```js
  const daysUntil = useMemo(() => {
    if (lifecycle.label !== 'Upcoming' || !eventData?.date) return null
    const eventDateMs = new Date(eventData.date + 'T00:00:00').getTime()
    return Math.ceil((eventDateMs - (+currentTime)) / 86_400_000)
  }, [lifecycle.label, eventData?.date, currentTime])
```

- [ ] **Step 2: Render the countdown chip**

Find the flex-wrap div containing the clock/venue/sets chips (around line 86):
```jsx
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-white/80">
              <FontAwesomeIcon icon={faClock} aria-hidden="true" className="text-accent-400" />
```

Add the countdown chip at the end of that flex-wrap div, before the closing `</div>`. The full flex-wrap div ends just before the closing `</div>` of the right column. Insert after the "stops in route" chip (the last chip, around line 107):

```jsx
            {daysUntil !== null && (
              <div className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-warning-400/35 bg-warning-400/10 px-3 py-2 text-warning-400 font-semibold">
                <span aria-label={`${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} until the event`}>
                  ⏳ {daysUntil} {daysUntil === 1 ? 'day' : 'days'}
                </span>
              </div>
            )}
```

- [ ] **Step 3: Run tests**

```bash
cd frontend && npm run test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/LiveContextBar.jsx
git commit -m "feat: show days-until countdown chip in LiveContextBar for upcoming events"
```

---

## Manual Verification Checklist

After all tasks are committed, start the dev server and verify visually:

```bash
cd frontend && npm run dev
```

**Skeletons (visit each page while throttling network in DevTools → Slow 3G):**
- [ ] `/` (EventsPage) — shimmer skeleton cards appear briefly, then real events load without layout shift
- [ ] `/event/<slug>` — shimmer skeleton cards appear briefly, then schedule loads
- [ ] `/band/<slug>` — avatar circle + text-line skeletons appear, then band data loads

**"Starts in Xm" pill:**
- [ ] Use DevTools debug time override (`?debugTime=<ISO>`) to set time ~15 min before a band's start time
- [ ] Confirm amber pulsing pill appears above the band name
- [ ] Confirm pill disappears once `isHappeningNow` is true (band is live)
- [ ] Confirm no pill appears for bands more than 30 min away

**Countdown chip:**
- [ ] On an event page whose date is in the future: confirm "⏳ N days" chip appears in the context bar
- [ ] On an event page whose date is today: confirm chip does NOT appear (shows "Live Tonight" badge instead)
- [ ] On a past event page: confirm chip does NOT appear
