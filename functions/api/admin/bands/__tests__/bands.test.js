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

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
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

    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers })
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: 'editor' } } })
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

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: 'editor' } } })
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

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBeTruthy()
  })
})

describe('Admin bands API - Validation', () => {
  it('create rejects performances for archived events', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ArchivedAdd', slug: 'archived-add', status: 'archived', is_published: 0 })
    const venue = insertVenue(rawDb, { name: 'Archive Venue' })

    const body = { eventId: ev.id, venueId: venue.id, name: 'Too Late Band', startTime: '18:00', endTime: '19:00' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Validation error')
  })

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

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Missing required fields')
  })

  it('create succeeds for event band without venue or times (TBD lineup)', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'MissingEvent', slug: 'missing-event' })

    const body = { eventId: ev.id, name: 'TBD Band' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.band.name).toBe('TBD Band')
  })

  it('create succeeds for event band with venue but no times', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'NoTimeEvent', slug: 'no-time-event' })
    const venue = insertVenue(rawDb, { name: 'No Time Venue' })

    const body = { eventId: ev.id, venueId: venue.id, name: 'No Time Band' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(201)
  })

  it('GET with event_id returns null-venue performances', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'NullVenueEvent', slug: 'null-venue-event' })

    // Insert a band (performance) without a venue or times
    const bandBody = { eventId: ev.id, name: 'TBD Venue Band' }
    const postReq = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(bandBody),
    })
    await bandsHandler.onRequestPost({ request: postReq, env, data: { user: { role: 'editor' } } })

    const getReq = new Request(`https://example.test/api/admin/bands?event_id=${ev.id}`, { headers })
    const getRes = await bandsHandler.onRequestGet({ request: getReq, env, data: { user: { role: 'editor' } } })
    expect(getRes.status).toBe(200)
    const list = await getRes.json()
    expect(list.bands.length).toBe(1)
    expect(list.bands[0].venue_name).toBeNull()
    expect(list.bands[0].start_time).toBeNull()
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

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.message).toContain('Time must be in HH:MM format')
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

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
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
    const r1 = await bandsHandler.onRequestPost({ request: req1, env, data: { user: { role: 'editor' } } })
    expect(r1.status).toBe(201)

    const req2 = new Request("https://example.test/api/admin/bands", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    })
    const r2 = await bandsHandler.onRequestPost({ request: req2, env, data: { user: { role: 'editor' } } })
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

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(404)
  })

  it('update rejects performances for archived events', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ArchivedUpdate', slug: 'archived-update', status: 'archived', is_published: 0 })
    const venue = insertVenue(rawDb, { name: 'Archive Update Venue' })
    const band = insertBand(rawDb, { name: 'Frozen Band', event_id: ev.id, venue_id: venue.id })

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name: 'Renamed Frozen Band' }),
    })

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Validation error')
  })

  it('delete returns 404 for non-existent band', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/99999', {
      method: 'DELETE',
      headers: { ...headers },
    })

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(404)
  })

  it('delete rejects performances for archived events', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ArchivedDelete', slug: 'archived-delete', status: 'archived', is_published: 0 })
    const venue = insertVenue(rawDb, { name: 'Archive Delete Venue' })
    const band = insertBand(rawDb, { name: 'Protected Band', event_id: ev.id, venue_id: venue.id })

    const request = new Request(`https://example.test/api/admin/bands/${band.id}`, {
      method: 'DELETE',
      headers: { ...headers },
    })

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Validation error')
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
    const r2 = await bandsHandler.onRequestPost({ request: req2, env, data: { user: { role: 'editor' } } })
    expect(r2.status).toBe(409)
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

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBeTruthy()
    expect(data.updated).toBe(2)
  })

  it('PATCH /api/admin/bands/bulk rejects archived event performances', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Archived Bulk', slug: 'archived-bulk', status: 'archived', is_published: 0 })
    const venue = insertVenue(rawDb, { name: 'Archived Bulk Venue' })
    const band = insertBand(rawDb, { name: 'Locked Bulk Band', event_id: ev.id, venue_id: venue.id })

    const body = { band_ids: [band.id], action: 'delete' }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Validation error')
  })

  it('DELETE /api/admin/bands/bulk rejects archived event performances', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Archived Bulk Delete', slug: 'archived-bulk-delete', status: 'archived', is_published: 0 })
    const venue = insertVenue(rawDb, { name: 'Archived Bulk Delete Venue' })
    const band = insertBand(rawDb, { name: 'Locked Delete Band', event_id: ev.id, venue_id: venue.id })

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [band.id] }),
    })

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Validation error')
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

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.changes).toBeDefined()
    expect(data.conflicts).toBeDefined()
  })

  it('bulk preview flags archived event performances as conflicts', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'Archived Preview', slug: 'archived-preview', status: 'archived', is_published: 0 })
    const venue = insertVenue(rawDb, { name: 'Archived Preview Venue' })
    const band = insertBand(rawDb, { name: 'Preview Locked Band', event_id: ev.id, venue_id: venue.id })

    const request = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [band.id], action: 'delete' }),
    })

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.conflicts.some(conflict => conflict.message.includes('archived event'))).toBe(true)
    expect(data.changes).toHaveLength(0)
  })

  it('bulk change_time preserves duration for after-midnight sets', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'MidnightEvent', slug: 'midnight-event' })
    const venue = insertVenue(rawDb, { name: 'Midnight Venue' })
    // 23:40–00:10 = 30 minute set crossing midnight
    const band = insertBand(rawDb, { name: 'Midnight Band', event_id: ev.id, venue_id: venue.id, start_time: '23:40', end_time: '00:10' })

    const body = { band_ids: [band.id], action: 'change_time', start_time: '23:00' }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)

    // Shifting 23:40 → 23:00 should shift end 00:10 → 23:30 (30 min duration preserved)
    const updated = rawDb.prepare('SELECT start_time, end_time FROM performances WHERE id = ?').get(band.id)
    expect(updated.start_time).toBe('23:00')
    expect(updated.end_time).toBe('23:30')
  })

  it('bulk change_time preserves duration for a set that shifts across midnight', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ShiftEvent', slug: 'shift-event' })
    const venue = insertVenue(rawDb, { name: 'Shift Venue' })
    // 22:00–23:00 = 60 minute same-day set
    const band = insertBand(rawDb, { name: 'Shift Band', event_id: ev.id, venue_id: venue.id, start_time: '22:00', end_time: '23:00' })

    const body = { band_ids: [band.id], action: 'change_time', start_time: '23:30' }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)

    // Shifting 22:00 → 23:30 should end at 00:30 (60 min duration)
    const updated = rawDb.prepare('SELECT start_time, end_time FROM performances WHERE id = ?').get(band.id)
    expect(updated.start_time).toBe('23:30')
    expect(updated.end_time).toBe('00:30')
  })

  it('bulk change_time rejects invalid start_time format', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ValidateEvent', slug: 'validate-event' })
    const venue = insertVenue(rawDb, { name: 'Validate Venue' })
    const band = insertBand(rawDb, { name: 'Validate Band', event_id: ev.id, venue_id: venue.id, start_time: '18:00', end_time: '19:00' })

    const body = { band_ids: [band.id], action: 'change_time', start_time: '6pm' }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
  })

  it('bulk move_venue rejects non-existent venue_id', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'VenueCheckEvent', slug: 'venue-check-event' })
    const venue = insertVenue(rawDb, { name: 'Venue Check' })
    const band = insertBand(rawDb, { name: 'Venue Check Band', event_id: ev.id, venue_id: venue.id })

    const body = { band_ids: [band.id], action: 'move_venue', venue_id: 99999 }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(404)
  })

  it('bulk PATCH returns 400 for malformed JSON body', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: 'not valid json{{{',
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
  })

  it('conflict detection returns type field distinguishing overlap from exact conflict', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'TypeEvent', slug: 'type-event' })
    const venue = insertVenue(rawDb, { name: 'Type Venue' })
    insertBand(rawDb, { name: 'Band Exact', event_id: ev.id, venue_id: venue.id, start_time: '18:00', end_time: '19:00' })

    // Exact conflict — same time slot
    const exactBody = { eventId: ev.id, venueId: venue.id, name: 'Band Exact Copy', startTime: '18:00', endTime: '19:00' }
    const exactReq = new Request('https://example.test/api/admin/bands', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(exactBody)
    })
    const exactRes = await bandsHandler.onRequestPost({ request: exactReq, env, data: { user: { role: 'editor' } } })
    expect(exactRes.status).toBe(409)
    const exactData = await exactRes.json()
    expect(exactData.conflicts[0].type).toBe('conflict')

    // Overlap — partial overlap
    const overlapBody = { eventId: ev.id, venueId: venue.id, name: 'Band Overlapper', startTime: '18:30', endTime: '19:30' }
    const overlapReq = new Request('https://example.test/api/admin/bands', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(overlapBody)
    })
    const overlapRes = await bandsHandler.onRequestPost({ request: overlapReq, env, data: { user: { role: 'editor' } } })
    expect(overlapRes.status).toBe(409)
    const overlapData = await overlapRes.json()
    expect(overlapData.conflicts[0].type).toBe('overlap')
  })

  it('move_venue preview detects overlap between two batch members moving to the same venue', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'BatchOverlapEvent', slug: 'batch-overlap-event' })
    const sourceA = insertVenue(rawDb, { name: 'Source A' })
    const sourceB = insertVenue(rawDb, { name: 'Source B' })
    const target = insertVenue(rawDb, { name: 'Target Venue' })
    // Two bands at different venues, overlapping times — moving both to the same target venue
    const bandA = insertBand(rawDb, { name: 'Batch A', event_id: ev.id, venue_id: sourceA.id, start_time: '21:00', end_time: '22:00' })
    const bandB = insertBand(rawDb, { name: 'Batch B', event_id: ev.id, venue_id: sourceB.id, start_time: '21:30', end_time: '22:30' })

    const req = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [bandA.id, bandB.id], action: 'move_venue', venue_id: target.id }),
    })
    const res = await bulkPreviewHandler.onRequestPost({ request: req, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.conflicts.some(c => c.band_id === bandA.id && c.type === 'overlap')).toBe(true)
    expect(data.conflicts.some(c => c.band_id === bandB.id && c.type === 'overlap')).toBe(true)
  })

  it('move_venue preview detects exact conflict when two batch members have identical times', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'BatchExactEvent', slug: 'batch-exact-event' })
    const sourceA = insertVenue(rawDb, { name: 'Exact Source A' })
    const sourceB = insertVenue(rawDb, { name: 'Exact Source B' })
    const target = insertVenue(rawDb, { name: 'Exact Target' })
    // Same time slot at different venues — should become an exact conflict when co-located
    const bandA = insertBand(rawDb, { name: 'Exact A', event_id: ev.id, venue_id: sourceA.id, start_time: '21:00', end_time: '22:00' })
    const bandB = insertBand(rawDb, { name: 'Exact B', event_id: ev.id, venue_id: sourceB.id, start_time: '21:00', end_time: '22:00' })

    const req = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [bandA.id, bandB.id], action: 'move_venue', venue_id: target.id }),
    })
    const res = await bulkPreviewHandler.onRequestPost({ request: req, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.conflicts.some(c => c.band_id === bandA.id && c.type === 'conflict')).toBe(true)
    expect(data.conflicts.some(c => c.band_id === bandB.id && c.type === 'conflict')).toBe(true)
  })

  it('change_time preview detects conflict between two batch members at the same venue+event after time shift', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ChangeTimeBatchEvent', slug: 'change-time-batch-event' })
    const venue = insertVenue(rawDb, { name: 'Shared Venue' })
    // Two bands at the same venue+event with different durations — moving both to the same start time
    const bandA = insertBand(rawDb, { name: 'CT Band A', event_id: ev.id, venue_id: venue.id, start_time: '20:00', end_time: '21:00' })  // 60 min
    const bandB = insertBand(rawDb, { name: 'CT Band B', event_id: ev.id, venue_id: venue.id, start_time: '20:00', end_time: '21:30' })  // 90 min

    // Both shifted to 23:00 → A: 23:00-00:00, B: 23:00-00:30 → overlap
    const req = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [bandA.id, bandB.id], action: 'change_time', start_time: '23:00' }),
    })
    const res = await bulkPreviewHandler.onRequestPost({ request: req, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()

    expect(data.conflicts.some(c => c.band_id === bandA.id && (c.type === 'overlap' || c.type === 'conflict'))).toBe(true)
    expect(data.conflicts.some(c => c.band_id === bandB.id && (c.type === 'overlap' || c.type === 'conflict'))).toBe(true)
  })
})

