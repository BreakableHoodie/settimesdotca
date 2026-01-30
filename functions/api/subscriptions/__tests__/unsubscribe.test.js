import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { onRequestGet } from '../unsubscribe.js'
import { MockD1Database } from './mocks/d1.js'
import { createMockContext } from './helpers.js'

describe('GET /api/subscriptions/unsubscribe', () => {
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

  it('should unsubscribe with valid token', async () => {
    // Pre-populate with subscription
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: true,
      verification_token: 'verify-token-12345',
      unsubscribe_token: 'valid-token-67890',
      created_at: new Date().toISOString()
    })

    const request = new Request('http://localhost/api/subscriptions/unsubscribe?token=valid-token-67890')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(200)
    expect(mockDB.data.email_subscriptions).toHaveLength(0)
    expect(mockDB.data.subscription_unsubscribes).toHaveLength(1)
    expect(mockDB.data.subscription_unsubscribes[0].subscription_id).toBe(1)
  })

  it('should reject request without token', async () => {
    const request = new Request('http://localhost/api/subscriptions/unsubscribe')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toContain('Missing unsubscribe token')
  })

  it('should reject invalid token', async () => {
    const request = new Request('http://localhost/api/subscriptions/unsubscribe?token=invalid-token')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(404)
    const text = await response.text()
    expect(text).toContain('Invalid unsubscribe token')
  })

  it('should log unsubscribe to subscription_unsubscribes table', async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: true,
      verification_token: 'verify-token-12345',
      unsubscribe_token: 'valid-token-67890',
      created_at: new Date().toISOString()
    })

    const request = new Request('http://localhost/api/subscriptions/unsubscribe?token=valid-token-67890')
    mockContext.request = request

    await onRequestGet(mockContext)

    expect(mockDB.data.subscription_unsubscribes).toHaveLength(1)
    expect(mockDB.data.subscription_unsubscribes[0]).toMatchObject({
      subscription_id: 1,
      unsubscribed_at: expect.any(String)
    })
  })

  it('should return HTML success page', async () => {
    mockDB.data.email_subscriptions.push({
      id: 1,
      email: 'test@example.com',
      city: 'portland',
      genre: 'punk',
      frequency: 'weekly',
      verified: true,
      verification_token: 'verify-token-12345',
      unsubscribe_token: 'valid-token-67890',
      created_at: new Date().toISOString()
    })

    const request = new Request('http://localhost/api/subscriptions/unsubscribe?token=valid-token-67890')
    mockContext.request = request

    const response = await onRequestGet(mockContext)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/html')
    
    const html = await response.text()
    expect(html).toContain('Unsubscribed')
    expect(html).toContain('portland')
    expect(html).toContain('punk')
    expect(html).toContain('example.com/subscribe')
  })
})
