import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VenuePage from '../VenuePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage(id = '3') {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/venue/${id}`]}>
          <Routes>
            <Route path="/venue/:id" element={<VenuePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

function perf(overrides = {}) {
  return {
    performance_id: 1,
    start_time: '20:00',
    end_time: '20:30',
    performance_date: null,
    is_cancelled: 0,
    event_id: 55,
    event_name: 'Buddies Fest 2',
    event_slug: 'buddies-fest-2',
    event_date: '2026-08-07',
    event_end_date: '2026-08-09',
    band_id: 9,
    band_name: 'Test Band',
    photo_url: null,
    genre: null,
    ...overrides,
  }
}

// #742 — performer cards replace the old flat text list. Structural/content
// assertions throughout (photo src, genre text, a formatted-time pattern,
// distinct per-day labels) rather than "something rendered", per the repo's
// vacuous-test defect class (see CLAUDE.md "Vacuous test defect class").
describe('VenuePage — performer cards (#742)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a photo, band name, genre pill, and a formatted time for a performance', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Room 47', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [
        perf({
          band_name: 'Deer Fang',
          photo_url: 'https://example.com/deer-fang.jpg',
          genre: 'Post-Punk',
        }),
      ],
      past: [],
    })

    const { container } = renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Room 47' })).toBeInTheDocument()

    expect(screen.getByText('Deer Fang')).toBeInTheDocument()
    expect(screen.getByText('Post-Punk')).toBeInTheDocument()
    expect(container.querySelector('img[src="https://example.com/deer-fang.jpg"]')).not.toBeNull()
    // Read-only (#742): unlike a cancelled set (which BandCard already hides
    // the toggle for on its own), this is a NORMAL, non-cancelled performance
    // -- the only thing suppressing the add/remove button here is
    // showToggleButton={false}. A cancelled-only fixture wouldn't prove this.
    expect(screen.queryByRole('button', { name: /route/i })).toBeNull()
    // getTimeDescription always renders a 12-hour clock time somewhere on the
    // card, regardless of which branch (Today/this week/default) it lands in.
    // Match the bare H:MM digits only, not an AM/PM suffix -- the ICU locale
    // this suite runs under formats it as "8:00 p.m." (lowercase, periods),
    // not "8:00 PM", so anchoring on the meridiem marker would be
    // environment-dependent rather than a real assertion about the app.
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument()

    // A venue's lineup spans multiple events, so the event attribution is the
    // only thing saying WHICH show a set belonged to. Assert the destination,
    // not just the text -- a plain-text fallback renders when event_slug is
    // absent, and that path would satisfy a text-only assertion.
    const eventLink = screen.getByRole('link', { name: 'Buddies Fest 2' })
    expect(eventLink).toHaveAttribute('href', '/event/buddies-fest-2')
  })

  it('renders no genre pill and no photo when the performance has neither', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Room 47', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [perf({ band_name: 'Plain Band', photo_url: null, genre: null })],
      past: [],
    })

    const { container } = renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Room 47' })).toBeInTheDocument()

    expect(screen.getByText('Plain Band')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  // Buddies Fest 2 is a 3-day event (Aug 7-9). Two sets at the SAME clock
  // time on DIFFERENT days of that event must not read identically -- the
  // exact ambiguity CLAUDE.md's after-midnight/multi-day invariants warn
  // about. getTimeDescription alone can't tell them apart (both fall in the
  // "this week" bucket and render a bare "8:00 PM"); the day label is what
  // must carry the distinction.
  it('shows a distinct per-set day label for two sets on different days of a multi-day event', async () => {
    // Pin the clock. These assert literal day-label strings, and
    // formatPerformanceDayLabel is date-relative -- left on the real clock
    // they would change meaning on Aug 7-8 2026, i.e. DURING Buddies Fest 2,
    // the exact weekend this code ships for. A test that only passes before
    // show day is worse than none.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 1, 12, 0, 0)) // Aug 1 2026 — within 2 weeks of the event
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Prohibition Warehouse', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [
        perf({
          performance_id: 1,
          band_name: 'Day One Band',
          performance_date: null, // day 1 -- NULL per the #543 convention, inherits event_date
        }),
        perf({
          performance_id: 2,
          band_name: 'Day Two Band',
          performance_date: '2026-08-08', // day 2
        }),
      ],
      past: [],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Prohibition Warehouse' })).toBeInTheDocument()

    expect(screen.getByText('Fri, Aug 7 (Day 1)')).toBeInTheDocument()
    expect(screen.getByText('Sat, Aug 8 (Day 2)')).toBeInTheDocument()
  })

  // "Where's Shane?" plays 2026-08-08 at 00:25 during BF2 -- an
  // after-midnight set that belongs to the PREVIOUS evening
  // (AFTER_MIDNIGHT_THRESHOLD_HOUR = 6). Its performance_date is stored as
  // the evening it belongs to (2026-08-07), per the repo-wide convention
  // (CLAUDE.md "After-midnight band sorting"). The day label must reflect
  // that evening, NOT the calendar date the clock happened to roll over to.
  it('groups an after-midnight set with the PREVIOUS evening, not the calendar date of its start time', async () => {
    // Pinned for the same reason as the multi-day test above, but here the
    // exact date matters. The clock is pinned EARLIER than two weeks before
    // the set so getTimeDescription's date-fallback branch actually runs —
    // inside the two-week window it renders time only and the /Aug 8/
    // assertion below is vacuous. #689: the fallback once rendered the raw
    // +1-day-offset timestamp ("Aug 8") instead of the festival day
    // ("Aug 7") for exactly this set; this test is the component-level
    // regression guard for that fix, and the negative assertion fails on a
    // revert of timeFilter.js.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 20, 12, 0, 0)) // Mon Jul 20 2026 — beyond the two-week window
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Prohibition Warehouse', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [
        perf({
          performance_id: 3,
          band_name: "Where's Shane?",
          start_time: '00:25',
          end_time: '01:00',
          performance_date: '2026-08-07', // the EVENING this set belongs to
        }),
      ],
      past: [],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Prohibition Warehouse' })).toBeInTheDocument()

    expect(screen.getByText("Where's Shane?")).toBeInTheDocument()
    expect(screen.getByText('Fri, Aug 7 (Day 1)')).toBeInTheDocument()
    expect(screen.queryByText(/Aug 8/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Day 2/)).not.toBeInTheDocument()
  })

  // The "starting soon" pill is fed by the `currentTime` prop directly (not
  // getCurrentDateTime()'s debug hook), so pinning the system clock is the
  // only way to control it. Local-component Date construction throughout
  // (never an explicit UTC offset) so the relative "15 minutes before" math
  // holds regardless of the test runner's timezone -- matching the repo
  // convention documented in timeFilter.test.js.
  //
  // This is the mutation-sensitive half of "multi-day sets show the correct
  // per-set date": it proves the card's underlying startMs was computed from
  // performance_date (2026-08-08), not event_date (2026-08-07). Using
  // event_date would place the computed start 24h in the past relative to
  // the pinned clock, and the pill would never appear.
  it('computes a starting-soon countdown from performance_date, not the event start date', async () => {
    // shouldAdvanceTime: real timers keep ticking (needed for findByRole's
    // internal polling/microtask flushing after the mocked fetch resolves)
    // while Date.now()/new Date() stay pinned to the value below.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 8, 19, 45, 0)) // Aug 8 2026, 19:45 local -- 15 min before the set below

    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Prohibition Warehouse', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [
        perf({
          performance_id: 4,
          band_name: 'Soon Band',
          start_time: '20:00',
          end_time: '20:30',
          event_date: '2026-08-07',
          performance_date: '2026-08-08',
        }),
      ],
      past: [],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Prohibition Warehouse' })).toBeInTheDocument()

    expect(screen.getByText(/Starts in 15m/)).toBeInTheDocument()
  })

  // The countdown above is only correct at the instant of first render. This
  // is the page a fan opens standing outside the venue and leaves open, so a
  // `currentTime` captured once strands them on "Starts in 15m" long after
  // the set began. Advancing the clock must move the card's state on.
  it('refreshes the countdown while the page stays open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 8, 19, 45, 0)) // 15 min before the set

    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Prohibition Warehouse', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [
        perf({
          performance_id: 5,
          band_name: 'Ticking Band',
          start_time: '20:00',
          end_time: '20:30',
          event_date: '2026-08-07',
          performance_date: '2026-08-08',
        }),
      ],
      past: [],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Prohibition Warehouse' })).toBeInTheDocument()
    expect(screen.getByText(/Starts in 15m/)).toBeInTheDocument()

    // Past the start time. Without the interval the card keeps rendering the
    // stale countdown; with it, the set reads as live.
    await act(async () => {
      vi.setSystemTime(new Date(2026, 7, 8, 20, 5, 0))
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(screen.queryByText(/Starts in 15m/)).not.toBeInTheDocument()
    expect(screen.getByText(/Live Now/i)).toBeInTheDocument()
  })

  it('renders a cancelled set struck through inside the new card, not as a plain row', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Room 47', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [perf({ band_name: 'Cancelled Band', is_cancelled: 1 })],
      past: [],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Room 47' })).toBeInTheDocument()

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Cancelled Band').closest('s')).not.toBeNull()
    // The read-only card must not offer an add/remove toggle -- selection is
    // explicitly out of scope for this page (#742).
    expect(screen.queryByRole('button', { name: /route/i })).toBeNull()
  })
})
