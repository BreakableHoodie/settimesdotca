import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SharePreviewPage from '../SharePreviewPage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage(slug = 'abc123') {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/s/${slug}`]}>
          <Routes>
            <Route path="/s/:slug" element={<SharePreviewPage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

// #733 follow-up — SharePreviewPage passed the STALE performance_ids snapshot
// (still containing hard-deleted ids) to LockInLineupPanel, while bandCount
// used the filtered `bands` list. That mismatch meant "Lock in your lineup"
// would submit follow-batch requests for performance ids that no longer
// resolve to anything. `shareData.bands` is the live, filtered source of
// truth (App.jsx already relies on it being accurate) -- performance_ids fed
// to the panel must come from there, not the raw snapshot.
describe('SharePreviewPage — LockInLineupPanel gets live performance ids, not the stale snapshot (#733)', () => {
  let fetchMock

  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('submits only the LIVE performance ids (bands), excluding a hard-deleted id still present in performance_ids', async () => {
    fetchPublicJson.mockResolvedValue({
      slug: 'abc123',
      event_slug: 'vol17',
      event_name: 'Vol. 17',
      // Stale snapshot: still lists 3 ids, including the deleted performance (3).
      performance_ids: [1, 2, 3],
      band_names: ['Kept One', 'Kept Two', 'Deleted Band'],
      // Live, filtered list: only 2 resolve (#733 drops the hard-deleted row).
      bands: [
        {
          performance_id: 1,
          name: 'Kept One',
          start_time: '20:00',
          end_time: '20:30',
          venue: 'Blue Room',
          performance_date: null,
          is_cancelled: 0,
        },
        {
          performance_id: 2,
          name: 'Kept Two',
          start_time: '21:00',
          end_time: '21:30',
          venue: 'Roost',
          performance_date: null,
          is_cancelled: 0,
        },
      ],
    })

    renderPage()
    expect(await screen.findByRole('heading', { name: '2-stop route' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/bands/follow-batch')
    const body = JSON.parse(opts.body)

    // The load-bearing assertion: the id list matches the LIVE bands, not the
    // stale snapshot. A broken implementation passing performance_ids
    // directly would submit [1, 2, 3] here.
    expect(body.performance_ids).toEqual([1, 2])
  })

  it('submits the full id list when nothing was deleted (sibling proof: not just always-truncated)', async () => {
    fetchPublicJson.mockResolvedValue({
      slug: 'fullset',
      event_slug: 'vol17',
      event_name: 'Vol. 17',
      performance_ids: [10, 20, 30],
      band_names: ['Band A', 'Band B', 'Band C'],
      bands: [
        {
          performance_id: 10,
          name: 'Band A',
          start_time: '19:00',
          end_time: '19:30',
          venue: 'Room 47',
          performance_date: null,
          is_cancelled: 0,
        },
        {
          performance_id: 20,
          name: 'Band B',
          start_time: '20:00',
          end_time: '20:30',
          venue: 'Room 47',
          performance_date: null,
          is_cancelled: 0,
        },
        {
          performance_id: 30,
          name: 'Band C',
          start_time: '21:00',
          end_time: '21:30',
          venue: 'Room 47',
          performance_date: null,
          is_cancelled: 0,
        },
      ],
    })

    renderPage('fullset')
    expect(await screen.findByRole('heading', { name: '3-stop route' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/your email address/i), {
      target: { value: 'fan@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /notify me/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.performance_ids).toEqual([10, 20, 30])
  })
})
