import { render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { ThemeProvider } from '../components/ThemeProvider.jsx'

// App.jsx's `/event/:slug` schedule fetch used to run ONCE on mount, with no
// polling, no visibilitychange handler, and no online/focus refresh -- only a
// manual window.location.reload() on the error card (#1081). The clock effect
// still ticked every 60s, so the page LOOKED live while the schedule
// underneath was a snapshot from whenever the tab was opened. Consequence on
// show day: the cancel toggle is documented to strike a set through "on every
// fan surface" (CLAUDE.md "Pulling a band from a live lineup"), but that was
// only true on a fresh load -- a fan who opened the page at doors and kept it
// in their pocket saw the original schedule all night and could walk to a
// cancelled set, the exact outcome the toggle exists to prevent.
//
// These tests cover the fix: a visibility-gated 60s poll plus a
// visibilitychange handler, mirroring the pattern already proven in
// EventTimeline.jsx. The critical constraint is the silent-failure contract:
// a background poll that fails must never replace a working schedule with
// the error card (CLAUDE.md "Public cache TTLs" neighbourhood; venues have
// bad signal) -- see the dedicated describe block below.

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

// Dated far in the future so the set never reads as "finished" relative to
// the real clock the suite runs under (matches App.test.jsx's convention).
function makeBand(overrides = {}) {
  return {
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
    is_cancelled: 0,
    ...overrides,
  }
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve(body),
  }
}

// Dispatches by URL prefix, same convention as App.test.jsx's mockScheduleFetch.
// `scheduleResponses` is consumed one entry per `/api/schedule?` call -- the
// Nth call gets scheduleResponses[N-1], and the LAST entry repeats for any
// call beyond the array's length so a test only has to spell out what changes.
function mockScheduleFetch(scheduleResponses) {
  let scheduleCallCount = 0
  const impl = vi.fn(url => {
    const u = String(url)
    if (u.startsWith('/api/schedule/share/')) {
      return Promise.resolve(jsonResponse({ performance_ids: [], band_names: [] }))
    }
    if (u.startsWith('/api/schedule?')) {
      scheduleCallCount += 1
      const index = Math.min(scheduleCallCount, scheduleResponses.length) - 1
      const responder = scheduleResponses[index]
      return typeof responder === 'function' ? responder() : Promise.resolve(responder)
    }
    // /api/schedule/build, /api/metrics, etc. -- fire-and-forget beacons the
    // component doesn't inspect the response of.
    return Promise.resolve(jsonResponse({}))
  })
  vi.stubGlobal('fetch', impl)
  return {
    impl,
    scheduleCallCount: () => scheduleCallCount,
  }
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    writable: true,
    configurable: true,
  })
}

function renderApp() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={['/event/test-event']}>
          <Routes>
            <Route path="/event/:slug" element={<App />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

// The signal that the schedule finished loading and rendered the "all" (Live
// Lineup) view -- used instead of a fixed sleep so tests don't race the fetch
// mock's microtask queue (mirrors App.test.jsx's findAlphaToggle).
const findAlphaToggle = () => screen.findByRole('button', { name: 'Add Alpha Wolves to my route' })

describe('App schedule refresh (#1081)', () => {
  beforeEach(() => {
    setVisibility('visible')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    // Unconditional even though only some tests install fake timers: if an
    // assertion in one of those throws, a trailing call scoped inside that
    // test never runs and fake timers leak into every later test in this
    // file (same convention as EventTimeline.test.jsx). A no-op otherwise.
    vi.useRealTimers()
  })

  it('polls /api/schedule again after 60s while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { scheduleCallCount } = mockScheduleFetch([jsonResponse({ event: mockEvent, bands: [makeBand()] })])

    renderApp()
    await findAlphaToggle()
    expect(scheduleCallCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(60000)

    await waitFor(() => {
      expect(scheduleCallCount()).toBeGreaterThanOrEqual(2)
    })
  })

  // THIS IS THE TEST THAT MATTERS -- the user-facing behaviour the issue is
  // about, not merely "a fetch happened". A fan who kept the page open must
  // actually see the cancelled treatment (struck-through name, "Cancelled"
  // badge, toggle button gone) once the poll picks up the change.
  it('shows the cancelled treatment on a band after a poll reports is_cancelled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockScheduleFetch([
      jsonResponse({ event: mockEvent, bands: [makeBand()] }),
      jsonResponse({ event: mockEvent, bands: [makeBand({ is_cancelled: 1 })] }),
    ])

    renderApp()
    await findAlphaToggle()

    await vi.advanceTimersByTimeAsync(60000)

    // The toggle button disappears for a cancelled set (BandCard.jsx) --
    // wait for that first so the assertions below run against the
    // post-poll render, not a race with the fetch mock's microtask queue.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Add Alpha Wolves to my route' })).not.toBeInTheDocument()
    })

    const group = screen.getByRole('group', { name: 'Alpha Wolves at Venue A' })
    expect(within(group).getByText('Cancelled')).toBeInTheDocument()
  })

  it('does not poll while the document is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setVisibility('hidden')
    const { scheduleCallCount } = mockScheduleFetch([jsonResponse({ event: mockEvent, bands: [makeBand()] })])

    renderApp()
    // The initial mount fetch is NOT gated on visibility -- only the poll is
    // -- so the toggle still appears even though the document reports hidden.
    await findAlphaToggle()
    expect(scheduleCallCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(60000)

    expect(scheduleCallCount()).toBe(1)
  })

  // A background poll error must never blank a working schedule (venues have
  // bad signal) -- if it did, a fan in a basement would watch their lineup
  // vanish, strictly worse than the bug being fixed.
  it('leaves the original set on screen with no error card when a silent refetch fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let scheduleCallCount = 0
    const impl = vi.fn(url => {
      const u = String(url)
      if (u.startsWith('/api/schedule?')) {
        scheduleCallCount += 1
        if (scheduleCallCount === 1) {
          return Promise.resolve(jsonResponse({ event: mockEvent, bands: [makeBand()] }))
        }
        // A network failure -- fetchPublicJson retries this once (GET, 600ms
        // delay) before rethrowing, so the advance below has to clear both
        // the poll interval AND that retry delay.
        return Promise.reject(new TypeError('Failed to fetch'))
      }
      return Promise.resolve(jsonResponse({}))
    })
    vi.stubGlobal('fetch', impl)

    renderApp()
    await findAlphaToggle()

    await vi.advanceTimersByTimeAsync(61000)

    await waitFor(() => {
      expect(scheduleCallCount).toBeGreaterThanOrEqual(2)
    })

    // The last good data is still on screen...
    expect(screen.getByRole('button', { name: 'Add Alpha Wolves to my route' })).toBeInTheDocument()
    // ...and neither error card replaced it.
    expect(screen.queryByRole('heading', { name: 'Oops! Something went wrong' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: "You're offline" })).not.toBeInTheDocument()
  })

  it('refetches immediately when the tab becomes visible again', async () => {
    const { scheduleCallCount } = mockScheduleFetch([jsonResponse({ event: mockEvent, bands: [makeBand()] })])

    renderApp()
    await findAlphaToggle()
    expect(scheduleCallCount()).toBe(1)

    // Leave the tab -- no fetch, and confirms the handler distinguishes
    // hidden from visible rather than refetching on every change.
    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(scheduleCallCount()).toBe(1)

    // Return to it.
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => {
      expect(scheduleCallCount()).toBeGreaterThanOrEqual(2)
    })
  })
})
