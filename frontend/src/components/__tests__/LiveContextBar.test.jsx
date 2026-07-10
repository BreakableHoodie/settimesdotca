import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LiveContextBar from '../LiveContextBar'

const eventData = {
  name: 'Long Weekend Band Crawl',
  date: '2026-05-06',
}

const bands = [
  { id: '1', venue: 'Stage A' },
  { id: '2', venue: 'Stage B' },
]

describe('LiveContextBar', () => {
  it('surfaces route, venue, and time controls in the sticky bar', () => {
    const onViewChange = vi.fn()
    const onVenueFilterChange = vi.fn()
    const onTimeFilterChange = vi.fn()

    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-05-06T19:30:00')}
        bands={bands}
        selectedCount={2}
        view="all"
        onViewChange={onViewChange}
        venueFilter={null}
        onVenueFilterChange={onVenueFilterChange}
        timeFilter="all"
        onTimeFilterChange={onTimeFilterChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /My Route/i }))
    expect(onViewChange).toHaveBeenCalledWith('mine')

    fireEvent.change(screen.getByLabelText(/Venue switcher/i), {
      target: { value: 'Stage B' },
    })
    expect(onVenueFilterChange).toHaveBeenCalledWith('Stage B')

    fireEvent.change(screen.getByLabelText(/Time filter/i), {
      target: { value: 'now' },
    })

    expect(onTimeFilterChange).toHaveBeenCalledWith('now')
  })

  it('collapses and expands the filter panel when the toggle is clicked', () => {
    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-05-06T19:30:00')}
        bands={bands}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )

    // Filters are open by default — panel and aria-expanded=true are present
    const toggles = screen.getAllByRole('button', { name: /hide filters/i })
    expect(toggles[0]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText(/Time filter/i)).toBeInTheDocument()

    // Click to collapse
    fireEvent.click(toggles[0])
    expect(screen.getAllByRole('button', { name: /show filters/i })[0]).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/Time filter/i)).not.toBeInTheDocument()

    // Click again to re-expand
    fireEvent.click(screen.getAllByRole('button', { name: /show filters/i })[0])
    expect(screen.getByLabelText(/Time filter/i)).toBeInTheDocument()
  })

  it('does not show a Doors chip when the event has no doors_json (#569)', () => {
    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-05-06T19:30:00')}
        bands={bands}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )

    expect(screen.queryByText(/Doors \d/i)).not.toBeInTheDocument()
  })

  it('shows a "Doors" chip for the event\'s first date when doors_json has a time for it (#569)', () => {
    const eventWithDoors = { ...eventData, doors_json: JSON.stringify({ '2026-05-06': '18:30' }) }

    render(
      <LiveContextBar
        eventData={eventWithDoors}
        currentTime={new Date('2026-05-06T12:00:00')}
        bands={bands}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )

    expect(screen.getAllByText('Doors 6:30 PM').length).toBeGreaterThan(0)
  })
})
