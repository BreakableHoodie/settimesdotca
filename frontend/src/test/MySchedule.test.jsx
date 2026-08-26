import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import MySchedule from '../components/MySchedule'
import * as gapSuggestions from '../utils/gapSuggestions'

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

const renderSchedule = (props, { route = '/' } = {}) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <MySchedule {...defaultProps} {...props} />
    </MemoryRouter>
  )

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

describe('MySchedule — #541: day dividers', () => {
  it('renders no day dividers for a single-day schedule', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band Beta', 'Stage B', '21:00', '21:30'),
    ]
    renderSchedule({ bands })

    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
  })

  it('renders exactly one divider for the active day, labeled with its true day number, across a 3-day route', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30', '2026-05-17'),
      makeBand(2, 'Band Beta', 'Stage A', '20:00', '20:30', '2026-05-18'),
      makeBand(3, 'Band Gamma', 'Stage A', '20:00', '20:30', '2026-05-19'),
    ]
    // Deep-links to Day 3 (?day=3) so the divider's numbering can be checked
    // independent of the smart-default resolution (covered separately below).
    renderSchedule({ bands }, { route: '/?day=3' })

    const dividers = screen.getAllByRole('separator')
    expect(dividers).toHaveLength(1)
    expect(dividers[0]).toHaveTextContent('Day 3')
    expect(screen.getByText('Band Gamma')).toBeInTheDocument()
    expect(screen.queryByText('Band Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Band Beta')).not.toBeInTheDocument()
  })
})

describe('MySchedule — #542 PR-3: day-tab filter', () => {
  const twoDayBands = [
    makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30', '2026-05-17'),
    makeBand(2, 'Band Beta', 'Stage A', '20:00', '20:30', '2026-05-18'),
  ]

  it('renders one tab per festival day and filters the route to the selected day (default Day 1)', () => {
    renderSchedule({ bands: twoDayBands })

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(screen.getByText('Band Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Band Beta')).not.toBeInTheDocument()
  })

  it('renders NO tabs for a single-day route (repo invariant)', () => {
    const bands = [
      makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'),
      makeBand(2, 'Band Beta', 'Stage B', '21:00', '21:30'),
    ]
    renderSchedule({ bands })

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('Band Alpha')).toBeInTheDocument()
    expect(screen.getByText('Band Beta')).toBeInTheDocument()
  })

  it('?day=2 activates day 2 on load', () => {
    renderSchedule({ bands: twoDayBands }, { route: '/?day=2' })

    expect(screen.queryByText('Band Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Band Beta')).toBeInTheDocument()
  })

  it('switching tabs updates the rendered route', () => {
    renderSchedule({ bands: twoDayBands })

    expect(screen.getByText('Band Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Band Beta')).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('tab')[1])

    expect(screen.queryByText('Band Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Band Beta')).toBeInTheDocument()
  })

  it('defaults to today’s festival day when the event is in progress', () => {
    renderSchedule({
      bands: twoDayBands,
      nowOverride: '2026-05-18T12:00:00',
      eventStartDate: '2026-05-17',
      eventEndDate: '2026-05-18',
    })

    expect(screen.queryByText('Band Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Band Beta')).toBeInTheDocument()
  })

  it('shows a Day-2 tab and correctly labels a Day-2-only selection when the full event days are supplied', () => {
    // The fan has only picked Day 2 bands so far. Without the authoritative
    // `festivalDays` prop, deriving days from `bands` alone would see just
    // one date and mislabel it "Day 1" — this is the exact bug the prop
    // fixes (see MySchedule.jsx's `festivalDays` prop comment).
    const day2OnlyBands = [makeBand(1, 'Band Gamma', 'Stage A', '20:00', '20:30', '2026-05-18')]

    renderSchedule({
      bands: day2OnlyBands,
      festivalDays: ['2026-05-17', '2026-05-18'],
    })

    expect(screen.getAllByRole('tab')).toHaveLength(2)
    // ?day= isn't set and the route isn't "in progress" (no nowOverride
    // matching), so it defaults to Day 1 — which has zero of the fan's picks.
    expect(screen.getByText(/No bands in your route for/i)).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('tab')[1])

    expect(screen.getByText('Band Gamma')).toBeInTheDocument()
    expect(screen.getByRole('separator')).toHaveTextContent('Day 2')
  })
})

