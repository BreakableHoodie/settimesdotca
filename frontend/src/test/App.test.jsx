import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { ThemeProvider } from '../components/ThemeProvider.jsx'
import { getSelectedBands } from '../utils/scheduleStorage'

// App.jsx is the `/event/:slug` route — the fan-facing schedule page used
// during a live show (band selection, filters, shared-route import, clear +
// undo). It was 1,015 lines with zero dedicated tests (#908); only
// `test/a11y.test.jsx` mounted it, incidentally, for axe scanning.
//
// Fetch is mocked wholesale, matching a11y.test.jsx's convention: every
// response needs `headers.get('content-type')` because App loads through
// `fetchPublicJson` (utils/publicApi.js), which reads that before parsing.
// Responses are dispatched by URL prefix so a single mock can serve the
// initial `/api/schedule` load, the `?share=` snapshot fetch
// (useSharedRouteImport), and the fire-and-forget `/api/schedule/build` /
// `/api/metrics` beacons without every test wiring up three separate mocks.

const HINT_DISMISSED_KEY = 'scheduleHintDismissed'
const SELECTED_BANDS_KEY = 'selectedBandsByEvent'
const DEBUG_TIME_STORAGE_KEY = 'debugScheduleTime'
// scheduleStorage.DATES_KEY is private; the test reads the persisted shape
// directly, the same way the debugScheduleTime test below writes localStorage
// rather than reaching into the module. (Not timeFilter.test.js, which uses a
// globalThis override and never touches localStorage.)
const DATES_KEY = '__dates__'

const mockEvent = {
  id: 1,
  name: 'Test Band Crawl',
  date: '2030-06-15',
  end_date: null,
  city: 'Waterloo',
  slug: 'test-event',
  ticket_url: null,
  poster_url: null,
  is_archived: false,
  theme_colors: null,
  venue_info: null,
  social_links: null,
  doors_json: null,
  reveal_mode: 0,
}

// Ids carry the performance id as the dash-suffixed final segment (matches
// the real API shape) — both the `?s=` and `?share=` import paths match on
// that suffix. Dated far in the future so no band is ever "finished"
// relative to the real clock the test runs under, keeping the default
// fixture stable regardless of when the suite executes.
const bandAlpha = {
  id: 'evt-alpha-101',
  performance_id: 101,
  band_profile_id: 11,
  name: 'Alpha Wolves',
  photo_url: null,
  venue: 'Venue A',
  venue_lat: null,
  venue_lng: null,
  date: '2030-06-15',
  startTime: '20:00',
  endTime: '20:30',
  url: null,
  notes: null,
}

const bandBeta = {
  id: 'evt-beta-202',
  performance_id: 202,
  band_profile_id: 12,
  name: 'Beta Foxes',
  photo_url: null,
  venue: 'Venue B',
  venue_lat: null,
  venue_lng: null,
  date: '2030-06-15',
  startTime: '21:00',
  endTime: '21:30',
  url: null,
  notes: null,
}

// Same festival day as Alpha (a different `date` here would make the event
// span two festival days and trigger day-tab filtering, which hides
// everything not on the tab-selected day — a real trap this fixture used to
// fall into). Only used alongside the `debugScheduleTime` override below,
// which pins App's "now" between the two start times so the finished/
// upcoming split is deterministic regardless of the real wall clock.
const bandGammaPast = {
  id: 'evt-gamma-303',
  performance_id: 303,
  band_profile_id: 13,
  name: 'Gamma Owls',
  photo_url: null,
  venue: 'Venue A',
  venue_lat: null,
  venue_lng: null,
  date: '2030-06-15',
  startTime: '10:00',
  endTime: '10:30',
  url: null,
  notes: null,
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  }
}

