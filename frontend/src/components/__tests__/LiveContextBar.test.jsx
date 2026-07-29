import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LiveContextBar, { computeIdentityCollapseStyle } from '../LiveContextBar'

describe('computeIdentityCollapseStyle (#690 scroll-collapse bounce)', () => {
  const px = style => parseFloat(style.maxHeight)

  it('never grows maxHeight as scrollProgress increases', () => {
    // The #690 bug was a NON-MONOTONIC collapse: while scrolling down, the
    // block shrank then grew back ~18px, producing a visible flicker and
    // CLS 0.2875 in production. Height must be a non-increasing function of
    // progress across the whole range, not merely smaller at the endpoints.
    let previous = Infinity
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const current = px(computeIdentityCollapseStyle(Math.min(p, 1)))
      expect(current).toBeLessThanOrEqual(previous)
      previous = current
    }
  })

  it('opts out of scroll anchoring, the actual cause of the bounce', () => {
    // Chrome's scroll-anchoring compensates for the shrinking block by
    // adjusting window.scrollY — the very value the collapse is driven from.
    // That feedback loop is what produced the non-monotonic scrollY.
    // Removing this opts the subtree back into anchor candidacy and the
    // bounce returns, so it is asserted rather than left as a bare style.
    expect(computeIdentityCollapseStyle(0.5).overflowAnchor).toBe('none')
  })

  it('is fully collapsed at progress 1 and fully open at 0', () => {
    expect(px(computeIdentityCollapseStyle(0))).toBeGreaterThan(0)
    expect(px(computeIdentityCollapseStyle(1))).toBe(0)
  })

  it('disables pointer events the moment the block becomes invisible, not later', () => {
    // The fade multiplier (1.75) drives opacity to 0 at progress ~0.571, but
    // pointerEvents was separately hardcoded to flip at 0.7 — leaving a window
    // where the block was fully transparent yet still clickable and focusable.
    // 0.6 sits inside that old window and is the regression guard.
    expect(computeIdentityCollapseStyle(0.5).pointerEvents).toBe('auto')
    expect(computeIdentityCollapseStyle(0.5).opacity).toBeGreaterThan(0)

    expect(computeIdentityCollapseStyle(0.6).opacity).toBe(0)
    expect(computeIdentityCollapseStyle(0.6).pointerEvents).toBe('none')
    expect(computeIdentityCollapseStyle(0.8).pointerEvents).toBe('none')
  })

  it('never leaves the block invisible while still interactive', () => {
    // The general property behind the case above: opacity 0 implies
    // non-interactive, at every progress value.
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const style = computeIdentityCollapseStyle(Math.min(p, 1))
      if (style.opacity === 0) {
        expect(style.pointerEvents).toBe('none')
      }
    }
  })
})

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
