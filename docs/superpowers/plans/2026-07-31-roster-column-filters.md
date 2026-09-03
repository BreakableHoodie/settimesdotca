# Roster Column Filters (Excel-style) — Implementation Plan

**Goal:** Replace the single "Data gaps" popover from #712 with Excel-style per-column filter dropdowns on all seven filterable Roster columns.

**Architecture:** A column registry (`rosterColumns.js`) describes each column's label, filter type, and a `getValues(band) -> string[]` extractor. One generic `ColumnFilter` value-checklist serves six columns; `LinksColumnFilter` handles the seventh, reusing `bandFields.js`'s existing `{ mode, keys, noLinks }` filter shape and `matchesGapFilter` verbatim. All client-side; no API change.

**Tech Stack:** React 19, Vite 8, Tailwind 4, Vitest + @testing-library/react, PropTypes.

## Global Constraints

- No API, schema, or migration changes. Everything under `frontend/src/admin/`.
- **Admin is dark-pinned** (`AdminApp.jsx` wraps it in `data-theme="midnight-ember"`) — `text-white` / `bg-bg-navy` / `bg-bg-purple` are CORRECT. Do NOT migrate to semantic theme tokens.
- **Never interpolate a Tailwind class.** v4 scans source text; `` `text-${c}` `` generates no CSS.
- **`bandFields.js` stays and is not modified.** It remains the single source of truth for link presence (`resolveHref(v) !== '#'`, never `v !== ''`) — see the Critical Invariants entry in `CLAUDE.md`.
- **`RosterTab` renders the desktop table AND the mobile card list unconditionally** (CSS-only visibility). Text queries match TWICE — use `getAllBy*` / `queryAllBy*` for artist names.
- Test files import vitest helpers explicitly despite `globals: true`.
- Coverage thresholds (`frontend/vitest.config.js`): 57 / 50 / 60 / 58. Never lower.
- `make gate` from the repo root before every commit; capture the real exit code (never pipe into `tail`, which masks it).

## Filter semantics

- **Across columns: AND.** Within a column: OR over checked values.
- **Absence of an entry, or an empty `values` array, means "no filter on this column."** Unchecking every value clears the filter rather than emptying the table.
- **Counts in a dropdown are computed against every OTHER column's filter plus the search box, but NOT the column's own filter.** This is what Excel does, and it is why unchecking one value doesn't make the rest of the list vanish.
- `(Blanks)` is a real selectable entry, represented by the exported `BLANK` sentinel.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `admin/utils/rosterColumns.js` | Create | Column registry, extractors, `matchesColumnFilters`, `valueCountsFor`, `isInactive`. |
| `admin/utils/__tests__/rosterColumns.test.js` | Create | Unit tests. |
| `admin/components/ColumnFilter.jsx` | Create | Generic value-checklist dropdown. |
| `admin/components/LinksColumnFilter.jsx` | Create | Missing/Has + 8 platforms + no-links. |
| `admin/components/FilterFunnel.jsx` | Create | Shared trigger button (funnel icon, filled when active). |
| `admin/components/__tests__/*.test.jsx` | Create | Component tests for both panels. |
| `admin/RosterTab.jsx` | Modify | Header funnels, memo chain, mobile sheet, remove Data-gaps + status select. |
| `admin/components/DataGapFilter.jsx` | **Delete** | Superseded. |
| `admin/components/__tests__/DataGapFilter.test.jsx` | **Delete** | Superseded. |
| `admin/__tests__/RosterTab.test.jsx` | Modify | Port existing tests to the new UI; add column-filter tests. |

---

### Task 1: `rosterColumns.js` registry + predicates

**Files:** Create `frontend/src/admin/utils/rosterColumns.js` and `frontend/src/admin/utils/__tests__/rosterColumns.test.js`.

**Produces:** `BLANK`, `isInactive`, `FILTERABLE_COLUMNS`, `matchesColumnFilters`, `valueCountsFor`, `linkCountsFor`, `isColumnFiltered`, `activeFilterCount`.

