import { describe, it, expect } from 'vitest'
import { createTestEnv, insertEvent } from '../../../test-utils'
import { onRequestPost } from '../[id]/reveal-mode.js'

describe('POST /api/admin/events/:id/reveal-mode', () => {
  it('enables reveal mode on an event', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-reveal' })

    const res = await onRequestPost({
      request: new Request(`https://example.test/api/admin/events/${ev.id}/reveal-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reveal_mode: true }),
      }),
      env,
      params: { id: String(ev.id) },
      data: { user: { role: 'editor', id: 2, userId: 2 } },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.event.reveal_mode).toBe(1)

    const row = rawDb.prepare('SELECT reveal_mode FROM events WHERE id=?').get(ev.id)
    expect(row.reveal_mode).toBe(1)
  })

  it('disables reveal mode on an event', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-reveal-off' })
    rawDb.prepare('UPDATE events SET reveal_mode=1 WHERE id=?').run(ev.id)

    const res = await onRequestPost({
      request: new Request(`https://example.test/api/admin/events/${ev.id}/reveal-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reveal_mode: false }),
      }),
      env,
      params: { id: String(ev.id) },
      data: { user: { role: 'editor', id: 2, userId: 2 } },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.event.reveal_mode).toBe(0)
  })

  it('returns 400 when reveal_mode is missing from body', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-reveal-bad' })

    const res = await onRequestPost({
      request: new Request(`https://example.test/api/admin/events/${ev.id}/reveal-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ other: true }),
      }),
      env,
      params: { id: String(ev.id) },
      data: { user: { role: 'editor', id: 2, userId: 2 } },
    })

    expect(res.status).toBe(400)
  })

  it('returns 404 for a non-existent event', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const res = await onRequestPost({
      request: new Request('https://example.test/api/admin/events/99999/reveal-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reveal_mode: true }),
      }),
      env,
      params: { id: '99999' },
      data: { user: { role: 'editor', id: 2, userId: 2 } },
    })

    expect(res.status).toBe(404)
  })

  it('requires at least editor role', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'viewer' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-reveal-auth' })

    const res = await onRequestPost({
      request: new Request(`https://example.test/api/admin/events/${ev.id}/reveal-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ reveal_mode: true }),
      }),
      env,
      params: { id: String(ev.id) },
      data: { user: { role: 'viewer', id: 3, userId: 3 } },
    })

    expect(res.status).toBe(403)
  })
})