describe('Admin bands API - Atomicity (P0-B1, P1-B6)', () => {
  it('cleans up newly created band_profile if performance insert fails', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'AtomicEvent', slug: 'atomic-event' })
    const venue = insertVenue(rawDb, { name: 'Atomic Venue' })

    // Make the performance INSERT throw to simulate a DB failure mid-creation
    const originalPrepare = env.DB.prepare.bind(env.DB)
    env.DB.prepare = sql => {
      if (sql.includes('INSERT INTO performances')) {
        return { bind: () => ({ first: () => { throw new Error('simulated D1 constraint failure') } }) }
      }
      return originalPrepare(sql)
    }

    const body = { eventId: ev.id, venueId: venue.id, name: 'NewOrphanBand', startTime: '18:00', endTime: '19:00' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(500)

    // The newly created band_profile must have been cleaned up
    const orphan = rawDb.prepare('SELECT id FROM band_profiles WHERE name_normalized = ?').get('neworphanband')
    expect(orphan).toBeUndefined()
  })

  it('does not delete an existing band_profile if performance insert fails', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ExistingProfileEvent', slug: 'existing-profile-event' })
    const venue = insertVenue(rawDb, { name: 'EP Venue' })

    // Pre-create the band profile so it already exists when the POST runs
    rawDb.prepare('INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)').run('ExistingArtist', 'existingartist')

    // Make the performance INSERT throw
    const originalPrepare = env.DB.prepare.bind(env.DB)
    env.DB.prepare = sql => {
      if (sql.includes('INSERT INTO performances')) {
        return { bind: () => ({ first: () => { throw new Error('simulated failure') } }) }
      }
      return originalPrepare(sql)
    }

    const body = { eventId: ev.id, venueId: venue.id, name: 'ExistingArtist', startTime: '20:00', endTime: '21:00' }
    const request = new Request('https://example.test/api/admin/bands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    await bandsHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })

    // Pre-existing profile must still be there — we must NOT delete profiles we didn't create
    const profile = rawDb.prepare('SELECT id FROM band_profiles WHERE name_normalized = ?').get('existingartist')
    expect(profile).toBeDefined()
  })
})

