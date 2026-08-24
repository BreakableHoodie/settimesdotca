import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AnnouncementPlanningPanel from '../components/AnnouncementPlanningPanel'

// Announcement-planning panel (#556). Tested directly (not through LineupTab)
// so the test doesn't pull the whole 1000-line LineupTab tree into the
// coverage denominator — the panel is purely presentational on purpose.
const HOT = {
  performance_id: 11,
  band_id: 1,
  band_name: 'Hot Band',
  is_announced: 0,
  follower_count: 9,
  recent_growth: 4,
  would_notify_count: 7,
}
const QUIET = {
  performance_id: 12,
  band_id: 2,
  band_name: 'Quiet Band',
  is_announced: 0,
  follower_count: 0,
  recent_growth: 0,
  would_notify_count: 0,
}
const ANNOUNCED = {
  performance_id: 13,
  band_id: 3,
  band_name: 'Old News Band',
  is_announced: 1,
  follower_count: 20,
  recent_growth: 1,
  would_notify_count: 0,
}

describe('AnnouncementPlanningPanel', () => {
  it('shows engaged unannounced sets with their signals, excluding announced and zero-follower rows', () => {
    render(<AnnouncementPlanningPanel planning={[HOT, QUIET, ANNOUNCED]} onAnnounce={vi.fn()} />)

    // Only Hot Band qualifies (unannounced + followers > 0)
    const heading = screen.getByText(/Announcement planning — 1 engaged set not yet announced/)
    fireEvent.click(heading.closest('button'))

    expect(screen.getByText('Hot Band')).toBeInTheDocument()
    expect(screen.getByText(/9 followers · \+4 this week · 7 to notify/)).toBeInTheDocument()
    expect(screen.queryByText('Quiet Band')).not.toBeInTheDocument()
    expect(screen.queryByText('Old News Band')).not.toBeInTheDocument()
  })

  it('announce button delegates to onAnnounce with the performance id', () => {
    const onAnnounce = vi.fn()
    render(<AnnouncementPlanningPanel planning={[HOT]} onAnnounce={onAnnounce} />)

    fireEvent.click(screen.getByText(/Announcement planning/).closest('button'))
    fireEvent.click(screen.getByRole('button', { name: 'Announce' }))
    expect(onAnnounce).toHaveBeenCalledWith(11, 0)
  })

  it('disables the in-flight row and hides actions in readOnly mode', () => {
    const { rerender } = render(<AnnouncementPlanningPanel planning={[HOT]} onAnnounce={vi.fn()} togglingId={11} />)
    fireEvent.click(screen.getByText(/Announcement planning/).closest('button'))
    expect(screen.getByRole('button', { name: 'Announcing…' })).toBeDisabled()

    rerender(<AnnouncementPlanningPanel planning={[HOT]} onAnnounce={vi.fn()} readOnly />)
    expect(screen.queryByRole('button', { name: 'Announce' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Announcing…' })).not.toBeInTheDocument()
  })

  it('renders nothing when no unannounced set has followers', () => {
    const { container } = render(<AnnouncementPlanningPanel planning={[QUIET, ANNOUNCED]} onAnnounce={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for an empty or missing planning array', () => {
    const { container, rerender } = render(<AnnouncementPlanningPanel planning={[]} onAnnounce={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<AnnouncementPlanningPanel onAnnounce={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
