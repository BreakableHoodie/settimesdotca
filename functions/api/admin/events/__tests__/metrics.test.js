// Admin event metrics endpoint tests
// GET /api/admin/events/[id]/metrics
import { describe, expect, test, vi } from 'vitest'

// Mock RBAC middleware: authenticate via context.data.user.role or x-test-role header
vi.mock('../../_middleware.js', () => ({
  checkPermission: async (context) => {
    const role =
      context?.data?.user?.role || context?.request?.headers?.get('x-test-role')
    if (!role) {
      return {
        error: true,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      }
    }
    return { error: false, user: { userId: 1, role }, userId: 1 }
  },
  auditLog: async () => {},
}))

import { onRequestGet } from '../[id]/metrics.js'
import { createTestEnv, insertEvent, insertShareLink, insertBand } from '../../../test-utils.js'

describe('GET /api/admin/events/[id]/metrics', () => {
  function call(env, eventId) {
    return onRequestGet({
      request: new Request(
        `https://example.test/api/admin/events/${eventId}/metrics`,
        { headers: { 'x-test-role': 'viewer' } }
      ),
      params: { id: String(eventId) },
      env,
      data: { user: { userId: 1, role: 'viewer' } },
    })
  }

  test('includes share analytics: count, total views, and top routes by views', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb, { name: 'Fest', slug: 'fest' })
    insertShareLink(rawDb, {
      slug: 'routeaaa',
      event_id: event.id,
      event_slug: 'fest',
      performance_ids: [1],
      band_names: ['A'],
    })
    insertShareLink(rawDb, {
      slug: 'routebbb',
      event_id: event.id,
      event_slug: 'fest',
      performance_ids: [1, 2],
      band_names: ['A', 'B'],
    })
    rawDb
      .prepare('UPDATE share_links SET view_count = ? WHERE slug = ?')
      .run(5, 'routeaaa')
    rawDb
      .prepare('UPDATE share_links SET view_count = ? WHERE slug = ?')
      .run(2, 'routebbb')

    const res = await call(env, event.id)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.metrics.totalShares).toBe(2)
    expect(body.metrics.totalShareViews).toBe(7)
    expect(body.metrics.topSharedRoutes[0].slug).toBe('routeaaa')
    expect(body.metrics.topSharedRoutes[0].view_count).toBe(5)
  })

  test('popularBands is ordered by schedule_count desc and totalScheduleBuilds/uniqueVisitors reflect inserted rows', async () => {
    const { env, rawDb } = createTestEnv()
    const event = insertEvent(rawDb, { name: 'Band Fest', slug: 'band-fest' })

    const perfA = insertBand(rawDb, { name: 'Alpha Band', event_id: event.id })
    const perfB = insertBand(rawDb, { name: 'Beta Band', event_id: event.id })

    // Alpha Band: 3 schedule builds across 2 sessions
    rawDb.prepare('INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)').run(event.id, perfA.id, 'session-1')
    rawDb.prepare('INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)').run(event.id, perfA.id, 'session-2')
    rawDb.prepare('INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)').run(event.id, perfA.id, 'session-2')
    // Beta Band: 1 schedule build in a new session
    rawDb.prepare('INSERT INTO schedule_builds (event_id, performance_id, user_session) VALUES (?, ?, ?)').run(event.id, perfB.id, 'session-3')

    const res = await call(env, event.id)
    expect(res.status).toBe(200)
    const body = await res.json()

    // popularBands should be a non-empty array ordered by schedule_count desc
    expect(Array.isArray(body.metrics.popularBands)).toBe(true)
    expect(body.metrics.popularBands.length).toBeGreaterThan(0)
    expect(body.metrics.popularBands[0].band_name).toBe('Alpha Band')
    expect(body.metrics.popularBands[0].schedule_count).toBe(3)
    expect(body.metrics.popularBands[1].band_name).toBe('Beta Band')
    expect(body.metrics.popularBands[1].schedule_count).toBe(1)

    // totalScheduleBuilds: 4 rows inserted
    expect(body.metrics.totalScheduleBuilds).toBe(4)
    // uniqueVisitors: 3 distinct sessions
    expect(body.metrics.uniqueVisitors).toBe(3)
  })
})