Implementation:

```js
import { formatOrigin, matchesGapFilter, countGaps } from './bandFields'

export const BLANK = '(Blanks)'

// Moved out of RosterTab so the Status column's filter and its badge agree.
// `is_active` is INTEGER NOT NULL DEFAULT 1 in D1, so it is always 0 or 1, but
// the legacy boolean shape is checked defensively too (#619).
export function isInactive(band) {
  return band.is_active === 0 || band.is_active === false
}

const single = value => {
  const text = String(value ?? '').trim()
  return text === '' ? [BLANK] : [text]
}

// Genre is the one multi-valued cell: "punk, indie rock" is two tokens, and the
// roster already splits it that way for autocomplete. Every other column
// returns a one-element array, so the `string[]` signature absorbs the whole
// special case.
const tokens = value => {
  const parts = String(value ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  return parts.length === 0 ? [BLANK] : parts
}

export const FILTERABLE_COLUMNS = [
  { key: 'name', label: 'Name', type: 'values', getValues: band => single(band.name) },
  { key: 'origin', label: 'Origin', type: 'values', getValues: band => single(formatOrigin(band)) },
  { key: 'genre', label: 'Genre', type: 'values', getValues: band => tokens(band.genre) },
  { key: 'is_active', label: 'Status', type: 'values', getValues: band => [isInactive(band) ? 'Inactive' : 'Active'] },
  { key: 'link_count', label: 'Links', type: 'links' },
  { key: 'contact_email', label: 'Contact', type: 'values', getValues: band => single(band.contact_email) },
  { key: 'follower_count', label: 'Followers', type: 'values', getValues: band => [String(band.follower_count ?? 0)] },
]

const COLUMN_BY_KEY = new Map(FILTERABLE_COLUMNS.map(column => [column.key, column]))

// A `values` filter with an empty/absent array is NOT a filter — it shows
// everything. Unchecking the last value therefore clears the column rather
// than emptying the table.
function columnPasses(band, column, filter) {
  if (!filter) return true
  if (column.type === 'links') return matchesGapFilter(band, filter)
  const selected = Array.isArray(filter.values) ? filter.values : []
  if (selected.length === 0) return true
  return column.getValues(band).some(value => selected.includes(value))
}

export function matchesColumnFilters(band, columnFilters) {
  const filters = columnFilters || {}
  return FILTERABLE_COLUMNS.every(column => columnPasses(band, column, filters[column.key]))
}

// Counts exclude THIS column's own filter (Excel behaviour) so unchecking a
// value doesn't make the rest of its list disappear.
export function valueCountsFor(columnKey, bands, columnFilters) {
  const column = COLUMN_BY_KEY.get(columnKey)
  if (!column || column.type === 'links') return new Map()
  const others = { ...(columnFilters || {}) }
  delete others[columnKey]
  const counts = new Map()
  for (const band of Array.isArray(bands) ? bands : []) {
    if (!matchesColumnFilters(band, others)) continue
    for (const value of column.getValues(band)) {
      counts.set(value, (counts.get(value) || 0) + 1)
    }
  }
  return counts
}

// Same exclusion rule, for the Links column's missing-counts.
export function linkCountsFor(bands, columnFilters) {
  const others = { ...(columnFilters || {}) }
  delete others.link_count
  return countGaps((Array.isArray(bands) ? bands : []).filter(band => matchesColumnFilters(band, others)))
}

export function isColumnFiltered(columnFilters, columnKey) {
  const filter = (columnFilters || {})[columnKey]
  if (!filter) return false
  if (columnKey === 'link_count') {
    return (Array.isArray(filter.keys) && filter.keys.length > 0) || filter.noLinks === true
  }
  return Array.isArray(filter.values) && filter.values.length > 0
}

export function activeFilterCount(columnFilters) {
  return FILTERABLE_COLUMNS.filter(column => isColumnFiltered(columnFilters, column.key)).length
}
```

