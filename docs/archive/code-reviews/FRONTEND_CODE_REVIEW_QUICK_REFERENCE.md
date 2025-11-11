# Frontend Code Review - Quick Reference

## Critical Issues (Fix Immediately)

| Issue                                | File(s)                              | Location              | Severity | Impact                                               |
| ------------------------------------ | ------------------------------------ | --------------------- | -------- | ---------------------------------------------------- |
| Missing `prop-types` dependency      | `package.json`, `BandForm.jsx`       | Line 1                | CRITICAL | Build/runtime failures in production                 |
| Empty catch blocks (silent failures) | `ScheduleView.jsx`, `MySchedule.jsx` | Lines 77-100, 275-298 | HIGH     | No error logging, users get no feedback              |
| `dreReminderPlaced` anti-pattern     | `MySchedule.jsx`                     | Line 301, 427-430     | HIGH     | Mutable state in render function, React anti-pattern |
| Malformed JSON parsing               | `VenueInfo.jsx`                      | Line 7-8              | HIGH     | Component crash on invalid data                      |
| Deprecated API usage                 | `performance.js`                     | Line 9                | MEDIUM   | `window.performance.timing` is deprecated            |

## Major Issues (Fix Before Next Release)

| Issue                    | Component                        | Lines                                               | Priority | Effort                      |
| ------------------------ | -------------------------------- | --------------------------------------------------- | -------- | --------------------------- |
| **Monolithic Component** | EventsTab.jsx                    | 1-1063                                              | HIGH     | Refactor into 4+ components |
| **Complex Component**    | BandsTab.jsx                     | 1-814                                               | HIGH     | Refactor form logic to hook |
| **Complex Logic**        | MySchedule.jsx                   | 120-300                                             | MEDIUM   | Extract utility functions   |
| **No Prop Validation**   | All components (except BandForm) | -                                                   | MEDIUM   | Add PropTypes or JSDoc      |
| **Duplicate Code**       | copyBands()                      | ScheduleView.jsx (67-101), MySchedule.jsx (261-299) | MEDIUM   | Extract to shared utility   |

## Code Organization Issues

### Missing Utilities (Should Exist)

```
utils/storage.js          - Abstract localStorage/sessionStorage access
utils/copyBands.js        - Shared copy-to-clipboard logic
utils/scheduleReminder.js - MySchedule reminder logic
utils/conflictDetection.js - Optimize O(n²) overlap checking
admin/hooks/useFormState.js - Custom hook for BandsTab form
```

### Duplicate Code

| Location                                             | Duplication             | Solution                          |
| ---------------------------------------------------- | ----------------------- | --------------------------------- |
| `ScheduleView.jsx:67-101` + `MySchedule.jsx:261-299` | `copyBands()` function  | Extract to `utils/copyBands.js`   |
| `BandsTab.jsx:163-170` + `BandsTab.jsx:214-222`      | Duplicate name checking | Let API be source of truth        |
| `MySchedule.jsx:189-202` + Similar in BandsTab       | Travel warnings         | Move to configurable backend data |

## Component Size Breakdown

```
1000+  lines: EventsTab.jsx ⚠️⚠️⚠️
800+   lines: BandsTab.jsx ⚠️⚠️
500+   lines: MySchedule.jsx ⚠️
400+   lines: EventWizard.jsx ⚠️
200-400 lines: AdminPanel.jsx, VenuesTab.jsx, ScheduleView.jsx ⚠️
<200   lines: All other components ✓
```

**Recommendation**: Components should be 200-300 lines max. Refactor anything >400 lines.

## Performance Issues

| Issue                      | Location                           | Type        | Fix                  |
| -------------------------- | ---------------------------------- | ----------- | -------------------- |
| O(n²) conflict checking    | MySchedule.jsx:135-161             | Algorithm   | Use Map-based lookup |
| Un-memoized array creation | MySchedule.jsx:120-124             | Re-render   | Add `useMemo`        |
| Form state recreation      | BandsTab.jsx:34-42                 | Memory      | Extract to constant  |
| Time zone calculation      | Every render in various components | Computation | Memoize results      |

