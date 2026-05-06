import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('ScheduleView — P2-F5: finishedCount respects venue filter', () => {
  it('shows only the count of finished sets in the active venue when a venue filter is selected', () => {
    const pastMs = NOW_MS - 2 * 60 * 60 * 1000
    const bands = [
      makeBand({
        id: '1',
        name: 'Stage A Band',
        venue: 'Stage A',
        startTime: '17:00',
        endTime: '18:00',
        startMs: pastMs - 60 * 60 * 1000,
        endMs: pastMs,
      }),
      makeBand({
        id: '2',
        name: 'Stage B Band',
        venue: 'Stage B',
        startTime: '17:00',
        endTime: '18:00',
        startMs: pastMs - 60 * 60 * 1000,
        endMs: pastMs,
      }),
    ]

    renderView({ bands, showPast: false })

    // Before filter: both finished sets hidden
    expect(screen.getByText(/2 finished sets hidden/i)).toBeInTheDocument()

    // Click Stage A filter
    fireEvent.click(screen.getByRole('button', { name: /Stage A/ }))

    // After filter: only Stage A's finished set should be counted
    expect(screen.getByText(/1 finished set hidden/i)).toBeInTheDocument()
    expect(screen.queryByText(/2 finished sets hidden/i)).not.toBeInTheDocument()
  })
})

describe('ScheduleView — Bug 5: blank venue filter button', () => {
  it('does not show venue filter when only one venue exists and no unscheduled bands', () => {
    const bands = [
      makeBand({ id: '1', name: 'Band A', venue: 'Stage A' }),
      makeBand({ id: '2', name: 'Band B', venue: 'Stage A' }),
    ]
    renderView({ bands })
    expect(screen.queryByText(/^venue$/i)).not.toBeInTheDocument()
  })

  it('shows Unscheduled pill and venue buttons when one venue exists with unscheduled bands', () => {
    const bands = [
      makeBand({ id: '1', name: 'Band A', venue: 'Stage A' }),
      makeBand({ id: '2', name: 'Band B', venue: null }),
      makeBand({ id: '3', name: 'Band C', venue: undefined }),
    ]
    renderView({ bands })
    expect(screen.getByRole('button', { name: /unscheduled/i })).toBeInTheDocument()
    // Null/undefined venues must not create a blank filter button
    const blankFilterButtons = screen
      .queryAllByRole('button')
      .filter(b => b.getAttribute('aria-pressed') !== null && b.textContent.trim() === '')
    expect(blankFilterButtons).toHaveLength(0)
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

describe('ScheduleView — P1: Select All respects visible filters', () => {
  it('passes only the visible filtered bands to the bulk select handler', () => {
    const onSelectAll = vi.fn()
    const bands = [
      makeBand({ id: '1', name: 'Stage A Band', venue: 'Stage A' }),
      makeBand({ id: '2', name: 'Stage B Band', venue: 'Stage B' }),
    ]

    renderView({ bands, onSelectAll })

    fireEvent.click(screen.getByRole('button', { name: /^Stage A$/i }))
    fireEvent.click(screen.getByRole('button', { name: /Select All/i }))

    expect(onSelectAll).toHaveBeenCalledTimes(1)
    expect(onSelectAll).toHaveBeenCalledWith([
      expect.objectContaining({ id: '1', name: 'Stage A Band', venue: 'Stage A' }),
    ])
  })

  it('treats all visible bands as selected even when hidden bands remain unselected', () => {
    const bands = [
      makeBand({ id: '1', name: 'Stage A Band', venue: 'Stage A' }),
      makeBand({ id: '2', name: 'Stage B Band', venue: 'Stage B' }),
    ]

    renderView({ bands, selectedBands: ['1'] })

    fireEvent.click(screen.getByRole('button', { name: /^Stage A$/i }))

    expect(screen.getByRole('button', { name: /All Selected/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /^Select All$/i })).not.toBeInTheDocument()
  })
})

describe('ScheduleView — P1: read-only schedule surfaces hide dead actions', () => {
  it('does not render schedule-building or past-toggle actions when handlers are absent', () => {
    const pastMs = NOW_MS - 2 * 60 * 60 * 1000
    const bands = [
      makeBand({ id: '1', name: 'Past Band', startTime: '17:00', endTime: '18:00', startMs: pastMs - 60 * 60 * 1000, endMs: pastMs }),
      makeBand({ id: '2', name: 'Future Band', startMs: NOW_MS + 60 * 60 * 1000, endMs: NOW_MS + 2 * 60 * 60 * 1000 }),
    ]

    renderView({
      bands,
      onToggleBand: undefined,
      onSelectAll: undefined,
      onToggleShowPast: undefined,
    })

    expect(screen.queryByRole('button', { name: /Select All/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Show finished sets/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/add .* to my schedule/i)).not.toBeInTheDocument()
  })
})
