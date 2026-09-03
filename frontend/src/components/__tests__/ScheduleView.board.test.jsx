import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import ScheduleView from '../ScheduleView'

vi.mock('../../utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

afterEach(() => {
  vi.clearAllMocks()
})

const NOW = new Date('2024-06-01T20:00:00')

const makeBand = (overrides = {}) => ({
  id: String(Math.random()),
  name: 'Test Band',
  date: '2024-06-01',
  startTime: '21:00',
  endTime: '22:00',
  startMs: Date.parse('2024-06-01T21:00:00'),
  endMs: Date.parse('2024-06-01T22:00:00'),
  venue: 'Stage A',
  ...overrides,
})

const defaultProps = {
  bands: [],
  selectedBands: [],
  onToggleBand: vi.fn(),
  onSelectAll: vi.fn(),
  currentTime: NOW,
  showPast: false,
  onToggleShowPast: vi.fn(),
  timeFilter: 'all',
}

const renderView = (props, { route = '/' } = {}) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <ScheduleView {...defaultProps} {...props} />
    </MemoryRouter>
  )

const singleDayBands = [
  makeBand({
    id: '1',
    name: 'Alpha',
    venue: 'Roost',
    startTime: '21:00',
    startMs: Date.parse('2024-06-01T21:00:00'),
    endMs: Date.parse('2024-06-01T22:00:00'),
  }),
  makeBand({
    id: '2',
    name: 'Beta',
    venue: 'Blue Room',
    startTime: '22:00',
    startMs: Date.parse('2024-06-01T22:00:00'),
    endMs: Date.parse('2024-06-01T23:00:00'),
  }),
]

describe('ScheduleView — board rows', () => {
  // EACH BAND RENDERS EXACTLY ONCE. This is the assertion that matters most.
  //
  // The first implementation rendered board rows AND a duplicate card grid,
  // switching between them with `sm:hidden` / `hidden sm:grid`. jsdom applies no
  // media queries, so every band appeared TWICE in the test DOM: seven existing
  // tests broke on "Found multiple elements", including the #542 day-tab filter
  // suite and the documented "never a lone Day 1 control" invariant. Making those
  // queries `getAllBy` would have left every count assertion permanently
  // ambiguous. One rendering, restyled by CSS, is the fix.
  it('renders each band exactly once, never a mobile and desktop copy', () => {
    renderView({ bands: singleDayBands })
    for (const band of singleDayBands) {
      expect(screen.getAllByText(band.name), `${band.name} should render exactly once`).toHaveLength(1)
    }
  })

  it('gives every row its venue code', () => {
    renderView({ bands: singleDayBands })
    // Derived, not stored -- see venueCode.js.
    // 'Roost' -> ROOS, 'Blue Room' -> BLUE: first four of the first significant
    // word, deduplicated across the bill. See venueCode.js.
    expect(screen.getByText('ROOS')).toBeInTheDocument()
    expect(screen.getByText('BLUE')).toBeInTheDocument()
  })

  // The board REPLACES the card, so the interaction the event page advertises in
  // its own onboarding must survive the swap. A first pass dropped onToggle from
  // the props and rendered an add button that silently did nothing.
  it('keeps the row addable to My Route', () => {
    const onToggleBand = vi.fn()
    renderView({ bands: [singleDayBands[0]], onToggleBand })
    const add = screen.getByRole('button', { name: /alpha to my route/i })
    fireEvent.click(add)
    expect(onToggleBand).toHaveBeenCalledWith(singleDayBands[0].id)
  })

  it('does not render duplicate time group headers on mobile', () => {
    renderView({ bands: singleDayBands })

    const mobileTimeHeaders = document.querySelectorAll('.sm\\:hidden [class*="bg-bg-navy"]')
    expect(mobileTimeHeaders.length).toBe(0)
  })

  it('does not show a "Day 1" label for single-day events', () => {
    renderView({ bands: singleDayBands })

    expect(screen.queryByText(/day 1/i)).not.toBeInTheDocument()
  })

  it('does not render board rows in the by-venue view', () => {
    renderView({ bands: singleDayBands })

    const byVenueButton = screen.getByRole('button', { name: /by venue/i })
    byVenueButton.click()

    const boardContainer = document.querySelector('.sm\\:hidden')
    const boardItems = boardContainer ? boardContainer.querySelectorAll('[class*="font-semibold"]') : []
    const names = Array.from(boardItems).map(el => el.textContent.trim())

    expect(names).not.toContain('Alpha')
    expect(names).not.toContain('Beta')
  })
})
