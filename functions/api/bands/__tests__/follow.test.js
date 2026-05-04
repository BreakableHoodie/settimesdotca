import { describe, it, expect } from 'vitest'
import { createTestEnv, insertBand, insertEvent } from '../../test-utils'
import * as followHandler from '../[name]/follow.js'

const waitUntil = () => {}

describe('POST /api/bands/:name/follow', () => {
  it('creates a band follow for a valid email and band', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-follow' })
    const band = insertBand(rawDb, { name: 'Follow Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: String(band.band_profile_id) }, waitUntil })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)

    const row = rawDb.prepare('SELECT * FROM band_follows WHERE email=? AND band_profile_id=?')
      .get('fan@example.com', band.band_profile_id)
    expect(row).toBeTruthy()
    expect(row.verified).toBe(1)
    expect(row.unsubscribe_token).toBeTruthy()
  })

  it('returns 400 for an invalid email', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-bad-email' })
    const band = insertBand(rawDb, { name: 'Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: String(band.band_profile_id) }, waitUntil })
    expect(res.status).toBe(400)
  })

  it('returns 200 silently if email already follows the band (no duplicate row)', async () => {
    const { env, rawDb } = createTestEnv()
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-dup' })
    const band = insertBand(rawDb, { name: 'Dup Band', event_id: ev.id })

    rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, unsubscribe_token) VALUES (?, ?, ?)'
    ).run('fan@example.com', band.band_profile_id, 'existing-token')

    const req = new Request(`https://example.test/api/bands/${band.band_profile_id}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: String(band.band_profile_id) }, waitUntil })
    expect(res.status).toBe(200)

    const rows = rawDb.prepare('SELECT * FROM band_follows WHERE email=? AND band_profile_id=?')
      .all('fan@example.com', band.band_profile_id)
    expect(rows.length).toBe(1)
  })

  it('returns 404 if band does not exist', async () => {
    const { env } = createTestEnv()

    const req = new Request('https://example.test/api/bands/99999/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fan@example.com' }),
    })
    const res = await followHandler.onRequestPost({ request: req, env, params: { name: '99999' }, waitUntil })
    expect(res.status).toBe(404)
  })
})
