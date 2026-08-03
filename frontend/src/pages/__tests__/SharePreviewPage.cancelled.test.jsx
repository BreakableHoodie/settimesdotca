import { render, screen } from '@testing-library/react'
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

// #733 — deleted performances left orphaned band names on shared lineups. The
// fix has the endpoint drop hard-deleted rows from `bands` while leaving the
// stale `performance_ids`/`band_names` snapshot untouched (for the ?import=1
// apply path). That means this page's route count MUST derive from
// `bands.length`, never `band_names.length` — otherwise the heading, the Add
// button, and LockInLineupPanel's count all disagree with the actual number
// of rows rendered.
describe('SharePreviewPage — orphaned/cancelled performances (#733)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('counts the route from bands, not the stale band_names snapshot, when a performance was hard-deleted', async () => {
    // band_names still has 3 entries (untouched snapshot); bands has only 2
    // because the endpoint omits the hard-deleted performance. If the
    // heading/button/panel read band_names.length instead, this renders a
    // "3-stop route" heading over only 2 list rows -- the exact regression
    // this test guards against.
    fetchPublicJson.mockResolvedValue({
      slug: 'abc123',
      event_slug: 'vol17',
      event_name: 'Vol. 17',
      performance_ids: [1, 2, 3],
      band_names: ['Kept One', 'Kept Two', 'Deleted Band'],
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
    expect(screen.getByRole('button', { name: /add 2 stops? to my route/i })).toBeInTheDocument()
    // Structural proof, not just the heading text: exactly 2 <li> rows render.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('renders a cancelled set struck through with a Cancelled pill, keeping it in the count', async () => {
    fetchPublicJson.mockResolvedValue({
      slug: 'abc123',
      event_slug: 'vol17',
      event_name: 'Vol. 17',
      performance_ids: [1, 2],
      band_names: ['Cancelled Band', 'Playing Band'],
      bands: [
        {
          performance_id: 1,
          name: 'Cancelled Band',
          start_time: '20:00',
          end_time: '20:30',
          venue: 'Blue Room',
          performance_date: null,
          is_cancelled: 1,
        },
        {
          performance_id: 2,
          name: 'Playing Band',
          start_time: '21:00',
          end_time: '21:30',
          venue: 'Roost',
          performance_date: null,
          is_cancelled: 0,
        },
      ],
    })

    renderPage()

    // A cancelled set still resolves and still counts (only hard-deleted rows
    // are omitted), so the heading covers both bands.
    expect(await screen.findByRole('heading', { name: '2-stop route' })).toBeInTheDocument()
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    // Structural, not just text-presence: the cancelled band's NAME is inside
    // an <s> element. Asserting only that "Cancelled" text exists somewhere on
    // the page would pass even if the strikethrough wrapper were missing.
    expect(screen.getByText('Cancelled Band').closest('s')).not.toBeNull()
    expect(screen.getByText('Playing Band').closest('s')).toBeNull()
  })
})