// Builds a `fetch` mock that dispatches by URL prefix. `bands` feeds the
// initial `/api/schedule` load; `shareSnapshot` (if given) answers the
// `?share=` slug lookup `useSharedRouteImport` performs.
function mockScheduleFetch({ bands = [bandAlpha, bandBeta], event = mockEvent, shareSnapshot = null } = {}) {
  const impl = vi.fn(url => {
    const u = String(url)
    if (u.startsWith('/api/schedule/share/')) {
      return Promise.resolve(jsonResponse(shareSnapshot || { performance_ids: [], band_names: [] }))
    }
    if (u.startsWith('/api/schedule?')) {
      return Promise.resolve(jsonResponse({ event, bands }))
    }
    // /api/schedule/build, /api/metrics, etc. — fire-and-forget beacons the
    // component doesn't inspect the response of.
    return Promise.resolve(jsonResponse({}))
  })
  global.fetch = impl
  return impl
}

function renderApp(initialEntry = '/event/test-event') {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/event/:slug" element={<App />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

// The signal that the schedule finished loading and rendered the "all"
// (Lineup) view: Alpha's toggle button is present. Used instead of a
// fixed sleep so tests don't race the fetch mock's microtask queue.
const findAlphaToggle = () => screen.findByRole('button', { name: 'Add Alpha Wolves to my route' })

// Reads the persisted `__dates__[slug]` value saveSelectedBands stored for an
// event. This is the field stale-detection in scheduleStorage compares against
// today, so it is precisely what the #542 invariant commits to — passing the
// multi-day END date (falling back to the start date) so the schedule isn't
// wiped on day 2.
function storedScheduleDate(slug) {
  const data = window.localStorage.getItem(SELECTED_BANDS_KEY)
  if (!data) return undefined
  const parsed = JSON.parse(data)
  return parsed?.[DATES_KEY]?.[slug]
}

beforeEach(() => {
  mockScheduleFetch()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('band selection (toggleBand)', () => {
  it('adds a set to My Route and persists the selection via scheduleStorage', async () => {
    renderApp()
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Add Alpha Wolves to my route' }))

    // The toggle button's own label is what CHANGES — proves the click
    // actually flipped selection state, not just that something re-rendered.
    expect(await screen.findByRole('button', { name: 'Remove Alpha Wolves from my route' })).toBeInTheDocument()

    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual(['evt-alpha-101'])
    })

    // The My Route tab badge reflects the new count.
    const mineTab = screen.getByRole('button', { name: /^My route/ })
    expect(within(mineTab).getByText('1')).toBeInTheDocument()
  })

  it('removes a set from My Route on a second toggle and clears persisted storage', async () => {
    renderApp()
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Add Alpha Wolves to my route' }))
    await screen.findByRole('button', { name: 'Remove Alpha Wolves from my route' })
    // Assert the intermediate persisted state too: without this, "ends up
    // empty" is trivially true even if persistence were entirely broken,
    // since the storage key starts empty (proven by mutation — see report).
    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual(['evt-alpha-101'])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha Wolves from my route' }))

    expect(await screen.findByRole('button', { name: 'Add Alpha Wolves to my route' })).toBeInTheDocument()
    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual([])
    })
  })
})

describe('persisted schedule date (stale detection, #542)', () => {
  it("stores a multi-day event's END date, not its start date", async () => {
    const multiDayEvent = { ...mockEvent, date: '2030-06-15', end_date: '2030-06-17' }
    mockScheduleFetch({ event: multiDayEvent })
    renderApp()
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Add Alpha Wolves to my route' }))
    await screen.findByRole('button', { name: 'Remove Alpha Wolves from my route' })

    // If the start date were stored, the schedule would read stale on day 2
    // of the event and get wiped (#542). Assert the stored value is the END
    // date so the invariant survives the `end_date || date` expression.
    await waitFor(() => {
      expect(storedScheduleDate('test-event')).toBe('2030-06-17')
    })
  })

  it('falls back to the start date for a single-day event with no end_date', async () => {
    renderApp()
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Add Alpha Wolves to my route' }))
    await screen.findByRole('button', { name: 'Remove Alpha Wolves from my route' })

    await waitFor(() => {
      expect(storedScheduleDate('test-event')).toBe('2030-06-15')
    })
  })
})