describe('MySchedule — genre chip on the route-list card', () => {
  it('shows the genre chip for a band with a genre set', () => {
    const bands = [{ ...makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'), genre: 'Punk' }]
    renderSchedule({ bands })

    expect(screen.getByText('Punk')).toBeInTheDocument()
  })

  it('shows no genre chip when the band has no genre (fixture default)', () => {
    const bands = [makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30')]
    const { container } = renderSchedule({ bands })

    // Every card in this route list renders with isSelected={true} (BandCard's
    // amber state), so the toggle button is also `rounded-full` — scope to
    // `span.rounded-full` so only a genre chip (not the button) would match.
    expect(container.querySelector('span.rounded-full')).not.toBeInTheDocument()
  })

  // Route-list cards always render BandCard with isSelected={true} (every
  // band shown is, by definition, in the fan's route) — pinning the
  // amber-safe pairing here, not just in BandCard's own isolated tests,
  // guards the actual composed usage against the #720 bug class.
  it('renders the chip with the amber-safe (not normal-card) pairing, since route cards are always selected', () => {
    const bands = [{ ...makeBand(1, 'Band Alpha', 'Stage A', '20:00', '20:30'), genre: 'Punk' }]
    renderSchedule({ bands })

    const chip = screen.getByText('Punk')
    expect(chip.className).toMatch(/bg-bg-navy\/15/)
    expect(chip.className).toMatch(/text-bg-navy/)
  })
})

describe('MySchedule — cancelled set gap suggestions', () => {
  const cancelledBand = { ...makeBand(1, 'Cancelled Act', 'Room 47', '20:00', '22:00'), is_cancelled: 1 }
  const candidateBand = makeBand(2, 'Replacement Act', 'Princess Cafe', '21:00', '21:30')
  const bands = [cancelledBand]
  const allBands = [cancelledBand, candidateBand]

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('suggests an artist, venue, and start time for a cancelled saved set', () => {
    renderSchedule({ bands, allBands })

    expect(
      screen.getByRole('button', { name: /Try Replacement Act at Princess Cafe, starting at 9:00 PM/i })
    ).toBeInTheDocument()
  })

  it('renders nothing when the engine returns no suggestions', () => {
    vi.spyOn(gapSuggestions, 'suggestGapFillers').mockReturnValue([])

    renderSchedule({ bands, allBands })

    expect(screen.queryByText('Try filling this gap:')).not.toBeInTheDocument()
    expect(screen.queryByText(/Try Replacement Act at Princess Cafe/i)).not.toBeInTheDocument()
  })

  it('omits distance text when the walk time is unknown', () => {
    renderSchedule({ bands, allBands })

    const suggestion = screen.getByRole('button', { name: /Try Replacement Act/i })
    expect(suggestion).toHaveTextContent('Try Replacement Act at Princess Cafe, starting at 9:00 PM')
    expect(suggestion).not.toHaveTextContent(/walk|null/i)
  })

  it('does not suggest alternatives for a non-cancelled saved set', () => {
    const savedBand = makeBand(1, 'Saved Act', 'Room 47', '20:00', '22:00')
    vi.spyOn(gapSuggestions, 'suggestGapFillers').mockReturnValue([
      { band: candidateBand, walkMinutes: null, startsAtMs: candidateBand.startMs },
    ])

    renderSchedule({ bands: [savedBand], allBands: [savedBand, candidateBand] })

    expect(screen.queryByText(/Try Replacement Act/i)).not.toBeInTheDocument()
  })

  it('adds a suggestion only through onToggleBand', () => {
    const onToggleBand = vi.fn()
    const selectedBands = [...bands]

    renderSchedule({ bands: selectedBands, allBands, onToggleBand })
    fireEvent.click(screen.getByRole('button', { name: /Try Replacement Act/i }))

    expect(onToggleBand).toHaveBeenCalledWith(candidateBand.id)
    expect(onToggleBand).toHaveBeenCalledTimes(1)
    expect(selectedBands).toEqual(bands)
    expect(selectedBands).not.toContain(candidateBand)
  })
})
