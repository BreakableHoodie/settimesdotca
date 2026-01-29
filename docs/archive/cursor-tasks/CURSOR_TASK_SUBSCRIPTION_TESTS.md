# CURSOR TASK: Subscription System Tests

**Created:** 2025-10-26
**Priority:** HIGH (Sprint 3 validation)
**Estimated Time:** 4-6 hours
**Complexity:** Medium
**AI Coder:** Cursor, Windsurf, or similar

---

## 🎯 Mission

Generate comprehensive unit and integration tests for the email subscription system (Sprint 3). The system has three API endpoints that handle subscription lifecycle: subscribe, verify, and unsubscribe.

**Files to Test:**
1. `functions/api/subscriptions/subscribe.js` - Create new subscriptions
2. `functions/api/subscriptions/verify.js` - Verify email addresses
3. `functions/api/subscriptions/unsubscribe.js` - Remove subscriptions

---

## 📋 Prerequisites Check

Before starting, verify these exist:
- ✅ `functions/api/subscriptions/subscribe.js` (implementation)
- ✅ `functions/api/subscriptions/verify.js` (implementation)
- ✅ `functions/api/subscriptions/unsubscribe.js` (implementation)
- ✅ `functions/utils/tokens.js` (token generation)
- ✅ `migrations/legacy/migration-subscriptions.sql` (schema)

If missing, **STOP** and notify user.

---

## 🚀 Quick Start

### Step 1: Install Test Dependencies

```bash
cd /Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl
npm install --save-dev vitest msw miniflare @cloudflare/workers-types
```

### Step 2: Create Test Directory

```bash
mkdir -p functions/api/subscriptions/__tests__/mocks
```

### Step 3: Implement Tests

Follow detailed specifications in:
- `docs/TEST_SPEC_SUBSCRIPTIONS.md` (comprehensive guide)

Or use quick reference below.

---

## 📝 Test Suite Overview

### File Structure to Create

```
functions/api/subscriptions/
├── __tests__/
│   ├── subscribe.test.js      # 10 test cases
│   ├── verify.test.js          # 6 test cases
│   ├── unsubscribe.test.js     # 5 test cases
│   ├── mocks/
│   │   └── d1.js               # Mock D1 database
│   └── helpers.js              # Shared test utilities
```

---

## Test Case Summary

### subscribe.test.js (10 tests)

1. ✅ **Happy Path** - New subscription created successfully
2. ❌ **Validation** - Missing email rejected
3. ❌ **Validation** - Invalid email format rejected
4. ❌ **Validation** - Missing city/genre/frequency rejected
5. ❌ **Duplicate** - Already verified subscription rejected
6. ✅ **Re-verification** - Unverified duplicate resends email
7. ✅ **Tokens** - Unique verification/unsubscribe tokens generated
8. ❌ **Error** - Database failure handled gracefully
9. ✅ **Multiple** - Same email, different feeds allowed
10. ✅ **Frequency** - All three frequencies (daily/weekly/monthly) work

### verify.test.js (6 tests)

1. ✅ **Happy Path** - Valid token verifies subscription
2. ❌ **Missing Token** - Request without token rejected
3. ❌ **Invalid Token** - Non-existent token rejected
4. ✅ **Already Verified** - Duplicate verification handled gracefully
5. ✅ **Logging** - Verification logged to `subscription_verifications` table
6. ✅ **Redirect** - Success redirects to `/subscribe?verified=true`

### unsubscribe.test.js (5 tests)

1. ✅ **Happy Path** - Valid token removes subscription
2. ❌ **Missing Token** - Request without token rejected
3. ❌ **Invalid Token** - Non-existent token rejected
4. ✅ **Logging** - Unsubscribe logged to `subscription_unsubscribes` table
5. ✅ **HTML Response** - Success page rendered correctly

---

## 🛠️ Implementation Guide

### Mock Database (mocks/d1.js)

**Purpose:** Simulate Cloudflare D1 database without real database connection

**Key Methods:**
- `prepare(query)` - Mock SQL query preparation
- `bind(...params)` - Mock parameter binding
- `all()` - Mock SELECT queries
- `run()` - Mock INSERT/UPDATE/DELETE queries
- `reset()` - Clear mock data between tests

