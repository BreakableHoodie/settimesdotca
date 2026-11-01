import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserManagement from '../UserManagement'
import VenuesTab from '../VenuesTab'
import EventsTab from '../EventsTab'
import MetricsDashboard from '../components/MetricsDashboard'
import ArtistPicker from '../components/ArtistPicker'
import { eventsApi, usersApi, venuesApi } from '../../utils/adminApi'

// #1420: Retry on a failed load removed the focused button, so keyboard focus
// fell to <body> and nothing announced loading or the result (WCAG 2.4.3,
// 4.1.3). Each surface follows one script:
//   focus Retry -> activate it -> the refetch settles ->
//   focus is NOT <body> and IS the surface's named region, and the region's
//   status line says "... loaded." (or "Couldn't load ..." if it failed again).
// jsdom has no user-event here, so "Enter on a focused button" is the click
// the browser dispatches for it. Queries are scoped to the region.

vi.mock('../../utils/adminApi', () => ({
  usersApi: { getAll: vi.fn() },
  venuesApi: { getAll: vi.fn() },
  eventsApi: { getMetrics: vi.fn(), setPublishState: vi.fn(), update: vi.fn(), create: vi.fn() },
  bandsApi: { getByEvent: vi.fn() },
}))

vi.mock('../../contexts/EventContext', () => ({
  useEventContext: () => ({ refreshEvents: vi.fn() }),
}))

beforeEach(() => {
  vi.resetAllMocks()
})

const regionNamed = name => screen.getByRole('group', { name })

async function focusAndRetry(region) {
  const button = within(region).getByRole('button', { name: 'Retry' })
  button.focus()
  expect(document.activeElement).toBe(button)
  fireEvent.click(button)
}

async function expectFocusedRegion(name, statusText) {
  const region = regionNamed(name)
  await waitFor(() => expect(within(region).getByRole('status')).toHaveTextContent(statusText))
  expect(document.activeElement).not.toBe(document.body)
  expect(document.activeElement).toBe(region)
}

describe('Retry keeps focus and announces — UserManagement', () => {
  it('lands on the Users region and says "Users loaded."', async () => {
    usersApi.getAll.mockRejectedValueOnce(new Error('boom'))
    usersApi.getAll.mockResolvedValueOnce({
      users: [{ id: 1, email: 'dre@example.test', role: 'admin', isActive: true, first_name: 'Dre', last_name: 'L' }],
    })
    render(<UserManagement showToast={vi.fn()} />)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load users.")).toBeInTheDocument()

    await focusAndRetry(regionNamed('Users'))
    await expectFocusedRegion('Users', 'Users loaded.')
    expect(within(regionNamed('Users')).queryByRole('alert')).toBeNull()
  })

  it('says "Couldn\'t load users." once, keeps focus in the region, when the retry fails again', async () => {
    usersApi.getAll.mockRejectedValue(new Error('boom'))
    render(<UserManagement showToast={vi.fn()} />)
    await screen.findByRole('alert')

    await focusAndRetry(regionNamed('Users'))
    await expectFocusedRegion('Users', "Couldn't load users.")
    const region = regionNamed('Users')
    // The status line speaks for the failure after a retry; the alert must not
    // announce it a second time.
    expect(within(region).queryByRole('alert')).toBeNull()
    expect(within(region).getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('Retry keeps focus and announces — VenuesTab', () => {
  it('survives the loading swap and lands on the Venues region', async () => {
    venuesApi.getAll.mockRejectedValueOnce(new Error('boom'))
    venuesApi.getAll.mockResolvedValueOnce({
      venues: [{ id: 1, name: 'Blue Room', address: '', city: 'Kitchener', band_count: 0 }],
    })
    render(<VenuesTab showToast={vi.fn()} />)
    await screen.findByRole('alert')

    await focusAndRetry(regionNamed('Venues'))
    await expectFocusedRegion('Venues', 'Venues loaded.')
    expect(within(regionNamed('Venues')).getAllByText('Blue Room').length).toBeGreaterThan(0)
  })

  it('does not steal focus on the first load', async () => {
    venuesApi.getAll.mockResolvedValueOnce({ venues: [] })
    render(<VenuesTab showToast={vi.fn()} />)
    await screen.findByText('No venues yet. Add your first venue to get started!')
    expect(document.activeElement).toBe(document.body)
    expect(within(regionNamed('Venues')).getByRole('status')).toBeEmptyDOMElement()
  })
})

describe('Retry keeps focus and announces — MetricsDashboard', () => {
  it('lands on the metrics region and says "Metrics loaded."', async () => {
    eventsApi.getMetrics.mockRejectedValueOnce(new Error('boom'))
    eventsApi.getMetrics.mockResolvedValueOnce({
      metrics: {
        totalScheduleBuilds: 10,
        routeBuilders: 7,
        completionRate: 25,
        routeSizeDistribution: [],
        lastUpdated: '2026-06-18 12:00:00',
        popularBands: [],
        totalShares: 3,
        totalShareViews: 42,
        totalShareImports: 1,
        topSharedRoutes: [],
      },
    })
    render(<MetricsDashboard eventId={37} />)
    await screen.findByRole('alert')

    await focusAndRetry(regionNamed('Event metrics'))
    await expectFocusedRegion('Event metrics', 'Metrics loaded.')
    expect(within(regionNamed('Event metrics')).getByText('Event Metrics')).toBeInTheDocument()
  })
})

describe('Retry keeps focus and announces — EventsTab (parent-owned load)', () => {
  // The parent owns the load, so the retry must hand back a promise it can
  // wait on, and must ask for a BACKGROUND reload: a foreground one swaps the
  // whole panel for a spinner and would unmount the tab (see CLAUDE.md,
  // "Uploads saved before the form").
  function Parent({ outcome }) {
    const [loadError, setLoadError] = useState(true)
    const [events, setEvents] = useState([])
    const onEventsChange = vi.fn(async opts => {
      outcome(opts)
      await Promise.resolve()
      setLoadError(false)
      setEvents([])
    })
    return <EventsTab events={events} loadError={loadError} onEventsChange={onEventsChange} showToast={vi.fn()} />
  }

  it('reloads in the background, then lands on the Events region', async () => {
    const outcome = vi.fn()
    render(<Parent outcome={outcome} />)
    await focusAndRetry(regionNamed('Events'))
    await expectFocusedRegion('Events', 'Events loaded.')
    expect(outcome).toHaveBeenCalledWith({ background: true })
  })
})

describe('Retry keeps focus and announces — ArtistPicker', () => {
  it('lands on the roster region after the parent reload settles', async () => {
    function Parent() {
      const [loadError, setLoadError] = useState(true)
      return (
        <ArtistPicker
          artists={[]}
          loadError={loadError}
          onRetry={async () => {
            await Promise.resolve()
            setLoadError(false)
          }}
          onSelect={vi.fn()}
          onBulkSelect={vi.fn()}
          onCancel={vi.fn()}
        />
      )
    }
    render(<Parent />)
    await focusAndRetry(regionNamed('Artist roster'))
    await expectFocusedRegion('Artist roster', 'The roster loaded.')
  })
})
