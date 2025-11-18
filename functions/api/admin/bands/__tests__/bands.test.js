import { describe, it, expect } from 'vitest'
import { createTestEnv, insertEvent, insertVenue, insertBand } from '../../../test-utils'
import * as bandsHandler from '../../bands.js'
import * as bandIdHandler from '../[id].js'
import * as bulkHandler from '../bulk.js'
import * as bulkPreviewHandler from '../bulk-preview.js'

describe('Admin bands API - CRUD operations', () => {
  it('can create a band for an event', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'BandEvent', slug: 'band-event' })
    const venue = insertVenue(rawDb, { name: 'Main Venue' })
    const body = { eventId: ev.id, venueId: venue.id, name: 'New Band', startTime: '18:00', endTime: '19:00' }

    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

    const res = await bandsHandler.onRequestPost({ request, env })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.band).toHaveProperty('id')
    expect(data.band.name).toBe('New Band')
  })

  it('GET /api/admin/bands?event_id returns bands with venue and event names', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ListEvent', slug: 'list-event' })
    const venue = insertVenue(rawDb, { name: 'List Venue' })
    const band = insertBand(rawDb, { name: 'List Band', event_id: ev.id, venue_id: venue.id })

    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`)
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env })
    expect(getRes.status).toBe(200)
    const list = await getRes.json()
    expect(list.bands.length).toBeGreaterThan(0)
    expect(list.bands[0]).toHaveProperty('venue_name')
    expect(list.bands[0]).toHaveProperty('event_name')
  })

  it('PUT /api/admin/bands/{id} updates band name', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'UpdateEvent', slug: 'update-event' })
    const venue = insertVenue(rawDb, { name: 'Update Venue' })
    const band = insertBand(rawDb, { name: 'Old Name', event_id: ev.id, venue_id: venue.id })

    const body = { name: 'New Name' }
    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandIdHandler.onRequestPut({ request, env })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.band.name).toBe('New Name')
  })

  it('DELETE /api/admin/bands/{id} removes band', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'DeleteEvent', slug: 'delete-event' })
    const venue = insertVenue(rawDb, { name: 'Delete Venue' })
    const band = insertBand(rawDb, { name: 'Delete Me', event_id: ev.id, venue_id: venue.id })

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'DELETE',
      headers: { ...headers },
    })

    const res = await bandIdHandler.onRequestDelete({ request, env })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBeTruthy()
  })
})

describe('Admin bands API - Validation', () => {
  it('create validation fails when name is missing', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ValEvent', slug: 'val-event' })
    const venue = insertVenue(rawDb, { name: 'Val Venue' })

    const body = { eventId: ev.id, venueId: venue.id, startTime: '18:00', endTime: '19:00' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Validation error')
  })

  it('create validation fails when event band missing venue/times', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'MissingEvent', slug: 'missing-event' })

    const body = { eventId: ev.id, name: 'Incomplete Band' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.message).toContain('venueId, startTime, and endTime are required')
  })

  it('create validation fails with invalid time format', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'TimeEvent', slug: 'time-event' })
    const venue = insertVenue(rawDb, { name: 'Time Venue' })

    const body = { eventId: ev.id, venueId: venue.id, name: 'Bad Time', startTime: '6pm', endTime: '19:00' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.message).toContain('Invalid start time format')
  })

  it('create validation fails when end time before start time', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'OrderEvent', slug: 'order-event' })
    const venue = insertVenue(rawDb, { name: 'Order Venue' })

    const body = { eventId: ev.id, venueId: venue.id, name: 'Bad Order', startTime: '19:00', endTime: '18:00' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.message).toContain('End time must be after start time')
  })

  it('duplicate band name returns 409', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'DupEvent', slug: 'dup-event' })
    const venue = insertVenue(rawDb, { name: 'Dup Venue' })

    const body = {
      eventId: ev.id,
      venueId: venue.id,
      name: "SameBand",
      startTime: "18:00",
      endTime: "19:00",
    }
    const req1 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
    const r1 = await bandsHandler.onRequestPost({ request: req1, env })
    expect(r1.status).toBe(201)

    const req2 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
    const r2 = await bandsHandler.onRequestPost({ request: req2, env })
    expect(r2.status).toBe(409)
  })

  it('update returns 404 for non-existent band', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const body = { name: 'Updated Name' }
    const request = new Request('https://example.test/api/admin/bands/99999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandIdHandler.onRequestPut({ request, env })
    expect(res.status).toBe(404)
  })

  it('delete returns 404 for non-existent band', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/99999', {
      method: 'DELETE',
      headers: { ...headers },
    })

    const res = await bandIdHandler.onRequestDelete({ request, env })
    expect(res.status).toBe(404)
  })
})

describe('Admin bands API - Conflicts', () => {
  it('conflict detection finds overlapping times at the same venue', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ConflictEvent', slug: 'conflict-event' })
    const venue = insertVenue(rawDb, { name: 'Conflict Venue' })

    // Existing band
    const band1 = insertBand(rawDb, { name: 'Band One', event_id: ev.id, venue_id: venue.id, start_time: '18:00', end_time: '19:00' })

    // Overlapping band
    const body2 = { eventId: ev.id, venueId: venue.id, name: 'Band Two', startTime: '18:30', endTime: '19:30' }
    const req2 = new Request('https://example.test/api/admin/bands', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body2)
    })
    const r2 = await bandsHandler.onRequestPost({ request: req2, env })
    expect(r2.status).toBe(201)
    const data2 = await r2.json()
    expect(data2.conflicts).toBeDefined()
    expect(data2.conflicts.length).toBeGreaterThan(0)
  })
})

describe('Admin bands API - Bulk operations', () => {
  it('PATCH /api/admin/bands/bulk deletes multiple bands', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'BulkEvent', slug: 'bulk-event' })
    const venue = insertVenue(rawDb, { name: 'Bulk Venue' })
    const band1 = insertBand(rawDb, { name: 'Bulk1', event_id: ev.id, venue_id: venue.id })
    const band2 = insertBand(rawDb, { name: 'Bulk2', event_id: ev.id, venue_id: venue.id })

    const body = { band_ids: [band1.id, band2.id], action: 'delete' }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBeTruthy()
    expect(data.updated).toBe(2)
  })

  it('bulk preview returns changes and conflicts', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'PreviewEvent', slug: 'preview-event' })
    const venue = insertVenue(rawDb, { name: 'Preview Venue' })
    const band1 = insertBand(rawDb, { name: 'Preview1', event_id: ev.id, venue_id: venue.id })

    const body = { band_ids: [band1.id], action: 'delete' }
    const request = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkPreviewHandler.onRequestPost({ request, env })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.changes).toBeDefined()
    expect(data.conflicts).toBeDefined()
  })
})
