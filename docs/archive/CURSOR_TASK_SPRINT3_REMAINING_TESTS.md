# CURSOR TASK: Sprint 3 Remaining Tests (Public API & iCal Feeds)

**Created:** 2025-10-26
**Priority:** MEDIUM (Complete Sprint 3 validation)
**Estimated Time:** 2-3 hours
**Complexity:** Low-Medium
**AI Coder:** Cursor, Windsurf, or similar

---

## 🎯 Mission

Complete Sprint 3 test coverage by implementing tests for the two remaining API endpoints:

1. Public Event API (`/api/events/public`)
2. iCal Feed Generation (`/api/feeds/ical`)

**Context:** Subscription system tests are complete (21/21 passing). These two endpoints are the last untested Sprint 3 features.

---

## 📋 Prerequisites Check

Before starting, verify these files exist:

- ✅ `functions/api/events/public.js` (implementation)
- ✅ `functions/api/feeds/ical.js` (implementation)
- ✅ `functions/api/subscriptions/__tests__/mocks/d1.js` (reusable mock)
- ✅ `vitest.config.js` (test configuration)

If missing, **STOP** and notify user.

---

## 🚀 Quick Start

### Step 1: Create Test Directory Structure

```bash
mkdir -p functions/api/events/__tests__
mkdir -p functions/api/feeds/__tests__
```

### Step 2: Implement Tests

Follow detailed specifications below or refer to existing pattern in `functions/api/subscriptions/__tests__/`.

---

## 📝 Test Suite Overview

### File Structure to Create

```
functions/api/events/
└── __tests__/
    └── public.test.js          # 8 test cases

functions/api/feeds/
└── __tests__/
    └── ical.test.js            # 6 test cases
```

**Total:** 14 new test cases

---

## Test Case Summary

### public.test.js (8 tests)

1. ✅ **Happy Path** - Returns all events with venue/band details
2. ✅ **Filtering** - Filter by city parameter
3. ✅ **Filtering** - Filter by genre parameter
4. ✅ **Filtering** - Combine city + genre filters
5. ✅ **Empty Results** - No events match filters
6. ❌ **Invalid City** - Non-existent city returns empty array
7. ✅ **Data Structure** - Verify response includes all required fields
8. ✅ **Sorting** - Events sorted chronologically by start_time

### ical.test.js (6 tests)

1. ✅ **Happy Path** - Generates valid iCal format with events
2. ✅ **Content-Type** - Returns `text/calendar` header
3. ✅ **iCal Headers** - Includes VERSION, PRODID, CALSCALE
4. ✅ **Event Formatting** - Each event has VEVENT block with DTSTART, DTEND, SUMMARY
5. ✅ **Empty Calendar** - No events generates valid empty calendar
6. ✅ **Special Characters** - Escapes commas, semicolons, newlines in event data

---

## 🛠️ Implementation Guide

### Reuse Existing Infrastructure

**From subscription tests:**

- ✅ MockD1Database (in `functions/api/subscriptions/__tests__/mocks/d1.js`)
- ✅ Test helpers pattern (create similar for events/feeds)
- ✅ Vitest configuration

**New Helpers Needed:**

```javascript
// functions/api/events/__tests__/helpers.js
export function createMockEvent(overrides = {}) {
  return {
    id: 1,
    slug: "long-weekend-2024",
    name: "Long Weekend Band Crawl 2024",
    start_date: "2024-05-24",
    end_date: "2024-05-26",
    city: "portland",
    ...overrides,
  };
}

export function createMockVenue(overrides = {}) {
  return {
    id: 1,
    event_id: 1,
    name: "The Analog Cafe",
    address: "720 SE Hawthorne Blvd",
    city: "portland",
    ...overrides,
  };
}

export function createMockBand(overrides = {}) {
  return {
    id: 1,
    event_id: 1,
    venue_id: 1,
    name: "The Replacements",
    genre: "punk",
    start_time: "2024-05-24T20:00:00",
    end_time: "2024-05-24T21:00:00",
    ...overrides,
  };
}
```

---

## 📊 Implementation Details

### Test Case 1: Public API - Happy Path

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { onRequestGet } from "../public.js";
import { MockD1Database } from "../../subscriptions/__tests__/mocks/d1.js";
import { createMockEvent, createMockVenue, createMockBand } from "./helpers.js";

