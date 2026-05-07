import { describe, expect, test } from 'vitest'
import { onRequestGet } from '../share/[slug].js'
import { createTestEnv, insertEvent, insertShareLink } from '../../test-utils.js'

describe('GET /api/schedule/share/[slug]', () => {
  function makeRequest(slug) {
    return new Request(`https://example.test/api/schedule/share/${slug}`)
  }

  test('returns share link data for a valid slug', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb, { name: 'My Fest', slug: 'my-fest' })
    insertShareLink(rawDb, {
      slug: 'abc12345',
      event_id: event.id,
      event_slug: 'my-fest',
      performance_ids: [10, 20],
      band_names: ['Band A', 'Band B'],
    })

    const res = await onRequestGet({
      request: makeRequest('abc12345'),
      params: { slug: 'abc12345' },
      env,
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.slug).toBe('abc12345')
    expect(body.event_slug).toBe('my-fest')
    expect(body.event_name).toBe('My Fest')
    expect(body.performance_ids).toEqual([10, 20])
    expect(body.band_names).toEqual(['Band A', 'Band B'])
  })

  test('returns 404 for unknown slug', async () => {
    const { env } = createTestEnv()
    const res = await onRequestGet({
      request: makeRequest('notfound'),
      params: { slug: 'notfound' },
      env,
    })
    expect(res.status).toBe(404)
  })

  test('returns 404 for expired slug', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb)
    insertShareLink(rawDb, {
      slug: 'expired1',
      event_id: event.id,
      performance_ids: [1],
      band_names: ['B'],
      expires_at: '2000-01-01 00:00:00',
    })

    const res = await onRequestGet({
      request: makeRequest('expired1'),
      params: { slug: 'expired1' },
      env,
    })
    expect(res.status).toBe(404)
  })

  test('returns 400 for invalid slug format', async () => {
    const { env } = createTestEnv()
    const res = await onRequestGet({
      request: makeRequest('../etc/passwd'),
      params: { slug: '../etc/passwd' },
      env,
    })
    expect(res.status).toBe(400)
  })
})
