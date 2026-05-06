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

    fireEvent.click(screen.getByRole('button', { name: /Any Time/i }))
    fireEvent.click(screen.getByRole('option', { name: /Happening Now/i }))

    expect(onTimeFilterChange).toHaveBeenCalledWith('now')
  })
})