describe("Public Events API", () => {
  let mockDB;
  let mockEnv;

  beforeEach(() => {
    mockDB = new MockD1Database();
    mockEnv = { DB: mockDB };

    // Seed test data
    mockDB.data.events = [createMockEvent()];
    mockDB.data.venues = [createMockVenue()];
    mockDB.data.bands = [createMockBand()];
  });

  it("should return all events with venue and band details", async () => {
    const request = new Request("http://localhost/api/events/public");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toBeInstanceOf(Array);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: 1,
      name: "Long Weekend Band Crawl 2024",
      city: "portland",
    });
    expect(data[0].venues).toBeInstanceOf(Array);
    expect(data[0].venues[0].bands).toBeInstanceOf(Array);
  });
});
```

### Test Case 2: iCal Feed - Happy Path

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { onRequestGet } from "../ical.js";
import { MockD1Database } from "../../subscriptions/__tests__/mocks/d1.js";

describe("iCal Feed Generator", () => {
  let mockDB;
  let mockEnv;

  beforeEach(() => {
    mockDB = new MockD1Database();
    mockEnv = { DB: mockDB, PUBLIC_URL: "https://bandcrawl.example.com" };

    // Seed test data
    mockDB.data.events = [
      /* ... */
    ];
    mockDB.data.venues = [
      /* ... */
    ];
    mockDB.data.bands = [
      /* ... */
    ];
  });

  it("should generate valid iCal format with events", async () => {
    const request = new Request("http://localhost/api/feeds/ical");
    const context = { request, env: mockEnv };

    const response = await onRequestGet(context);
    const icalData = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar");
    expect(icalData).toContain("BEGIN:VCALENDAR");
    expect(icalData).toContain("VERSION:2.0");
    expect(icalData).toContain("BEGIN:VEVENT");
    expect(icalData).toContain("END:VEVENT");
    expect(icalData).toContain("END:VCALENDAR");
  });
});
```

---

## 📈 Success Criteria

### Must Pass

- [ ] All 14 test cases pass (8 + 6)
- [ ] Code coverage ≥ 80% for both files
- [ ] No console errors during test execution
- [ ] Tests run in under 5 seconds total

### Nice to Have

- [ ] Test execution in CI/CD pipeline
- [ ] Coverage reports committed
- [ ] Integration with existing test suite

---

## 🔧 Commands

### Development

```bash
# Run all tests
npm test

# Run specific test file
npm test -- functions/api/events/__tests__/public.test.js
npm test -- functions/api/feeds/__tests__/ical.test.js

# Watch mode
npm run test:watch
```

### Coverage

```bash
# Generate coverage report
npm run test:coverage

# Focus on new files
npm run test:coverage -- functions/api/events/ functions/api/feeds/
```

---

## 🐛 Troubleshooting

### Problem: MockD1Database not found

**Solution:** Import from subscription tests:

```javascript
import { MockD1Database } from "../../subscriptions/__tests__/mocks/d1.js";
```

### Problem: iCal format validation fails

**Solution:**

- Verify `BEGIN:VCALENDAR` and `END:VCALENDAR` are present
- Check line endings (CRLF for iCal spec)
- Validate DTSTART/DTEND format: `YYYYMMDDTHHMMSS`

### Problem: Public API returns empty results

**Solution:** Ensure MockD1Database is seeded with test data in `beforeEach`

---

## 📚 Reference Documents

- **Subscription Tests Pattern:** `functions/api/subscriptions/__tests__/subscribe.test.js`
- **MockD1Database:** `functions/api/subscriptions/__tests__/mocks/d1.js`
- **Implementation:** `functions/api/events/public.js`, `functions/api/feeds/ical.js`
- **iCal Spec:** RFC 5545 (https://datatracker.ietf.org/doc/html/rfc5545)

---

## ✅ Acceptance Checklist

**Before Marking Complete:**

- [ ] All 14 tests implemented and passing
- [ ] Coverage reports show ≥80% coverage
- [ ] Mock database properly resets between tests
- [ ] No real database calls during tests
- [ ] No console errors or warnings
- [ ] Tests run in under 5 seconds
- [ ] Code follows existing project patterns
- [ ] Commits have descriptive messages

**After Implementation:**

- [ ] Run `npm test` and verify all pass
- [ ] Run `npm run test:coverage` and verify coverage
- [ ] Update `docs/PROJECT_STATUS_AND_ROADMAP.md`
- [ ] Update `docs/STATUS_SUBSCRIPTION_TESTS_2025_10_26.md`

---

## 🎯 Deliverables

### Commit 1: Public API Tests

```bash
git add functions/api/events/__tests__/
git commit -m "test: add tests for public events API endpoint (8 cases)"
```

### Commit 2: iCal Feed Tests

```bash
git add functions/api/feeds/__tests__/
git commit -m "test: add tests for iCal feed generation (6 cases)"
```

---

## 🚦 Status Tracking

### Phase 1: Setup (20 min)

- [ ] Create directory structure
- [ ] Create test helpers for events/venues/bands
- [ ] Import MockD1Database

### Phase 2: Public API Tests (60 min)

- [ ] Test 1-4: Happy path and filtering
- [ ] Test 5-8: Edge cases and data validation

### Phase 3: iCal Feed Tests (45 min)

- [ ] Test 1-3: Format validation
- [ ] Test 4-6: Event formatting and edge cases

### Phase 4: Validation (15 min)

- [ ] Run all tests
- [ ] Generate coverage report
- [ ] Fix any failures
- [ ] Commit changes

**Total Time:** 2.5 hours (within 2-3 hour estimate)

---

**READY TO START?**

1. Read this entire document
2. Create directory structure
3. Implement test helpers
4. Implement tests following the specification
5. Run tests and verify coverage
6. Commit and push to `dev` branch

**Questions?** Check existing subscription tests for patterns.

---

**END OF CURSOR TASK**

_This task completes Sprint 3 test coverage before implementing Priority 1 (Image Upload System)._
