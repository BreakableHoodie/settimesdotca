# Cursor AI Handoff Instructions

**Task:** Generate comprehensive tests for subscription system
**Estimated Time:** 4-6 hours
**Date:** 2025-10-26

---

## ✅ Setup Complete

Your project is now configured for optimal Cursor AI execution:

### What Was Done
1. ✅ **`.cursorrules` created** - Cursor AI coding standards and project context
2. ✅ **Test specifications ready** - `docs/CURSOR_TASK_SUBSCRIPTION_TESTS.md`
3. ✅ **Detailed test cases** - `docs/TEST_SPEC_SUBSCRIPTIONS.md`
4. ✅ **Project roadmap updated** - `docs/PROJECT_STATUS_AND_ROADMAP.md`

---

## 🚀 How to Hand Off to Cursor

### Step 1: Open Project in Cursor

```bash
cd /Users/andrelevesque/Projects/longweekendbandcrawl/longweekendbandcrawl
cursor .
```

Or if Cursor is already open, ensure you're in the correct directory.

---

### Step 2: Give Cursor This Exact Prompt

**Copy and paste this into Cursor's chat:**

```
Read docs/CURSOR_TASK_SUBSCRIPTION_TESTS.md and implement all test cases following the specification.

Context:
- We need comprehensive tests for the subscription system (Sprint 3 validation)
- 21 test cases across 3 endpoints: subscribe.js, verify.js, unsubscribe.js
- Must achieve 90%+ code coverage
- Use Vitest + Mock D1 database
- Follow patterns in .cursorrules

Requirements:
1. Create functions/api/subscriptions/__tests__/ directory structure
2. Implement MockD1Database in mocks/d1.js
3. Implement test helpers in helpers.js
4. Create subscribe.test.js with 10 test cases
5. Create verify.test.js with 6 test cases
6. Create unsubscribe.test.js with 5 test cases
7. Ensure all tests pass with 90%+ coverage

Success criteria:
- All 21 tests pass
- npm run test:coverage shows ≥90% for all three files
- No console errors during test execution
- Mock database resets properly between tests

Start with Phase 1 (Setup) from the specification document.
```

---

### Step 3: Monitor Progress

Cursor will work through the task in phases. You should see:

**Phase 1: Setup (30 min)**
- Created `__tests__` directory structure
- Implemented `MockD1Database` class
- Created test helpers

**Phase 2: Subscribe Tests (90 min)**
- 10 test cases for `subscribe.js`
- Validation, duplicate prevention, error handling

**Phase 3: Verify Tests (60 min)**
- 6 test cases for `verify.js`
- Token validation, state management

**Phase 4: Unsubscribe Tests (45 min)**
- 5 test cases for `unsubscribe.js`
- Token validation, logging, HTML response

**Phase 5: Validation (30 min)**
- Run tests: `npm test -- functions/api/subscriptions/__tests__/`
- Generate coverage: `npm run test:coverage -- functions/api/subscriptions/`
- Fix any failures

---

## 🔍 Validation Commands

After Cursor completes, run these commands to validate:

### Run Tests
```bash
npm test -- functions/api/subscriptions/__tests__/
```

**Expected Output:**
```
✓ functions/api/subscriptions/__tests__/subscribe.test.js (10)
✓ functions/api/subscriptions/__tests__/verify.test.js (6)
✓ functions/api/subscriptions/__tests__/unsubscribe.test.js (5)

Test Files  3 passed (3)
     Tests  21 passed (21)
```

### Check Coverage
```bash
npm run test:coverage -- functions/api/subscriptions/
```

**Expected Output:**
```
File                      | % Stmts | % Branch | % Funcs | % Lines
--------------------------|---------|----------|---------|--------
subscribe.js              |   95+   |    90+   |  100.00 |   95+
verify.js                 |   92+   |    85+   |  100.00 |   92+
unsubscribe.js            |   94+   |    87+   |  100.00 |   94+
```

---

## 🐛 Common Issues & Solutions

### Issue: "Cannot find module 'vitest'"
**Solution:**
```bash
npm install --save-dev vitest msw miniflare @cloudflare/workers-types
```

### Issue: "env.DB.prepare is not a function"
**Solution:** Check MockD1Database implementation in `mocks/d1.js`

### Issue: Tests timeout
**Solution:** Increase timeout in `vitest.config.js`:
```javascript
test: {
  testTimeout: 10000 // 10 seconds
}
```

### Issue: Mock data persists between tests
**Solution:** Verify `afterEach(() => mockDB.reset())` is in test suite

