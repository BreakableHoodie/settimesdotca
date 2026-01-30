# Tech Debt & Janitorial Analysis

> **Generated:** November 11, 2025
> **Status:** Comprehensive codebase cleanup analysis
> **Overall Code Quality:** B+ (Solid foundation, needs refactoring)

## Executive Summary

Analysis of 480+ files across the Long Weekend Band Crawl codebase identified key areas for improvement: component size, code duplication, and missing utility abstractions. The codebase is well-structured with solid foundations. Main debt areas are component size (2 files >800 lines), code duplication (2-3 instances), and missing utility abstractions (4 needed). No urgent deletions required - focus should be on extraction and consolidation.

**Quick Stats:**

- 🔴 Critical Issues: 2
- 🟡 Code Duplication: 3 instances
- 🟢 Monolithic Components: 2
- 🔵 Missing Utilities: 4
- 🟣 Performance Issues: 3
- **Overall Grade: B+**

---

## 🔴 CRITICAL ISSUES

### 1. Empty Catch Blocks

**Priority: HIGH | Effort: 30 minutes**

- **Files:** `ScheduleView.jsx` (lines 77-100), `MySchedule.jsx` (lines 275-298)
- **Issue:** Silent error swallowing without logging
- **Impact:** Hidden bugs, difficult debugging, poor user experience
- **Recommendation:** Add `console.error()` logging or user-facing error toast

### 2. React Anti-Pattern

**Priority: HIGH | Effort: 30 minutes**

- **File:** `MySchedule.jsx` (line 301, 427-430)
- **Issue:** Mutable flag `dreReminderPlaced` modified during render
- **Risk:** React strict mode violations, unpredictable behavior
- **Recommendation:** Replace with proper ternary/filter logic using `findIndex()`

---

## 🟡 CODE DUPLICATION

### 1. Duplicate `copyBands()` Function

**Priority: HIGH | Effort: 1 hour**

- **Locations:** `ScheduleView.jsx` (lines 67-101), `MySchedule.jsx` (lines 261-299)
- **Lines:** ~35 lines duplicated
- **Impact:** DRY violation, maintenance burden
- **Recommendation:** Extract to `utils/clipboard.js`

### 2. Travel Warning Logic

**Priority: MEDIUM | Effort: 2 hours**

- **Issue:** Room 47 hardcoded as "across the street" in multiple places
- **Locations:** BandsTab, MySchedule
- **Recommendation:** Centralize venue metadata in configuration

### 3. Conflict Detection Logic

**Priority: MEDIUM | Effort: 3 hours**

- **Locations:** BandsTab, MySchedule
- **Issue:** Repeated O(n²) overlap checking
- **Recommendation:** Create `utils/conflictDetection.js` with memoization

---

## 🟢 COMPLEXITY & REFACTORING

### Monolithic Components

#### 1. EventsTab.jsx (1,063 lines)

**Priority: HIGH | Effort: 2-3 weeks**

Should split into:

- `EventListTable.jsx` - Event list rendering
- `EventForm.jsx` - Create/edit/duplicate logic
- `EventMetrics.jsx` - Dashboard and analytics
- `EventPublishing.jsx` - Publish/unpublish logic

#### 2. BandsTab.jsx (814 lines)

**Priority: HIGH | Effort: 1-2 weeks**

Should split into:

- `BandForm.jsx` ✓ (already extracted)
- `BandBulkOperations.jsx`
- `BandList.jsx`
- Custom hook for form state management

### Missing Utility Abstractions

Should create:

- **`utils/storage.js`** - Abstract localStorage (28+ direct accesses)
  Priority: HIGH | Effort: 1h | Impact: HIGH

- **`utils/clipboard.js`** - Shared copy functionality
  Priority: HIGH | Effort: 1h | Impact: MEDIUM

- **`utils/conflictDetection.js`** - Optimize band overlap checking
  Priority: MEDIUM | Effort: 3h | Impact: HIGH

- **`utils/scheduleReminder.js`** - Extract 50+ line reminder logic
  Priority: MEDIUM | Effort: 2h | Impact: MEDIUM

---

## 🔵 DEPENDENCY CLEANUP

### Current Status

✅ **Frontend:** All dependencies appear used and necessary
✅ **Backend:** Minimal dependencies (Express, Helmet, Compression)
✅ **Root:** Only dev dependencies (Vitest, coverage)

### Current Follow-ups

- **react-swipeable**: Confirmed required for `BandsTab` swipe gestures—keep installed
- **qrcode**: No references remain; safe to remove until real QR generation ships

---

## 🟣 PERFORMANCE ISSUES

### 1. O(n²) Conflict Detection

**Location:** `MySchedule.jsx` (lines 135-161)

- **Current:** O(n²) - 1,225 comparisons for 50 bands
- **Impact:** Noticeable lag with large schedules
- **Solution:** Use Map-based lookup - O(n) complexity

### 2. Un-memoized Computations

- **Issue:** Sorting/filtering bands not memoized in MySchedule
- **Solution:** Use `useMemo` for expensive computations

### 3. Inline Class Concatenation

- **Issue:** String concatenation for className in multiple files
- **Solution:** Use `classnames` library or extract to constants

---

## 📝 DOCUMENTATION DEBT

### Missing Prop Validation

- **Most components** lack PropTypes or JSDoc
- **Exception:** BandForm.jsx ✓ (has PropTypes)
- **Recommendation:** Add PropTypes or migrate to TypeScript

**Priority Components:**

1. BandCard.jsx
2. ScheduleView.jsx
3. MySchedule.jsx
4. EventsTab.jsx
5. BandsTab.jsx

---

## 🧪 TEST COVERAGE

### Current Status

