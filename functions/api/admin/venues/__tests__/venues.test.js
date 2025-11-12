import { describe, it, expect } from 'vitest'
import { createTestEnv, insertVenue } from '../../../test-utils'
import * as venueIdHandler from '../[id].js'
import * as venuesHandler from '../../venues.js'

describe('Admin venues API', () => {
  it('can create a venue and then list it', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })

    const body = { name: 'The Roxy', address: '123 Main St' }
    const request = new Request('https://example.test/api/admin/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await venuesHandler.onRequestPost({ request, env })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.venue).toHaveProperty('id')

    // Now GET list
    const getReq = new Request('https://example.test/api/admin/venues')
    const getRes = await venuesHandler.onRequestGet({ request: getReq, env })
    expect(getRes.status).toBe(200)
    const list = await getRes.json()
    expect(list.venues.some(v => v.name === 'The Roxy')).toBeTruthy()
  })

  it('creating duplicate venue returns 409', async () => {
    const { env } = createTestEnv({ role: 'editor' })

    const body = { name: 'Duplicate Venue' }
    const req1 = new Request('https://example.test/api/admin/venues', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    const r1 = await venuesHandler.onRequestPost({ request: req1, env })
    expect(r1.status).toBe(201)

    const req2 = new Request('https://example.test/api/admin/venues', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    })
    const r2 = await venuesHandler.onRequestPost({ request: req2, env })
    expect(r2.status).toBe(409)
  })

  it('can update a venue and conflicts on duplicate name', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const v = insertVenue(rawDb, { name: 'Old Name' })

    const putReq = new Request(`https://example.test/api/admin/venues/${v.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ name: 'New Name', address: '55 Road' })
    })
    // handler is functions/api/admin/venues/[id].js
  const putRes = await venueIdHandler.onRequestPut({ request: putReq, env })
    expect(putRes.status).toBe(200)

    // Create another venue and attempt to rename to same name => 409
    const v2 = insertVenue(rawDb, { name: 'Taken' })
    const putReq2 = new Request(`https://example.test/api/admin/venues/${v.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ name: 'Taken' })
    })
  const putRes2 = await venueIdHandler.onRequestPut({ request: putReq2, env })
    expect(putRes2.status).toBe(409)
  })
})
