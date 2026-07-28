import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LiveContextBar from '../LiveContextBar'

const eventData = {
  name: 'Long Weekend Band Crawl',
  date: '2026-05-06',
}

const bands = [
  { id: '1', venue: 'Stage A' },
  { id: '2', venue: 'Stage B' },
]

function setViewportWidth(width) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

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

  it('shows "Tonight" instead of "0 days away" pre-doors on the event\'s own day (#596)', () => {
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

    expect(screen.getAllByText('Tonight').length).toBeGreaterThan(0)
    expect(screen.queryByText(/0 days away/)).not.toBeInTheDocument()
  })

  // #665: Tabs and the filters toggle are the functional controls and must
  // stay reachable regardless of the venue/time filter panel's open state —
  // previously they were rendered INSIDE the same `isFiltersOpen` gate as
  // the selects, so closing filters also hid the Live Lineup/My Route tabs.
  describe('Tabs stay reachable independent of the filter panel (#665)', () => {
    afterEach(() => {
      setViewportWidth(1024)
    })

    it('keeps the Tabs visible after collapsing the venue/time filters', () => {
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

      const toggles = screen.getAllByRole('button', { name: /hide filters/i })
      fireEvent.click(toggles[0])

      expect(screen.queryByLabelText(/Time filter/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Live Lineup/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /My Route/i })).toBeInTheDocument()
      // The toggle itself must also stay reachable once collapsed.
      expect(screen.getAllByRole('button', { name: /show filters/i }).length).toBeGreaterThan(0)
    })

    it('defaults the filter panel open on a desktop-width viewport', () => {
      setViewportWidth(1024)
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

      expect(screen.getByLabelText(/Time filter/i)).toBeInTheDocument()
    })

    it('defaults the filter panel collapsed on a phone-width viewport, Tabs still present', () => {
      setViewportWidth(375)
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

      expect(screen.queryByLabelText(/Time filter/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Live Lineup/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /My Route/i })).toBeInTheDocument()
    })
  })

  // #666: the poster is rendered inline (beside the title/stats) inside
  // LiveContextBar's mobile identity block rather than as its own row.
  describe('inline poster (#666)', () => {
    it('renders the poster button when posterUrl is provided', () => {
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
          posterUrl="https://band-photos.settimes.ca/event-posters/1-test.jpg"
          onPosterOpen={vi.fn()}
        />
      )

      expect(screen.getByRole('button', { name: /View .*poster/i })).toBeInTheDocument()
    })

    it('renders no poster button when posterUrl is absent — the meta column stays unaffected', () => {
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

      expect(screen.queryByRole('button', { name: /View .*poster/i })).not.toBeInTheDocument()
      expect(screen.getAllByText(eventData.name).length).toBeGreaterThan(0)
    })

    it('calls onPosterOpen when the inline poster is clicked', () => {
      const onPosterOpen = vi.fn()
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
          posterUrl="https://band-photos.settimes.ca/event-posters/1-test.jpg"
          onPosterOpen={onPosterOpen}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: /View .*poster/i }))
      expect(onPosterOpen).toHaveBeenCalledTimes(1)
    })
  })
})
