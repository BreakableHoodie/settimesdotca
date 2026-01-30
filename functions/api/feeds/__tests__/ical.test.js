import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { onRequestGet } from '../ical.js'
import { MockD1Database } from '../../subscriptions/__tests__/mocks/d1.js'

// Reuse helpers from events tests
import { createMockEvent, createMockVenue, createMockBand, seedMockData } from '../../events/__tests__/helpers.js'

describe('GET /api/feeds/ical', () => {
  let mockDB
  let mockEnv

  beforeEach(() => {
    mockDB = new MockD1Database()
    mockEnv = { DB: mockDB, PUBLIC_URL: 'https://settimes.example.com' }
    
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should generate valid iCal format with events', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const event = createMockEvent({ date: tomorrow.toISOString().split('T')[0] })
    const venue = createMockVenue()
    const band = createMockBand({ start_time: '20:00', end_time: '21:00' })
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/feeds/ical')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const icalData = await response.text()

    expect(response.status).toBe(200)
    expect(icalData).toContain('BEGIN:VCALENDAR')
    expect(icalData).toContain('END:VCALENDAR')
    expect(icalData).toContain('BEGIN:VEVENT')
    expect(icalData).toContain('END:VEVENT')
  })

  it('should return text/calendar Content-Type header', async () => {
    const event = createMockEvent()
    const venue = createMockVenue()
    const band = createMockBand()
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/feeds/ical')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8')
  })

  it('should include iCal headers VERSION, PRODID, CALSCALE', async () => {
    const event = createMockEvent()
    const venue = createMockVenue()
    const band = createMockBand()
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/feeds/ical')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const icalData = await response.text()

    expect(response.status).toBe(200)
    expect(icalData).toContain('VERSION:2.0')
    expect(icalData).toContain('PRODID:-//Concert Schedule//EN')
    expect(icalData).toContain('CALSCALE:GREGORIAN')
  })

  it('should format each event with VEVENT block including DTSTART, DTEND, SUMMARY', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]
    
    const event = createMockEvent({ date: dateStr })
    const venue = createMockVenue({ name: 'Test Venue', address: '123 Main St' })
    const band = createMockBand({ name: 'Test Band', start_time: '20:00', end_time: '21:00' })
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/feeds/ical')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const icalData = await response.text()

    expect(response.status).toBe(200)
    expect(icalData).toContain('BEGIN:VEVENT')
    expect(icalData).toContain('END:VEVENT')
    expect(icalData).toContain('SUMMARY:Test Band')
    // iCal format escapes commas in LOCATION
    expect(icalData).toContain('LOCATION:Test Venue\\')
    expect(icalData).toMatch(/DTSTART:\d{8}T\d{6}/)
    expect(icalData).toMatch(/DTEND:\d{8}T\d{6}/)
  })

  it('should generate valid empty calendar when no events', async () => {
    seedMockData(mockDB, [], [], [])

    const request = new Request('http://localhost/api/feeds/ical')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const icalData = await response.text()

    expect(response.status).toBe(200)
    expect(icalData).toContain('BEGIN:VCALENDAR')
    expect(icalData).toContain('END:VCALENDAR')
    // Should not contain any VEVENT blocks
    expect(icalData.split('BEGIN:VEVENT').length).toBe(1)
  })

  it('should escape special characters in event data', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]
    
    const event = createMockEvent({ date: dateStr })
    const venue = createMockVenue({ name: 'Venue, Inc; Address', address: '123 Main St, Suite 100' })
    const band = createMockBand({ 
      name: 'Band Name, Special; Characters\nDescription', 
      start_time: '20:00', 
      end_time: '21:00' 
    })
    
    seedMockData(mockDB, [event], [venue], [band])

    const request = new Request('http://localhost/api/feeds/ical')
    const context = { request, env: mockEnv }

    const response = await onRequestGet(context)
    const icalData = await response.text()

    expect(response.status).toBe(200)
    // Should contain escaped characters
    expect(icalData).toContain('\\,') // Escaped comma
    expect(icalData).toContain('\\;') // Escaped semicolon
    expect(icalData).toContain('\\n') // Escaped newline
  })
})