describe('Admin bands API - Input validation (P1-S2)', () => {
  it('bulk PATCH rejects non-integer band_ids (string injection)', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'InjEvent', slug: 'inj-event' })
    const venue = insertVenue(rawDb, { name: 'InjVenue' })

    const body = { band_ids: ['1; DROP TABLE performances; --'], action: 'delete' }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/invalid/i)
  })

  it('bulk PATCH rejects floating-point band_ids', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const body = { band_ids: [1.5, 2.9], action: 'delete' }
    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkHandler.onRequestPatch({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
  })

  it('bulk-preview rejects non-integer band_ids', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const body = { band_ids: ['not-an-id'], action: 'delete' }
    const request = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
  })
})

describe('Admin bands API - Bulk DELETE profile IDs (P1-B4, P1-B7)', () => {
  it('bulk DELETE correctly removes a profile that has no performances', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const profileInfo = rawDb.prepare('INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)').run('Orphan Artist', 'orphanartist')
    const profileId = profileInfo.lastInsertRowid

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [`profile_${profileId}`] }),
    })

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.deletedCount).toBe(1)
    expect(rawDb.prepare('SELECT id FROM band_profiles WHERE id = ?').get(profileId)).toBeUndefined()
  })

  it('bulk DELETE blocks profile deletion when it has existing performances', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'HasPerfEvent', slug: 'has-perf-event' })
    const band = insertBand(rawDb, { name: 'Busy Artist', event_id: ev.id })
    const profileId = band.band_profile_id

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [`profile_${profileId}`] }),
    })

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.deletedCount).toBe(0)
    expect(data.errors).toBeDefined()
    expect(data.errors.length).toBeGreaterThan(0)
    expect(rawDb.prepare('SELECT id FROM band_profiles WHERE id = ?').get(profileId)).toBeDefined()
  })

  it('bulk DELETE with non-integer profile ID reports an error instead of silently succeeding', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: ['profile_not_a_number'] }),
    })

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.deletedCount).toBe(0)
    expect(data.errors).toBeDefined()
    expect(data.errors.length).toBeGreaterThan(0)
  })
})