### Issue: Cursor asks clarifying questions
**Answers:**
- Mock console.log? **Yes**
- Test token randomness? **No, just format (64-char hex)**
- Error message matching? **Contains key phrases (flexible)**
- Mock database strategy? **Reset per test (safest)**

---

## 📊 Success Checklist

After Cursor completes, verify these items:

### Files Created
- [ ] `functions/api/subscriptions/__tests__/mocks/d1.js`
- [ ] `functions/api/subscriptions/__tests__/helpers.js`
- [ ] `functions/api/subscriptions/__tests__/subscribe.test.js`
- [ ] `functions/api/subscriptions/__tests__/verify.test.js`
- [ ] `functions/api/subscriptions/__tests__/unsubscribe.test.js`

### Tests Pass
- [ ] All 21 tests pass
- [ ] No console errors
- [ ] Tests run in under 10 seconds

### Coverage Requirements
- [ ] subscribe.js: ≥90% coverage
- [ ] verify.js: ≥90% coverage
- [ ] unsubscribe.js: ≥90% coverage

### Quality Gates
- [ ] No ESLint errors
- [ ] No TypeScript errors (if applicable)
- [ ] Mock database properly implemented
- [ ] Test helpers are reusable

---

## 🎯 After Tests Pass

### Step 1: Commit Changes
```bash
git add functions/api/subscriptions/__tests__/
git commit -m "test: add comprehensive tests for subscription system (Sprint 3 validation)

- Implement MockD1Database for testing
- Add 21 test cases across subscribe, verify, unsubscribe endpoints
- Achieve 90%+ code coverage
- All tests passing with proper mock isolation"
```

### Step 2: Update Roadmap
Open `docs/PROJECT_STATUS_AND_ROADMAP.md` and update:

**Before:**
```markdown
### ⚠️ What's Not Tested
Sprint 3 features are **implemented but not validated**
```

**After:**
```markdown
### ✅ Sprint 3 Validated
Sprint 3 features fully tested with 21 passing tests and 90%+ coverage
```

### Step 3: Manual Validation (Optional but Recommended)

Even though automated tests pass, manually test the actual endpoints:

```bash
# Start local dev server
npx wrangler pages dev frontend/dist --d1 DB --compatibility-date 2024-01-01

# In another terminal, test subscription
curl -X POST http://localhost:8788/api/subscriptions/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","city":"portland","genre":"punk","frequency":"weekly"}'

# Expected: 201 response with success message
```

---

## 📚 Reference Documents

- **Main Task Spec:** `docs/CURSOR_TASK_SUBSCRIPTION_TESTS.md` (high-level)
- **Detailed Test Cases:** `docs/TEST_SPEC_SUBSCRIPTIONS.md` (low-level)
- **Project Status:** `docs/PROJECT_STATUS_AND_ROADMAP.md`
- **Cursor Rules:** `.cursorrules` (AI behavior guidance)

---

## 🔄 What Happens Next

After Sprint 3 tests are validated:

### Option B (Priority 1): Image Upload System
- SuperClaude will research Cloudflare R2 integration
- Create similar specification document for Cursor
- Implement drag-and-drop image upload

### Option C (Priority 3): Mobile Optimization
- SuperClaude will audit current mobile experience
- Create mobile optimization specification
- Implement touch-friendly improvements

---

## 💬 Questions?

If Cursor gets stuck or produces errors:

1. **Check Specification:** Review `docs/CURSOR_TASK_SUBSCRIPTION_TESTS.md`
2. **Check Cursor Rules:** Review `.cursorrules` for project patterns
3. **Check Similar Tests:** Look at `frontend/src/test/` for existing patterns
4. **Ask SuperClaude:** Return to SuperClaude for clarification

---

## 🎓 Key Success Factors

1. **Cursor reads .cursorrules automatically** - Project context is loaded
2. **Specification is comprehensive** - All test cases clearly defined
3. **Mock patterns are documented** - D1 database mocking explained
4. **Success criteria are clear** - 21 tests, 90% coverage
5. **Validation is straightforward** - Run tests and check coverage

---

## 🚦 Current Status

- ✅ Project configured for Cursor
- ✅ `.cursorrules` created with project context
- ✅ Test specifications ready
- ✅ Mock patterns documented
- ⏳ **Ready for Cursor handoff**

---

**NEXT ACTION:** Copy the prompt from Step 2 above into Cursor and let it execute the task!

**Estimated Completion Time:** 4-6 hours (Cursor will work autonomously)

---

**END OF HANDOFF INSTRUCTIONS**

*For questions or issues, refer back to SuperClaude with specific error messages or blocked states.*
