# Performance Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `performances` a reversible cancelled state that renders on every fan-facing surface, so pulling a band no longer means deleting the row — and fix the orphaned-name bug on shared lineups that deleting causes (#732, #733).

**Architecture:** One additive column (`is_cancelled INTEGER NOT NULL DEFAULT 0`) flows out through eight read endpoints in two modes — most *return* the flag and always include the row; three *exclude* the row (band history once past, play-count stats, live timeline). The frontend marks cancelled sets with `<s>` plus a visible "Cancelled" pill and suppresses them from three behaviours: up-next routing, live/starting-soon time math, and selection. Admin gets a reversible toggle on the existing single-band handler.

**Tech Stack:** Cloudflare Pages Functions, D1 (SQLite), React 19, Tailwind v4, Vitest, Playwright.

**Source spec:** `docs/superpowers/specs/2026-08-02-performance-cancellation-design.md`

---

## STATUS — updated 2026-08-03, keep current

Update this block whenever a task lands. A session can end without warning; this
block is the only thing that tells the next one where work stopped. The
conversation does not survive — this file does.

**Branch:** `feat/732-performance-cancellation`, 10 commits, pushed to origin.
**Gate:** green at last run — 916 backend, 877 frontend, 0 lint errors.

| Task | State |
|---|---|
| 1. Migration + test schema | Done |
| 2. Three always-include endpoints | Done |
| 3. Past-event exclusion gate | Done |
| 4. iCal `STATUS:CANCELLED` | Done |
| 5. BandCard render + suppressions | Done |
| 5b. timeline `upcoming`/`past` projection | Done (not in original plan — added in review) |
| 6. Up-next routing suppression | Done |
| 7. Admin cancel toggle | Done |
| 8. #733 share orphan + stop count | Done |
| 9. Playwright E2E + a11y + 4 themes | **NOT DONE** |

**Task 9 in-progress artifact:** `e2e/cancelled-set.spec.js` (221 lines) exists but
is **untracked and has never been executed** — written by an agent that died before
starting wrangler. Treat it as an unreviewed draft, not working code. It is
deliberately uncommitted: an unverified E2E spec in the repo is worse than none.

**Remaining before PR:** Task 9 → `pr-review-toolkit:code-reviewer` (this feature
hits the trigger: migration + 8 endpoints + documented invariants) → `make review`
→ rebase on `origin/main` → PR with `Closes #732` and `Closes #733` on their own
lines, labels `enhancement,priority:p2`.

**Deviations from this plan already found and fixed** (do not re-introduce):
- Task 4's literal text would have emitted two `STATUS:` lines in one VEVENT — invalid RFC 5545. Fixed with a ternary.
- Task 5's own test file passed vacuously: 2 of 6 tests green with zero implementation. One clicked a `<Link>` with its own `stopPropagation`, so it could never reach the handler under test.
- Task 7's file list omitted `functions/api/admin/bands.js`, which never selected `p.is_cancelled` — the toggle would have shown "Cancel" forever after reload.

## Global Constraints

Copy these values exactly; every task's requirements implicitly include this section.

