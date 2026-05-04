# Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the fan-facing app feel noticeably more finished before May 17th — loading skeletons on all public pages, a "Starts in X min" pill badge on schedule cards, and a days-until countdown chip in the event header.

**Architecture:** Three independent improvements, each touching a narrow set of files. A single reusable `Skeleton` primitive is composed into page-specific skeleton layouts. The "starts soon" badge extends the existing `timeFilter.js` utilities and `BandCard` component. The countdown chip is an additive change to `LiveContextBar`.

**Tech Stack:** React 19, Tailwind CSS (via existing class conventions), no new dependencies.

---

## Decisions

| Item | Decision |
|---|---|
| Band photos in cards | Kept out — photos remain on band profile page only |
| Loading skeletons | All three public pages: schedule, events listing, band profile |
| "Playing soon" style | Pulsing amber pill badge ("Starts in Xm") above band name |
| "Playing soon" threshold | 30 minutes before start time |
| Countdown placement | Amber chip in LiveContextBar, visible only in `upcoming` state |

---

## Files

### New files
- `frontend/src/components/ui/Skeleton.jsx` — base shimmer primitive
- `frontend/src/components/ScheduleSkeleton.jsx` — skeleton for the schedule/lineup view
- `frontend/src/components/EventsPageSkeleton.jsx` — skeleton for the events listing page
- `frontend/src/components/BandProfileSkeleton.jsx` — skeleton for the band profile page

### Modified files
- `frontend/src/index.css` — add `@keyframes shimmer` animation
- `frontend/src/utils/timeFilter.js` — add `isStartingSoon(band, currentTime, thresholdMinutes)` export
- `frontend/src/components/BandCard.jsx` — accept `currentTime` prop; render "Starts in Xm" pill
- `frontend/src/components/LiveContextBar.jsx` — render days-until chip when state is `upcoming`
- `frontend/src/App.jsx` — pass `currentTime` through to `BandCard`
- `frontend/src/pages/EventsPage.jsx` — replace loading state with `EventsPageSkeleton`
- `frontend/src/pages/BandProfilePage.jsx` — replace loading state with `BandProfileSkeleton`

---

## Component Specifications

### `Skeleton.jsx`

```jsx
// Props: className (string), style (object)
// Renders a div with the shimmer animation applied via the 'skeleton' CSS class
export default function Skeleton({ className = '', style }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />
}
```

The `skeleton` class applies the shimmer background and animation. The component is purely presentational with no logic.

### `ScheduleSkeleton.jsx`

Renders 5 fake band card shapes preceded by a fake time-group label pill. Cards are centered, matching the real `BandCard` dimensions (≈ 90px tall, full width, `rounded-xl`). Uses `Skeleton` internally.

```jsx
// No props needed — purely structural placeholder
export default function ScheduleSkeleton() { ... }
```

### `EventsPageSkeleton.jsx`

Renders 2–3 event card placeholder shapes matching the `EventTimeline` card dimensions. Uses `Skeleton` internally.

### `BandProfileSkeleton.jsx`

Renders: a circle skeleton (avatar), two text-line skeletons (name + genre), then three content block skeletons (bio, social links, past shows). Uses `Skeleton` internally.

### `isStartingSoon` utility

```js
// frontend/src/utils/timeFilter.js (additive export)
export function isStartingSoon(band, currentTime, thresholdMinutes = 30) {
  if (!band.startMs) return false
  const nowMs = +currentTime
  const diff = band.startMs - nowMs
  return diff > 0 && diff <= thresholdMinutes * 60_000
}
```

Returns `false` when `band.startMs` is falsy, when `diff <= 0` (start already past — band is live or over), or when start is more than `thresholdMinutes` away. Returns `true` only in the "imminent" window. Note: does **not** call `isHappeningNow` (which uses internal time and breaks time injection in tests) — the `diff > 0` guard is equivalent for this purpose.

### `BandCard.jsx` changes

- Add `currentTime` prop (Date or timestamp, same type already used by `isHappeningNow` callers)
- Compute `nowMs = +currentTime`, `startingSoon = isStartingSoon(band, currentTime)`, and `minutesUntil = Math.ceil((band.startMs - nowMs) / 60_000)`
- When `startingSoon && !isPlaying`: render amber pill above band name:
  ```jsx
  <span className="soon-pill" aria-label={`Starts in ${minutesUntil} minutes`}>
    Starts in {minutesUntil}m
  </span>
  ```
- `soon-pill` class: amber background/border, pulsing opacity animation, `rounded-full`, `text-xs font-bold uppercase tracking-wide`
- `currentTime` defaults to `Date.now()` when not provided so existing callers don't break

### `LiveContextBar.jsx` changes

- When `getEventState(eventData?.date, currentTime)` returns `'upcoming'`:
  - Compute `daysUntil = Math.ceil((eventDateMs - nowMs) / 86_400_000)`
  - Render chip: `⏳ {daysUntil} day{daysUntil !== 1 ? 's' : ''}` with amber color/border
  - Parse `eventData.date` with the same timezone-safe method already used in the component
- Chip is not rendered in any other state (live_tonight, recently_completed, archived)

### `App.jsx` changes

The `currentTime` state is already maintained and passed to `ScheduleView`. Extend the pass-through so `BandCard` also receives it. `ScheduleView` passes it down to each `BandCard`.

---

## CSS (`index.css`)

```css
@keyframes shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255,255,255,0.06) 25%,
    rgba(255,255,255,0.12) 50%,
    rgba(255,255,255,0.06) 75%
  );
  background-size: 600px 100%;
  animation: shimmer 1.4s infinite linear;
  border-radius: 6px;
}

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

---

## Error Handling

- If `eventData.date` is missing in `LiveContextBar`, skip rendering the countdown chip silently.
- If `band.startMs` is `0` or `NaN`, `isStartingSoon` returns `false` — no pill shown.
- All skeletons are `aria-hidden="true"` so screen readers skip them. Each loading region should retain its existing `aria-live` or `role="status"` wrapper.

---

## Testing

No new API endpoints — all changes are UI-only. Tests needed:

- `isStartingSoon` unit tests in `frontend/src/utils/__tests__/timeFilter.test.js`:
  - Returns `false` when `startMs` is falsy
  - Returns `false` when band is already live
  - Returns `false` when more than 30 min away
  - Returns `true` when 29 min away
  - Returns `true` when 1 min away
  - Returns `false` when start is in the past

- Visual regression: manually verify all three skeleton pages render without layout shift once data loads.
- Countdown chip: manually verify it appears for upcoming events and is absent on live/archived events.
