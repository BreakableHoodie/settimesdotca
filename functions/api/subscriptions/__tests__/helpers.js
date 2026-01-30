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

// Invalid payloads
export const INVALID_PAYLOADS = {
  missingEmail: { city: 'portland', genre: 'punk', frequency: 'weekly' },
  invalidEmail: { email: 'not-an-email', city: 'portland', genre: 'punk', frequency: 'weekly' },
  missingCity: { email: 'test@example.com', genre: 'punk', frequency: 'weekly' },
  missingGenre: { email: 'test@example.com', city: 'portland', frequency: 'weekly' },
  missingFrequency: { email: 'test@example.com', city: 'portland', genre: 'punk' }
}





