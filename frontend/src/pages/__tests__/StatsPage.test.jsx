import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StatsPage from '../StatsPage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter>
          <StatsPage />
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

describe('StatsPage', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
  })

  it('renders stat cards and the top-bands list once loaded', async () => {
    fetchPublicJson.mockResolvedValue({
      bands: 22,
      venues: 6,
      events: 1,
      performances: 23,
      routes_shared: 14,
      route_views: 40,
      route_views_legacy: 0,
      fans_following: 8,
      page_views: 500,
      top_bands: [
        { name: 'The Creepshow', slug: 'the-creepshow', score: 47 },
        { name: 'Zero Score Band', slug: 'zero-score-band', score: 0 },
      ],
    })

    renderPage()

    expect(await screen.findByText('22')).toBeInTheDocument()
    expect(screen.getByText('Bands')).toBeInTheDocument()
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText('Venues')).toBeInTheDocument()

    expect(screen.getByText('Top bands')).toBeInTheDocument()
    const creepshowLink = screen.getByRole('link', { name: /The Creepshow/ })
    expect(creepshowLink).toHaveAttribute('href', '/band/the-creepshow')
    expect(screen.getByText('47 pts')).toBeInTheDocument()

    // A zero score is not shown as "0 pts" (softened per the privacy/UX spec).
    const zeroBandLink = screen.getByRole('link', { name: /Zero Score Band/ })
    expect(zeroBandLink).not.toHaveTextContent('pts')
  })

  it('softens a zero-value stat instead of showing a stark "0"', async () => {
    fetchPublicJson.mockResolvedValue({
      bands: 22,
      venues: 6,
      events: 1,
      performances: 22,
      routes_shared: 0,
      route_views: 0,
      route_views_legacy: 0,
      fans_following: 0,
      page_views: 0,
      top_bands: [],
    })

    renderPage()

    expect(await screen.findByText('Bands')).toBeInTheDocument()
    const fansCard = screen.getByText('Fans following bands').previousSibling
    expect(fansCard).toHaveTextContent('0')
    expect(fansCard).not.toHaveClass('text-accent-400')

    // No top bands at all -> section is omitted entirely.
    expect(screen.queryByText('Top bands')).not.toBeInTheDocument()
  })

  it('shows legacy raw fetches separately from unique visitor route views', async () => {
    fetchPublicJson.mockResolvedValue({
      bands: 22,
      venues: 6,
      events: 1,
      performances: 23,
      routes_shared: 14,
      route_views: 2,
      route_views_legacy: 9,
      fans_following: 8,
      page_views: 500,
      top_bands: [],
    })

    renderPage()

    expect(await screen.findByText('Route views (unique visitors, all-time)')).toBeInTheDocument()
    expect(screen.getByText('9 pre-cutover raw fetches')).toBeInTheDocument()
    expect(screen.queryByText('11')).not.toBeInTheDocument()
  })

  it('omits legacy raw fetches when the legacy count is zero or null', async () => {
    fetchPublicJson.mockResolvedValue({
      bands: 22,
      venues: 6,
      events: 1,
      performances: 23,
      routes_shared: 14,
      route_views: 40,
      route_views_legacy: null,
      fans_following: 8,
      page_views: 500,
      top_bands: [],
    })

    renderPage()

    expect(await screen.findByText('Route views (unique visitors, all-time)')).toBeInTheDocument()
    expect(screen.queryByText(/pre-cutover raw fetches/)).not.toBeInTheDocument()
  })

  it('shows a friendly error message when the fetch fails', async () => {
    fetchPublicJson.mockRejectedValue(new Error('Failed to load stats'))

    renderPage()

    expect(await screen.findByText('Failed to load stats')).toBeInTheDocument()
  })
})
