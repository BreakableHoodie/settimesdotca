# ✅ READY FOR CURSOR - Next Tasks

**Date:** 2025-10-26 (Updated)
**Previous Task:** Sprint 3 Subscription Tests ✅ COMPLETE
**Current Task:** Sprint 3 Remaining Tests OR Priority 1 (Image Upload)
**Status:** Ready to execute

---

## 🎯 Quick Decision Guide

### Option A: Complete Sprint 3 Testing (2-3 hours)

**Goal:** Finish validating all Sprint 3 features
**Files:** Public Events API + iCal Feed tests
**Effort:** 14 test cases, 2-3 hours

### Option B: Start Image Upload System (1-2 days)

**Goal:** Implement drag-and-drop image upload with R2
**Priority:** High user value, critical feature
**Effort:** R2 setup + endpoints + UI components

---

## 📋 Option A: Complete Sprint 3 Tests

### Quick Start (30 seconds)

**1. Open Cursor**

```bash
cursor /Users/andrelevesque/Projects/settimes/settimes
```

**2. Copy This Prompt**

```
Read docs/CURSOR_TASK_SPRINT3_REMAINING_TESTS.md and implement all test cases following the specification.

Context:
- Subscription system tests complete (21/21 passing, 90%+ coverage)
- Need tests for 2 remaining Sprint 3 endpoints: public API and iCal feeds
- 14 total test cases (8 for public.js, 6 for ical.js)
- Reuse MockD1Database from subscription tests

Requirements:
1. Create functions/api/events/__tests__/ directory
2. Create functions/api/feeds/__tests__/ directory
3. Implement test helpers for events/venues/bands
4. Create public.test.js with 8 test cases
5. Create ical.test.js with 6 test cases
6. Ensure all tests pass with ≥80% coverage

Success criteria:
- All 14 tests pass
- npm run test:coverage shows ≥80% for both files
- No console errors during test execution
- Tests run in under 5 seconds

Start with Phase 1 (Setup) from the specification document.
```

**3. Paste into Cursor and Press Enter**

---

## 📋 Option B: Image Upload System

### Research Phase (SuperClaude - 30 minutes)

**Commands to run FIRST:**

```bash
# Research R2 integration
/sc:research "Cloudflare R2 direct upload from browser"
/sc:research "drag and drop file upload React best practices"

# Design implementation
/sc:think-hard "Design image upload system:
1. R2 bucket configuration in wrangler.toml
2. Upload endpoint with multipart form handling
3. Auto-resize images (max 1200px, WebP format)
4. Drag-and-drop React component
5. Integrate into EventsTab and BandsTab"
```

### Implementation Phase (Cursor - 4-6 hours)

**After SuperClaude research, create spec document:**

```
docs/CURSOR_TASK_IMAGE_UPLOAD.md
```

**Then hand off to Cursor with complete specification**

---

## ✅ What's Already Done

### Sprint 3 Testing Status

- ✅ Subscription system tests (21/21 passing, 90%+ coverage)
- ✅ Production bug fixed (verification_token in SELECT query)
- ⏳ Public API tests (pending)
- ⏳ iCal feed tests (pending)

### Configuration Files

- ✅ `.cursorrules` - Comprehensive coding standards
- ✅ `vitest.config.js` - Test configuration
- ✅ `package.json` - Test scripts setup
- ✅ MockD1Database - Reusable test infrastructure

---

## 🔍 Validation Commands

### After Option A Completes

```bash
# Run all tests
npm test

# Check coverage
npm run test:coverage

# Should see:
# ✓ functions/api/subscriptions/__tests__/ (21 tests)
# ✓ functions/api/events/__tests__/public.test.js (8 tests)
# ✓ functions/api/feeds/__tests__/ical.test.js (6 tests)
# Total: 35 tests passing
```

### After Option B Completes

```bash
# Test upload endpoint
curl -X POST http://localhost:8788/api/admin/upload \
  -F "image=@test.jpg"

# Start dev server
npx wrangler pages dev frontend/dist --d1 DB --r2 ASSETS

# Test in browser - drag and drop image in EventsTab
```

---

## 📊 Updated Project Status

### Sprint 3 Features

- ✅ Email Subscriptions (21 tests, 90%+ coverage, bug fixed)
- ⏳ Public Event API (implementation complete, tests pending)
- ⏳ iCal Feeds (implementation complete, tests pending)

### Priority 1: Image Upload

- ❌ Not started (waiting for Option B decision)

### Sprint 3 Completion Status

- **With Option A:** 100% tested and validated ✅
- **Without Option A:** Subscriptions validated (66%), public API/iCal untested

---

## 💡 Recommendation

### If Priority is Quality & Completeness

→ **Choose Option A** (Complete Sprint 3 tests)

- Time: 2-3 hours
- Ensures all Sprint 3 features are validated
- Establishes comprehensive test coverage baseline
- Lower risk before starting new feature

### If Priority is User Value & Features

→ **Choose Option B** (Start Image Upload)

- Time: 1-2 days (with research)
- High user value (visual engagement)
- Non-technical user friendly
- Can test Sprint 3 endpoints manually later

---

## 🎯 Next Action Decision

**A)** Complete Sprint 3 tests (2-3 hours)
→ Paste Option A prompt into Cursor

**B)** Start Image Upload system (1-2 days)
→ Run SuperClaude research commands first
→ Then create spec and hand off to Cursor

**C)** Something else?
→ Specify what you'd like to prioritize

---

## 📚 Key Documents

**For Option A:**

- `docs/CURSOR_TASK_SPRINT3_REMAINING_TESTS.md` - Main task spec
- `functions/api/subscriptions/__tests__/` - Pattern reference
- `functions/api/events/public.js` - Implementation to test
- `functions/api/feeds/ical.js` - Implementation to test

**For Option B:**

- `docs/PROJECT_STATUS_AND_ROADMAP.md` - Priority 1 details
- Need to create: `docs/CURSOR_TASK_IMAGE_UPLOAD.md`

---

## 🚀 You're Ready!

**Option A (Sprint 3 Tests):**

1. Copy prompt from section above
2. Paste into Cursor chat
3. Press Enter
4. Wait 2-3 hours

**Option B (Image Upload):**

1. Run SuperClaude research commands
2. Review research findings
3. Create implementation spec
4. Hand off to Cursor
5. Wait 4-6 hours

---

**Good luck!** 🚀

---

**END OF READY FOR CURSOR - NEXT TASKS**

_For previous task status, see `docs/STATUS_SUBSCRIPTION_TESTS_2025_10_26.md`_
