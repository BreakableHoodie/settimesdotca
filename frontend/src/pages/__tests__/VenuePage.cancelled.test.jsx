import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import VenuePage from '../VenuePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage(id = '3') {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/venue/${id}`]}>
          <Routes>
            <Route path="/venue/:id" element={<VenuePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

function perf(overrides = {}) {
  return {
    performance_id: 1,
    start_time: '20:00',
    end_time: '20:30',
    is_cancelled: 0,
    event_id: 55,
    event_name: 'Vol. 17',
    event_slug: 'vol-17',
    event_date: '2099-08-02',
    band_id: 9,
    band_name: 'Test Band',
    ...overrides,
  }
}

// #732 — functions/api/venues/[id].js already returns is_cancelled (Row always
// included, per the design doc's API table), but VenuePage never read it —
// PerformanceRow rendered a cancelled set exactly like an ordinary one on this
// public SEO surface. Structural assertions: the band name must be inside an
// <s> element, not just "Cancelled" text appearing somewhere on the page.
describe('VenuePage — cancelled performance rendering (#732)', () => {
  it('renders a cancelled upcoming performance struck through with a visible Cancelled label', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Room 47', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [perf({ is_cancelled: 1, band_name: 'Cancelled Band' })],
      past: [],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Room 47' })).toBeInTheDocument()

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Cancelled Band').closest('s')).not.toBeNull()
  })

  it('renders a NON-cancelled upcoming performance with no strikethrough or Cancelled label', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Room 47', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [perf({ is_cancelled: 0, band_name: 'Playing Band' })],
      past: [],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Room 47' })).toBeInTheDocument()

    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
    expect(screen.getByText('Playing Band').closest('s')).toBeNull()
  })

  it('renders a cancelled PAST performance struck through with a visible Cancelled label', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 3, name: 'Room 47', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [],
      past: [perf({ is_cancelled: 1, band_name: 'Cancelled Past Band', event_date: '2001-01-01' })],
    })

    renderPage('3')
    expect(await screen.findByRole('heading', { level: 1, name: 'Room 47' })).toBeInTheDocument()

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Cancelled Past Band').closest('s')).not.toBeNull()
  })
})
