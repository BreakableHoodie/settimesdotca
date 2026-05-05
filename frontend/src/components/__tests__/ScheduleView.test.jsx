import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import ScheduleView from '../ScheduleView'

const NOW = new Date('2024-06-01T20:00:00')
const NOW_MS = NOW.getTime()

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

const renderView = props =>
  render(
    <MemoryRouter>
      <ScheduleView {...defaultProps} {...props} />
    </MemoryRouter>
  )

describe('ScheduleView — Bug 4: finished sets hidden count', () => {
  it('does not count bands with no endTime as finished', () => {
    // Bands without endTime have endMs = 0; previously 0 <= NOW_MS always counted them as finished.
    const bands = [
      makeBand({ id: '1', name: 'Band A', startTime: '21:00', endTime: undefined, endMs: 0 }),
      makeBand({ id: '2', name: 'Band B', startTime: '22:00', endTime: undefined, endMs: 0 }),
    ]
    renderView({ bands })
    expect(screen.queryByText(/finished set/i)).not.toBeInTheDocument()
  })

  it('does not count TBD bands as finished', () => {
    const bands = [makeBand({ id: '1', endTime: 'TBD', endMs: 0 })]
    renderView({ bands })
    expect(screen.queryByText(/finished set/i)).not.toBeInTheDocument()
  })

  it('counts bands with a past endMs as finished when showPast=false', () => {
    // A band that ended 2 hours ago
    const pastEndMs = NOW_MS - 2 * 60 * 60 * 1000
    const pastBand = makeBand({
      id: '1',
      name: 'Past Band',
      startTime: '17:00',
      endTime: '18:00',
      startMs: NOW_MS - 3 * 60 * 60 * 1000,
      endMs: pastEndMs,
    })
    renderView({ bands: [pastBand], showPast: false })
    // "1 finished set hidden" appears in the header
    expect(screen.getByText(/1 finished set hidden/i)).toBeInTheDocument()
  })

  it('does not show "sets hidden" when all bands are in the future', () => {
    const futureBand = makeBand({
      id: '1',
      startMs: NOW_MS + 2 * 60 * 60 * 1000,
      endMs: NOW_MS + 3 * 60 * 60 * 1000,
    })
    renderView({ bands: [futureBand] })
    expect(screen.queryByText(/finished sets hidden/i)).not.toBeInTheDocument()
  })
})

describe('ScheduleView — Bug 5: blank venue filter button', () => {
  it('does not show venue filter when only one non-null venue exists', () => {
    // One null venue → filtered out → only one unique venue → filter section hidden
    const bands = [
      makeBand({ id: '1', name: 'Band A', venue: 'Stage A' }),
      makeBand({ id: '2', name: 'Band B', venue: null }),
      makeBand({ id: '3', name: 'Band C', venue: undefined }),
    ]
    renderView({ bands })
    // Filter section requires 2+ venues to appear
    expect(screen.queryByText(/^venue$/i)).not.toBeInTheDocument()
  })

  it('renders venue filter buttons only for bands with a venue, not for null', () => {
    const bands = [
      makeBand({ id: '1', name: 'Band A', venue: 'Stage A' }),
      makeBand({ id: '2', name: 'Band B', venue: 'Stage B' }),
      makeBand({ id: '3', name: 'Band C', venue: null }),
    ]
    const { container } = renderView({ bands })
    expect(screen.getByRole('button', { name: /Stage A/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Stage B/ })).toBeInTheDocument()
    // Venue filter buttons have aria-pressed; none should have empty text
    const filterButtons = container.querySelectorAll('button[aria-pressed]')
    const emptyFilterButtons = Array.from(filterButtons).filter(b => b.textContent.trim() === '')
    expect(emptyFilterButtons).toHaveLength(0)
  })
})
