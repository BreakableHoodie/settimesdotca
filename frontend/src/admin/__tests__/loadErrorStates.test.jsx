import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserManagement from '../UserManagement'
import VenuesTab from '../VenuesTab'
import EventsTab from '../EventsTab'
import MetricsDashboard from '../components/MetricsDashboard'
import ArtistPicker from '../components/ArtistPicker'
import { eventsApi, usersApi, venuesApi } from '../../utils/adminApi'

// #1323: a failed fetch used to leave the list at [] and fall through to the
// view's "No X yet. Add one!" empty state, telling an admin their data was gone
// and inviting them to recreate it. Every case here follows the same shape so
// none can pass vacuously:
//   1. the fetch REJECTS -> the empty-state copy is ABSENT, the error is present
//   2. Retry is clicked  -> the fetch is called AGAIN
//   3. the retry resolves -> the real list renders and the error is gone
// Queries are exact-string (getByText with a string is an exact, whole-node
// match) or scoped with within(), never a loose regex against the whole page.

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

describe('UserManagement — load failure (#1323)', () => {
  it('shows an error with Retry, never the empty-state invite, and recovers on retry', async () => {
    usersApi.getAll.mockRejectedValueOnce(new Error('boom'))
    usersApi.getAll.mockResolvedValueOnce({
      users: [{ id: 1, email: 'dre@example.test', role: 'admin', isActive: true, first_name: 'Dre', last_name: 'L' }],
    })
    render(<UserManagement showToast={vi.fn()} />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load users.")).toBeInTheDocument()
    expect(screen.queryByText(/No users found/)).toBeNull()
    expect(usersApi.getAll).toHaveBeenCalledTimes(1)

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(usersApi.getAll).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(screen.getAllByText('dre@example.test').length).toBeGreaterThan(0)
  })

  it('a genuinely empty roster still shows the empty state, not the error', async () => {
    usersApi.getAll.mockResolvedValueOnce({ users: [] })
    render(<UserManagement showToast={vi.fn()} />)
    expect(await screen.findByText('No users found. Click "Invite User" to add one.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('VenuesTab — load failure (#1323)', () => {
  it('shows an error with Retry, never "No venues yet", and recovers on retry', async () => {
    venuesApi.getAll.mockRejectedValueOnce(new Error('boom'))
    venuesApi.getAll.mockResolvedValueOnce({
      venues: [{ id: 1, name: 'Blue Room', address: '', city: 'Kitchener', band_count: 0 }],
    })
    render(<VenuesTab showToast={vi.fn()} />)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load venues.")).toBeInTheDocument()
    expect(screen.queryByText(/No venues yet/)).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(venuesApi.getAll).toHaveBeenCalledTimes(2))
    expect((await screen.findAllByText('Blue Room')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a genuinely empty venue list still shows the empty state, not the error', async () => {
    venuesApi.getAll.mockResolvedValueOnce({ venues: [] })
    render(<VenuesTab showToast={vi.fn()} />)
    expect(await screen.findByText('No venues yet. Add your first venue to get started!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('EventsTab — load failure reported by its parent (#1323)', () => {
  it('shows an error, never "No events yet", and Retry calls the parent reload', () => {
    const onEventsChange = vi.fn()
    render(<EventsTab events={[]} loadError onEventsChange={onEventsChange} showToast={vi.fn()} />)

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText("Couldn't load events.")).toBeInTheDocument()
    expect(screen.queryByText(/No events yet/)).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(onEventsChange).toHaveBeenCalledTimes(1)
  })

  it('a genuinely empty event list (no error) still shows the empty state', () => {
    render(<EventsTab events={[]} onEventsChange={vi.fn()} showToast={vi.fn()} />)
    expect(screen.getByText('No events yet. Create your first event to get started!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('MetricsDashboard — load failure (#1323)', () => {
  it('shows an error with Retry instead of crashing on null metrics, and recovers on retry', async () => {
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

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText("Couldn't load metrics.")).toBeInTheDocument()
    expect(screen.queryByText('Event Metrics')).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(eventsApi.getMetrics).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Event Metrics')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ArtistPicker — roster load failure (#1323)', () => {
  it('shows an error with Retry, not "No artist found" or the Create prompt, even with a query typed', () => {
    const onRetry = vi.fn()
    render(
      <ArtistPicker
        artists={[]}
        loadError
        onRetry={onRetry}
        onSelect={vi.fn()}
        onBulkSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    fireEvent.change(screen.getByPlaceholderText('Search for an artist...'), { target: { value: 'Zed' } })

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText("Couldn't load the roster.")).toBeInTheDocument()
    expect(screen.queryByText(/No artist found named/)).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('without a load error, an unmatched query still offers to create the artist', () => {
    render(<ArtistPicker artists={[]} onSelect={vi.fn()} onBulkSelect={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('Search for an artist...'), { target: { value: 'Zed' } })
    expect(screen.getByText(/No artist found named/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
