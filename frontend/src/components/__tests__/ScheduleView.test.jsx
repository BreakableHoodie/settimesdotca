import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { copyToClipboard } from '../../utils/clipboard'
import ScheduleView from '../ScheduleView'

vi.mock('../../utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}))

afterEach(() => {
  vi.clearAllMocks()
})

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

describe('ScheduleView — venue-lane view', () => {
  it('groups the lineup by venue when "By venue" is selected', () => {
    const bands = [
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
        startTime: '21:30',
        startMs: Date.parse('2024-06-01T21:30:00'),
        endMs: Date.parse('2024-06-01T22:30:00'),
      }),
    ]
    renderView({ bands })

    fireEvent.click(screen.getByRole('button', { name: /by venue/i }))

    expect(screen.getByRole('heading', { name: 'Roost' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Blue Room' })).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})

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

describe('ScheduleView — P2: copy action respects visible filters', () => {
  it('copies only the visible filtered bands', async () => {
    const bands = [
      makeBand({ id: '1', name: 'Stage A Band', venue: 'Stage A' }),
      makeBand({ id: '2', name: 'Stage B Band', venue: 'Stage B' }),
    ]

    renderView({ bands })

    fireEvent.click(screen.getByRole('button', { name: /^Stage A$/i }))
    fireEvent.click(screen.getByRole('button', { name: /copy the visible schedule/i }))

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledTimes(1))

    const copiedText = copyToClipboard.mock.calls[0][0]
    expect(copiedText).toContain('Stage A Band')
    expect(copiedText).not.toContain('Stage B Band')
  })

  it('filters the visible lineup from the mobile genre select', () => {
    const bands = [
      makeBand({ id: '1', name: 'Dream Pop Band', genre: 'Dream Pop' }),
      makeBand({ id: '2', name: 'Garage Band', genre: 'Garage' }),
    ]

    renderView({ bands, showVenueFilter: false })

    fireEvent.change(screen.getByLabelText(/Genre filter/i), {
      target: { value: 'Garage' },
    })

    expect(screen.getByText('Garage Band')).toBeInTheDocument()
    expect(screen.queryByText('Dream Pop Band')).not.toBeInTheDocument()
  })
})

describe('ScheduleView — P1: read-only schedule surfaces hide dead actions', () => {
  it('does not render schedule-building or past-toggle actions when handlers are absent', () => {
    const pastMs = NOW_MS - 2 * 60 * 60 * 1000
    const bands = [
      makeBand({
        id: '1',
        name: 'Past Band',
        startTime: '17:00',
        endTime: '18:00',
        startMs: pastMs - 60 * 60 * 1000,
        endMs: pastMs,
      }),
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
