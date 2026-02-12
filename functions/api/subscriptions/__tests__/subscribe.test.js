import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { onRequestPost } from '../subscribe.js'
import { MockD1Database } from './mocks/d1.js'
import { createMockRequest, createMockContext, VALID_SUBSCRIPTION, INVALID_PAYLOADS } from './helpers.js'

describe('POST /api/subscriptions/subscribe', () => {
  let mockDB
  let mockContext

  beforeEach(() => {
    // Reset mocks before each test
    mockDB = new MockD1Database()
    mockContext = createMockContext(mockDB)
    
    // Mock console.log and info to suppress logs
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create new subscription successfully', async () => {
    const request = createMockRequest('POST', '/api/subscriptions/subscribe', VALID_SUBSCRIPTION)
    mockContext.request = request

    const response = await onRequestPost(mockContext)

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
  })

  it('should reject request with missing email', async () => {
    const request = createMockRequest('POST', '/api/subscriptions/subscribe', INVALID_PAYLOADS.missingEmail)
    mockContext.request = request

    const response = await onRequestPost(mockContext)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid email address')
    expect(mockDB.data.email_subscriptions).toHaveLength(0)
  })

  it('should reject request with invalid email format', async () => {
    const request = createMockRequest('POST', '/api/subscriptions/subscribe', INVALID_PAYLOADS.invalidEmail)
    mockContext.request = request

    const response = await onRequestPost(mockContext)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Invalid email address')
  })

  it('should reject request with missing city', async () => {
    const request = createMockRequest('POST', '/api/subscriptions/subscribe', INVALID_PAYLOADS.missingCity)
    mockContext.request = request

    const response = await onRequestPost(mockContext)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Missing required fields')
  })

  it('should reject duplicate verified subscription', async () => {
    // Pre-populate with verified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: true,
      verification_token: 'existing-token-12345',
      unsubscribe_token: 'existing-unsub-token-67890',
      created_at: new Date().toISOString()
    })

    const request = createMockRequest('POST', '/api/subscriptions/subscribe', VALID_SUBSCRIPTION)
    mockContext.request = request

    const response = await onRequestPost(mockContext)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('already subscribed')
    expect(mockDB.data.email_subscriptions).toHaveLength(1)
  })

  it('should resend verification email for unverified subscription', async () => {
    // Pre-populate with unverified subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: false,
      verification_token: 'existing-token-12345',
      unsubscribe_token: 'existing-unsub-token-67890',
      created_at: new Date().toISOString()
    })

    const request = createMockRequest('POST', '/api/subscriptions/subscribe', VALID_SUBSCRIPTION)
    mockContext.request = request

    const response = await onRequestPost(mockContext)

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.message).toContain('Verification email sent')
    expect(mockDB.data.email_subscriptions).toHaveLength(1)
    // Verification links are now only logged when DEBUG_EMAIL_LINKS is enabled.
    expect(console.info).not.toHaveBeenCalled()
  })

  it('should generate unique verification and unsubscribe tokens', async () => {
    const request = createMockRequest('POST', '/api/subscriptions/subscribe', VALID_SUBSCRIPTION)
    mockContext.request = request

    await onRequestPost(mockContext)

    const subscription = mockDB.data.email_subscriptions[0]
    expect(subscription.verification_token).toMatch(/^[0-9a-f]{64}$/)
    expect(subscription.unsubscribe_token).toMatch(/^[0-9a-f]{64}$/)
    expect(subscription.verification_token).not.toBe(subscription.unsubscribe_token)
  })

  it('should handle database errors gracefully', async () => {
    // Mock database to throw error
    mockDB.prepare = () => ({
      bind: () => ({
        run: async () => {
          throw new Error('Database connection failed')
        },
        all: async () => {
          throw new Error('Database connection failed')
        }
      })
    })

    const request = createMockRequest('POST', '/api/subscriptions/subscribe', VALID_SUBSCRIPTION)
    mockContext.request = request

    const response = await onRequestPost(mockContext)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Subscription failed')
  })

  it('should allow same email for different city/genre combinations', async () => {
    // First subscription
    const request1 = createMockRequest('POST', '/api/subscriptions/subscribe', {
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly'
    })
    mockContext.request = request1

    const response1 = await onRequestPost(mockContext)

    // Second subscription (different city)
    const request2 = createMockRequest('POST', '/api/subscriptions/subscribe', {
      email: 'test@example.com',
      city: 'seattle',
      genre: 'punk',
      frequency: 'weekly'
    })
    mockContext.request = request2

    const response2 = await onRequestPost(mockContext)

    expect(response1.status).toBe(201)
    expect(response2.status).toBe(201)
    expect(mockDB.data.email_subscriptions).toHaveLength(2)
    expect(mockDB.data.email_subscriptions[0].city).toBe('portland')
    expect(mockDB.data.email_subscriptions[1].city).toBe('seattle')
  })

  it('should accept all valid frequency values', async () => {
    const frequencies = ['daily', 'weekly', 'monthly']
    
    for (const frequency of frequencies) {
      const request = createMockRequest('POST', '/api/subscriptions/subscribe', {
        email: `test-${frequency}@example.com`,
        city: 'portland',
        genre: 'punk',
        frequency
      })
      mockContext.request = request

      const response = await onRequestPost(mockContext)
      expect(response.status).toBe(201)
    }

    expect(mockDB.data.email_subscriptions).toHaveLength(3)
    expect(mockDB.data.email_subscriptions[0].frequency).toBe('daily')
    expect(mockDB.data.email_subscriptions[1].frequency).toBe('weekly')
    expect(mockDB.data.email_subscriptions[2].frequency).toBe('monthly')
  })
})
