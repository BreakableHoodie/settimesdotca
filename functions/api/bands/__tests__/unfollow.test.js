import { describe, it, expect } from 'vitest'
import { createTestEnv, insertBand, insertEvent } from '../../test-utils'
import { onRequestGet } from '../[name]/unfollow.js'

describe('GET /api/bands/:name/unfollow', () => {
  it('deletes the follow row for a valid token and returns 200 HTML', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-unfollow' })
    const band = insertBand(rawDb, { name: 'Band', event_id: ev.id })
    rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)'
    ).run('fan@example.com', band.band_profile_id, 'valid-token-abc')

    const res = await onRequestGet({
      request: new Request('https://example.test/api/bands/1/unfollow?token=valid-token-abc'),
      env,
    })

    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Unfollowed')
    expect(res.headers.get('Cache-Control')).toBe('no-store')

    const row = rawDb.prepare('SELECT * FROM band_follows WHERE unsubscribe_token=?').get('valid-token-abc')
    expect(row).toBeUndefined()
  })

  it('returns 200 even when the token does not exist (avoids enumeration)', async () => {
    const { env } = createTestEnv()

    const res = await onRequestGet({
      request: new Request('https://example.test/api/bands/1/unfollow?token=nonexistent-token'),
      env,
    })

    expect(res.status).toBe(200)
  })

  it('returns 400 for a missing token', async () => {
    const { env } = createTestEnv()

    const res = await onRequestGet({
      request: new Request('https://example.test/api/bands/1/unfollow'),
      env,
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 for a token that exceeds 256 characters', async () => {
    const { env } = createTestEnv()
    const longToken = 'a'.repeat(257)

    const res = await onRequestGet({
      request: new Request(`https://example.test/api/bands/1/unfollow?token=${longToken}`),
      env,
    })

    expect(res.status).toBe(400)
  })
})
