# Test Specification: Subscription System

**Created:** 2025-10-26
**Target File:** `functions/api/subscriptions/subscribe.js`
**Test Framework:** Vitest + MSW (Mock Service Worker)
**For:** Cursor AI or other AI coder implementation
**Estimated Time:** 2-3 hours

---

## Overview

Generate comprehensive unit and integration tests for the email subscription API endpoint. The endpoint handles new subscriptions, duplicate prevention, and email verification workflows.

---

## Test File Location

Create: `functions/api/subscriptions/__tests__/subscribe.test.js`

**Directory Structure:**
```
functions/api/subscriptions/
├── subscribe.js          # Implementation (exists)
├── verify.js             # Implementation (exists)
├── unsubscribe.js        # Implementation (exists)
└── __tests__/
    ├── subscribe.test.js    # TO CREATE
    ├── verify.test.js       # Future
    └── unsubscribe.test.js  # Future
```

---

## Test Setup Requirements

### 1. Install Dependencies (if not present)

```bash
npm install --save-dev vitest msw miniflare @cloudflare/workers-types
```

### 2. Create Test Configuration

**File:** `functions/vitest.config.js` (create if doesn't exist)

```javascript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      bindings: { DB: true },
      kvNamespaces: [],
      d1Databases: ['DB'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '__tests__/', '*.config.js'],
    },
  },
})
```

### 3. Mock D1 Database

**File:** `functions/api/subscriptions/__tests__/mocks/d1.js`

```javascript
// Mock D1 database for testing
export class MockD1Database {
  constructor() {
    this.data = {
      email_subscriptions: []
    }
  }

  prepare(query) {
    return {
      bind: (...params) => ({
        all: async () => {
          // Mock SELECT queries
          if (query.includes('SELECT')) {
            const [email, city, genre] = params
            const results = this.data.email_subscriptions.filter(
              sub => sub.email === email && sub.city === city && sub.genre === genre
            )
            return { results }
          }
          return { results: [] }
        },
        run: async () => {
          // Mock INSERT queries
          if (query.includes('INSERT')) {
            const [email, city, genre, frequency, verificationToken, unsubscribeToken] = params
            this.data.email_subscriptions.push({
              id: this.data.email_subscriptions.length + 1,
              email,
              city,
              genre,
              frequency,
              verification_token: verificationToken,
              unsubscribe_token: unsubscribeToken,
              verified: false,
              created_at: new Date().toISOString()
            })
            return { success: true }
          }
          return { success: false }
        }
      })
    }
  }

  reset() {
    this.data.email_subscriptions = []
  }
}
```

---

## Test Cases to Implement

### Test Suite Structure

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { onRequestPost } from '../subscribe'
import { MockD1Database } from './mocks/d1'

describe('POST /api/subscriptions/subscribe', () => {
  let mockDB
  let mockEnv
  let mockContext

  beforeEach(() => {
    // Reset mocks before each test
    mockDB = new MockD1Database()
    mockEnv = {
      DB: mockDB,
      PUBLIC_URL: 'https://example.com'
    }

    // Mock console.log to suppress verification email logs
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  // Test cases below...
})
```

---

## Test Case Definitions

### 1. Happy Path - New Subscription

**Test Name:** `should create new subscription successfully`

**Input:**
```javascript
const request = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    city: 'portland',
    genre: 'punk',
    frequency: 'weekly'
  })
})
```

**Expected Behavior:**
- Response status: `201`
- Response body: `{ message: 'Subscription created. Please check your email to verify.' }`
- Database: New record inserted with `verified: false`
- Console log: Verification URL logged

**Assertions:**
```javascript
expect(response.status).toBe(201)
const data = await response.json()
expect(data.message).toContain('Subscription created')
expect(mockDB.data.email_subscriptions).toHaveLength(1)
expect(mockDB.data.email_subscriptions[0]).toMatchObject({
  email: 'test@example.com',
  city: 'portland',
  genre: 'punk',
  frequency: 'weekly',
  verified: false
})
```

---

### 2. Validation - Missing Email

**Test Name:** `should reject request with missing email`

**Input:**
```javascript
const request = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    city: 'portland',
    genre: 'punk',
    frequency: 'weekly'
  })
})
```

**Expected Behavior:**
- Response status: `400`
- Response body: `{ error: 'Invalid email address' }`
- Database: No records inserted

**Assertions:**
```javascript
expect(response.status).toBe(400)
const data = await response.json()
expect(data.error).toBe('Invalid email address')
expect(mockDB.data.email_subscriptions).toHaveLength(0)
```

---

### 3. Validation - Invalid Email Format

**Test Name:** `should reject request with invalid email format`

**Input:**
```javascript
const request = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'not-an-email',
    city: 'portland',
    genre: 'punk',
    frequency: 'weekly'
  })
})
```

**Expected Behavior:**
- Response status: `400`
- Response body: `{ error: 'Invalid email address' }`

**Assertions:**
```javascript
expect(response.status).toBe(400)
const data = await response.json()
expect(data.error).toBe('Invalid email address')
```

---

### 4. Validation - Missing Required Fields

**Test Name:** `should reject request with missing city`

**Input:**
```javascript
const request = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    genre: 'punk',
    frequency: 'weekly'
  })
})
```

**Expected Behavior:**
- Response status: `400`
- Response body: `{ error: 'Missing required fields' }`

**Repeat for:** Missing `genre`, missing `frequency`

---

### 5. Duplicate Prevention - Already Verified

**Test Name:** `should reject duplicate verified subscription`

**Setup:**
```javascript
// Pre-populate database with verified subscription
mockDB.data.email_subscriptions.push({
  id: 1,
  email: 'test@example.com',
  city: 'portland',
  genre: 'punk',
  frequency: 'weekly',
  verified: true,
  verification_token: 'existing-token',
  unsubscribe_token: 'existing-unsub-token'
})
```

**Input:**
```javascript
const request = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    city: 'portland',
    genre: 'punk',
    frequency: 'weekly'
  })
})
```

**Expected Behavior:**
- Response status: `400`
- Response body: `{ error: 'You are already subscribed to this feed' }`
- Database: No new records inserted (still 1 record)

**Assertions:**
```javascript
expect(response.status).toBe(400)
const data = await response.json()
expect(data.error).toContain('already subscribed')
expect(mockDB.data.email_subscriptions).toHaveLength(1)
```

---

### 6. Re-verification - Unverified Duplicate

**Test Name:** `should resend verification email for unverified subscription`

**Setup:**
```javascript
// Pre-populate database with unverified subscription
mockDB.data.email_subscriptions.push({
  id: 1,
  email: 'test@example.com',
  city: 'portland',
  genre: 'punk',
  frequency: 'weekly',
  verified: false,
  verification_token: 'existing-token',
  unsubscribe_token: 'existing-unsub-token'
})
```

**Input:**
```javascript
const request = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'test@example.com',
    city: 'portland',
    genre: 'punk',
    frequency: 'weekly'
  })
})
```

**Expected Behavior:**
- Response status: `200`
- Response body: `{ message: 'Verification email sent. Please check your inbox.' }`
- Database: No new records (still 1 record)
- Console log: Verification URL logged with existing token

**Assertions:**
```javascript
expect(response.status).toBe(200)
const data = await response.json()
expect(data.message).toContain('Verification email sent')
expect(mockDB.data.email_subscriptions).toHaveLength(1)
expect(console.log).toHaveBeenCalledWith(
  expect.stringContaining('existing-token')
)
```

---

### 7. Token Generation

**Test Name:** `should generate unique verification and unsubscribe tokens`

**Input:** Standard valid subscription request

**Expected Behavior:**
- `verification_token` is a 64-character hex string
- `unsubscribe_token` is a 64-character hex string
- Tokens are different from each other

**Assertions:**
```javascript
const subscription = mockDB.data.email_subscriptions[0]
expect(subscription.verification_token).toMatch(/^[0-9a-f]{64}$/)
expect(subscription.unsubscribe_token).toMatch(/^[0-9a-f]{64}$/)
expect(subscription.verification_token).not.toBe(subscription.unsubscribe_token)
```

---

### 8. Error Handling - Database Failure

**Test Name:** `should handle database errors gracefully`

**Setup:**
```javascript
// Mock database to throw error
mockDB.prepare = () => ({
  bind: () => ({
    run: async () => {
      throw new Error('Database connection failed')
    }
  })
})
```

**Input:** Standard valid subscription request

**Expected Behavior:**
- Response status: `500`
- Response body: `{ error: 'Subscription failed' }`
- Error logged to console

**Assertions:**
```javascript
expect(response.status).toBe(500)
const data = await response.json()
expect(data.error).toBe('Subscription failed')
```

---

### 9. Multiple Subscriptions - Same Email, Different Feeds

**Test Name:** `should allow same email for different city/genre combinations`

**Input:** Create two subscriptions with same email but different city/genre

**Setup:**
```javascript
// First subscription
const request1 = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  body: JSON.stringify({
    email: 'test@example.com',
    city: 'portland',
    genre: 'punk',
    frequency: 'weekly'
  })
})