describe('Admin bands API - Bulk POST add profiles (P1-B5)', () => {
  it('POST bulk add correctly adds multiple profiles to a lineup', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'BulkAddEvent', slug: 'bulk-add-event' })
    const p1 = rawDb.prepare('INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)').run('Roster One', 'rosterone')
    const p2 = rawDb.prepare('INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)').run('Roster Two', 'rostertwo')

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_profile_ids: [p1.lastInsertRowid, p2.lastInsertRowid], event_id: ev.id }),
    })

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.added.length).toBe(2)
    expect(data.skipped.length).toBe(0)

    const perfs = rawDb.prepare('SELECT id FROM performances WHERE event_id = ?').all(ev.id)
    expect(perfs.length).toBe(2)
  })

  it('POST bulk add skips a profile already in the event and reports it', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'SkipAddEvent', slug: 'skip-add-event' })
    const band = insertBand(rawDb, { name: 'Already There', event_id: ev.id })

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_profile_ids: [band.band_profile_id], event_id: ev.id }),
    })

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.added.length).toBe(0)
    expect(data.skipped.length).toBe(1)
  })

  it('POST bulk add handles duplicate profile IDs — adds once, skips the second', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'DupAddEvent', slug: 'dup-add-event' })
    const profileInfo = rawDb.prepare('INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)').run('Dup Artist', 'dupartist')
    const profileId = profileInfo.lastInsertRowid

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_profile_ids: [profileId, profileId], event_id: ev.id }),
    })

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.added.length).toBe(1)
    expect(data.skipped.length).toBe(1)

    const perfs = rawDb.prepare('SELECT id FROM performances WHERE band_profile_id = ? AND event_id = ?').all(profileId, ev.id)
    expect(perfs.length).toBe(1)
  })
})