**Implementation:**
```javascript
export class MockD1Database {
  constructor() {
    this.data = {
      email_subscriptions: [],
      subscription_verifications: [],
      subscription_unsubscribes: []
    }
  }

  prepare(query) {
    return {
      bind: (...params) => ({
        all: async () => {
          // Parse query and return mock results
          // See TEST_SPEC_SUBSCRIPTIONS.md for details
        },
        run: async () => {
          // Parse query and execute mock operation
          // See TEST_SPEC_SUBSCRIPTIONS.md for details
        }
      })
    }
  }

  reset() {
    this.data = {
      email_subscriptions: [],
      subscription_verifications: [],
      subscription_unsubscribes: []
    }
  }
}
```

**Full Implementation:** See `docs/TEST_SPEC_SUBSCRIPTIONS.md` Section "Mock D1 Database"

---

### Test Helpers (helpers.js)

**Purpose:** Shared utilities to reduce test boilerplate

**Functions to Implement:**

```javascript
// Create mock request
export function createMockRequest(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  }
  if (body) {
    options.body = JSON.stringify(body)
  }
  return new Request(`http://localhost${path}`, options)
}

// Create mock context
export function createMockContext(mockDB) {
  return {
    request: null, // Set per test
    env: {
      DB: mockDB,
      PUBLIC_URL: 'https://example.com'
    }
  }
}

// Valid payloads
export const VALID_SUBSCRIPTION = {
  email: 'test@example.com',
  city: 'portland',
  genre: 'punk',
  frequency: 'weekly'
}

export const INVALID_PAYLOADS = {
  missingEmail: { city: 'portland', genre: 'punk', frequency: 'weekly' },
  invalidEmail: { email: 'not-an-email', city: 'portland', genre: 'punk', frequency: 'weekly' },
  // ... more invalid payloads
}
```

---

## 📊 Success Criteria

### Must Pass
- [ ] All 21 test cases pass (10 + 6 + 5)
- [ ] Code coverage ≥ 90% for all three endpoints
- [ ] No console errors during test execution
- [ ] Tests run in under 10 seconds total
- [ ] Mock database resets properly between tests

### Nice to Have
- [ ] Test execution in CI/CD pipeline
- [ ] HTML coverage report generated
- [ ] Integration with existing `npm test` command

---

## 🔧 Commands

### Development
```bash
# Run all subscription tests
npm test -- functions/api/subscriptions/__tests__/

# Run specific test file
npm test -- functions/api/subscriptions/__tests__/subscribe.test.js

# Watch mode (auto-rerun on changes)
npm run test:watch -- functions/api/subscriptions/__tests__/
```

### Coverage
```bash
# Generate coverage report
npm run test:coverage -- functions/api/subscriptions/

# HTML report (opens in browser)
npm run test:coverage -- --reporter=html functions/api/subscriptions/
open coverage/index.html
```

---

## 🐛 Troubleshooting

### Problem: `Cannot find module 'vitest'`
**Solution:** Run `npm install --save-dev vitest`

### Problem: `env.DB.prepare is not a function`
**Solution:** Ensure MockD1Database is imported and instantiated correctly

### Problem: Tests timeout
**Solution:** Increase timeout in vitest.config.js:
```javascript
test: {
  testTimeout: 10000 // 10 seconds
}
```

### Problem: Mock data persists between tests
**Solution:** Add `afterEach(() => mockDB.reset())` to test suite

---

## 📈 Expected Results

### Terminal Output (Success)
```
✓ functions/api/subscriptions/__tests__/subscribe.test.js (10)
  ✓ should create new subscription successfully
  ✓ should reject request with missing email
  ✓ should reject request with invalid email format
  ... (7 more tests)

✓ functions/api/subscriptions/__tests__/verify.test.js (6)
  ✓ should verify subscription with valid token
  ... (5 more tests)

✓ functions/api/subscriptions/__tests__/unsubscribe.test.js (5)
  ✓ should unsubscribe with valid token
  ... (4 more tests)

Test Files  3 passed (3)
     Tests  21 passed (21)
  Duration  2.34s
