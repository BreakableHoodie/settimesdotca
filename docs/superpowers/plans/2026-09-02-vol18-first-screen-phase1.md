# Vol 18 First Screen — Phase 1 (the fold) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get an act name onto the first screen of `/event/:slug` at 390 px, replacing the nine controls that currently precede it, and give the lineup a scannable time-led board layout.

**Architecture:** No new data and no migration. The work is a re-ordering of what `App.jsx` renders above `ScheduleView`, plus a compact board presentation inside `ScheduleView`'s existing `groupByTime` structure. `BandCard` gains a `variant` prop rather than being replaced, so cancelled-set handling, selection and a11y stay in the one already-tested component. A Playwright assertion pins the fold so the regression cannot return.

**Tech Stack:** React 19, Vite 8, Tailwind v4 (semantic tokens via `data-theme`), Vitest + Testing Library + jest-axe, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-vol18-first-screen-design.md`

## Global Constraints

Every task's requirements implicitly include all of these. Values are copied verbatim from the spec and `CLAUDE.md`.

- **Public surfaces use semantic tokens, never hardcoded white.** `text-text-primary` / `-secondary` / `-tertiary`, `bg-surface`, `border-border`. `text-white` is allowed only on a fixed colour (a coloured button) or over a dark photo scrim.
- **Both contrast guards must stay green:** `frontend/src/__tests__/themeContrast.test.js` and `frontend/src/__tests__/linkButtonContrast.test.js`. Any new colour pair is checked across all four themes.
- **Never break after-midnight sorting.** `AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`. Sets before 06:00 belong to the previous evening; `prepareBands` already applies the offset. Do not re-sort, re-group, or re-derive times — consume `band.startMs` / `band.date` as given.
- **Single-day events never show a "Day 1" label.** Day dividers and tabs are gated on `hasDayTabs` / `isMultiDay`. Vol. 18 is single-day.
- **Cancelled sets stay visible, struck through, labelled "Cancelled"** on every fan surface. `BandCard.cancelled.test.jsx` covers this and must keep passing.
- **Never write `selectedBandsByEvent` directly** — go through `frontend/src/utils/scheduleStorage.js`.
- **A `<dt>`/`<dd>` may sit at most ONE `<div>` below its `<dl>`** (axe `dlitem`). If you add a definition list, keep the wrapper count at one.
- **Vol. 18 has no set times yet.** Every performance has `start_time = null`, so the `'TBD'` path in `groupByTime` is the live path today. It must render correctly, not as a degraded case.

---

### Task 1: Pin the fold with a failing Playwright assertion

Written first and expected to FAIL. It is the acceptance criterion for the whole plan; every later task moves it closer to green.

**Files:**
- Create: `e2e/accessibility/event-fold.spec.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Later tasks are verified by this spec passing.

- [ ] **Step 1: Write the failing test**

