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

// CodeRabbit MAJOR 2 (#733 follow-up) -- when EVERY shared performance has
// been hard-deleted since the link was created, `bands` resolves to a
// PRESENT, live, empty array (`[]`), not an absent field. The old code read
// `shareData.bands?.length ?? shareData.band_names.length` for the heading
// (0-length is not nullish, so this correctly produced 0) but
// `shareData.bands?.length ? ... : shareData.band_names.map(...)` for the row
// list -- 0-length IS falsy in a ternary, so the ELSE branch fired and
// rendered the stale band_names snapshot. The heading said "0-stop route"
// while the list below showed every deleted band's name. This test seeds
// exactly that shape (bands: [], band_names: 2 stale entries) and pins BOTH
// the heading and the row count to the SAME resolved list.
describe('SharePreviewPage — an empty live bands list must not fall back to the stale snapshot (#733)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders a 0-stop route with zero rows when every shared performance was hard-deleted', async () => {
    fetchPublicJson.mockResolvedValue({
      slug: 'abc123',
      event_slug: 'vol17',
      event_name: 'Vol. 17',
      performance_ids: [1, 2],
      band_names: ['Deleted Band One', 'Deleted Band Two'],
      bands: [],
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: '0-stop route' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add 0 stops to my route/i })).toBeInTheDocument()
    // Structural, not just heading text: no <li> rows at all -- the stale
    // band_names snapshot must never leak into the rendered list.
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.queryByText('Deleted Band One')).not.toBeInTheDocument()
    expect(screen.queryByText('Deleted Band Two')).not.toBeInTheDocument()
  })
})
