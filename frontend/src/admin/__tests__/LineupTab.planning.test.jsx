import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LineupTab from '../LineupTab'

vi.mock('../../utils/adminApi', () => ({
  bandsApi: {
    getByEvent: vi.fn().mockResolvedValue({ bands: [] }),
    getAll: vi.fn().mockResolvedValue({ bands: [] }),
    patch: vi.fn().mockResolvedValue({}),
  },
  venuesApi: {
    getAll: vi.fn().mockResolvedValue({ venues: [] }),
  },
  eventsApi: {
    getMetrics: vi.fn(),
  },
}))

import { eventsApi } from '../../utils/adminApi'

const EVENT = { id: 1, name: 'Test Fest', date: '2026-08-02', end_date: null }

function renderLineup() {
  return render(
    <LineupTab selectedEventId={1} selectedEvent={EVENT} events={[EVENT]} showToast={() => {}} readOnly={false} />
  )
}

// Announcement-planning panel (#556)
describe('LineupTab announcement planning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows engaged unannounced sets with their signals, excluding announced and zero-follower rows', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        announcementPlanning: [
          {
            performance_id: 11,
            band_id: 1,
            band_name: 'Hot Band',
            is_announced: 0,
            follower_count: 9,
            recent_growth: 4,
            would_notify_count: 7,
          },
          {
            performance_id: 12,
            band_id: 2,
            band_name: 'Quiet Band',
            is_announced: 0,
            follower_count: 0,
            recent_growth: 0,
            would_notify_count: 0,
          },
          {
            performance_id: 13,
            band_id: 3,
            band_name: 'Old News Band',
            is_announced: 1,
            follower_count: 20,
            recent_growth: 1,
            would_notify_count: 0,
          },
        ],
      },
    })

    renderLineup()

    // Only Hot Band qualifies (unannounced + followers > 0)
    const heading = await screen.findByText(/Announcement planning — 1 engaged set not yet announced/)
    expect(heading).toBeInTheDocument()

    // Expand and check the row + signals
    fireEvent.click(heading.closest('button'))
    expect(screen.getByText('Hot Band')).toBeInTheDocument()
    expect(screen.getByText(/9 followers · \+4 this week · 7 to notify/)).toBeInTheDocument()
    expect(screen.queryByText('Quiet Band')).not.toBeInTheDocument()
    expect(screen.queryByText('Old News Band')).not.toBeInTheDocument()
  })

  it('renders no panel when there are no engaged unannounced sets', async () => {
    eventsApi.getMetrics.mockResolvedValue({
      metrics: {
        announcementPlanning: [
          {
            performance_id: 13,
            band_id: 3,
            band_name: 'Old News Band',
            is_announced: 1,
            follower_count: 20,
            recent_growth: 1,
            would_notify_count: 0,
          },
        ],
      },
    })

    renderLineup()

    // Wait for the lineup to settle, then assert the panel never appeared
    await screen.findByText('Event Lineup')
    expect(screen.queryByText(/Announcement planning/)).not.toBeInTheDocument()
  })

  it('renders no panel when the metrics call fails (quiet failure)', async () => {
    eventsApi.getMetrics.mockRejectedValue(new Error('boom'))

    renderLineup()

    await screen.findByText('Event Lineup')
    expect(screen.queryByText(/Announcement planning/)).not.toBeInTheDocument()
  })
})
