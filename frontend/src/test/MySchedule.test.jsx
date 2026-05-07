import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import MySchedule from '../components/MySchedule'

const makeMs = timeStr => new Date(`2026-05-17T${timeStr}:00`).getTime()

const makeBand = (id, name, venue, startTime, endTime) => ({
  id: `event-test-perf-${id}`,
  name,
  venue,
  date: '2026-05-17',
  startTime,
  endTime,
  startMs: makeMs(startTime),
  endMs: makeMs(endTime) > makeMs(startTime) ? makeMs(endTime) : makeMs(endTime) + 24 * 60 * 60 * 1000,
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

    // Alpha is in both buckets — its pill must be red (conflict = more severe)
    const alphaCard = screen.getByText('Band Alpha').closest('[class*="rounded-xl"]')
    const pill = alphaCard?.querySelector('[class*="bg-red"]')
    expect(pill).not.toBeNull()
  })

  it('red summary banner appears for same-start bands', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band Beta', 'Stage B', '20:00', '20:30'),
    ]
    render(
      <MemoryRouter>
        <MySchedule {...defaultProps} bands={bands} />
      </MemoryRouter>
    )

    // The red summary banner must mention "same time"
    expect(screen.getByText(/happening at the same time/i)).toBeInTheDocument()
    // And must NOT say "overlapping set" in a red context
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