```js
/**
 * The first screen must lead with the lineup, not with controls.
 *
 * Measured before this guard existed: on a 390px viewport a fan passed roughly
 * 1,300px of chrome -- header, lifecycle pill, clock, title block, poster chip,
 * tab toggle, "How it works", "Full Lineup" heading, view toggle, Copy, Select
 * All, genre dropdown -- before the first act name. Nine controls before one
 * band, on the page people hold standing in the street.
 *
 * The assertion is a POSITION, not a class or a DOM shape, because every
 * cheaper proxy passes on a page that still scrolls. iPhone 12/13/14 viewport.
 *
 * WHY THE BUDGET IS HALF THE FOLD AND NOT THE WHOLE FOLD.
 *
 * The first version of this test asserted only "inside 844px" and PASSED against
 * the seed on day one, which made it useless as the acceptance criterion it was
 * written to be. Measured: the seeded event puts its first act at 827px -- inside
 * the fold by 17 pixels, because the seed has four bands and fewer controls than
 * a real bill. Production `lwbc18`, with fifteen acts and every control, put it
 * at roughly 1,300px.
 *
 * So the whole-fold budget is environment-dependent at exactly the margin that
 * matters, and an act name clinging to the bottom edge of the screen is not
 * "leading with the lineup" in any sense a fan would recognise.
 *
 * LINEUP_BUDGET_PX is half the viewport: on the first screen, half of it should
 * be schedule. That is a claim about the design, it fails today on both the seed
 * and production, and it cannot be satisfied by a page that merely stopped
 * getting worse.
 */
import { test, expect } from "@playwright/test";

const SEEDED_EVENT = "future-fest-e2e";
const FOLD_PX = 844;
const LINEUP_BUDGET_PX = Math.round(FOLD_PX / 2);

test.describe("Event page fold (#1074 / Vol 18 phase 1)", () => {
  test.use({ viewport: { width: 390, height: FOLD_PX } });

  test("an act name is visible without scrolling", async ({ page, request }) => {
    const res = await request.get(`/api/schedule?event=${SEEDED_EVENT}`);
    expect(res.ok(), "seeded schedule should resolve").toBeTruthy();
    const body = await res.json();
    const names = (body.bands || []).map((b) => b.name).filter(Boolean);
    expect(names.length, "seed must have performances for this to mean anything").toBeGreaterThan(0);

    await page.goto(`/event/${SEEDED_EVENT}`);
    // Wait for real content, never a skeleton -- a fold measured mid-fetch is meaningless.
    await expect(page.getByRole("heading", { name: "Full Lineup" })).toBeVisible({ timeout: 15000 });

    const firstActTop = await page.evaluate((actNames) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (!actNames.includes(text)) continue;
        const el = node.parentElement;
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Skip anything not actually painted (sr-only, display:none, zero-box).
        if (rect.height === 0 || rect.width === 0) continue;
        return rect.top;
      }
      return null;
    }, names);

    expect(firstActTop, `no act name from ${JSON.stringify(names.slice(0, 3))} was rendered at all`).not.toBeNull();

    // The floor: an act name below this is not on the first screen at all.
    expect(
      firstActTop,
      `first act name renders ${Math.round(firstActTop)}px down, past the ${FOLD_PX}px fold entirely`
    ).toBeLessThan(FOLD_PX);

    // The real bar. See the header for why the fold alone is not enough.
    expect(
      firstActTop,
      `first act name renders ${Math.round(firstActTop)}px down; the lineup should start within ` +
        `${LINEUP_BUDGET_PX}px so half the first screen is schedule rather than controls`
    ).toBeLessThan(LINEUP_BUDGET_PX);
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS for the right reason**

Run: `ADMIN_EMAIL=$ADMIN_EMAIL ADMIN_PASSWORD=$ADMIN_PASSWORD npx playwright test e2e/accessibility/event-fold.spec.js --project=chromium --reporter=list`

Expected: FAIL with `first act name renders 827px down; the lineup should start within 422px`.

Two wrong failures to watch for, because a test that fails for the wrong reason proves nothing:

- `no act name was rendered at all` — the seed or the ready-locator is broken. Fix that first.
- A failure naming the 844px fold rather than the 422px budget — that means the page is *even worse* than measured here, which is possible on a denser bill but not what the seed produces.

**Measured 2026-09-02:** the seeded event puts its first act at **827px** and production `lwbc18` at roughly **1,300px**. The whole-fold assertion alone PASSED against the seed on day one (827 < 844, by 17 pixels) which is why the half-fold budget exists — see the spec file's header.

- [ ] **Step 3: Commit the red test**

```bash
git add e2e/accessibility/event-fold.spec.js
git commit -m "test(e2e): pin the event-page fold, currently ~1300px past it"
```

---

### Task 2: Venue short codes

A pure function first, with no UI. The board row needs a 4-character venue chip, and the collision case is real: **Blue Room (Inside Revive Karaoke)** and **Revive Karaoke** share an address and both reduce awkwardly.

**Files:**
- Create: `frontend/src/utils/venueCode.js`
- Test: `frontend/src/utils/__tests__/venueCode.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `venueCodes(venueNames: string[]) => Map<string, string>` — maps each venue name to a unique uppercase code of at most 4 characters. Task 3 imports this.

- [ ] **Step 1: Write the failing test**

