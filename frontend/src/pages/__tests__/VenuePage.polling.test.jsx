import { act, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VenuePage from '../VenuePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

const VENUE = { id: 6, name: 'Prohibition Warehouse', location: 'Waterloo, ON', address: null, website: null }
const set = isCancelled => ({
  performance_id: 1,
  start_time: '20:00',
  end_time: '20:30',
  is_cancelled: isCancelled,
  event_id: 37,
  event_name: 'Vol. 18',
  event_slug: 'lwbc18',
  event_date: '2099-10-11',
  band_id: 9,
  band_name: 'Night Owls',
})

const renderPage = () =>
  render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={['/venue/6']}>
          <Routes>
            <Route path="/venue/:id" element={<VenuePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )

const setVisibility = state => Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })

// A fan standing outside the venue with this page open must see a cancellation
// without reloading, as the event schedule already does (#1081).
describe('VenuePage keeps its sets live while open', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setVisibility('visible')
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({ venue: VENUE, upcoming: [set(0)], past: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('shows a cancellation within a minute of it being made', async () => {
    renderPage()
    expect(await screen.findByText('Night Owls')).toBeInTheDocument()
    expect(screen.getByText('Night Owls').closest('s')).toBeNull()

    fetchPublicJson.mockResolvedValue({ venue: VENUE, upcoming: [set(1)], past: [] })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(screen.getByText('Night Owls').closest('s')).not.toBeNull()
  })

  // Two refreshes can overlap (a timer tick and a return to the tab). The
  // older one must not overwrite the newer one's data when it lands last.
  it('ignores a slower, older response that lands after a newer one', async () => {
    renderPage()
    await screen.findByText('Night Owls')

    let resolveOld
    fetchPublicJson.mockImplementationOnce(() => new Promise(resolve => (resolveOld = resolve)))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000) // tick: old request, pending
    })

    fetchPublicJson.mockResolvedValueOnce({ venue: VENUE, upcoming: [set(1)], past: [] })
    await act(async () => {
      setVisibility('visible')
      document.dispatchEvent(new Event('visibilitychange')) // newer request: cancelled
    })
    expect(screen.getByText('Night Owls').closest('s')).not.toBeNull()

    await act(async () => {
      resolveOld({ venue: VENUE, upcoming: [set(0)], past: [] }) // stale: not cancelled
    })
    expect(screen.getByText('Night Owls').closest('s')).not.toBeNull()
  })

  it('recovers from a failed first load once a refresh succeeds', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockRejectedValueOnce(new Error('Failed to load venue'))
    fetchPublicJson.mockResolvedValue({ venue: VENUE, upcoming: [set(0)], past: [] })
    renderPage()
    expect(await screen.findByText('Failed to load venue')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Prohibition Warehouse' })).toBeInTheDocument()
    expect(screen.queryByText('Failed to load venue')).not.toBeInTheDocument()
  })

  it('does not poll while the tab is hidden', async () => {
    renderPage()
    await screen.findByText('Night Owls')
    const callsAfterLoad = fetchPublicJson.mock.calls.length

    setVisibility('hidden')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180000)
    })

    expect(fetchPublicJson.mock.calls.length).toBe(callsAfterLoad)
  })
})
