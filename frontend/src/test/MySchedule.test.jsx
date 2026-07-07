import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import MySchedule from '../components/MySchedule'

const makeMs = (timeStr, date = '2026-05-17') => new Date(`${date}T${timeStr}:00`).getTime()

const makeBand = (id, name, venue, startTime, endTime, date = '2026-05-17') => ({
  id: `event-test-perf-${id}`,
  name,
  venue,
  date,
  startTime,
  endTime,
  startMs: makeMs(startTime, date),
  endMs:
    makeMs(endTime, date) > makeMs(startTime, date)
      ? makeMs(endTime, date)
      : makeMs(endTime, date) + 24 * 60 * 60 * 1000,
  genre: null,
  performance_id: id,
})

const defaultProps = {
  onToggleBand: vi.fn(),
  onClearSchedule: vi.fn(),
  showPast: true,
  onToggleShowPast: vi.fn(),
  nowOverride: null,
}

describe('MySchedule — conflict vs overlap severity', () => {
  it('shows red warning for two bands at the exact same start time', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band Beta', 'Stage B', '20:00', '20:30'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    // "Same time as" text must exist
    const warnings = screen.getAllByText(/Same time as/i)
    expect(warnings.length).toBeGreaterThan(0)

    // The pill must be red (conflict), not yellow (overlap)
    const pill = warnings[0].closest('[class*="bg-"]')
    expect(pill.className).toMatch(/bg-red/)
    expect(pill.className).not.toMatch(/bg-yellow/)
  })

  it('shows yellow warning for two bands with a partial time overlap', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '19:00', '19:30'),
      makeBand(2, 'Band Beta', 'Stage B', '19:15', '19:45'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    const warnings = screen.getAllByText(/Overlaps with/i)
    expect(warnings.length).toBeGreaterThan(0)

    // The pill must be yellow (overlap), not red (conflict)
    const pill = warnings[0].closest('[class*="bg-"]')
    expect(pill.className).toMatch(/bg-yellow/)
    expect(pill.className).not.toMatch(/bg-red/)
  })

  it('red conflict takes priority over yellow overlap on the same band', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band Beta', 'Stage B', '20:00', '20:45'), // same start as Alpha
      makeBand(3, 'Band Gamma', 'Stage C', '19:45', '20:15'), // partial overlap with Alpha
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    // Alpha is in both buckets — its BandCard pill must be red (conflict = more severe).
    // Note: Band Alpha also appears in the ForkCard, so we use getAllByText and check
    // each ancestor rounded-xl for a red pill.
    const alphaElements = screen.getAllByText('Band Alpha')
    const hasRedPill = alphaElements.some(
      el => el.closest('[class*="rounded-xl"]')?.querySelector('[class*="bg-red"]') != null
    )
    expect(hasRedPill).toBe(true)
  })

  it('fork card replaces the summary banner for same-start bands', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band Beta', 'Stage B', '20:00', '20:30'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    // The fork card header must appear
    expect(screen.getByText(/fork in the road/i)).toBeInTheDocument()
    // Both band names must appear (in the fork card)
    expect(screen.getAllByText('Band Alpha').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Band Beta').length).toBeGreaterThan(0)
    // Two "Keep …" buttons must exist — one per side (accessible name is the aria-label, e.g. "Keep Band Alpha, remove Band Beta")
    expect(screen.getAllByRole('button', { name: /^keep /i }).length).toBe(2)
    // These bands conflict (same start), so no partial-overlap banner
    expect(screen.queryByText(/overlapping set/i)).not.toBeInTheDocument()
  })

  it('yellow summary banner appears for partial-overlap bands', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '19:00', '19:30'),
      makeBand(2, 'Band Beta', 'Stage B', '19:15', '19:45'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    // The yellow summary banner must mention "overlapping set"
    expect(screen.getByText(/overlapping set/i)).toBeInTheDocument()
    // And must NOT say "same time" (that's for exact conflicts)
    expect(screen.queryByText(/happening at the same time/i)).not.toBeInTheDocument()
  })

  it('shows combined "Same time as X · Overlaps with Y" when a band has both a conflict and a partial overlap', () => {
    // Band A and Band B start at the same time → conflict with each other
    // Band C starts 15 min later → overlap with both, not a conflict
    const bands = [
      makeBand(1, 'Band A', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band B', 'Stage B', '20:00', '20:30'),
      makeBand(3, 'Band C', 'Stage C', '20:15', '20:45'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    // Band A card must show both labels separated by the dot
    expect(screen.getAllByText(/Same time as Band B · Overlaps with Band C/i).length).toBeGreaterThan(0)
    // Band C must show only an overlap warning, no conflict label
    expect(screen.getAllByText(/Overlaps with Band A, Band B/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Same time as Band C/i)).not.toBeInTheDocument()
  })
})

describe('MySchedule — #541: multi-day day dividers', () => {
  it('renders no day dividers for a single-day schedule', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band Beta', 'Stage B', '21:00', '21:30'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('inserts a day-divider before Day 1 and again before the first Day 2 band, none for the second Day 1 band', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30', '2026-05-17'),
      makeBand(2, 'Band Beta', 'Stage B', '21:00', '21:30', '2026-05-17'),
      makeBand(3, 'Band Gamma', 'Stage A', '20:00', '20:30', '2026-05-18'),
    ]
    const { container } = render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    // One divider before the very first band (Day 1) and one before the first
    // Day 2 band (Gamma); Band Beta (2nd Day 1 band) gets none since its date
    // matches the previous rendered band's date.
    const dividers = screen.getAllByRole('separator')
    expect(dividers).toHaveLength(2)
    expect(dividers[0]).toHaveTextContent('Day 1')
    expect(dividers[1]).toHaveTextContent('Day 2')

    // The Day 2 divider must appear before Band Gamma (the first Day 2 band) in DOM order.
    const text = container.textContent
    expect(text.indexOf('Day 2')).toBeLessThan(text.indexOf('Band Gamma'))
  })

  it('inserts a divider for each subsequent day change across a 3-day schedule', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30', '2026-05-17'),
      makeBand(2, 'Band Beta', 'Stage A', '20:00', '20:30', '2026-05-18'),
      makeBand(3, 'Band Gamma', 'Stage A', '20:00', '20:30', '2026-05-19'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    const dividers = screen.getAllByRole('separator')
    expect(dividers).toHaveLength(3)
    expect(dividers[0]).toHaveTextContent('Day 1')
    expect(dividers[1]).toHaveTextContent('Day 2')
    expect(dividers[2]).toHaveTextContent('Day 3')
  })
})