**Tests** (`rosterColumns.test.js`) — cover at minimum:

- `getValues` per column: present name; whitespace-only name → `[BLANK]`; null genre → `[BLANK]`; `"punk, indie rock"` → `['punk','indie rock']`; `"punk,,  indie"` → `['punk','indie']`.
- `origin` uses `formatOrigin` (city+region, legacy fallback, blank).
- `follower_count` of `0`, `1`, `undefined` → `['0']`, `['1']`, `['0']`.
- `is_active` of `0`, `1`, `false` → Inactive / Active / Inactive.
- `matchesColumnFilters`: no filters matches all; a one-value filter narrows; two columns AND; two values in one column OR; a multi-token genre matches if ANY token is checked; an empty `values` array is treated as no filter; `link_count` delegates to `matchesGapFilter` (verify with `{ mode: 'missing', keys: ['instagram'], noLinks: false }`).
- `valueCountsFor`: counts a multi-token genre once per token; **excludes its own column's filter but honours others** — this is the key assertion. Filter Status to Active and the Genre counts must reflect only active bands; filter Genre itself and the Genre list must NOT shrink.
- `isColumnFiltered` / `activeFilterCount` for both filter shapes, including `link_count`'s `noLinks`-only case.
- Guards: `matchesColumnFilters(band, undefined)`, `valueCountsFor('genre', undefined, {})`, `valueCountsFor('nope', [], {})`.

Commit: `feat(admin): add roster column registry and filter predicates`

---

### Task 2: `ColumnFilter`, `LinksColumnFilter`, `FilterFunnel`

**Files:** Create the three components in `frontend/src/admin/components/` plus tests for the two filter panels.

`FilterFunnel.jsx` — shared trigger: a `<button type="button">` with a lucide `ListFilter` icon, `aria-expanded`, `aria-controls`, `aria-label={`Filter by ${label}`}`, and a visually distinct accent state when `active`. Use complete literal Tailwind classes for both states — no interpolation.

`ColumnFilter.jsx` — generic value checklist. Props: `column` (`{ key, label }`), `counts` (`Map<string, number>`), `value` (`string[]` of checked values), `onChange(nextValues)`, `onClear()`.

Behaviour:

- Sorted value list: `(Blanks)` **always last**; everything else `localeCompare`, except the `follower_count` column which sorts numerically. Pick the comparator via `column.key === 'follower_count'`.
- A search box filters the visible rows. Always render it — it is simply not useful on a 2-value column, and Origin (50), Genre (64) and Name (219) all need it.
- `(Select all)` checkbox: checked when every visible value is checked, indeterminate when only some are. Toggling sets/clears all *currently visible* (search-filtered) values, matching Excel.
- Every value row: `<label>` + checkbox + value text + count, `aria-label={`${value} — ${count}`}`, `min-h-[44px]`.
- Footer: a `Clear filter` button calling `onClear`.
- **Unchecking the last value calls `onClear()`**, not `onChange([])`. They are equivalent in the predicate, but clearing keeps `isColumnFiltered` honest so the funnel un-fills.
- An empty-state row when the search matches nothing.

`LinksColumnFilter.jsx` — Missing/Has radio pair, then the 8 `LINK_FIELDS` rows with missing-counts, then `(No links at all)`, then `Clear filter`. Props: `value` (`{ mode, keys, noLinks }`), `counts` (from `linkCountsFor`), `onChange`, `onClear`. **Reuse `LINK_FIELDS` from `bandFields.js`; do not restate the platform list.** Keep the aria-label format `${label} — ${count} missing` in missing-mode; in has-mode use a phrasing that does not misreport the number. `DataGapFilter.jsx` already solved this — read it before Task 3 deletes it and carry the approach over.

Both panels: Escape closes and returns focus to the trigger; outside mousedown closes; listeners removed on close and on unmount.