```js
// Codes are derived, not stored: no migration, and a venue renamed in admin
// cannot leave a stale code behind. Uniqueness is resolved ACROSS THE SET rather
// than per-name, because collisions only exist relative to the other venues on
// the same bill.
import { describe, expect, it } from 'vitest'
import { venueCodes } from '../venueCode'

describe('venueCodes', () => {
  it('takes the initials of a multi-word name', () => {
    const codes = venueCodes(['Prohibition Warehouse'])
    expect(codes.get('Prohibition Warehouse')).toBe('PROH')
  })

  it('separates the Vol 18 collision case', () => {
    // Both are at 28 King St N and both start from "Revive".
    const names = ['Revive Karaoke', 'Blue Room (Inside Revive Karaoke)', 'Princess Cafe', 'Prohibition Warehouse']
    const codes = venueCodes(names)
    const values = names.map(n => codes.get(n))
    expect(new Set(values).size, `codes collided: ${values.join(', ')}`).toBe(names.length)
    expect(codes.get('Blue Room (Inside Revive Karaoke)')).toBe('BLUE')
    expect(codes.get('Revive Karaoke')).toBe('REVI')
  })

  it('is stable regardless of input order', () => {
    const a = venueCodes(['Revive Karaoke', 'Room 47'])
    const b = venueCodes(['Room 47', 'Revive Karaoke'])
    expect(a.get('Room 47')).toBe(b.get('Room 47'))
    expect(a.get('Revive Karaoke')).toBe(b.get('Revive Karaoke'))
  })

  it('never returns more than four characters', () => {
    const codes = venueCodes(['The Extremely Long Venue Name Company'])
    expect(codes.get('The Extremely Long Venue Name Company').length).toBeLessThanOrEqual(4)
  })

  it('ignores empty and missing names rather than emitting a blank chip', () => {
    const codes = venueCodes(['', null, undefined, 'Roost'])
    expect(codes.get('Roost')).toBe('ROOS')
    expect(codes.has('')).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/utils/__tests__/venueCode.test.js`
Expected: FAIL — `Failed to resolve import "../venueCode"`.

- [ ] **Step 3: Implement**

```js
/**
 * Short venue codes for the schedule board, derived from the venue name.
 *
 * Derived rather than stored: no migration, and renaming a venue in admin cannot
 * leave a stale code behind. If derivation ever proves inadequate the answer is a
 * `short_code` column, but the live bill does not need one -- see the Vol 18
 * collision case in the tests.
 *
 * Uniqueness is resolved across the whole set, because a collision only exists
 * relative to the other venues on the same bill.
 */
const MAX = 4

const clean = name => String(name ?? '').replace(/\([^)]*\)/g, ' ').replace(/[^A-Za-z0-9 ]/g, ' ').trim()

// Leading articles carry no identity: "The Copper Mug" must read COPP, not THE.
const ARTICLE = /^(the|a|an)$/i

function candidate(name) {
  const words = clean(name).split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  // The first MAX characters of the first SIGNIFICANT word, not the initials.
  // Initials read worse at this length: "Prohibition Warehouse" gives PW, padded
  // back out to PWRO, where PROH is what a person would write on a wristband.
  // Ties are venueCodes()'s problem, and it breaks them with a numeric suffix.
  const significant = words.length > 1 && ARTICLE.test(words[0]) ? words.slice(1) : words
  return (significant[0] ?? words[0]).slice(0, MAX).toUpperCase()
}

export function venueCodes(names) {
  const codes = new Map()
  const taken = new Set()
  // Sorted so the result does not depend on the order venues arrive in.
  const unique = [...new Set(names.filter(n => clean(n).length > 0))].sort()

  for (const name of unique) {
    const base = candidate(name)
    let code = base
    let n = 2
    while (taken.has(code)) {
      code = (base.slice(0, MAX - 1) + n).slice(0, MAX)
      n += 1
    }
    taken.add(code)
    codes.set(name, code)
  }
  return codes
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd frontend && npx vitest run src/utils/__tests__/venueCode.test.js`
Expected: PASS, 5 tests.

If `Blue Room (Inside Revive Karaoke)` does not yield `BLUE`, check that `clean()` strips the parenthetical before taking initials — that is the whole reason it exists.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/venueCode.js frontend/src/utils/__tests__/venueCode.test.js
git commit -m "feat(schedule): derive short venue codes, separating the Blue Room/Revive collision"
```

---

### Task 3: A compact board variant on BandCard

`BandCard` gains a `variant` prop instead of being replaced. Cancelled handling, selection, and a11y already live there and are already tested — a second component would duplicate them, and the duplicate would drift.

**Files:**
- Modify: `frontend/src/components/BandCard.jsx`
- Test: `frontend/src/components/__tests__/BandCard.board.test.jsx`

**Interfaces:**
- Consumes: `venueCodes` from Task 2.
- Produces: `<BandCard variant="board" venueCode="PROH" … />`. Task 4 renders this.

- [ ] **Step 1: Read the component before changing it**

Run: `sed -n '1,80p' frontend/src/components/BandCard.jsx`

Note the existing prop list and how the cancelled state is rendered. The board variant must reuse that branch, not re-implement it.

- [ ] **Step 2: Write the failing test**

```js
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it } from 'vitest'
import BandCard from '../BandCard'

expect.extend(toHaveNoViolations)

