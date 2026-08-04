import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LiveContextBar from '../LiveContextBar'

// LiveContextBar is one of the four named consumers in the design spec's
// suppression #1 ("Never up next") -- a cancelled set must not sustain a
// "Happening Now"/"Live Tonight" lifecycle label, and must not inflate the
// "N sets" count in the summary line (#732).
describe('LiveContextBar — cancelled sets', () => {
  it('does not let a cancelled-only band\'s schedule window keep a long-past event "Live Tonight"', () => {
    // eventDate is 2020-01-01 -- with no eligible band, the event is
    // unambiguously archived by 2026. The ONLY band on the lineup is
    // cancelled and carries a fabricated endMs far in the future (2026-09-01,
    // after `currentTime`) -- if getLifecycleLabel's schedule window counted
    // it, `liveEnd` would be pushed out past `now`, and the event would read
    // "Live Tonight" instead of "Archive". Excluding cancelled bands from the
    // schedule window (`activeBands`) is what keeps this correct.
    const eventData = { name: 'Long Past Event', date: '2020-01-01' }
    const currentTime = new Date('2026-08-10T12:00:00')
    const bands = [
      {
        id: 1,
        name: 'Deer Fang',
        venue: 'Room 47',
        is_cancelled: 1,
        startMs: +new Date('2020-01-01T20:00:00'),
        endMs: +new Date('2026-09-01T00:00:00'),
      },
    ]

    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={currentTime}
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

    expect(screen.getAllByText('Archive').length).toBeGreaterThan(0)
    expect(screen.queryByText('Live Tonight')).not.toBeInTheDocument()
  })

  it('excludes a cancelled set from the "N sets" count, on both the mobile summary and the desktop stat chip', () => {
    const eventData = { name: 'Two Set Event', date: '2026-08-07' }
    const bands = [
      { id: 1, name: 'Deer Fang', venue: 'Room 47', is_cancelled: 1 },
      { id: 2, name: 'Sam Nabi', venue: 'Roost', is_cancelled: 0 },
    ]

    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-08-07T19:00:00')}
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

    // The raw (uncorrected) count would read "2 sets" -- must never appear.
    // queryAllByText (not queryByText) because the mobile summary string is
    // legitimately rendered twice in the markup (once in the collapsible
    // mobile identity block, once in the sm:hidden duplicate inside the
    // desktop header row) -- queryByText throws on multiple matches instead
    // of returning null.
    expect(screen.queryAllByText(/2 sets/)).toHaveLength(0)
    // The corrected count -- singular "1 set" -- must appear at least once
    // (mobile summary and/or the desktop stat chip).
    expect(screen.getAllByText(/1 set\b/).length).toBeGreaterThan(0)
  })

  it('keeps a venue in the switcher even when its only set is cancelled, so fans can still find the cancellation', () => {
    const eventData = { name: 'Venue Filter Event', date: '2026-08-07' }
    const bands = [
      { id: 1, name: 'Deer Fang', venue: 'Room 47', is_cancelled: 1 },
      { id: 2, name: 'Sam Nabi', venue: 'Roost', is_cancelled: 0 },
    ]

    render(
      <LiveContextBar
        eventData={eventData}
        currentTime={new Date('2026-08-07T19:00:00')}
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

    expect(screen.getByRole('option', { name: 'Room 47' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Roost' })).toBeInTheDocument()
  })
})