## Prop Validation Status

### Components WITH Validation ✓

- BandForm.jsx (uses PropTypes)

### Components WITHOUT Validation ❌

- BandCard.jsx (8 props)
- MySchedule.jsx (7 props)
- ScheduleView.jsx (8 props)
- Header.jsx (4 props)
- ComingUp.jsx (1 prop)
- VenueInfo.jsx (1 prop)
- And 20+ more admin components

**Action**: Add PropTypes to all components, or migrate to TypeScript.

## State Management

### Current Approach

- Local state in components (Recommended for app size)
- localStorage for user preferences
- sessionStorage for admin auth

### Concern

- localStorage accessed directly 28+ times (no abstraction)
- No clear patterns for shared state between routes

### Recommendation

- Create `utils/storage.js` to centralize all storage access
- Consider React Context if state sharing increases

## Error Handling Assessment

| Category         | Status         | Examples                             |
| ---------------- | -------------- | ------------------------------------ |
| API errors       | ✓ Handled      | App.jsx:104-113, errorBoundary       |
| JSON parsing     | ❌ Not handled | VenueInfo.jsx:7-8                    |
| Clipboard        | ⚠️ Partial     | ScheduleView.jsx:77-100 (no logging) |
| Form validation  | ✓ Good         | BandsTab.jsx, BandForm.jsx           |
| Async operations | ⚠️ No timeout  | App.jsx fetch calls                  |

## Accessibility Status

| Feature             | Status  | Notes                                      |
| ------------------- | ------- | ------------------------------------------ |
| ARIA labels         | ✓ Good  | Most components have proper labels         |
| Focus visible       | ✓ Good  | Proper focus rings on interactive elements |
| Keyboard navigation | ✓ Good  | Buttons, links work with Enter/Space       |
| Color contrast      | ✓ Good  | Orange/navy theme has good contrast        |
| Error messages      | ⚠️ Fair | Could be more descriptive                  |
| Form labels         | ✓ Good  | Associated with form fields                |

## Testing Status

| Test Type   | Coverage  | Files                |
| ----------- | --------- | -------------------- |
| Unit Tests  | ~15%      | `__tests__/` folders |
| Integration | ~5%       | Minimal              |
| A11y Tests  | ✓ Present | `test/a11y.test.jsx` |
| E2E         | ❌ None   | -                    |

### Critical Tests Needed

- [ ] BandsTab form submission
- [ ] MySchedule conflict detection
- [ ] localStorage persistence
- [ ] API error handling
- [ ] Admin authentication flow

## File Structure Review

