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
})