// Second subscription (different city)
const request2 = new Request('http://localhost/api/subscriptions/subscribe', {
  method: 'POST',
  body: JSON.stringify({
    email: 'test@example.com',
    city: 'seattle',
    genre: 'punk',
    frequency: 'weekly'
  })
})
```

**Expected Behavior:**
- Both requests return `201`
- Database contains 2 records for same email
- Both have unique verification tokens

**Assertions:**
```javascript
expect(response1.status).toBe(201)
expect(response2.status).toBe(201)
expect(mockDB.data.email_subscriptions).toHaveLength(2)
expect(mockDB.data.email_subscriptions[0].city).toBe('portland')
expect(mockDB.data.email_subscriptions[1].city).toBe('seattle')
```

---

### 10. Frequency Validation

**Test Name:** `should accept valid frequency values`

**Input:** Test all three frequency options: `daily`, `weekly`, `monthly`

**Expected Behavior:**
- All three frequencies are accepted
- Database records have correct frequency value

**Assertions:**
```javascript
const frequencies = ['daily', 'weekly', 'monthly']
for (const frequency of frequencies) {
  const request = new Request('http://localhost/api/subscriptions/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      email: `test-${frequency}@example.com`,
      city: 'portland',
      genre: 'punk',
      frequency
    })
  })

  const response = await onRequestPost({ request, env: mockEnv })
  expect(response.status).toBe(201)
}

