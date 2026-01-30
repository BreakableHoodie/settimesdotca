import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { onRequestGet } from '../verify.js'
import { MockD1Database } from './mocks/d1.js'
import { createMockContext } from './helpers.js'

describe('GET /api/subscriptions/verify', () => {
  let mockDB
  let mockContext

  beforeEach(() => {
    mockDB = new MockD1Database()
    mockContext = createMockContext(mockDB)
    
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should verify subscription with valid token', async () => {
    // Pre-populate with unverified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: false,
      verification_token: 'valid-token-12345',
      unsubscribe_token: 'unsub-token-67890',
      created_at: new Date().toISOString()
    })

    const request = new Request('http://localhost/api/subscriptions/verify?token=valid-token-12345')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(302)
    const subscription = mockDB.data.email_subscriptions.find(sub => sub.id === 1)
    expect(subscription.verified).toBe(true)
    expect(mockDB.data.subscription_verifications).toHaveLength(1)
    expect(mockDB.data.subscription_verifications[0].subscription_id).toBe(1)
  })

  it('should reject request without token', async () => {
    const request = new Request('http://localhost/api/subscriptions/verify')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Missing verification token')
  })

  it('should reject invalid token', async () => {
    const request = new Request('http://localhost/api/subscriptions/verify?token=invalid-token')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(404)
    const text = await response.text()
    expect(text).toContain('Invalid verification token')
  })

  it('should handle already verified subscription gracefully', async () => {
    // Pre-populate with verified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: true,
      verification_token: 'valid-token-12345',
      unsubscribe_token: 'unsub-token-67890',
      created_at: new Date().toISOString()
    })

    const request = new Request('http://localhost/api/subscriptions/verify?token=valid-token-12345')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).toContain('Email already verified')
  })

  it('should log verification to subscription_verifications table', async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: false,
      verification_token: 'valid-token-12345',
      unsubscribe_token: 'unsub-token-67890',
      created_at: new Date().toISOString()
    })

    const request = new Request('http://localhost/api/subscriptions/verify?token=valid-token-12345')
    mockContext.request = request

    await onRequestGet(mockContext)

    expect(mockDB.data.subscription_verifications).toHaveLength(1)
    expect(mockDB.data.subscription_verifications[0]).toMatchObject({
      subscription_id: 1,
      verified_at: expect.any(String)
    })
  })

  it('should redirect to success page after verification', async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: false,
      verification_token: 'valid-token-12345',
      unsubscribe_token: 'unsub-token-67890',
      created_at: new Date().toISOString()
    })

    const request = new Request('http://localhost/api/subscriptions/verify?token=valid-token-12345')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    expect(location).toBe('https://example.com/subscribe?verified=true')
  })
})