- **Migration number is `0056`.** Latest existing is `0055_add_event_daily_stats.sql`.
- **Column definition, verbatim:** `ALTER TABLE performances ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0;`
- **After any migration change** run `node scripts/regenerate-setup-complete.mjs` then `node scripts/check-schema-drift.mjs`. `setup-complete.sql`'s schema section is generated — never hand-edit it. CI enforces this via `quality.yml`.
- **Past/current comparison MUST use `eventLocalToday()`** from `functions/utils/eventDay.js`. Never `new Date().toISOString().slice(0, 10)` — it flips to tomorrow at 8 PM Eastern (the #568 bug class) and would make cancelled sets vanish from the live schedule mid-evening.
- **Never lower or bypass `AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`** (`frontend/src/utils/festivalDays.js`). A cancelled 00:15 set belongs to the previous evening. Any new sort/filter delegates to `prepareBands()`.
- **D1 has no BEGIN/COMMIT.** Use `env.DB.batch([...])` for multi-statement mutations.
- **Semantic theme tokens only** on public surfaces — `text-text-primary/-secondary/-tertiary`, `bg-surface`, `border-border`, `warning`/`error` status colours. Never `text-white` or `bg-white/N` outside `frontend/src/admin/` (admin is dark-pinned and its `text-white` is correct).
- **Cancelled band name renders at `text-text-secondary`** — NOT `text-text-disabled` (`#6b7280`), which won't clear 4.5:1 on the light themes.
- **The visible pill is the accessible carrier, not the strikethrough.** `line-through` is not announced by NVDA or JAWS by default; conveying state through styling alone fails WCAG 1.4.1.
- **Every test must assert on what CHANGES.** Flip `is_cancelled` and prove the response differs. Prove each new test fails by mutating the implementation before committing it. An assertion that passes against both the correct and the broken implementation is worth nothing (defect class seen 3× in #712/#714).
- **Commit after every task.** Run `make gate` before any commit; do not commit if it fails.

---

### Task 1: Migration and test schema

**Files:**
- Create: `migrations/0056_add_performance_is_cancelled.sql`
- Modify: `functions/api/test-utils.js:176-191` (the `CREATE TABLE performances` block)
- Modify: `database/setup-complete.sql` (generated — via script only)

**Interfaces:**
- Produces: the `performances.is_cancelled` column (INTEGER, NOT NULL, DEFAULT 0), available to every later task.

- [ ] **Step 1: Write the migration**

Create `migrations/0056_add_performance_is_cancelled.sql`:

```sql
-- Adds a reversible cancelled state to performances (#732).
--
-- Before this column, pulling a band from a lineup meant DELETING the
-- performance row: the set silently vanished from the schedule and left an
-- orphaned name on already-shared routes (#733). `is_announced` is not a
-- workaround -- every public query guards with
-- `AND (e.reveal_mode = 0 OR p.is_announced = 1)`, so on a reveal_mode = 0
-- event un-announcing short-circuits true and changes nothing on the live site.
--
-- Matches the house boolean convention (is_announced, is_published,
-- band_follow_notified). DEFAULT 0 backfills every existing row as scheduled.
ALTER TABLE performances ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Add the column to the in-memory test schema**

`functions/api/test-utils.js` hand-writes the schema for `better-sqlite3`; it does not read `migrations/`. Without this every later test fails with "no such column". In the `CREATE TABLE performances` block, add the column immediately after `band_follow_notified`:

```js
      is_announced INTEGER NOT NULL DEFAULT 1,
      band_follow_notified INTEGER NOT NULL DEFAULT 0,
      is_cancelled INTEGER NOT NULL DEFAULT 0,
      performance_date TEXT
    );
```

- [ ] **Step 3: Regenerate the generated schema and check for drift**

```bash
node scripts/regenerate-setup-complete.mjs
node scripts/check-schema-drift.mjs
```

Expected: drift check exits 0. If it reports a diff, the regenerate step did not run — do not hand-edit `setup-complete.sql`.

- [ ] **Step 4: Verify the existing suite still passes against the new schema**

```bash
npm test
```

Expected: PASS, no "no such column: is_cancelled" errors.

- [ ] **Step 5: Commit**

```bash
git add migrations/0056_add_performance_is_cancelled.sql functions/api/test-utils.js database/setup-complete.sql
git commit -m "feat(db): add is_cancelled to performances (#732)"
```

---

### Task 2: Return `is_cancelled` from the three always-include endpoints

**Files:**
- Modify: `functions/api/schedule.js:72-90` (the performances SELECT)
- Modify: `functions/api/events/[id]/details.js`
- Modify: `functions/api/venues/[id].js`
- Test: `functions/api/__tests__/schedule-cancelled.test.js` (create)

**Interfaces:**
- Consumes: `performances.is_cancelled` from Task 1.
- Produces: each band/performance object in these three responses carries `is_cancelled` (number, 0 or 1). Tasks 5 and 6 read `band.is_cancelled` on the frontend.

These three endpoints **always include the row**. Returning a field is safe; gating a row is where this codebase has been bitten — do not add any `WHERE` clause in this task.

- [ ] **Step 1: Write the failing test**

Read `functions/api/__tests__/schedule-genre.test.js` first and mirror its seeding and context construction exactly rather than inventing a new pattern. Create `functions/api/__tests__/schedule-cancelled.test.js`:

```js
import { describe, expect, it } from "vitest";
import { onRequestGet } from "../schedule.js";

describe("GET /api/schedule — is_cancelled", () => {
  it("returns is_cancelled=1 for a cancelled set and still includes the row", async () => {
    const { db, context, eventSlug, performanceId } = seedOneSet();

    // Baseline: scheduled.
    const before = await (await onRequestGet(context(`?event=${eventSlug}`))).json();
    const beforeBand = before.bands.find((b) => b.performance_id === performanceId);
    expect(beforeBand.is_cancelled).toBe(0);

    db.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(performanceId);

    const after = await (await onRequestGet(context(`?event=${eventSlug}`))).json();
    const afterBand = after.bands.find((b) => b.performance_id === performanceId);
    // The row is still present -- this endpoint never gates.
    expect(afterBand).toBeDefined();
    expect(afterBand.is_cancelled).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- schedule-cancelled
```

Expected: FAIL — `expect(beforeBand.is_cancelled).toBe(0)` receives `undefined`, because the SELECT does not yet project the column.

- [ ] **Step 3: Add the column to the three SELECTs**

In `functions/api/schedule.js`, in the performances SELECT beginning at line 72, add after `p.notes,`:

```sql
        p.is_cancelled,
```

Apply the same one-line addition to the performances SELECT in `functions/api/events/[id]/details.js` and in `functions/api/venues/[id].js`. Do not change any `WHERE` clause in any of the three.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test -- schedule-cancelled
```

Expected: PASS.

- [ ] **Step 5: Prove the test is not vacuous**

Temporarily remove `p.is_cancelled,` from `functions/api/schedule.js` and re-run. Expected: FAIL. Restore and re-run. Expected: PASS. Only then continue.

- [ ] **Step 6: Commit**

```bash
make gate
git add functions/api/schedule.js "functions/api/events/[id]/details.js" "functions/api/venues/[id].js" functions/api/__tests__/schedule-cancelled.test.js
git commit -m "feat(api): return is_cancelled from schedule, event details, and venue endpoints (#732)"
```

---

### Task 3: The three exclusion endpoints — the risky gate

**Files:**
- Modify: `functions/api/bands/[name].js` (exclude cancelled sets for PAST events only)
- Modify: `functions/api/bands/stats/[name].js` (exclude always)
- Modify: `functions/api/events/timeline.js` (exclude always)
- Test: `functions/api/bands/__tests__/band-cancelled-history.test.js` (create)

**Interfaces:**
- Consumes: `performances.is_cancelled` from Task 1; `eventLocalToday()` from `functions/utils/eventDay.js`.
- Produces: no new fields. Behaviour only.

This is the only task that removes rows, so it is the only place this feature can fail silently. Re-read the Global Constraints entry on `eventLocalToday()` before writing any SQL here.

The rule for `bands/[name].js`: a cancelled set **stays visible while its event is current** (fans need to see it was cancelled) and **drops out once the event is past** (a cancellation is often not the artist's fault and should not be a permanent public mark).

- [ ] **Step 1: Write the failing tests**

Mirror the seeding helpers in `functions/api/__tests__/artists.test.js` for `seedAndFetch`; read it before writing. Create `functions/api/bands/__tests__/band-cancelled-history.test.js`:

```js
import { describe, expect, it } from "vitest";
import { eventLocalToday } from "../../../utils/eventDay.js";

describe("GET /api/bands/[name] — cancelled set lifecycle", () => {
  it("keeps a cancelled set visible while the event is still current", async () => {
    const today = eventLocalToday();
    const { response } = await seedAndFetch({ endDate: today, isCancelled: 1 });
    const body = await response.json();
    expect(body.performances).toHaveLength(1);
    expect(body.performances[0].is_cancelled).toBe(1);
  });

  it("drops a cancelled set from history once the event is past", async () => {
    const { response } = await seedAndFetch({ endDate: "2020-01-01", isCancelled: 1 });
    const body = await response.json();
    expect(body.performances).toHaveLength(0);
  });

  it("keeps a NON-cancelled set in history after the event is past", async () => {
    // Proves the test above gates on is_cancelled, not merely on the date.
    const { response } = await seedAndFetch({ endDate: "2020-01-01", isCancelled: 0 });
    const body = await response.json();
    expect(body.performances).toHaveLength(1);
  });

  it("classifies a late-evening instant as still today (Toronto, not UTC)", () => {
    // Regression guard for #568: a UTC-sliced "today" flips to tomorrow at
    // 8 PM Eastern, which would classify a live event as past and make the
    // cancelled set vanish on the night it matters most.
    expect(eventLocalToday(new Date("2026-08-07T23:30:00-04:00"))).toBe("2026-08-07");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- band-cancelled-history
```

Expected: the "drops from history" test FAILS (receives 1 performance, expects 0). The others may pass trivially — that is expected at this stage.

- [ ] **Step 3: Implement the past-event gate**

In `functions/api/bands/[name].js`, add the import and compute today once, above the performances query:

```js
import { eventLocalToday } from "../../utils/eventDay.js";

// A cancelled set stays visible while its event is current -- fans need to
// know the set is off -- and drops out of the band's history once the event
// has passed, because a cancellation is frequently not the artist's fault.
// `eventLocalToday()` is REQUIRED here: a toISOString().slice(0, 10)
// comparison flips to tomorrow at 8 PM Eastern (#568) and would erase
// cancelled sets from the live schedule mid-evening.
const today = eventLocalToday();
```

Add this to the performances SELECT's `WHERE`, binding `today` in the correct positional order:

```sql
  AND (p.is_cancelled = 0 OR COALESCE(e.end_date, e.date) >= ?)
```

- [ ] **Step 4: Implement the two unconditional exclusions**

In `functions/api/bands/stats/[name].js`, add to the performances `WHERE` — a cancelled set must never inflate a play count:

```sql
  AND p.is_cancelled = 0
```

In `functions/api/events/timeline.js`, add the same clause to the query backing "Happening Now" / "Up Next". Directing a fan to a band that is not playing is the worst failure mode of this feature.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- band-cancelled-history
npm test
```

Expected: PASS for both.

- [ ] **Step 6: Prove the gate is not vacuous**

Change `COALESCE(e.end_date, e.date) >= ?` to `>= '1970-01-01'` and re-run. Expected: the "drops from history" test FAILS. Restore and re-run. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
make gate
git add "functions/api/bands/[name].js" "functions/api/bands/stats/[name].js" functions/api/events/timeline.js "functions/api/bands/__tests__/band-cancelled-history.test.js"
git commit -m "feat(api): drop cancelled sets from history, stats, and timeline (#732)"
```

---

### Task 4: iCal `STATUS:CANCELLED`

**Files:**
- Modify: `functions/api/feeds/ical.js`
- Test: `functions/api/feeds/__tests__/ical-cancelled.test.js` (create)

**Interfaces:**
- Consumes: `performances.is_cancelled` from Task 1.
- Produces: a `STATUS:CANCELLED` line on the VEVENT for cancelled sets. Native to RFC 5545 — Google and Apple Calendar render it as cancelled with no custom client handling.

- [ ] **Step 1: Write the failing test**

Create `functions/api/feeds/__tests__/ical-cancelled.test.js`. Mirror the seeding and fetch helpers from an existing feed test; if none exists, follow `functions/api/__tests__/schedule-genre.test.js`:

```js
import { describe, expect, it } from "vitest";

describe("GET /api/feeds/ical — cancelled sets", () => {
  it("emits STATUS:CANCELLED on a cancelled VEVENT and not on a scheduled one", async () => {
    const body = await fetchIcalWith({ cancelledSetName: "Deer Fang", scheduledSetName: "Sam Nabi" });

    const events = body.split("BEGIN:VEVENT").slice(1);
    const cancelled = events.find((e) => e.includes("Deer Fang"));
    const scheduled = events.find((e) => e.includes("Sam Nabi"));

    expect(cancelled).toContain("STATUS:CANCELLED");
    // The negative half is what proves the line is conditional, not constant.
    expect(scheduled).not.toContain("STATUS:CANCELLED");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- ical-cancelled
```

Expected: FAIL — `cancelled` does not contain `STATUS:CANCELLED`.

- [ ] **Step 3: Add the column to the feed query and emit the status line**

Add `p.is_cancelled,` to the SELECT in `functions/api/feeds/ical.js`. Then, in the VEVENT builder, emit the line only when the set is cancelled — RFC 5545 defines `CONFIRMED` as the default, so scheduled sets need no line:

```js
    // RFC 5545 STATUS:CANCELLED -- Google and Apple Calendar render the entry
    // as cancelled natively, so no custom handling is needed on the client.
    ...(performance.is_cancelled ? ["STATUS:CANCELLED"] : []),
```

Place it adjacent to the existing `SUMMARY` / `DTSTART` lines, following the array-join pattern already in the file. If the file builds its VEVENT by string concatenation instead, append a conditional line in that same style.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm test -- ical-cancelled
```

Expected: PASS.

- [ ] **Step 5: Prove the test is not vacuous**

Change the condition to `...(true ? ["STATUS:CANCELLED"] : [])` and re-run. Expected: FAIL on the `scheduled` assertion. Restore and re-run. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
make gate
git add functions/api/feeds/ical.js "functions/api/feeds/__tests__/ical-cancelled.test.js"
git commit -m "feat(feeds): emit RFC 5545 STATUS:CANCELLED for cancelled sets (#732)"
```

---

### Task 5: BandCard rendering and the time-math suppression

**Files:**
- Modify: `frontend/src/components/BandCard.jsx:40-43` (suppress time math), `:60-84` (inert wrapper, hide toggle), `:104-122` (strikethrough + pill)
- Test: `frontend/src/components/__tests__/BandCard.cancelled.test.jsx` (create)

**Interfaces:**
- Consumes: `band.is_cancelled` (number, 0 or 1) from Task 2.
- Produces: no new exports. `BandCard` renders `<s>` + a "Cancelled" pill and refuses to report live/soon/selectable state.

Suppressions 2 and 3 from the spec land here. Both `isHappeningNow` and `isStartingSoon` are pure time math and will happily light up a cancelled row.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/__tests__/BandCard.cancelled.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BandCard from '../BandCard'

// A set that IS currently playing by the clock, so any suppression assertion
// below proves the guard fired -- not merely that the fixture lacked data.
const NOW = new Date('2026-08-07T20:30:00-04:00')
const baseBand = {
  id: 1,
  name: 'Deer Fang',
  venue: 'Room 47',
  startTime: '20:00',
  endTime: '21:00',
  startMs: +new Date('2026-08-07T20:00:00-04:00'),
  endMs: +new Date('2026-08-07T21:00:00-04:00'),
  is_cancelled: 0,
}

const renderCard = (overrides = {}, onToggle = vi.fn()) =>
  render(
    <MemoryRouter>
      <BandCard band={{ ...baseBand, ...overrides }} currentTime={NOW} onToggle={onToggle} />
    </MemoryRouter>
  )

describe('BandCard — cancelled sets', () => {
  it('shows a visible Cancelled pill', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('strikes through the band name', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.getByText('Deer Fang').closest('s')).not.toBeNull()
  })

  it('says Live Now for a playing set that is NOT cancelled', () => {
    // Baseline: proves the fixture really is inside its set window.
    renderCard({ is_cancelled: 0 })
    expect(screen.getByText('Live Now')).toBeInTheDocument()
  })

  it('does NOT say Live Now when the same playing set is cancelled', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.queryByText('Live Now')).toBeNull()
  })

  it('hides the add/remove toggle', () => {
    renderCard({ is_cancelled: 1 })
    expect(screen.queryByRole('button', { name: /route/i })).toBeNull()
  })

  it('does not fire onToggle when a cancelled card is clicked', () => {
    const onToggle = vi.fn()
    renderCard({ is_cancelled: 1 }, onToggle)
    screen.getByText('Deer Fang').click()
    expect(onToggle).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npm test -- BandCard.cancelled --run
```

Expected: FAIL on the pill, the `<s>`, the "does NOT say Live Now" case, and the toggle assertions.

- [ ] **Step 3: Suppress the time math and selection**

In `frontend/src/components/BandCard.jsx`, replace lines 40–43:

```jsx
  // A cancelled set is never live, never "starting soon", and never
  // selectable. Both isHappeningNow and isStartingSoon are pure time math
  // (#732) and will light up a cancelled row otherwise.
  const isCancelled = Boolean(band.is_cancelled)
  const isPlaying = !isCancelled && isHappeningNow(band)
  const nowMs = +currentTime
  const startingSoon = !isCancelled && isStartingSoon(band, currentTime)
  const minutesUntil = startingSoon ? Math.ceil((band.startMs - nowMs) / 60000) : 0
  const isInteractive = clickable && !isCancelled
```

Then substitute `isInteractive` for `clickable` in every expression on the wrapper `div` (lines 60–69): the `cursor-pointer` ternary, `onClick`, `onKeyDown`, `tabIndex`, `role`, and `aria-label`. Also change the early-return guards in `handleToggle` (line 22) and `handleKeyDown` (line 33) from `if (!clickable) return` to `if (!isInteractive) return`, and change the toggle-button guard on line 70 to:

```jsx
      {showToggleButton && !isCancelled && (
```

- [ ] **Step 4: Add the strikethrough and the pill**

Wrap the band name inside the `<Link>` (line 113). The `Unnamed Artist` branch (line 119) needs it too — a cancelled set with no name still reads as cancelled:

```jsx
              {isCancelled ? <s>{band.name}</s> : band.name}
```

Add the pill immediately after the name block's closing `</div>` (after line 122), reusing the existing warning-pill pattern from lines 155–168:

```jsx
        {isCancelled && (
          <span
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              onAmber ? 'bg-yellow-900/80 text-yellow-100' : 'bg-warning-500/25 text-text-primary'
            }`}
          >
            <TriangleAlert size={14} aria-hidden="true" />
            Cancelled
          </span>
        )}
```

`TriangleAlert` is already imported on line 1. The pill text is the accessible carrier — do not add `aria-hidden` to it and do not replace it with a CSS-only treatment.

- [ ] **Step 5: Apply the muted name colour**

In the name `<Link>`'s className (lines 109–111), change the non-amber branch so a cancelled name is `text-text-secondary`:

```jsx
                onAmber
                  ? 'text-bg-navy'
                  : isCancelled
                    ? 'text-text-secondary'
                    : 'text-text-primary hover:text-accent-400'
```

Do **not** use `text-text-disabled` — it will not clear 4.5:1 on the light themes.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd frontend && npm test -- BandCard.cancelled --run
```

Expected: PASS.

- [ ] **Step 7: Prove the suppression tests are not vacuous**

Revert `isPlaying` to `isHappeningNow(band)` and re-run. Expected: the "does NOT say Live Now" test FAILS. Restore and re-run. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd frontend && npx prettier --write "src/**/*.{js,jsx,json,css}" && npm run lint && npm run format:check && npm test -- --run && npm run build
cd .. && git add frontend/src/components/BandCard.jsx frontend/src/components/__tests__/BandCard.cancelled.test.jsx
git commit -m "feat(schedule): render cancelled sets struck through with a Cancelled pill (#732)"
```

---

### Task 6: Never "up next" — the routing suppression

**Files:**
- Modify: `frontend/src/utils/nextMove.js:38-41` (the `timed` filter)
- Modify: `frontend/src/components/ComingUp.jsx:22` (the `diff > 0` filter)
- Modify: `frontend/src/components/LiveContextBar.jsx:137-140` and `:261-272` (lifecycle input and set count)
- Test: `frontend/src/utils/__tests__/nextMove.cancelled.test.js` (create)

**Interfaces:**
- Consumes: `band.is_cancelled` from Task 2.
- Produces: no new exports. `computeNextMove()` never returns a cancelled band as `nextBand` or `nowBand`.

This is suppression #1 and the highest-severity behaviour in the feature. **Note the spec named `NextMove.jsx` — that component is purely presentational.** The actual selection happens in `computeNextMove()`, so the fix belongs in the util, where it also covers every other consumer. Do not patch the component.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/__tests__/nextMove.cancelled.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { computeNextMove } from '../nextMove'

const at = iso => +new Date(iso)

describe('computeNextMove — cancelled sets', () => {
  const now = new Date('2026-08-07T20:00:00-04:00')

  const cancelledSoon = {
    id: 1,
    name: 'Deer Fang',
    venue: 'Room 47',
    is_cancelled: 1,
    startMs: at('2026-08-07T20:15:00-04:00'),
    endMs: at('2026-08-07T20:45:00-04:00'),
  }
  const scheduledLater = {
    id: 2,
    name: 'Sam Nabi',
    venue: 'Roost',
    is_cancelled: 0,
    startMs: at('2026-08-07T21:00:00-04:00'),
    endMs: at('2026-08-07T21:40:00-04:00'),
  }

  it('never routes a fan to a cancelled set', () => {
    // Without the guard the sooner (cancelled) set wins on start time.
    const state = computeNextMove([cancelledSoon, scheduledLater], now)
    expect(state.nextBand?.name).toBe('Sam Nabi')
  })

  it('still routes to the sooner set when it is NOT cancelled', () => {
    // Proves the assertion above turns on is_cancelled, not on ordering.
    const state = computeNextMove([{ ...cancelledSoon, is_cancelled: 0 }, scheduledLater], now)
    expect(state.nextBand?.name).toBe('Deer Fang')
  })

  it('does not report a cancelled set as playing now', () => {
    const playingButCancelled = {
      ...cancelledSoon,
      startMs: at('2026-08-07T19:45:00-04:00'),
      endMs: at('2026-08-07T20:30:00-04:00'),
    }
    const state = computeNextMove([playingButCancelled], now)
    expect(state.nowBand).toBeFalsy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npm test -- nextMove.cancelled --run
```

Expected: FAIL — `nextBand.name` is `'Deer Fang'`, the cancelled set.

- [ ] **Step 3: Add the guard at the single choke point**

In `frontend/src/utils/nextMove.js`, extend the `timed` filter (line 38):

```js
  // Only bands with usable precomputed times participate -- and never a
  // cancelled set (#732). Routing a fan across town for a band that is not
  // playing is the worst failure mode of this feature, so the guard lives
  // here at the single choke point every consumer shares.
  const timed = (Array.isArray(bands) ? bands : []).filter(
    b => Number.isFinite(b.startMs) && b.startMs > 0 && Number.isFinite(b.endMs) && b.endMs > 0 && !b.is_cancelled
  )
```

- [ ] **Step 4: Guard ComingUp**

In `frontend/src/components/ComingUp.jsx`, extend the filter on line 22:

```jsx
        .filter(band => band.diff > 0 && !band.is_cancelled)
```

- [ ] **Step 5: Guard the LiveContextBar counts and lifecycle**

`LiveContextBar` does not compute an up-next band, but it feeds `bands` into `getLifecycleLabel()` and renders a set count. A cancelled set must not sustain a "Happening Now" label or inflate "34 sets". Add a derived list just above the `lifecycle` memo (line 137):

```jsx
  // Cancelled sets must not sustain a "Happening Now" lifecycle label or
  // inflate the set count in the summary line (#732).
  const activeBands = useMemo(() => bands.filter(b => !b.is_cancelled), [bands])
```

Then use `activeBands` in place of `bands` in the `getLifecycleLabel(...)` call and its dependency array, and replace both `bands.length` references in `mobileSummary` (line 264) and its dependency array with `activeBands.length`.

**Leave `venueOptions` (line 126) on the full `bands` list** — a venue whose only set is cancelled must stay filterable so fans can actually find the cancellation.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd frontend && npm test -- --run
```

Expected: PASS.

- [ ] **Step 7: Prove the guard is not vacuous**

Remove `&& !b.is_cancelled` from `nextMove.js` and re-run. Expected: the "never routes a fan to a cancelled set" test FAILS. Restore and re-run. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd frontend && npx prettier --write "src/**/*.{js,jsx,json,css}" && npm run lint && npm run format:check && npm test -- --run && npm run build
cd .. && git add frontend/src/utils/nextMove.js frontend/src/components/ComingUp.jsx frontend/src/components/LiveContextBar.jsx frontend/src/utils/__tests__/nextMove.cancelled.test.js
git commit -m "feat(live): never route fans to a cancelled set (#732)"
```

---

### Task 7: Admin cancel toggle

**Files:**
- Modify: `functions/api/admin/bands/[id].js` (accept `is_cancelled` on the update path)
- Modify: `frontend/src/admin/LineupTab.jsx` (the toggle control)
- Test: `functions/api/admin/bands/__tests__/cancel-toggle.test.js` (create)

**Interfaces:**
- Consumes: `performances.is_cancelled` from Task 1.
- Produces: the existing single-band admin update route accepts `is_cancelled: 0 | 1`.

There is no `functions/api/admin/performances/` route — performance writes go through this handler. Extend it rather than adding a route. Cancelling must be reversible: un-cancelling restores the set, which is the entire point of not deleting.

- [ ] **Step 1: Write the failing test**

Mirror the auth/context seeding from an existing test under `functions/api/admin/` — read one before writing `seedEditorContext`. Create `functions/api/admin/bands/__tests__/cancel-toggle.test.js`:

```js
import { describe, expect, it } from "vitest";

describe("admin single-band handler — is_cancelled", () => {
  it("cancels a performance and reverses it", async () => {
    const { db, performanceId, patch } = await seedEditorContext();
    const read = () => db.prepare("SELECT is_cancelled FROM performances WHERE id = ?").get(performanceId).is_cancelled;

    await patch({ is_cancelled: 1 });
    expect(read()).toBe(1);

    // Reversibility is the whole point -- a one-way flag would be a DELETE
    // with extra steps.
    await patch({ is_cancelled: 0 });
    expect(read()).toBe(0);
  });

  it("rejects a viewer", async () => {
    const { patchAsViewer } = await seedEditorContext();
    const res = await patchAsViewer({ is_cancelled: 1 });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm test -- cancel-toggle
```

Expected: FAIL — `is_cancelled` stays 0 because the handler ignores the field.

- [ ] **Step 3: Accept the field in the handler**

In `functions/api/admin/bands/[id].js`, add `is_cancelled` to the performance update alongside the existing `is_announced` handling. Coerce to 0/1 rather than passing the raw body value into SQL:

```js
    // Reversible by design (#732): un-cancelling restores the set, which is
    // the entire reason this is a column and not a DELETE.
    const isCancelled = body.is_cancelled === undefined ? undefined : body.is_cancelled ? 1 : 0;
```

Include it in the same `UPDATE performances SET ...` statement the handler already builds, only when `isCancelled !== undefined`. Confirm the handler calls `checkPermission(context, "editor")` before any write — it does for the existing paths; do not add a second, weaker path.

- [ ] **Step 4: Add the LineupTab toggle**

In `frontend/src/admin/LineupTab.jsx`, add a per-row Cancel / Restore control next to the existing per-row actions, calling the same update endpoint the row already uses. Admin is dark-pinned (`AdminApp.jsx` wraps it in `data-theme="midnight-ember"`), so hardcoded `text-white` here is correct and intentional — match the surrounding admin styling rather than public semantic tokens.

Label the button by what it will do, and reflect current state in the row:

```jsx
<button
  type="button"
  onClick={() => handleCancelToggle(performance)}
  aria-label={`${performance.is_cancelled ? 'Restore' : 'Cancel'} ${performance.band_name}`}
>
  {performance.is_cancelled ? 'Restore' : 'Cancel'}
</button>
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- cancel-toggle
```

Expected: PASS.

- [ ] **Step 6: Prove the reversibility assertion is real**

Make the handler write a hardcoded `1` instead of `isCancelled` and re-run. Expected: the reversal assertion FAILS. Restore and re-run. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
make gate
git add "functions/api/admin/bands/[id].js" frontend/src/admin/LineupTab.jsx "functions/api/admin/bands/__tests__/cancel-toggle.test.js"
git commit -m "feat(admin): reversible cancel toggle on the lineup (#732)"
```

---

### Task 8: Fix orphaned names on shared lineups (#733)

**Files:**
- Modify: `functions/api/schedule/share/[slug].js:80-104`
- Modify: `frontend/src/pages/SharePreviewPage.jsx:205`, `:238`, `:242`
- Test: `functions/api/schedule/__tests__/share-get-bands.test.js` (extend the existing file)

**Interfaces:**
- Consumes: `performances.is_cancelled` from Task 1.
- Produces: `bands[]` entries carry `is_cancelled`; entries whose performance row no longer exists are omitted from `bands`, while `performance_ids` and `band_names` are returned unchanged.

Two distinct cases, resolving differently:

1. **Cancelled** — the row still resolves, so it keeps its real time and venue and renders struck through. This is the ordinary path now, and strictly better than either the orphan or a silent disappearance.
2. **Hard-deleted** (a set added in error, an event cleaned up) — nothing resolves, and today the endpoint emits the stored name with `start_time: null, venue: null`. That is the orphan. Omit it from `bands`.

`performance_ids` and `band_names` must be returned **unchanged and index-aligned** — `App.jsx` re-fetches this endpoint with `?import=1` and reads exactly those two fields to apply a shared route. Filtering only the additive `bands` array preserves that contract (issue acceptance criterion 3).

**The consequence the existing comment at `:91-93` warns about is real and must be handled:** `SharePreviewPage` derives its "N-stop route" heading from `band_names.length`, so filtering `bands` alone would render 5 rows under a "6-stop route" heading. The count has to move to `bands.length`.

- [ ] **Step 1: Write the failing tests**

Extend `functions/api/schedule/__tests__/share-get-bands.test.js`, reusing the seeding helper already in that file (add a third set to it if it currently seeds fewer):

```js
  it("omits a hard-deleted performance instead of emitting a nameless orphan", async () => {
    const { db, deletedId, fetchShare } = await seedShareWithThreeSets();

    const before = await fetchShare();
    expect(before.bands).toHaveLength(3);

    db.prepare("DELETE FROM performances WHERE id = ?").run(deletedId);

    const after = await fetchShare();
    expect(after.bands).toHaveLength(2);
    // The orphan signature: a row carrying a name but no time and no venue.
    expect(after.bands.some((b) => b.start_time === null && b.venue === null)).toBe(false);
  });

  it("returns performance_ids and band_names unchanged so ?import=1 stays index-aligned", async () => {
    const { db, deletedId, fetchShare } = await seedShareWithThreeSets();
    const before = await fetchShare();

    db.prepare("DELETE FROM performances WHERE id = ?").run(deletedId);
    const after = await fetchShare();

    expect(after.performance_ids).toEqual(before.performance_ids);
    expect(after.band_names).toEqual(before.band_names);
  });

  it("KEEPS a cancelled performance with its real time and venue", async () => {
    const { db, cancelledId, fetchShare } = await seedShareWithThreeSets();

    db.prepare("UPDATE performances SET is_cancelled = 1 WHERE id = ?").run(cancelledId);

    const after = await fetchShare();
    const entry = after.bands.find((b) => b.performance_id === cancelledId);
    expect(entry).toBeDefined();
    expect(entry.is_cancelled).toBe(1);
    expect(entry.start_time).not.toBeNull();
    expect(entry.venue).not.toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test -- share-get-bands
```

Expected: FAIL — the deleted performance still appears, and `is_cancelled` is `undefined`.

- [ ] **Step 3: Project the column and drop unresolved entries**

In `functions/api/schedule/share/[slug].js`, add `p.is_cancelled,` to the detail SELECT (lines 80–81), then replace the mapping at lines 90–104:

```js
      const byId = new Map((detail.results || []).map((r) => [r.performance_id, r]));
      // A performance that no longer resolves was HARD-DELETED. Emitting the
      // stored name with a null time and venue produces an orphan that reads
      // as a rendering bug (#733) -- starkly so since #731 added times and
      // venues to every other row. Drop it instead.
      //
      // A CANCELLED set still resolves, so it keeps its real time and venue
      // and renders struck through -- the ordinary path now, and strictly
      // better than either the orphan or a silent disappearance.
      //
      // `performance_ids` and `band_names` are returned UNCHANGED below:
      // App.jsx re-fetches with ?import=1 and reads those two index-aligned
      // arrays to apply a shared route. Only the additive `bands` is filtered.
      bands = performance_ids
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((found) => ({
          performance_id: found.performance_id,
          name: found.name,
          start_time: found.start_time,
          end_time: found.end_time,
          venue: found.venue,
          performance_date: found.performance_date,
          is_cancelled: found.is_cancelled,
        }));
```

This also removes the now-unreachable `"Unknown artist"` fallback — that string was only ever reached via the orphan path.

- [ ] **Step 4: Move the SharePreviewPage count off `band_names`**

`bands` is now the canonical render list, so the count must come from it. In `frontend/src/pages/SharePreviewPage.jsx`, add a derived count above the return:

```jsx
  // `bands` is the canonical render list -- it excludes performances that have
  // been hard-deleted since the link was shared (#733). `band_names` is the
  // untouched snapshot kept for the ?import=1 apply path, so counting it here
  // would render N-1 rows under an "N-stop route" heading.
  const stopCount = shareData.bands?.length ?? shareData.band_names.length
```

Replace `{shareData.band_names.length}-stop route` (line 205), both occurrences in the Add button (line 238), and `bandCount={shareData.band_names.length}` (line 242) with `stopCount`. **Leave `performanceIds={shareData.performance_ids}` on line 242 unchanged** — the apply path still needs the full snapshot.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test -- share-get-bands
cd frontend && npm test -- --run
```

Expected: PASS for both.

- [ ] **Step 6: Prove the filter is not vacuous**

Replace `.filter(Boolean)` with `.filter(() => true)` and re-run. Expected: the omit-orphan test FAILS. Restore and re-run. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
make gate
git add "functions/api/schedule/share/[slug].js" frontend/src/pages/SharePreviewPage.jsx functions/api/schedule/__tests__/share-get-bands.test.js
git commit -m "fix(share): drop orphaned entries for deleted performances; carry is_cancelled (#733)"
```

---

### Task 9: Playwright a11y and visual coverage

**Files:**
- Modify: the E2E seed script (locate with `grep -rn "ALLOW_ADMIN_SIGNUP" e2e/ scripts/`)
- Modify: the existing schedule spec under `e2e/` (follow the file that already renders a lineup)

**Interfaces:**
- Consumes: everything above.
- Produces: no application code. Verification only.

- [ ] **Step 1: Seed a cancelled set in the E2E fixture**

Set `is_cancelled = 1` on exactly one seeded performance. `ALLOW_ADMIN_SIGNUP` is test-only and must never be set in production.

- [ ] **Step 2: Write the spec case**

```js
test('a cancelled set is marked accessibly and is not selectable', async ({ page }) => {
  await page.goto('/event/<seeded-slug>')
  const card = page.locator('li', { hasText: 'Deer Fang' })

  // The visible pill is the accessible carrier -- line-through alone is not
  // announced by NVDA or JAWS and would fail WCAG 1.4.1.
  await expect(card.getByText('Cancelled')).toBeVisible()
  await expect(card.locator('s')).toHaveText('Deer Fang')
  await expect(card.getByRole('button', { name: /route/i })).toHaveCount(0)
})
```

Adjust the `card` locator to match the actual list markup in the spec file you are extending.

- [ ] **Step 3: Run the a11y pass**

```bash
npm run build --prefix frontend
npx playwright test --grep "cancelled"
```

Expected: PASS, including the axe assertions in the existing a11y spec.

- [ ] **Step 4: Verify all four themes**

Load the event page and cycle `midnight-ember`, `arctic-night`, `daybreak`, `silver-lining` via the theme toggle. Confirm on each that the "Cancelled" pill text and the struck-through name are both legible. The light themes are the risk — `text-text-disabled` would fail here, which is why the name uses `text-text-secondary`.

- [ ] **Step 5: Commit**

```bash
make gate
git add e2e/
git commit -m "test(e2e): cover cancelled-set rendering and a11y (#732)"
```

---

## Pre-PR gate

- [ ] `make gate` passes end to end
- [ ] `make review` (CodeRabbit) run **before** opening the PR, not after
- [ ] Rebase: `git fetch origin && git rebase origin/main`
- [ ] PR body includes `Closes #732` and `Closes #733` on their own lines
- [ ] Labels applied at open: `enhancement,priority:p2`
- [ ] Update `CLAUDE.md`: the "Band Announcements" section's implication that un-announcing is the only lever is now stale. Document `is_cancelled` as the cancellation path while KEEPING the `reveal_mode` no-op explanation — that is what #734 asks for; reference it.

## Deployment note

Migrations auto-apply on merge via `cloudflare-pages.yml`. The column is additive with a DEFAULT, so it backfills every existing row as scheduled — no data migration, no backfill script.

Nothing is required for Vol. 17 (event 21): it is past, and a cancelled set would be excluded from history anyway, so the hard delete performed on show day is retroactively consistent with this design.

**Buddies Fest 2 (event 36, 2026-08-07 to 2026-08-09) is the first event this protects.** Three days, three venues, out-of-region touring acts — merge and deploy before Aug 7.