```

### Coverage Report (Success)
```
File                      | % Stmts | % Branch | % Funcs | % Lines
--------------------------|---------|----------|---------|--------
subscribe.js              |   95.23 |    90.90 |  100.00 |   95.00
verify.js                 |   92.30 |    85.71 |  100.00 |   92.30
unsubscribe.js            |   94.11 |    87.50 |  100.00 |   94.11
--------------------------|---------|----------|---------|--------
All files                 |   93.88 |    88.03 |  100.00 |   93.80
```

---

## 🎯 Deliverables

### Commit 1: Mock Infrastructure
```bash
git add functions/api/subscriptions/__tests__/mocks/
git add functions/api/subscriptions/__tests__/helpers.js
git commit -m "test: add mock D1 database and test helpers for subscriptions"
```

### Commit 2: Subscribe Tests
```bash
git add functions/api/subscriptions/__tests__/subscribe.test.js
git commit -m "test: add comprehensive tests for subscription creation (10 cases)"
```

### Commit 3: Verify Tests
```bash
git add functions/api/subscriptions/__tests__/verify.test.js
git commit -m "test: add tests for email verification endpoint (6 cases)"
```

### Commit 4: Unsubscribe Tests
```bash
git add functions/api/subscriptions/__tests__/unsubscribe.test.js
git commit -m "test: add tests for unsubscribe endpoint (5 cases)"
```

---

## 📚 Reference Documents

- **Detailed Spec:** `docs/TEST_SPEC_SUBSCRIPTIONS.md`
- **Implementation:** `functions/api/subscriptions/*.js`
- **Schema:** `migrations/legacy/migration-subscriptions.sql`
- **Vitest Docs:** https://vitest.dev/
- **Cloudflare Workers Testing:** https://developers.cloudflare.com/workers/testing/

---

## ✅ Acceptance Checklist

**Before Marking Complete:**
- [ ] All 21 tests implemented and passing
- [ ] Coverage reports show ≥90% coverage
- [ ] Mock database properly resets between tests
- [ ] No real database calls during tests
- [ ] No console errors or warnings
- [ ] Tests run in under 10 seconds
- [ ] Code follows existing project patterns
- [ ] Commits have descriptive messages

**After Implementation:**
- [ ] Run `npm test -- functions/api/subscriptions/__tests__/` and verify all pass
- [ ] Run `npm run test:coverage -- functions/api/subscriptions/` and verify coverage
- [ ] Push to `dev` branch
- [ ] Update `docs/PROJECT_STATUS_AND_ROADMAP.md` with test status

---

## 🚦 Status Tracking

Use this checklist during implementation:

### Phase 1: Setup (30 min)
- [ ] Install dependencies
- [ ] Create directory structure
- [ ] Implement MockD1Database
- [ ] Implement test helpers

### Phase 2: Subscribe Tests (90 min)
- [ ] Test 1-3: Validation tests
- [ ] Test 4-6: Duplicate prevention
- [ ] Test 7-10: Edge cases

### Phase 3: Verify Tests (60 min)
- [ ] Test 1-3: Token validation
- [ ] Test 4-6: State management

### Phase 4: Unsubscribe Tests (45 min)
- [ ] Test 1-3: Token validation
- [ ] Test 4-5: Logging and HTML response

### Phase 5: Validation (30 min)
- [ ] Run all tests
- [ ] Generate coverage report
- [ ] Fix any failures
- [ ] Commit changes

**Total Time:** 4.5 hours (within 4-6 hour estimate)

---

## 💬 Questions for User (If Blocked)

1. **Mock Data Strategy:** Should mock database persist across test files or reset per file?
2. **Email Mocking:** Should we mock console.log calls for email verification URLs?
3. **Token Generation:** Should we test actual token randomness or just format?
4. **Error Messages:** Should error messages match exactly or just contain key phrases?

**Default Answers (If Unable to Ask):**
1. Reset per test (safest)
2. Yes, mock console.log to suppress output
3. Test format only (64-char hex)
4. Contains key phrases (more flexible)

---

## 🎓 Learning Resources

If stuck on concepts:

- **Vitest Basics:** https://vitest.dev/guide/
- **Mocking in Vitest:** https://vitest.dev/guide/mocking.html
- **Cloudflare Workers Testing:** https://developers.cloudflare.com/workers/testing/vitest-integration/
- **D1 Database API:** https://developers.cloudflare.com/d1/platform/client-api/

---

**READY TO START?**

1. Read this entire document
2. Review `docs/TEST_SPEC_SUBSCRIPTIONS.md` for detailed test cases
3. Install dependencies and create directory structure
4. Implement tests following the specification
5. Run tests and verify coverage
6. Commit and push to `dev` branch

**Questions?** Check "Troubleshooting" section or reference documents.

---

**END OF CURSOR TASK**

*This task is part of Sprint 3 validation before implementing new features.*
