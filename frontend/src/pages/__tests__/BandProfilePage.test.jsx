import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BandProfilePage from '../BandProfilePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage(id = '206') {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/band/${id}`]}>
          <Routes>
            <Route path="/band/:id" element={<BandProfilePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

// ---------------------------------------------------------------------------
// #739 — production bug: ALL (band profile 206) plays Buddies Fest 2 on both
// Aug 7 and Aug 8, but the profile showed both sets as Aug 7 and neither
// set's notes. Mirrors the real production payload shape once the backend
// fix (performance_date + notes emitted, ordered day 1 before day 2) lands.
// ---------------------------------------------------------------------------
describe('BandProfilePage — per-set performance_date, notes, and Day N label (#739)', () => {
  // The fixtures below use 2099 so the sets always classify as "upcoming"
  // regardless of when the suite runs. Pin the clock into that same year so
  // they also read as CURRENT-year dates — which is what the real case is
  // (Buddies Fest 2 is a current-year event), and the year suffix that
  // formatPerformanceDayLabel adds for other years therefore stays out of the
  // expected strings. Without this, the assertions would encode a rendering
  // ("Fri, Aug 7, 2099") that never appears for the bug being fixed.
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2099, 7, 1)) // 2099-08-01, before both fixtures
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("renders each set's OWN date (Aug 7 and Aug 8), not the event start date twice, with a Day N label on the multi-day event", async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      id: 206,
      name: 'ALL',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: 'Punk',
      origin: null,
      social: {},
      stats: null,
      upcoming: [
        {
          id: 1001,
          event_id: 55,
          event_name: 'Buddies Fest 2',
          event_slug: 'buddies-fest-2',
          event_date: '2099-08-07',
          event_end_date: '2099-08-09',
          event_status: 'published',
          performance_date: '2099-08-07',
          notes: 'Bonus set: ALL w/ Scott (Reynolds) -- sold out',
          venue_id: 3,
          venue_name: 'Room 47',
          venue_address: null,
          start_time: '22:00',
          end_time: '23:00',
        },
        {
          id: 1002,
          event_id: 55,
          event_name: 'Buddies Fest 2',
          event_slug: 'buddies-fest-2',
          event_date: '2099-08-07',
          event_end_date: '2099-08-09',
          event_status: 'published',
          performance_date: '2099-08-08',
          notes: 'Bonus set: ALL w/ Chad (Price)',
          venue_id: 3,
          venue_name: 'Room 47',
          venue_address: null,
          start_time: '21:00',
          end_time: '22:00',
        },
      ],
      past: [],
    })

    renderPage('206')
    expect(await screen.findByRole('heading', { level: 1, name: 'ALL' })).toBeInTheDocument()

    // Each set shows its OWN day, with the multi-day (Day N) label — the two
    // dates must be distinct, not both showing the event's Aug 7 start date.
    expect(screen.getByText('Fri, Aug 7 (Day 1)')).toBeInTheDocument()
    expect(screen.getByText('Sat, Aug 8 (Day 2)')).toBeInTheDocument()

    // Notes render on the correct set, not swapped.
    expect(screen.getByText('Bonus set: ALL w/ Scott (Reynolds) -- sold out')).toBeInTheDocument()
    expect(screen.getByText('Bonus set: ALL w/ Chad (Price)')).toBeInTheDocument()
  })

  it('shows no Day N label on a single-day event', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      id: 202,
      name: 'Kepi Ghoulie',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: null,
      origin: null,
      social: {},
      stats: null,
      upcoming: [
        {
          id: 2001,
          event_id: 60,
          event_name: 'Single Night Show',
          event_slug: 'single-night-show',
          event_date: '2099-09-05',
          event_end_date: null,
          event_status: 'published',
          performance_date: null,
          notes: null,
          venue_id: 4,
          venue_name: 'Roost',
          venue_address: null,
          start_time: '20:00',
          end_time: '21:00',
        },
      ],
      past: [],
    })

    renderPage('202')
    expect(await screen.findByRole('heading', { level: 1, name: 'Kepi Ghoulie' })).toBeInTheDocument()

    // Single-day event convention (#540/#541): the date renders, but with no
    // "(Day N)" suffix at all.
    expect(screen.getByText('Sat, Sep 5')).toBeInTheDocument()
    expect(screen.queryByText(/\(Day \d+\)/)).not.toBeInTheDocument()
  })
})
