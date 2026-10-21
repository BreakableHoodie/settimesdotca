import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import LiveContextBar from '../LiveContextBar'
import VenueDelayBanner from '../VenueDelayBanner'

const DELAYS = [{ venueId: 2, venue: 'Roost', minutes: 15, updatedAt: '2026-08-07 23:00:00' }]

describe('VenueDelayBanner (#1249)', () => {
  it('names each late venue and its delay, as a polite status', () => {
    render(<VenueDelayBanner delays={DELAYS} />)
    expect(screen.getByRole('status')).toHaveTextContent('Roost is running about 15 minutes late.')
  })

  it('says "1 minute", not "1 minutes"', () => {
    render(<VenueDelayBanner delays={[{ venueId: 3, venue: 'Room 47', minutes: 1 }]} />)
    expect(screen.getByRole('status')).toHaveTextContent('Room 47 is running about 1 minute late.')
  })

  it('renders nothing when no venue is late', () => {
    const { container } = render(<VenueDelayBanner delays={[{ venueId: 1, venue: 'Blue Room', minutes: 0 }]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('LiveContextBar shows the banner only while the event is live', () => {
  // A prepared set at 21:00, so before it starts the label reads "Upcoming".
  const firstSet = {
    id: 1,
    name: 'Band',
    venue: 'Roost',
    is_cancelled: 0,
    date: '2026-08-07',
    startMs: new Date('2026-08-07T21:00:00').getTime(),
    endMs: new Date('2026-08-07T22:00:00').getTime(),
  }
  const renderAt = currentTime =>
    render(
      <LiveContextBar
        eventData={{ name: 'Crawl', date: '2026-08-07', venue_delays: DELAYS }}
        currentTime={currentTime}
        bands={[firstSet]}
        selectedCount={0}
        view="all"
        onViewChange={vi.fn()}
        venueFilter={null}
        onVenueFilterChange={vi.fn()}
        timeFilter="all"
        onTimeFilterChange={vi.fn()}
      />
    )
  const banner = () => screen.queryByText(/running about 15 minutes late/)

  it('on show night, once sets are playing: shown', () => {
    renderAt(new Date('2026-08-07T21:30:00'))
    expect(banner()).toBeInTheDocument()
  })

  it('on show day BEFORE the first set, while the label still reads Upcoming: shown (running late to start)', () => {
    renderAt(new Date('2026-08-07T19:00:00'))
    expect(screen.getAllByText('Upcoming').length).toBeGreaterThan(0)
    expect(banner()).toBeInTheDocument()
  })

  it('days before, or after the show is over: not shown, whatever the data says', () => {
    renderAt(new Date('2026-08-01T21:00:00'))
    expect(banner()).not.toBeInTheDocument()
  })

  it('weeks later (archive): not shown', () => {
    renderAt(new Date('2026-09-20T21:00:00'))
    expect(banner()).not.toBeInTheDocument()
  })
})

describe('torontoDate: the show runs on Toronto time wherever the fan is', () => {
  it("is Toronto's date for a viewer in Vancouver", async () => {
    // The module builds its formatter at import, so it must be imported FRESH
    // under the viewer's zone: switching TZ around an already-imported helper
    // proves nothing (a formatter missing timeZone would still pass).
    const original = process.env.TZ
    process.env.TZ = 'America/Vancouver'
    vi.resetModules()
    try {
      const { torontoDate: freshTorontoDate } = await import('../../utils/festivalDays')
      // 00:30 on Aug 7 in Toronto is still 21:30 on Aug 6 in Vancouver.
      const instant = new Date('2026-08-07T04:30:00Z')
      expect(new Date(instant).getDate()).toBe(6) // the viewer's own calendar
      expect(freshTorontoDate(instant)).toBe('2026-08-07')
    } finally {
      process.env.TZ = original
      vi.resetModules()
    }
  })
})