describe('Admin bands API - profile_abc integer validation in [id].js (P1-B7)', () => {
  it('PUT /bands/profile_not_a_number returns 400 for non-integer profile ID', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/profile_not_a_number', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name: 'Anything' }),
    })

    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/bad request/i)
  })

  it('DELETE /bands/profile_not_a_number returns 400 for non-integer profile ID', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/profile_not_a_number', {
      method: 'DELETE',
      headers: { ...headers },
    })

    const res = await bandIdHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/bad request/i)
  })
})

describe('Admin bands API - Malformed JSON body (P2-B9)', () => {
  it('bulk DELETE returns 400 for malformed JSON body', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: 'not json{{{',
    })

    const res = await bulkHandler.onRequestDelete({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/invalid/i)
  })

  it('bulk-preview returns 400 for malformed JSON body', async () => {
    const { env, headers } = createTestEnv({ role: 'editor' })

    const request = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: 'not json{{{',
    })

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/invalid/i)
  })
})

describe('Admin bands API - bulk-preview after-midnight conflict detection (T2/VL-1b)', () => {
  it('move_venue detects overlap with an after-midnight band at the target venue', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'MidnightConflictEvent', slug: 'midnight-conflict' })
    const sourceVenue = insertVenue(rawDb, { name: 'Source Venue' })
    const targetVenue = insertVenue(rawDb, { name: 'Target Venue' })

    // Existing band at target venue: 23:30–00:30 (crosses midnight)
    insertBand(rawDb, {
      name: 'Midnight Resident',
      event_id: ev.id,
      venue_id: targetVenue.id,
      start_time: '23:30',
      end_time: '00:30',
    })

    // Band we want to move to that venue: 23:50–01:00 — overlaps midnight resident
    const movingBand = insertBand(rawDb, {
      name: 'Moving Band',
      event_id: ev.id,
      venue_id: sourceVenue.id,
      start_time: '23:50',
      end_time: '01:00',
    })

    const request = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [movingBand.id], action: 'move_venue', venue_id: targetVenue.id }),
    })

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    // Must detect the overlap — HH:MM string comparison would miss this entirely
    expect(data.conflicts.length).toBeGreaterThan(0)
    expect(data.conflicts.some(c => c.message.includes('Midnight Resident'))).toBe(true)
  })

  it('change_time detects overlap with an after-midnight band at same venue', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'ChangeTimeMidnight', slug: 'change-time-midnight' })
    const venue = insertVenue(rawDb, { name: 'Midnight Venue 2' })

    // Existing band: 23:00–00:00
    insertBand(rawDb, {
      name: 'Late Night Band',
      event_id: ev.id,
      venue_id: venue.id,
      start_time: '23:00',
      end_time: '00:00',
    })

    // Band being moved: currently 21:00–22:00, being moved to 23:30 (new end: 00:30)
    const movingBand = insertBand(rawDb, {
      name: 'Shifting Band',
      event_id: ev.id,
      venue_id: venue.id,
      start_time: '21:00',
      end_time: '22:00',
    })

    const request = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [movingBand.id], action: 'change_time', start_time: '23:30' }),
    })

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.conflicts.length).toBeGreaterThan(0)
    expect(data.conflicts.some(c => c.message.includes('Late Night Band'))).toBe(true)
  })
})