**Tests** — `ColumnFilter`: renders values with counts; `(Blanks)` last; search narrows rows; `(Select all)` toggles only visible values; checking emits the right array; unchecking the last value calls `onClear`; numeric sort on `follower_count`; Escape closes and returns focus. `LinksColumnFilter`: mode switch preserves keys; platform toggle emits; no-links toggle emits; clear resets; counts render.

Commit: `feat(admin): add column filter dropdown components`

---

### Task 3: Wire the desktop table; remove the Data-gaps popover

**Files:** Modify `frontend/src/admin/RosterTab.jsx` and `frontend/src/admin/__tests__/RosterTab.test.jsx`. Delete `DataGapFilter.jsx` and its test.

1. Replace `gapFilter` state with `const [columnFilters, setColumnFilters] = useState({})`.
2. Memo chain:

```jsx
const searchFiltered = useMemo(/* search box only, over `bands` */)
const filteredBands = useMemo(
  () => searchFiltered.filter(band => matchesColumnFilters(band, columnFilters)),
  [searchFiltered, columnFilters],
)
```

Dropdown counts come from `valueCountsFor(key, searchFiltered, columnFilters)` and `linkCountsFor(searchFiltered, columnFilters)`, computed per *open* dropdown — pass `searchFiltered` and `columnFilters` down rather than precomputing all seven on every render.

3. Each of the seven `<th>`s keeps its existing sort `<button>` and `aria-sort`, and gains the `FilterFunnel` plus its panel. The `<th>` needs `relative` positioning to anchor the panel; the panel needs `z-30` to clear the sticky bulk bar at `z-10`.
4. **Delete the status `<select>`** and the `statusFilter` state — Status is now a column filter. The three existing tests that drive `getByLabelText('Filter by status')` must be ported to assert the same behaviour through the Status column filter, not deleted.
5. **Delete the `Data gaps` trigger, the `DataGapFilter` import, and both DataGapFilter files.** Grep before removing `bandFields` imports from RosterTab — `matchesGapFilter` and `countGaps` are still used, but by `rosterColumns.js`, not here.
6. Keep the chips row, now driven by `columnFilters`: one chip per filtered column reading `${label}: ${summary}` (e.g. `Genre: punk, indie rock`; `Links: Missing Instagram`), truncating to 2 values plus `+N`. Dismissing a chip clears that whole column. Keep the `N artists` count.
7. `isInactive` now comes from `rosterColumns.js` — delete the local copy.

**Tests:** port the three status tests to the Status column filter; port the gap-filter tests to the Links column filter; add — two columns AND; a chip clears one column; the Genre dropdown's counts reflect the Status filter but not Genre's own.

Commit: `feat(admin): replace the data-gaps popover with per-column filters`

---

### Task 4: Mobile filter sheet

**Files:** Modify `frontend/src/admin/RosterTab.jsx` and its test file.

The mobile card list has no table header, so add a single `Filters` button above the cards (inside the `md:hidden` block) opening a sheet that stacks all seven columns' filter panels as collapsible sections, reusing `ColumnFilter` / `LinksColumnFilter` unchanged. Badge the button with `activeFilterCount(columnFilters)`.

The sheet must be dismissible by an explicit Close button as well as Escape — a mobile user has no obvious outside-click target.

**Tests:** the button badges the active count; opening the sheet and checking a Status value narrows the mobile cards.

Commit: `feat(admin): add mobile filter sheet for roster columns`

---

### Task 5: Gates and PR

`make gate` (real exit code), `cd frontend && npx vitest run --coverage` (57/50/60/58 must hold), `make review`, rebase on `origin/main`, open the PR from the template with labels `enhancement` + `priority:p2`.

Note in the PR: removing the Data-gaps popover drops filtering by **missing photo** and **missing bio**, since neither is a roster column. Both are low priority (photos are deprioritised; bios are not AI-written), so this is accepted, not overlooked.
