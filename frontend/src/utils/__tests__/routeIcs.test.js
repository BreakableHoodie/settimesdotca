import { describe, expect, it, vi } from 'vitest'
import { buildRouteIcs } from '../routeIcs'

const event = { name: 'Long Weekend Band Crawl', slug: 'lwbc18', date: '2026-10-11' }

const set = (overrides = {}) => ({
  performance_id: 42,
  name: 'The Headliners',
  venue: 'Room 47',
  date: event.date,
  startTime: '20:00',
  endTime: '21:00',
  is_cancelled: 0,
  ...overrides,
})

describe('buildRouteIcs', () => {
  it('dates evening and after-midnight starts, and rolls an end across midnight', () => {
    const ical = buildRouteIcs({
      event,
      sets: [
        set({ performance_id: 1, startTime: '23:00', endTime: '23:45' }),
        set({ performance_id: 2, startTime: '00:25', endTime: '01:00' }),
        set({ performance_id: 3, startTime: '23:30', endTime: '00:30' }),
      ],
    })

    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261011T230000')
    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261012T002500')
    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261011T233000')
    expect(ical).toContain('DTEND;TZID=America/Toronto:20261012T003000')
  })

  it('binds every time to Toronto with a VTIMEZONE, never floating', () => {
    const ical = buildRouteIcs({ event, sets: [set()] })

    expect(ical).toContain('BEGIN:VTIMEZONE\r\nTZID:America/Toronto')
    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261011T200000')
    expect(ical).toContain('DTEND;TZID=America/Toronto:20261011T210000')
    const events = ical.split('BEGIN:VEVENT').slice(1).join('')
    expect(events).not.toMatch(/^DT(START|END):/m)
  })

  it('keeps dated sets when the event record is absent', () => {
    const ical = buildRouteIcs({ event: undefined, sets: [set({ date: '2026-10-11' })] })

    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261011T200000')
  })

  // 01:30 on 2026-03-29 does not exist in London (UK springs forward that
  // night) but does in Toronto. Deriving the end in the device zone moved it.
  it('derives an end time without applying the device time zone', () => {
    const previous = process.env.TZ
    process.env.TZ = 'Europe/London'
    try {
      const ical = buildRouteIcs({
        event: { ...event, date: '2026-03-28' },
        sets: [set({ date: '2026-03-28', startTime: '00:30', endTime: null })],
      })
      expect(ical).toContain('DTEND;TZID=America/Toronto:20260329T013000')
    } finally {
      if (previous === undefined) delete process.env.TZ
      else process.env.TZ = previous
    }
  })

  it('omits sets without a start time', () => {
    const ical = buildRouteIcs({ event, sets: [set({ name: 'Time TBA', startTime: null })] })

    expect(ical).not.toContain('Time TBA')
    expect(ical).not.toContain('BEGIN:VEVENT')
  })

  it('derives a missing end time as exactly one hour after the start', () => {
    const ical = buildRouteIcs({ event, sets: [set({ startTime: '23:30', endTime: null })] })

    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261011T233000')
    expect(ical).toContain('DTEND;TZID=America/Toronto:20261012T003000')
  })

  it('marks cancelled and confirmed sets with their matching status', () => {
    const ical = buildRouteIcs({
      event,
      sets: [set({ performance_id: 1, is_cancelled: 1 }), set({ performance_id: 2 })],
    })

    expect(ical.match(/STATUS:CANCELLED/g)).toHaveLength(1)
    expect(ical.match(/STATUS:CONFIRMED/g)).toHaveLength(1)
  })

  it("uses a set's performance date for multi-day events", () => {
    const ical = buildRouteIcs({
      event: { ...event, end_date: '2026-10-12' },
      sets: [set({ performance_date: '2026-10-12', date: event.date, startTime: '19:00' })],
    })

    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261012T190000')
    expect(ical).toContain('UID:performance-42-2026-10-12@settimes.ca')
  })

  it('includes only the sets passed to it', () => {
    const ical = buildRouteIcs({ event, sets: [set({ name: 'Picked Act' })] })

    expect(ical).toContain('SUMMARY:Picked Act')
    expect(ical).not.toContain('Not Picked Act')
  })

  it('escapes RFC 5545 text characters', () => {
    const ical = buildRouteIcs({
      event: { ...event, name: 'Event,;\nName' },
      sets: [set({ name: 'Band,;\nName', venue: 'Venue,;\nName' })],
    })

    expect(ical).toContain('X-WR-CALNAME:Event\\,\\;\\nName')
    expect(ical).toContain('SUMMARY:Band\\,\\;\\nName')
    expect(ical).toContain('LOCATION:Venue\\,\\;\\nName')
  })

  // A line break in DESCRIPTION must be encoded ONCE (RFC 5545 "\n"). Joining
  // the parts with a literal "\\n" and then escaping produced "\\n", which
  // calendar apps show as the text "\n". The live server feed had this bug.
  it('separates DESCRIPTION lines with a single-escaped newline', () => {
    const ical = buildRouteIcs({ event, sets: [set({ name: 'Picked Act', venue: 'Prohibition Warehouse' })] })
    const description = ical.split('\r\n').find(line => line.startsWith('DESCRIPTION:'))

    expect(description).toBe('DESCRIPTION:Picked Act\\nVenue: Prohibition Warehouse')
    expect(description).not.toContain('\\\\n')
  })

  it('does not depend on the current clock for set dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const ical = buildRouteIcs({ event, sets: [set()] })
    expect(ical).toContain('DTSTART;TZID=America/Toronto:20261011T200000')
    vi.useRealTimers()
  })
})