- ✅ Accessibility tests (`a11y.test.jsx`)
- ✅ ErrorBoundary tests
- ⚠️ Missing unit tests for complex utils
- ⚠️ Missing tests for conflict detection
- ⚠️ Missing tests for schedule reminder logic

### Recommended Test Files

```
frontend/src/utils/__tests__/
├── clipboard.test.js
├── conflictDetection.test.js
├── scheduleReminder.test.js
└── storage.test.js
```

---

## 🚀 QUICK WINS (High Impact, Low Effort)

| Task                                 | Impact | Effort  | Priority |
| ------------------------------------ | ------ | ------- | -------- |
| Add error logging to catch blocks    | High   | 30 min  | 1        |
| Fix `dreReminderPlaced` anti-pattern | High   | 30 min  | 2        |
| Remove unused `qrcode` dependency    | Medium | 15 min  | 3        |
| Extract `copyBands()` to utility     | Medium | 1 hour  | 4        |
| Create `utils/storage.js`            | High   | 1 hour  | 5        |
| Add PropTypes to top 5 components    | Medium | 2 hours | 6        |

---

## 📊 METRICS SUMMARY

| Metric                     | Value | Status |
| -------------------------- | ----- | ------ |
| Total Files Analyzed       | 480+  | ✅     |
| Code Duplication Instances | 2-3   | ⚠️     |
| Monolithic Components      | 2     | ⚠️     |
| Missing Utility Files      | 4     | ⚠️     |
| Empty Catch Blocks         | 2     | ⚠️     |
| Direct localStorage Access | 28+   | ⚠️     |
| Overall Code Quality       | B+    | ✅     |

---

## 🎯 ACTION PLAN

### Phase 1: Critical Fixes (Week 1)

**Goal:** Eliminate critical issues and anti-patterns

- [ ] Add error logging to empty catch blocks (30 min)
- [ ] Fix `dreReminderPlaced` anti-pattern (30 min)
- [ ] Remove unused `qrcode` dependency from frontend (15 min)

**Estimated Time:** 1.25 hours | Risk: Low | Impact: High

---

### Phase 2: Code Consolidation (Week 2-3)

**Goal:** Reduce duplication and improve maintainability

- [ ] Extract `copyBands()` to `utils/clipboard.js` (1 hour)
- [ ] Create `utils/storage.js` abstraction (1 hour)
- [ ] Extract conflict detection to utility (3 hours)
- [ ] Centralize venue metadata (2 hours)
- [ ] Create `utils/scheduleReminder.js` (2 hours)

**Estimated Time:** 9 hours | Risk: Low | Impact: High

---

### Phase 3: Component Refactoring (Week 4-6)

**Goal:** Break down monolithic components

#### Week 4: EventsTab Refactoring (18 hours)

- [ ] Extract EventListTable component
- [ ] Extract EventForm component
- [ ] Extract EventMetrics component
- [ ] Extract EventPublishing component
- [ ] Update tests and documentation

#### Week 5: BandsTab Refactoring (13 hours)

- [ ] Extract BandBulkOperations component
- [ ] Extract BandList component
- [ ] Create custom form hook
- [ ] Update tests and documentation

#### Week 6: Integration & Testing (12 hours)

- [ ] Integration testing
- [ ] Performance testing
- [ ] Documentation updates
- [ ] Code review

**Total Phase 3:** 43 hours | Risk: Medium | Impact: Very High

---

### Phase 4: Quality Improvements (Ongoing)

**Goal:** Establish quality standards

- [ ] Add PropTypes to all components (8 hours)
- [ ] Add unit tests for new utilities (4 hours)
- [ ] Optimize performance with memoization (3 hours)
- [ ] Document complex logic (3 hours)
- [ ] Set up ESLint rules (1 hour)
- [ ] Plan TypeScript migration (2 hours)

**Estimated Time:** 21 hours | Risk: Low | Impact: Medium

---

## 📈 SUCCESS METRICS

### Code Quality

- Component Size: Average < 300 lines
- Function Complexity: Cyclomatic < 10
- Code Duplication: < 3%
- Test Coverage: > 80% utilities, > 70% components

### Performance

- Bundle Size: < 500KB initial
- Lighthouse Score: > 90
- Conflict Detection: < 10ms for 100 bands
- Render Time: < 16ms per frame

### Maintainability

- Add Feature Time: < 2 days average
- Bug Fix Time: < 4 hours average
- Code Review Time: < 1 hour average
- Onboarding Time: < 1 week

---

## 🎓 LESSONS LEARNED

### What Works Well ✅

1. Clean separation of admin and public components
2. Utility functions for time formatting and filtering
3. Error boundaries for production stability
4. Accessibility testing with axe-core
5. Code quality tools (ESLint, Prettier, Lighthouse)

### Areas for Improvement ⚠️

1. Component size - enforce 300-line limit
2. Prop validation - make PropTypes mandatory
3. Code reuse - identify duplication early
4. Performance - profile before optimization
5. Testing - write tests before refactoring

---

## 📚 REFERENCES

### Code Review Documents

- `docs/archive/code-reviews/FRONTEND_CODE_REVIEW.md`
- `docs/archive/code-reviews/CODE_REVIEW_SUMMARY.txt`

### Related Documentation

- `README.md` - Project overview
- `ROADMAP_TO_DEMO.md` - Feature roadmap
- `docs/DATABASE.md` - Database schema
- `docs/DEPLOYMENT.md` - Deployment guide

---

## 📝 CHANGELOG

### 2025-11-11

- Initial tech debt analysis completed
- Identified 2 critical issues, 3 duplication areas, 2 monolithic components
- Created 4-phase action plan with 74+ hours of estimated work
- Documented quick wins and success metrics

---

**Next Review:** 2025-12-11 (1 month)
**Owner:** Development Team
**Status:** Active - Phase 1 Ready to Start
