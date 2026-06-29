// Test helpers for subscription tests
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

export function createMockContext(mockDB) {
  return {
    env: {
      DB: mockDB,
      PUBLIC_URL: 'https://example.com',
      // Required so isDevRequest() returns true and Turnstile/CSRF skip in
      // unit tests.  Without an explicit ENVIRONMENT the security default is
      // now "production" (secure/closed), not localhost-sniffing. (#425)
      ENVIRONMENT: 'test',
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

// Invalid payloads
export const INVALID_PAYLOADS = {
  missingEmail: { city: 'portland', genre: 'punk', frequency: 'weekly' },
  invalidEmail: { email: 'not-an-email', city: 'portland', genre: 'punk', frequency: 'weekly' },
  missingCity: { email: 'test@example.com', genre: 'punk', frequency: 'weekly' },
  missingGenre: { email: 'test@example.com', city: 'portland', frequency: 'weekly' },
  missingFrequency: { email: 'test@example.com', city: 'portland', genre: 'punk' }
}





