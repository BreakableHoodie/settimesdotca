import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { onRequestGet } from '../public.js'
import { MockD1Database } from '../../subscriptions/__tests__/mocks/d1.js'
import { createMockEvent, createMockVenue, createMockBand, seedMockData } from './helpers.js'

describe('GET /api/events/public', () => {
  let mockDB
  let mockEnv

  beforeEach(() => {
    mockDB = new MockD1Database()
    mockEnv = { DB: mockDB }
    
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return all events with venue and band details', async () => {
    const event = createMockEvent()
    const venue = createMockVenue()
    const band = createMockBand()
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/events/public')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.events).toBeInstanceOf(Array)
    expect(data.events).toHaveLength(1)
    expect(data.events[0]).toMatchObject({
      id: 1,
      name: 'Long Weekend Band Crawl 2024',
      city: 'portland'
    })
    expect(data.events[0].band_count).toBeGreaterThan(0)
    expect(data.events[0].venue_count).toBeGreaterThan(0)
  })

  it('should filter by city parameter', async () => {
    const event1 = createMockEvent({ id: 1, city: 'portland' })
    const event2 = createMockEvent({ id: 2, city: 'seattle', name: 'Seattle Showcase' })
    const venue = createMockVenue()
    const band1 = createMockBand({ id: 1 })
    const band2 = createMockBand({ id: 2, event_id: 2 })
    
    seedMockData(mockDB, [event1, event2], [venue], [band1, band2])

    const request = new Request('http://localhost/api/events/public?city=portland')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.events).toHaveLength(1)
    expect(data.events[0].city).toBe('portland')
    expect(data.filters.city).toBe('portland')
  })

  it('should filter by genre parameter', async () => {
    const event = createMockEvent()
    const venue = createMockVenue()
    const punkBand = createMockBand({ id: 1, genre: 'punk', name: 'Punk Band' })
    const indieBand = createMockBand({ id: 2, genre: 'indie', name: 'Indie Band' })
    
    seedMockData(mockDB, [event], [venue], [punkBand, indieBand])

    const request = new Request('http://localhost/api/events/public?genre=punk')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.filters.genre).toBe('punk')
    // Should still return the event but filtered by genre
    expect(data.events).toBeInstanceOf(Array)
  })

  it('should combine city and genre filters', async () => {
    const portlandEvent = createMockEvent({ id: 1, city: 'portland' })
    const seattleEvent = createMockEvent({ id: 2, city: 'seattle', name: 'Seattle Showcase' })
    const venue = createMockVenue()
    const punkBand = createMockBand({ id: 1, event_id: 1, genre: 'punk' })
    const indieBand = createMockBand({ id: 2, event_id: 2, genre: 'indie' })
    
    seedMockData(mockDB, [portlandEvent, seattleEvent], [venue], [punkBand, indieBand])

    const request = new Request('http://localhost/api/events/public?city=portland&genre=punk')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.filters.city).toBe('portland')
    expect(data.filters.genre).toBe('punk')
  })

  it('should return empty array when no events match filters', async () => {
    seedMockData(mockDB, [], [], [])

    const request = new Request('http://localhost/api/events/public?city=nonexistent')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.events).toHaveLength(0)
    expect(data.count).toBe(0)
  })

  it('should return empty array for invalid city', async () => {
    const event = createMockEvent({ city: 'portland' })
    const venue = createMockVenue()
    const band = createMockBand()
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/events/public?city=invalidcity')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.events).toHaveLength(0)
  })

  it('should verify response includes all required fields', async () => {
    const event = createMockEvent()
    const venue = createMockVenue()
    const band = createMockBand()
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/events/public')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('events')
    expect(data).toHaveProperty('filters')
    expect(data).toHaveProperty('count')
    expect(data).toHaveProperty('generated_at')
    
    expect(data.filters).toHaveProperty('city')
    expect(data.filters).toHaveProperty('genre')
    expect(data.filters).toHaveProperty('upcoming')
    expect(data.filters).toHaveProperty('limit')
  })

  it('should sort events chronologically by date', async () => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dayAfter = new Date(today)
    dayAfter.setDate(dayAfter.getDate() + 2)
    
    const event1 = createMockEvent({ id: 1, date: dayAfter.toISOString().split('T')[0], name: 'Event 3' })
    const event2 = createMockEvent({ id: 2, date: tomorrow.toISOString().split('T')[0], name: 'Event 1' })
    const event3 = createMockEvent({ id: 3, date: tomorrow.toISOString().split('T')[0], name: 'Event 2' })
    
    const venue = createMockVenue()
    const band1 = createMockBand({ id: 1, event_id: 1 })
    const band2 = createMockBand({ id: 2, event_id: 2 })
    const band3 = createMockBand({ id: 3, event_id: 3 })
    
    seedMockData(mockDB, [event1, event2, event3], [venue], [band1, band2, band3])

    const request = new Request('http://localhost/api/events/public')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.events).toHaveLength(3)
    
    // Should be sorted by date ASC
    const dates = data.events.map(e => e.date)
    const sorted = [...dates].sort()
    expect(dates).toEqual(sorted)
  })
})