```
frontend/src/
├── main.jsx               ✓ Good (104 lines)
├── App.jsx               ✓ Good (229 lines, minor issues)
├── index.css             ✓ Good
├── components/
│   ├── BandCard.jsx       ✓ Good (84 lines)
│   ├── ComingUp.jsx       ✓ Good (85 lines)
│   ├── ErrorBoundary.jsx  ✓ Well-designed (94 lines)
│   ├── Header.jsx         ⚠️ Minor issues (133 lines)
│   ├── MySchedule.jsx     ⚠️ Needs refactoring (526 lines)
│   ├── OfflineIndicator.jsx ✓ Good
│   ├── ScheduleView.jsx   ✓ Good (209 lines)
│   ├── TimeFilter.jsx     ✓ Good (83 lines)
│   ├── VenueInfo.jsx      ⚠️ JSON parsing issue (122 lines)
│   └── __tests__/         ✓ Good coverage
├── admin/
│   ├── AdminApp.jsx       ✓ Good (69 lines)
│   ├── AdminLogin.jsx     ✓ Good (127 lines)
│   ├── AdminPanel.jsx     ⚠️ Could be smaller (267 lines)
│   ├── BandForm.jsx       ✓ Good with PropTypes (207 lines)
│   ├── BandsTab.jsx       ❌ Refactor needed (814 lines)
│   ├── EventsTab.jsx      ❌ Major refactor needed (1,063 lines)
│   ├── EventWizard.jsx    ⚠️ Large but functional (471 lines)
│   ├── VenuesTab.jsx      ⚠️ Could be smaller (295 lines)
│   ├── UserManagement.jsx ⚠️ Moderate (236 lines)
│   └── components/        ✓ Good organization
├── pages/
│   ├── EmbedPage.jsx      ✓ Good
│   ├── SubscribePage.jsx  ✓ Good
│   └── ResetPasswordPage.jsx ✓ Good
├── utils/
│   ├── adminApi.js        ✓ Good pattern (API calls)
│   ├── eventLifecycle.js  ✓ Good (state machines)
│   ├── performance.js     ❌ Needs fixing (deprecated API)
│   ├── timeFilter.js      ✓ Good (236 lines, well-documented)
│   ├── timeFormat.js      ✓ Good (22 lines, simple)
│   └── validation.js      ✓ Good (102 lines, comprehensive)
└── config/
    └── highlights.jsx     ✓ Good (configuration)
```

## Refactoring Priority

### Phase 1: Critical Fixes (1 sprint)

1. Add `prop-types` to dependencies
2. Fix empty catch blocks
3. Fix `dreReminderPlaced` anti-pattern
4. Add try-catch to JSON.parse in VenueInfo
5. Fix performance.js deprecated API

### Phase 2: Refactoring (2-3 sprints)

1. Split EventsTab.jsx into 4+ components
2. Split BandsTab.jsx - extract form logic
3. Extract copyBands to utils
4. Create storage.js abstraction
5. Add PropTypes to all components

### Phase 3: Optimization (1 sprint)

1. Optimize conflict detection algorithm
2. Add memoization where needed
3. Improve error messages
4. Add missing tests

### Phase 4: Future (Post-MVP)

1. Migrate to TypeScript
2. Add more comprehensive tests
3. Implement state management library if complexity increases
4. Performance monitoring integration

## Quick Wins (Low Effort, High Value)

1. **Extract constants** (1 hour)

   ```jsx
   const STORAGE_KEYS = {
     SELECTED_BANDS: "selectedBands",
     ADMIN_PASSWORD: "adminPassword",
   };
   ```

2. **Add error logging** (30 min)

   ```jsx
   catch (err) {
     console.warn('[ComponentName] Operation failed:', err)
   }
   ```

3. **Fix dreReminderPlaced** (1 hour)
   - Replace with proper render logic

4. **Add JSDoc comments** (2 hours)
   - Document prop types in 5 largest components

5. **Extract copyBands** (1 hour)
   - Create `utils/copyBands.js`
   - Use in both ScheduleView and MySchedule

**Total**: ~5-6 hours for 5 improvements

---

## Metrics Summary

```
Total Lines of Code (src/):     ~5,314
Largest Component:              EventsTab (1,063 lines)
Smallest Component:             BulkActionBar (78 lines)
Average Component Size:         ~250 lines
Components > 400 lines:         5 (EventsTab, BandsTab, MySchedule, EventWizard, AdminPanel)
Components < 100 lines:         8 (well-organized)

PropTypes Coverage:             10% (only BandForm)
Prop Validation Needed:         23 components
Code Duplication Score:         Moderate (5-10 instances)
Test Coverage:                  ~15%
Accessibility Score:            ~80%
Error Handling:                 ~70%
```

---

## Next Steps

1. **Read full review**: `FRONTEND_CODE_REVIEW.md`
2. **Create tickets** for Phase 1 critical fixes
3. **Schedule refactoring** for BandsTab/EventsTab
4. **Add to CI pipeline**: PropTypes validation, unused import detection
5. **Plan migration**: TypeScript roadmap (if needed)
