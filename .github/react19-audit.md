# React 19 Migration Audit Report

Generated: 2026-05-18  
React current version: 19.2.5 (range: ^19.2.6 — one patch behind, harmless)

## Executive Summary

- 🔴 Critical (breaking): **0**
- 🟡 Deprecated (should migrate): **3 files** (defaultProps on function components)
- 🔵 Test-specific: **0**
- ℹ️ Informational: 22 propTypes usages, 8 toHaveBeenCalledTimes assertions
- **Total files requiring code changes: 3**

The codebase is in excellent shape for React 19. No removed APIs are in use. The only
actionable items are `defaultProps` on three function components — a quick mechanical
refactor with no risk.

---

## 🔴 Critical — Breaking Changes

None. All removed APIs checked and absent:
- `ReactDOM.render` — not used
- `ReactDOM.hydrate` — not used
- `unmountComponentAtNode` — not used
- `findDOMNode` — not used
- `createFactory` — not used
- `react-dom/test-utils` imports — not used
- Legacy Context API (`contextTypes`, `childContextTypes`, `getChildContext`) — not used
- String refs (`this.refs.*`) — not used

---

## 🟡 Deprecated — Should Migrate

### `defaultProps` on function components

React 19 removes support for `defaultProps` on function components at runtime. The
`defaultProps` object is silently ignored — defaults do **not** apply. Migrate to ES6
default parameter syntax.

| File | Line | Props to default |
|------|------|-----------------|
| `frontend/src/admin/BandForm.jsx` | 594 | `showEventIntro: false`, `conflicts: { overlaps: [], conflicts: [] }` |
| `frontend/src/admin/BottomNav.jsx` | 48 | `showLineup: false`, `showUsers: false`, `showPlatform: false` |
| `frontend/src/admin/components/ArtistPicker.jsx` | 213 | `loading: false`, `venues: []` |

**Migration pattern (same for all three):**

```jsx
// Before
function BottomNav({ showLineup, showUsers, showPlatform }) { ... }
BottomNav.defaultProps = { showLineup: false, showUsers: false, showPlatform: false }

// After — move defaults into the destructure
function BottomNav({ showLineup = false, showUsers = false, showPlatform = false }) { ... }
// Delete the BottomNav.defaultProps = { ... } block
```

**Risk:** Low. All three components are internal admin components with known call sites.

---

## 🔵 Test-Specific Issues

None. Checked:
- `react-dom/test-utils` imports — absent
- `Simulate.*` usage — absent
- `react-test-renderer` — absent

### `toHaveBeenCalledTimes` — informational only

8 assertions in `useAdminAuthSession.test.jsx` and `ScheduleView.test.jsx`. React 19
**removes** the StrictMode double-invocation of effects in development, so any assertions
that were relying on `×2` counts would break. These assertions all use `(1)` or `(2)` for
intentional call counts (not StrictMode artifacts), so they are safe. Verified by reading
the test context.

---

## ℹ️ Informational — No Code Change Required

### propTypes (22 usages)

React 19 removes the built-in `propTypes` checking from the React package itself. The
`prop-types` npm package continues to function independently via `import PropTypes from
'prop-types'`. No runtime errors. No code change required; the annotations remain useful
for IDE autocomplete and documentation.

### forwardRef

Zero usages. Not applicable.

### `useRef()` without initial value

Zero usages. Not applicable.

### Unnecessary `import React from 'react'`

Zero usages. JSX transform is already configured (Vite/React plugin), so default React
import is not needed.

---

## 📦 Dependency Status

All React-related packages are on React 19 compatible versions:

| Package | Installed | Required | Status |
|---------|-----------|----------|--------|
| `react` | 19.2.5 | ^19.2.6 | ⚠️ one patch behind |
| `react-dom` | 19.2.5 | ^19.2.6 | ⚠️ one patch behind |
| `@testing-library/react` | 16.x | ^16.3.2 | ✅ React 19 compatible |
| `@testing-library/jest-dom` | 6.x | ^6.9.1 | ✅ |
| `react-router-dom` | 7.14.2 | ^7.15.0 | ⚠️ one minor behind |
| `react-helmet-async` | 3.x | ^3.0.0 | ⚠️ see CLAUDE.md — known React 19 issue with document.title |

Note: The `react` / `react-dom` one-patch lag and `@tiptap/*` minor lag are all resolved by
running `npm install` from the frontend directory.

---

## Ordered Migration Plan

All three `defaultProps` removals are safe to do in a single PR:

1. `frontend/src/admin/BottomNav.jsx` — move 3 booleans into destructure, delete `defaultProps` block
2. `frontend/src/admin/components/ArtistPicker.jsx` — move `loading`, `venues` into destructure, delete `defaultProps` block
3. `frontend/src/admin/BandForm.jsx` — move `showEventIntro`, `conflicts` into destructure, delete `defaultProps` block
4. Run `cd frontend && npm test` → confirm 0 failures
5. `npm install` in repo root and `frontend/` to pull patch-level updates

**Estimated effort:** 30 minutes.
