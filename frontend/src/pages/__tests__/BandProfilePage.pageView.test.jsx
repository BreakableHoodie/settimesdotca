import { render, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BandProfilePage from '../BandProfilePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'
import { trackArtistView, trackPageView } from '../../utils/metrics'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))
vi.mock('../../utils/metrics', () => ({
  trackPageView: vi.fn(),
  trackArtistView: vi.fn(),
  trackSocialClick: vi.fn(),
}))

const PROFILE = {
  id: 241,
  name: 'Your Pal Bill',
  photo_url: null,
  photo_alt_text: null,
  description: null,
  genre: null,
  origin: null,
  social: {},
  stats: null,
  performances: [],
}

function renderAt(path) {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/band/:id" element={<BandProfilePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

// #1265: every in-app artist link is slug-built, and the page redirects the
// URL to /band/<id> client-side once the profile loads. Keying the page view
// on the route param recorded both URLs, so each visit counted twice.
describe('BandProfilePage page views (#1265)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchPublicJson.mockImplementation(url =>
      url.startsWith('/api/bands/stats/') ? Promise.resolve(PROFILE) : Promise.resolve([])
    )
  })

  it('records exactly one page view, under the numeric id, for an in-app slug visit', async () => {
    renderAt('/band/your-pal-bill')
    await waitFor(() => expect(trackArtistView).toHaveBeenCalledWith(241))
    // Let the client redirect to /band/241 settle before counting.
    await waitFor(() => expect(fetchPublicJson).toHaveBeenCalledWith('/api/bands/stats/241', {}, 'Band not found'))
    await new Promise(r => setTimeout(r, 50))
    expect(trackPageView.mock.calls).toEqual([['/band/241']])
  })

  it('records one page view for a direct id visit', async () => {
    renderAt('/band/241')
    await waitFor(() => expect(trackArtistView).toHaveBeenCalledWith(241))
    await new Promise(r => setTimeout(r, 50))
    expect(trackPageView.mock.calls).toEqual([['/band/241']])
  })

  it('records no page view for a slug that does not resolve', async () => {
    fetchPublicJson.mockRejectedValue(new Error('Band not found'))
    renderAt('/band/nobody-by-this-name')
    await waitFor(() => expect(fetchPublicJson).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 50))
    expect(trackPageView).not.toHaveBeenCalled()
  })
})