describe('Admin bands API - PUT conflict self-exclusion (T3)', () => {
  it('PUT update does not conflict with the band being updated (self-exclusion)', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'SelfExEvent', slug: 'self-ex-event' })
    const venue = insertVenue(rawDb, { name: 'SelfEx Venue' })
    const bandA = insertBand(rawDb, { name: 'Band A', event_id: ev.id, venue_id: venue.id, start_time: '22:00', end_time: '23:00' })

    // Update Band A to the exact same time — must not conflict with itself
    const request = new Request(`https://example.test/api/admin/bands/${bandA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ startTime: '22:00', endTime: '23:00' }),
    })
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
  })

  it('PUT update conflicts with a different band at the same venue', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'CrossConflictEvent', slug: 'cross-conflict-event' })
    const venue = insertVenue(rawDb, { name: 'CrossConflict Venue' })
    insertBand(rawDb, { name: 'Band B', event_id: ev.id, venue_id: venue.id, start_time: '23:00', end_time: '00:00' })
    const bandA = insertBand(rawDb, { name: 'Band A', event_id: ev.id, venue_id: venue.id, start_time: '22:00', end_time: '23:00' })

    // Move Band A to 22:30–23:30 — overlaps with Band B
    const request = new Request(`https://example.test/api/admin/bands/${bandA.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ startTime: '22:30', endTime: '23:30' }),
    })
    const res = await bandIdHandler.onRequestPut({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(409)
  })
})

describe('Admin bands API - Bulk POST onRequestPost full flow (T6)', () => {
  it('POST bulk add skips archived events and reports it as a conflict', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const archivedEvent = insertEvent(rawDb, { name: 'Archived Event', slug: 'archived-event', status: 'archived', is_published: 0 })
    const venue = insertVenue(rawDb, { name: 'Venue A' })
    const band = insertBand(rawDb, { name: 'Archived Band', event_id: archivedEvent.id, venue_id: venue.id })

    const request = new Request('https://example.test/api/admin/bands/bulk-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_ids: [band.id], action: 'move_venue', venue_id: venue.id }),
    })

    const res = await bulkPreviewHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect(res.status).toBe(200)
    const data = await res.json()
    // archived band → changes list is empty, conflict reported
    expect(data.changes).toHaveLength(0)
    expect(data.conflicts.some(c => c.message.includes('archived event'))).toBe(true)
  })

  it('POST bulk add to an event correctly deduplicates and skips already-in-event profiles', async () => {
    const { env, rawDb, headers } = createTestEnv({ role: 'editor' })
    const ev = insertEvent(rawDb, { name: 'DedupeFullEvent', slug: 'dedupe-full-event' })
    const p1 = rawDb.prepare('INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)').run('Unique Roster', 'uniqueroster')
    // p2 is already in the event
    const p2info = rawDb.prepare('INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)').run('Already In', 'alreadyin')
    rawDb.prepare('INSERT INTO performances (band_profile_id, event_id) VALUES (?, ?)').run(p2info.lastInsertRowid, ev.id)

    const request = new Request('https://example.test/api/admin/bands/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ band_profile_ids: [p1.lastInsertRowid, p2info.lastInsertRowid], event_id: ev.id }),
    })

    const res = await bulkHandler.onRequestPost({ request, env, data: { user: { role: 'editor' } } })
    expect([200, 201]).toContain(res.status)
    const data = await res.json()
    expect(data.added.length).toBe(1)
    expect(data.skipped.length).toBe(1)
  })
})