expect(mockDB.data.email_subscriptions).toHaveLength(3)
expect(mockDB.data.email_subscriptions[0].frequency).toBe('daily')
expect(mockDB.data.email_subscriptions[1].frequency).toBe('weekly')
expect(mockDB.data.email_subscriptions[2].frequency).toBe('monthly')
```

---

## Code Coverage Requirements

**Minimum Thresholds:**
- **Statements:** 90%
- **Branches:** 85%
- **Functions:** 90%
- **Lines:** 90%

**Coverage Report Command:**
```bash
npm run test:coverage -- functions/api/subscriptions/__tests__/subscribe.test.js
```

---

## Additional Test Utilities

### Helper Functions to Create

**File:** `functions/api/subscriptions/__tests__/helpers.js`

```javascript
// Create mock request with JSON body
export function createMockRequest(body) {
  return new Request('http://localhost/api/subscriptions/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
}

// Create mock context with DB
export function createMockContext(mockDB) {
  return {
    request: null, // Set per test
    env: {
      DB: mockDB,
      PUBLIC_URL: 'https://example.com'
    }
  }
}

// Valid subscription payload
export const VALID_SUBSCRIPTION = {
  email: 'test@example.com',
  city: 'portland',
  genre: 'punk',
  frequency: 'weekly'
}

// Invalid payloads for testing
export const INVALID_PAYLOADS = {
  missingEmail: { city: 'portland', genre: 'punk', frequency: 'weekly' },
  invalidEmail: { email: 'not-an-email', city: 'portland', genre: 'punk', frequency: 'weekly' },
  missingCity: { email: 'test@example.com', genre: 'punk', frequency: 'weekly' },
  missingGenre: { email: 'test@example.com', city: 'portland', frequency: 'weekly' },
  missingFrequency: { email: 'test@example.com', city: 'portland', genre: 'punk' }
}
```

---

## Running Tests

### Development
```bash
# Run tests in watch mode
npm run test:watch -- functions/api/subscriptions/__tests__/subscribe.test.js

# Run tests once
npm test -- functions/api/subscriptions/__tests__/subscribe.test.js
```

### CI/CD
```bash
# Run with coverage report
npm run test:coverage -- functions/api/subscriptions/

# Generate HTML coverage report
npm run test:coverage -- --reporter=html functions/api/subscriptions/
```

---

## Success Criteria

✅ All 10 test cases pass
✅ Code coverage meets 90% threshold
✅ No console errors during test execution
✅ Tests run in under 5 seconds
✅ Mock database resets properly between tests

---

## Next Steps After Implementation

1. **Run Tests:** `npm test -- functions/api/subscriptions/__tests__/subscribe.test.js`
2. **Check Coverage:** `npm run test:coverage -- functions/api/subscriptions/`
3. **Fix Failures:** Address any test failures or coverage gaps
4. **Commit:** `git add functions/api/subscriptions/__tests__/ && git commit -m "test: add comprehensive tests for subscription API"`
5. **Move On:** Generate tests for `verify.js` and `unsubscribe.js` using same pattern

---

## Handoff Checklist for AI Coder

- [ ] Read `functions/api/subscriptions/subscribe.js` implementation
- [ ] Create `functions/api/subscriptions/__tests__/` directory
- [ ] Implement `mocks/d1.js` mock database
- [ ] Implement `helpers.js` test utilities
- [ ] Create `subscribe.test.js` with all 10 test cases
- [ ] Run tests and verify all pass
- [ ] Generate coverage report and verify 90%+ coverage
- [ ] Commit changes with descriptive message

**Estimated Time:** 2-3 hours for experienced AI coder

---

**End of Test Specification**

*For implementation support, reference:*
- Vitest Documentation: https://vitest.dev/
- Cloudflare Workers Testing: https://developers.cloudflare.com/workers/testing/
- MSW Documentation: https://mswjs.io/