describe('onboarding hint', () => {
  it('dismissing the hint persists across remounts', async () => {
    renderApp()
    await findAlphaToggle()

    expect(screen.getByRole('button', { name: 'Dismiss tip' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tip' }))

    expect(screen.queryByRole('button', { name: 'Dismiss tip' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(HINT_DISMISSED_KEY)).toBe('1')

    cleanup()
    mockScheduleFetch()
    renderApp()
    await findAlphaToggle()

    // A fresh mount must read the persisted flag rather than defaulting back
    // to visible.
    expect(screen.queryByRole('button', { name: 'Dismiss tip' })).not.toBeInTheDocument()
  })

  it('selecting a band before dismissing still marks the hint dismissed in storage', async () => {
    renderApp()
    await findAlphaToggle()
    expect(screen.getByRole('button', { name: 'Dismiss tip' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Alpha Wolves to my route' }))
    await screen.findByRole('button', { name: 'Remove Alpha Wolves from my route' })

    // The hint disappears either way once a band is selected (its own
    // visibility guard includes `selectedBands.length === 0`), so the
    // meaningful assertion is the persisted flag, not DOM visibility.
    await waitFor(() => {
      expect(window.localStorage.getItem(HINT_DISMISSED_KEY)).toBe('1')
    })
  })
})

describe('view toggle (All vs Mine)', () => {
  it('defaults to My Route when a selection is already stored for this slug', async () => {
    window.localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify({ 'test-event': ['evt-alpha-101'] }))
    renderApp()

    expect(await screen.findByRole('heading', { name: 'My Route', level: 2 })).toBeInTheDocument()
    const mineTab = screen.getByRole('button', { name: /^My route/ })
    const allTab = screen.getByRole('button', { name: 'Lineup' })
    expect(mineTab).toHaveAttribute('aria-pressed', 'true')
    expect(allTab).toHaveAttribute('aria-pressed', 'false')
  })

  it('defaults to Lineup with no stored selection, and the tabs actually switch views', async () => {
    renderApp()
    await findAlphaToggle()

    const allTab = screen.getByRole('button', { name: 'Lineup' })
    expect(allTab).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /^My route/ }))
    // With nothing selected, MySchedule renders its empty state rather than
    // the "My Route" heading (that heading only appears once bands.length > 0).
    const main = screen.getByRole('main')
    expect(await within(main).findByText('No bands selected yet')).toBeInTheDocument()
    // ScheduleView's band toggle buttons are gone once MySchedule is showing.
    expect(within(main).queryByRole('button', { name: 'Add Alpha Wolves to my route' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Lineup' }))
    expect(await findAlphaToggle()).toBeInTheDocument()
  })
})

describe('select all', () => {
  it('adds every visible band to the route', async () => {
    renderApp()
    await findAlphaToggle()

    // Select-all follows the lineup it acts on (below the last band), not a
    // menu above it.
    fireEvent.click(screen.getByRole('button', { name: 'Add all 2 to My route' }))

    expect(await screen.findByRole('button', { name: 'Remove Alpha Wolves from my route' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Beta Foxes from my route' })).toBeInTheDocument()

    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual(['evt-alpha-101', 'evt-beta-202'])
    })
    expect(screen.getByRole('button', { name: 'All 2 in My route' })).toBeDisabled()
  })
})

describe('clear + undo', () => {
  it('clearing shows a confirm dialog, then an undo toast, and Undo restores the route', async () => {
    window.localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify({ 'test-event': ['evt-alpha-101'] }))
    renderApp()
    await screen.findByRole('heading', { name: 'My Route', level: 2 })

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))

    const dialog = await screen.findByRole('dialog', { name: 'Clear route' })
    within(dialog).getByText('Are you sure you want to clear your entire route?')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear', exact: true }))

    // Confirming clears the route AND flips the view back to Lineup
    // (App.jsx's doActualClear calls setView('all')) — so the visible proof
    // of the clear is Alpha's toggle button reverting to "Add", not a
    // MySchedule empty state (that view is no longer mounted).
    expect(await screen.findByRole('button', { name: 'Add Alpha Wolves to my route' })).toBeInTheDocument()
    const undoButton = screen.getByRole('button', { name: 'Undo' })
    const toast = undoButton.closest('div')
    within(toast).getByText('Cleared 1 stop from your route.')

    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual([])
    })

    fireEvent.click(undoButton)

    // Undo restores both the selection and the Mine view.
    expect(await screen.findByRole('heading', { name: 'My Route', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Alpha Wolves from my route' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual(['evt-alpha-101'])
    })
  })
})

describe('filters', () => {
  it('applies a time filter choice and persists it per event slug', async () => {
    renderApp()
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    const timeSelect = screen.getByRole('combobox', { name: 'Time' })
    fireEvent.change(timeSelect, { target: { value: 'today' } })

    expect(timeSelect).toHaveValue('today')
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('timeFiltersByEvent'))
      expect(stored['test-event']).toBe('today')
    })
  })

  it('filters the rendered bands by venue, not just the control value', async () => {
    renderApp()
    await findAlphaToggle()
    expect(screen.getByRole('button', { name: 'Add Beta Foxes to my route' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Venue' }), { target: { value: 'Venue B' } })

    const main = screen.getByRole('main')
    expect(within(main).queryByRole('button', { name: 'Add Alpha Wolves to my route' })).not.toBeInTheDocument()
    expect(within(main).getByRole('button', { name: 'Add Beta Foxes to my route' })).toBeInTheDocument()
  })

  it('hides a finished set by default and reveals it via "Show finished sets"', async () => {
    mockScheduleFetch({ bands: [bandAlpha, bandGammaPast] })
    // App reads window.location.search for ?debugTime=, which MemoryRouter
    // never touches (it keeps history in memory, not on window.location) —
    // so the supported way to pin "now" under this test setup is the
    // localStorage fallback getInitialDebugTime() reads next.
    window.localStorage.setItem(DEBUG_TIME_STORAGE_KEY, new Date('2030-06-15T18:00:00').toISOString())
    renderApp()
    await findAlphaToggle()

    const main = screen.getByRole('main')
    expect(within(main).queryByRole('button', { name: /Gamma Owls/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Show finished sets/ }))
    expect(await within(main).findByRole('button', { name: 'Add Gamma Owls to my route' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /Show finished sets/ }))
    await waitFor(() => {
      expect(within(main).queryByRole('button', { name: /Gamma Owls/ })).not.toBeInTheDocument()
    })
  })
})

describe('one control row (#1248)', () => {
  const punkAlpha = { ...bandAlpha, genre: 'Punk' }
  const folkBeta = { ...bandBeta, genre: 'Folk' }

  it('renders no filter control outside the dialog: no group-by, More menu, or genre select', async () => {
    mockScheduleFetch({ bands: [punkAlpha, folkBeta] })
    renderApp()
    await findAlphaToggle()

    expect(screen.queryByRole('button', { name: /^by (time|venue)$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^more$/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/genre/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Exactly one Filter button, beside the view switch.
    expect(screen.getAllByRole('button', { name: /^Filter/ })).toHaveLength(1)
  })

  it('filters by genre from the dialog, reports "1 active", and Clear all restores every set', async () => {
    mockScheduleFetch({ bands: [punkAlpha, folkBeta] })
    renderApp()
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    const dialog = screen.getByRole('dialog', { name: 'Filter the lineup' })
    fireEvent.change(within(dialog).getByLabelText('Genre'), { target: { value: 'Punk' } })

    const main = screen.getByRole('main')
    expect(within(main).getByRole('button', { name: 'Add Alpha Wolves to my route' })).toBeInTheDocument()
    expect(within(main).queryByRole('button', { name: 'Add Beta Foxes to my route' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter, 1 active' })).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }))
    expect(within(main).getByRole('button', { name: 'Add Beta Foxes to my route' })).toBeInTheDocument()
    expect(within(main).getByRole('button', { name: 'Add Alpha Wolves to my route' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument()
  })

  it('clears genre, grouping and finished sets when the fan moves to another event', async () => {
    // Gamma has already ended at this pinned "now", so "Show finished sets" is offered.
    mockScheduleFetch({ bands: [punkAlpha, folkBeta, { ...bandGammaPast, genre: 'Punk' }] })
    window.localStorage.setItem(DEBUG_TIME_STORAGE_KEY, new Date('2030-06-15T18:00:00').toISOString())
    function GoToOther() {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate('/event/other-event')}>
          Go to other event
        </button>
      )
    }
    render(
      <ThemeProvider>
        <HelmetProvider>
          <MemoryRouter initialEntries={['/event/test-event']}>
            <GoToOther />
            <Routes>
              <Route path="/event/:slug" element={<App />} />
            </Routes>
          </MemoryRouter>
        </HelmetProvider>
      </ThemeProvider>
    )
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    const dialog = screen.getByRole('dialog', { name: 'Filter the lineup' })
    fireEvent.change(within(dialog).getByLabelText('Genre'), { target: { value: 'Punk' } })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Venue' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Show finished sets/ }))
    expect(screen.getByRole('button', { name: 'Filter, 3 active' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Same <App/> instance, new slug: nothing set on the last event carries over.
    fireEvent.click(screen.getByRole('button', { name: 'Go to other event' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument())
    const main = screen.getByRole('main')
    expect(await within(main).findByRole('button', { name: 'Add Beta Foxes to my route' })).toBeInTheDocument()
  })

  it('"Show N sets" reports the count the lineup will show, and closes the dialog', async () => {
    mockScheduleFetch({ bands: [punkAlpha, folkBeta] })
    renderApp()
    await findAlphaToggle()

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    expect(screen.getByRole('button', { name: 'Show 2 sets' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Genre'), { target: { value: 'Folk' } })
    const showButton = screen.getByRole('button', { name: 'Show 1 set' })
    fireEvent.click(showButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Group by Venue in the dialog renders a heading per venue', async () => {
    mockScheduleFetch({ bands: [punkAlpha, folkBeta] })
    renderApp()
    await findAlphaToggle()
    const main = screen.getByRole('main')
    expect(within(main).queryByRole('heading', { name: 'Venue A' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Venue' }))

    expect(within(main).getByRole('heading', { name: 'Venue A' })).toBeInTheDocument()
    expect(within(main).getByRole('heading', { name: 'Venue B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Filter, 1 active' })).toBeInTheDocument()
  })

  it('moves "Add all" and "Copy this list" after the lineup', async () => {
    renderApp()
    await findAlphaToggle()
    const main = screen.getByRole('main')

    const addAll = within(main).getByRole('button', { name: 'Add all 2 to My route' })
    const lastBand = within(main).getByRole('button', { name: 'Add Beta Foxes to my route' })
    // DOCUMENT_POSITION_FOLLOWING: addAll comes after the last band.
    expect(lastBand.compareDocumentPosition(addAll) & window.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(main).getByRole('button', { name: 'Copy this list' })).toBeInTheDocument()
  })

  it('shows the "Later" heading only while something is playing now', async () => {
    renderApp()
    await findAlphaToggle()
    // Real "now" (2026) is long before the 2030 fixtures: nothing is playing.
    expect(screen.queryByRole('heading', { name: 'Later' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'UPCOMING' })).not.toBeInTheDocument()
    cleanup()

    // Pin "now" inside Alpha's 20:00-20:30 set, with Beta still to come.
    window.localStorage.setItem(DEBUG_TIME_STORAGE_KEY, new Date('2030-06-15T20:10:00').toISOString())
    renderApp()
    await findAlphaToggle()
    expect(screen.getByRole('heading', { name: 'Later' })).toBeInTheDocument()
  })
})

describe('shared-schedule import via ?s=', () => {
  it('applies immediately when the fan has no existing route', async () => {
    renderApp('/event/test-event?s=101')

    expect(await screen.findByRole('button', { name: 'Remove Alpha Wolves from my route' })).toBeInTheDocument()
    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual(['evt-alpha-101'])
    })
  })

  it('opens the Load shared route confirm when a route already exists, and Merge unions the two routes', async () => {
    window.localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify({ 'test-event': ['evt-alpha-101'] }))
    renderApp('/event/test-event?s=202')

    const dialog = await screen.findByRole('dialog', { name: 'Load shared route' })
    within(dialog).getByText('Beta Foxes') // "You'd add"
    within(dialog).getByText('Alpha Wolves') // "Only yours"

    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }))

    expect(screen.queryByRole('dialog', { name: 'Load shared route' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual(['evt-alpha-101', 'evt-beta-202'])
    })
  })

  it('Replace swaps the route for the shared one instead of merging', async () => {
    window.localStorage.setItem(SELECTED_BANDS_KEY, JSON.stringify({ 'test-event': ['evt-alpha-101'] }))
    renderApp('/event/test-event?s=202')

    const dialog = await screen.findByRole('dialog', { name: 'Load shared route' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }))

    expect(screen.queryByRole('dialog', { name: 'Load shared route' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(getSelectedBands('test-event')).toEqual(['evt-beta-202'])
    })
  })
})

describe('shared-schedule import via ?share= (useSharedRouteImport -> handleShareData)', () => {
  it('fetches the share snapshot and opens the confirm dialog with the matched band', async () => {
    const fetchMock = mockScheduleFetch({ shareSnapshot: { performance_ids: [202], band_names: ['Beta Foxes'] } })
    renderApp('/event/test-event?share=shared-abc123')

    const dialog = await screen.findByRole('dialog', { name: 'Load shared route' })
    within(dialog).getByText('Beta Foxes')

    expect(fetchMock).toHaveBeenCalledWith('/api/schedule/share/shared-abc123?import=1')
  })
})

describe('error states', () => {
  it('shows the generic error card for a non-network failure', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ message: 'Schedule temporarily unavailable' }, { ok: false, status: 400 }))
    )
    renderApp()

    const heading = await screen.findByRole('heading', { name: 'Oops! Something went wrong', level: 2 })
    const card = heading.closest('div')
    within(card).getByText('Schedule temporarily unavailable')
    expect(screen.queryByRole('heading', { name: "You're offline" })).not.toBeInTheDocument()
  })

  it('shows branded offline messaging, not the generic error card, for a network failure', async () => {
    // fetchPublicJson retries once on a transient network error before
    // rethrowing (utils/publicApi.js), so the TypeError surfaces ~600ms
    // after mount — hence the generous findByRole timeout below.
    global.fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
    renderApp()

    const heading = await screen.findByRole('heading', { name: "You're offline", level: 2 }, { timeout: 3000 })
    expect(heading).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Oops! Something went wrong' })).not.toBeInTheDocument()
  })
})

// The "something is still to come" teaser (#1150).
//
// TWO states share one banner, and the negative cases are the point: a
// predicate that is too wide would tell a fan the set times are coming while
// the page is already showing them. So every state gets a case, not just the
// new one.
describe('still-to-come teaser', () => {
  const noTimeAlpha = { ...bandAlpha, startTime: null, endTime: null }
  const noTimeBeta = { ...bandBeta, startTime: null, endTime: null }

  it('offers "set times coming soon" for an announced lineup with no start times', async () => {
    // Vol 18's exact shape: reveal_mode 0, every set announced, not one placed.
    mockScheduleFetch({ bands: [noTimeAlpha, noTimeBeta], event: { ...mockEvent, reveal_mode: 0 } })
    renderApp()

    expect(await screen.findByText(/Set times coming soon\./)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Subscribe for updates/ })).not.toBeInTheDocument()
  })

  it('still says "more bands dropping soon" on a staged reveal', async () => {
    // reveal_mode wins even with no times set: more BANDS is the bigger news,
    // and the two messages must never both render.
    mockScheduleFetch({ bands: [noTimeAlpha], event: { ...mockEvent, reveal_mode: 1 } })
    renderApp()

    expect(await screen.findByText(/More bands dropping soon\./)).toBeInTheDocument()
    expect(screen.queryByText(/Set times coming soon\./)).not.toBeInTheDocument()
  })

  it('shows no teaser once the schedule is out', async () => {
    // The regression this guards: promising set times that are already on screen.
    mockScheduleFetch({ bands: [bandAlpha, bandBeta], event: { ...mockEvent, reveal_mode: 0 } })
    renderApp()
    await findAlphaToggle()

    expect(screen.queryByText(/Set times coming soon\./)).not.toBeInTheDocument()
    expect(screen.queryByText(/More bands dropping soon\./)).not.toBeInTheDocument()
  })

  it('shows no teaser on an archived event', async () => {
    // Nothing is still to come for an event that already happened.
    mockScheduleFetch({
      bands: [noTimeAlpha],
      event: { ...mockEvent, reveal_mode: 0, is_archived: true },
    })
    renderApp()
    await screen.findByText(/Alpha Wolves/)

    expect(screen.queryByText(/Set times coming soon\./)).not.toBeInTheDocument()
  })

  it('shows no teaser when the lineup itself is empty', async () => {
    // "Lineup TBA" is a third state. Promising SET TIMES before there are any
    // sets gets ahead of itself -- and an empty `bands` is also what the page
    // looks like mid-fetch, so this doubles as the no-flash case.
    mockScheduleFetch({ bands: [], event: { ...mockEvent, reveal_mode: 0 } })
    renderApp()
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    expect(screen.queryByText(/Set times coming soon\./)).not.toBeInTheDocument()
  })
  it('shows no teaser once even ONE set has a time', async () => {
    // The boundary the every() expresses: a PARTIAL schedule is a schedule that
    // has started landing. "Set times coming soon" alongside visible set times
    // would contradict the page it sits on.
    mockScheduleFetch({
      bands: [bandAlpha, noTimeBeta],
      event: { ...mockEvent, reveal_mode: 0 },
    })
    renderApp()
    await findAlphaToggle()

    expect(screen.queryByText(/Set times coming soon\./)).not.toBeInTheDocument()
  })

  it('reads the PUBLIC lineup, so a hidden set cannot suppress the teaser', async () => {
    // On a staged reveal the API omits unannounced sets, so a timed-but-hidden
    // performance never reaches `bands`. The teaser must therefore key off what
    // the fan can actually see -- which is also why reveal_mode is checked
    // first and this event says "more bands" rather than "set times".
    mockScheduleFetch({ bands: [noTimeAlpha], event: { ...mockEvent, reveal_mode: 1 } })
    renderApp()

    expect(await screen.findByText(/More bands dropping soon\./)).toBeInTheDocument()
  })
  it('still teases a staged reveal that has revealed NOTHING yet', async () => {
    // Deliberate, and the behaviour predates this PR: the old condition was
    // `!isArchived && reveal_mode === 1` with no lineup check at all.
    //
    // Suppressing the teaser here would remove it from the event that needs it
    // most -- a staged reveal with nothing revealed is the whole premise of a
    // staged reveal, and "more bands dropping soon" is exactly true.
    //
    // Note this differs from the SET TIMES branch, which does require a
    // non-empty lineup: promising set times before there are any sets gets
    // ahead of itself, while promising bands before there are any is the point.
    mockScheduleFetch({ bands: [], event: { ...mockEvent, reveal_mode: 1 } })
    renderApp()

    expect(await screen.findByText(/More bands dropping soon\./)).toBeInTheDocument()
    expect(screen.queryByText(/Set times coming soon\./)).not.toBeInTheDocument()
  })
})