const band = {
  id: 7,
  name: 'Dolly Sods',
  venue: 'Princess Cafe',
  startTime: '20:30',
  endTime: '21:15',
  date: '2026-10-11',
}

const renderBoard = (props = {}) =>
  render(
    <MemoryRouter>
      <BandCard band={band} variant="board" venueCode="PRIN" showVenue currentTime={new Date()} {...props} />
    </MemoryRouter>
  )

describe('BandCard variant="board"', () => {
  it('shows the act, its time and the venue code', () => {
    renderBoard()
    expect(screen.getByText('Dolly Sods')).toBeInTheDocument()
    expect(screen.getByText('PRIN')).toBeInTheDocument()
  })

  it('still marks a cancelled set as cancelled', () => {
    // The reason this is a variant rather than a new component: the cancelled
    // treatment is the one thing that must never differ between presentations.
    renderBoard({ band: { ...band, is_cancelled: 1 } })
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument()
  })

  it('exposes the venue code to assistive tech as a real venue name', () => {
    // "PRIN" is a visual abbreviation. A screen reader must hear the venue.
    renderBoard()
    expect(screen.getByText('PRIN')).toHaveAttribute('title', 'Princess Cafe')
  })

  it('has no axe violations', async () => {
    const { container } = renderBoard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/components/__tests__/BandCard.board.test.jsx`
Expected: FAIL — `PRIN` is not rendered, because the variant does not exist yet.

- [ ] **Step 4: Implement the variant**

Add `variant = 'card'` and `venueCode` to the props, and return the compact row before the existing card JSX. Reuse the component's existing cancelled flag rather than recomputing it.

```jsx
  if (variant === 'board') {
    return (
      <div
        className={`grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-border px-3 py-3 ${
          isCancelled ? 'opacity-70' : ''
        }`}
      >
        <span className="font-mono text-base font-bold tabular-nums text-text-primary">
          {band.startTime && band.startTime !== 'TBD' ? formatTime(band.startTime) : '--'}
        </span>
        <span className="min-w-0">
          <span className={`block truncate font-semibold text-text-primary ${isCancelled ? 'line-through' : ''}`}>
            {band.name}
          </span>
          {isCancelled && <span className="text-xs font-semibold text-warning-400">Cancelled</span>}
        </span>
        {venueCode && (
          <span
            title={band.venue}
            className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] font-bold text-text-secondary"
          >
            {venueCode}
          </span>
        )}
        {/* The board row REPLACES the card on mobile, so without this the core
            interaction the page advertises -- "Tap any performer to add them to
            My Route" -- would simply not exist on phones. */}
        {showToggleButton && !isCancelled && (
          <button
            type="button"
            onClick={handleRemove}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2"
            aria-label={
              isSelected
                ? `Remove ${band.name || 'Unnamed Artist'} from my route`
                : `Add ${band.name || 'Unnamed Artist'} to my route`
            }
          >
            {isSelected ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
          </button>
        )}
      </div>
    )
  }
```

Three things this depends on, all verified present in the file already: `isCancelled`
(line 31), `formatTime` (imported line 7), and `buildBandProfileHref`, whose signature
is **`(bandName, eventSlug)`** — it takes the NAME, not the band object. `TriangleAlert`,
`Plus` and `X` are already imported too. Do not add duplicate imports.

**The toggle is not optional.** A first draft of this variant omitted it and every
other test still passed — the row rendered, the name showed, axe was clean, and My
Route was silently unusable on mobile. Test the toggle explicitly, and use
`fireEvent` from `@testing-library/react`: `@testing-library/user-event` is NOT a
dependency of this project.

- [ ] **Step 5: Run the new test and the existing BandCard tests together**

Run: `cd frontend && npx vitest run src/components/__tests__/BandCard`
Expected: PASS. All of `BandCard.test.jsx`, `BandCard.cancelled.test.jsx`, `BandCard.dayLabel.test.jsx` and the new board test. If a pre-existing test broke, the variant leaked into the default path — the `card` branch must be byte-identical in behaviour.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/BandCard.jsx frontend/src/components/__tests__/BandCard.board.test.jsx
git commit -m "feat(schedule): add a compact board variant to BandCard"
```

---

### Task 4: Render the board on mobile

`ScheduleView` keeps `groupByTime` — the grouping is correct and carries the festival-day logic. What changes is that on narrow viewports the per-group time header collapses into the rows, which is where most of the vertical space goes.

**Files:**
- Modify: `frontend/src/components/ScheduleView.jsx:540-572` (the upcoming branch) and the matching past branch below it
- Test: `frontend/src/components/__tests__/ScheduleView.board.test.jsx`

**Interfaces:**
- Consumes: `venueCodes` (Task 2), `BandCard variant="board"` (Task 3).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

```js
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import ScheduleView from '../ScheduleView'

const bands = [
  { id: 1, name: 'G.F.U.', venue: 'Prohibition Warehouse', startTime: '21:15', date: '2026-10-11' },
  { id: 2, name: 'Frank Dux', venue: 'Blue Room (Inside Revive Karaoke)', startTime: '21:45', date: '2026-10-11' },
]

const renderView = () =>
  render(
    <MemoryRouter>
      <ScheduleView
        bands={bands}
        selectedBands={[]}
        onToggleBand={() => {}}
        currentTime={new Date('2026-10-11T21:20:00-04:00')}
      />
    </MemoryRouter>
  )

describe('ScheduleView board rows', () => {
  it('renders every act with a venue code', () => {
    renderView()
    expect(screen.getByText('G.F.U.')).toBeInTheDocument()
    expect(screen.getByText('Frank Dux')).toBeInTheDocument()
    expect(screen.getByText('PROH')).toBeInTheDocument()
    expect(screen.getByText('BLUE')).toBeInTheDocument()
  })

  it('does not print a day label for a single-day event', () => {
    // Vol 18 is single-day. A "Day 1" label on it is a documented bug class.
    renderView()
    expect(screen.queryByText(/day 1/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd frontend && npx vitest run src/components/__tests__/ScheduleView.board.test.jsx`
Expected: FAIL — the venue codes `PROH` / `BLUE` are not rendered.

- [ ] **Step 3: Compute the codes once, at the top of the component**

Add near the other `useMemo` calls (beside `upcomingByTime`, around line 181):

```js
  const venueCodeMap = useMemo(() => venueCodes(bands.map(b => b.venue)), [bands])
```

and import it:

```js
import { venueCodes } from '../utils/venueCode'
```

- [ ] **Step 4: Render board rows below `sm:`, cards at and above it**

Replace the card grid inside the upcoming branch (currently `frontend/src/components/ScheduleView.jsx:555-568`) with both presentations, each hidden at the other's width. The time header block above it becomes `hidden sm:flex` so the time only appears once on mobile — inside the rows.

```jsx
                      <div className="sm:hidden">
                        {timeBands.map(band => (
                          <BandCard
                            key={band.id}
                            band={band}
                            variant="board"
                            venueCode={venueCodeMap.get(band.venue)}
                            isSelected={selectedBandsSet.has(band.id)}
                            onToggle={onToggleBand}
                            showToggleButton={canToggleBands}
                            eventSlug={eventSlug}
                            showVenue={true}
                            currentTime={currentTime}
                          />
                        ))}
                      </div>
                      <div className="hidden sm:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6 ml-0 sm:ml-4">
                        {timeBands.map(band => (
                          <BandCard
                            key={band.id}
                            band={band}
                            isSelected={selectedBandsSet.has(band.id)}
                            onToggle={onToggleBand}
                            showToggleButton={canToggleBands}
                            eventSlug={eventSlug}
                            showVenue={true}
                            currentTime={currentTime}
                          />
                        ))}
                      </div>
```

Then change the time header wrapper on the line above from `className="flex items-center mb-4"` to `className="hidden sm:flex items-center mb-4"`.

- [ ] **Step 5: Apply the identical change to the past-events branch**

The past branch (around `frontend/src/components/ScheduleView.jsx:588-610`) has the same structure. Make the same edit there. Leaving it as cards is a visible inconsistency on the same page.

- [ ] **Step 6: Run the component tests**

Run: `cd frontend && npx vitest run src/components/__tests__/ScheduleView`
Expected: PASS, including any pre-existing ScheduleView tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ScheduleView.jsx frontend/src/components/__tests__/ScheduleView.board.test.jsx
git commit -m "feat(schedule): board rows on mobile, cards from sm: up"
```

---

### Task 5: Move the onboarding hint out of the fold

The "How it works" banner is shown on first visit and sits directly above the lineup. It is genuinely useful, and it does not need to be the thing between a fan and the schedule.

**Files:**
- Modify: `frontend/src/App.jsx:766-781`

**Interfaces:** none.

- [ ] **Step 1: Move the block below the schedule**

Cut the entire `{!isArchived && showHint && selectedBands.length === 0 && bands.length > 0 && ( … )}` block from its current position and paste it immediately **after** the `<ScheduleView … />` element (which begins at `frontend/src/App.jsx:844`). Change nothing inside the block — `dismissHint`, the gating conditions and the markup all stay exactly as they are.

- [ ] **Step 2: Verify by eye that the conditions are unchanged**

Run: `git diff frontend/src/App.jsx`
Expected: a pure move — the same lines removed and re-added, no edits inside them. If the diff shows anything else, undo and redo the move.

- [ ] **Step 3: Run the app's tests**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "fix(event): move the onboarding hint below the lineup"
```

---

### Task 6: Collapse the schedule controls into one toolbar

**Files:**
- Modify: `frontend/src/components/ScheduleView.jsx` (the control cluster above the lineup — the view toggle, Copy, Select All and the genre/time filter)

**Interfaces:** none.

- [ ] **Step 1: Find the control cluster**

Run: `grep -n "Copy Visible\|Select All\|By Venue\|By Time" frontend/src/components/ScheduleView.jsx`

- [ ] **Step 2: Put the primary controls in one row and demote the rest**

Wrap the view toggle and the filter in a single flex row, and move **Copy Visible Schedule** and **Select All** into a `<details>` disclosure so they cost one line instead of two blocks:

```jsx
        <div className="flex flex-wrap items-center gap-2">
          {/* existing view toggle element, unchanged */}
          {/* existing filter element, unchanged */}
          <details className="ml-auto">
            <summary className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-text-secondary">
              More
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {/* existing Copy Visible Schedule button, unchanged */}
              {/* existing Select All button, unchanged */}
            </div>
          </details>
        </div>
```

Move the existing elements into these slots. Do not rewrite them — their handlers, labels and aria attributes stay as they are.

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npx vitest run src/components/__tests__/ScheduleView`
Expected: PASS. If a test fails because it queried a control that is now inside `<details>`, the control is still in the DOM and still reachable — Testing Library finds it regardless of the disclosure state. A failure here means the element was accidentally dropped, not hidden.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ScheduleView.jsx
git commit -m "refactor(schedule): one control row, with Copy and Select All demoted"
```

---

### Task 7: Turn the fold guard green and verify the whole change

**Files:**
- Modify: whichever of the above still stand between the top of the page and the first act name.

**Interfaces:** none.

- [ ] **Step 1: Run the fold guard**

Run: `ADMIN_EMAIL=$ADMIN_EMAIL ADMIN_PASSWORD=$ADMIN_PASSWORD npx playwright test e2e/accessibility/event-fold.spec.js --project=chromium --reporter=list`

- [ ] **Step 2: If it still fails, measure rather than guess**

The failure message names the exact pixel offset. Find what is above it:

```js
// Add temporarily inside the test, then remove once the fold is green.
const chrome = await page.evaluate(() =>
  [...document.querySelectorAll('main > *, header, header ~ div')]
    .map(el => ({ tag: el.tagName, cls: el.className.toString().slice(0, 60), h: Math.round(el.getBoundingClientRect().height) }))
    .filter(x => x.h > 0)
)
console.log(chrome)
```

Take the tallest remaining block and decide whether it belongs above the lineup. Do not lower `FOLD_PX` — the viewport is a real device, and moving the goalposts is how this regression returns.

- [ ] **Step 3: Confirm the whole a11y sweep still passes**

Run: `ADMIN_EMAIL=$ADMIN_EMAIL ADMIN_PASSWORD=$ADMIN_PASSWORD npx playwright test e2e/accessibility/ --project=chromium --reporter=list`
Expected: PASS, including `public-routes.spec.js` — the board rows are new DOM on a scanned route.

- [ ] **Step 4: Run the full gate**

Run: `make gate`
Expected: exit 0. Both contrast guards included.

- [ ] **Step 5: Verify on a real phone-width browser before believing it**

Run the local E2E stack (build → seed an isolated D1 under `--persist-to` → `wrangler pages dev --port 8788`), open `/event/future-fest-e2e` at 390 px, and look at it. A class-presence test passes on visually broken CSS; this is the step that catches a board row whose columns collapse.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(event): lineup-first fold, guarded at 390px"
```

---

## Out of scope for this plan

Phase 2 — `events.accent_color` / `events.texture`, the admin picker, and the server-side contrast validation — is a separate plan. Nothing here depends on it, and the page renders on the current default accent until it lands.

Also unchanged: `/s/:slug`, `/embed/:slug`, recap and directory pages. They inherit tokens but keep their layout.
