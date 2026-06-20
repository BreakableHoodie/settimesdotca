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
import { createTestEnv, insertEvent, insertShareLink } from '../../../test-utils.js'

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
})
