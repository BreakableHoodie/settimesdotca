import { describe, it, expect } from 'vitest'
import { createTestEnv, insertEvent, insertVenue, insertBand } from '../../../test-utils'
import * as bandIdHandler from '../[id].js'

describe('PATCH /api/admin/bands/:id - announce toggle', () => {
  it('announces a performance (sets is_announced=1)', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-announce' })
    const venue = insertVenue(rawDb, { name: 'Venue X' })
    const band = insertBand(rawDb, { name: 'Test Band', event_id: ev.id, venue_id: venue.id })
    rawDb.prepare('UPDATE performances SET is_announced=0 WHERE id=?').run(band.id)

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.performance.is_announced).toBe(1)

    const row = rawDb.prepare('SELECT is_announced FROM performances WHERE id=?').get(band.id)
    expect(row.is_announced).toBe(1)
  })

  it('unannounces a performance (sets is_announced=0)', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-unannounce' })
    const venue = insertVenue(rawDb, { name: 'Venue Y' })
    const band = insertBand(rawDb, { name: 'Visible Band', event_id: ev.id, venue_id: venue.id })

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: false }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.performance.is_announced).toBe(0)
  })

  it('returns 400 if is_announced is missing from body', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-bad' })
    const band = insertBand(rawDb, { name: 'Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ unrelated: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(400)
  })

  it('requires at least editor role', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'viewer' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-auth' })
    const band = insertBand(rawDb, { name: 'Band', event_id: ev.id })

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'viewer', id: 3 } },
    })

    expect(res.status).toBe(403)
  })

  it('sets band_follow_notified=1 when band is announced and followers exist', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    env.EMAIL_PROVIDER = 'mailchannels'
    env.EMAIL_FROM = 'noreply@settimes.ca'
    // Stub fetch so sendEmail resolves without a real network call.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202 }))

    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-notify' })
    rawDb.prepare('UPDATE events SET reveal_mode=1 WHERE id=?').run(ev.id)
    const venue = insertVenue(rawDb, { name: 'Venue N' })
    const band = insertBand(rawDb, { name: 'Notify Band', event_id: ev.id, venue_id: venue.id })
    rawDb.prepare('UPDATE performances SET is_announced=0 WHERE id=?').run(band.id)

    rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('follower@example.com', band.band_profile_id, 'unsub-token-1')

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: true }),
    })
    await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    vi.unstubAllGlobals()

    const row = rawDb.prepare('SELECT band_follow_notified FROM performances WHERE id=?').get(band.id)
    expect(row.band_follow_notified).toBe(1)
  })

  it('does not set band_follow_notified when no followers exist', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-nofollowers' })
    const band = insertBand(rawDb, { name: 'No Followers Band', event_id: ev.id })
    rawDb.prepare('UPDATE performances SET is_announced=0 WHERE id=?').run(band.id)
    // No rows in band_follows for this band

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(200)
    const row = rawDb.prepare('SELECT band_follow_notified FROM performances WHERE id=?').get(band.id)
    // Flag should remain 0 since there were no followers — future followers will still be notified
    expect(row.band_follow_notified).toBe(0)
  })

  it('does not set band_follow_notified again if band was already notified', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Vol6', slug: 'vol6-renotify' })
    const band = insertBand(rawDb, { name: 'Already Notified', event_id: ev.id })
    rawDb.prepare('UPDATE performances SET is_announced=0, band_follow_notified=1 WHERE id=?').run(band.id)

    rawDb.prepare(
      'INSERT INTO band_follows (email, band_profile_id, verified, unsubscribe_token) VALUES (?, ?, 1, ?)'
    ).run('follower2@example.com', band.band_profile_id, 'unsub-token-2')

    const req = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ is_announced: true }),
    })
    const res = await bandIdHandler.onRequestPatch({
      request: req,
      env,
      data: { user: { role: 'editor', id: 2 } },
    })

    expect(res.status).toBe(200)
    const row = rawDb.prepare('SELECT band_follow_notified FROM performances WHERE id=?').get(band.id)
    expect(row.band_follow_notified).toBe(1)
  })
})
