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

// #742 (directions half only) — a fan standing outside a venue on their phone
// had no way to hand off to a maps app; the address was plain text. Assert on
// the resolved href, not just "a link exists" -- a mere-presence check would
// still pass against a broken query string or an unencoded interpolation.
describe('VenuePage — Directions handoff (#742)', () => {
  it('renders a Directions link built from venue name + address, properly encoded', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: {
        id: 20,
        name: 'The Mill (Main Stage)',
        location: 'Tillsonburg, ON',
        address: '20 John Pound Road, Tillsonburg, ON',
        website: null,
      },
      upcoming: [],
      past: [],
    })

    renderPage('20')
    expect(await screen.findByRole('heading', { level: 1, name: 'The Mill (Main Stage)' })).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Directions to The Mill (Main Stage)' })
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('The Mill (Main Stage), 20 John Pound Road, Tillsonburg, ON')
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders no Directions link when the venue has no address', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 21, name: 'No Address Venue', location: 'Waterloo, ON', address: null, website: null },
      upcoming: [],
      past: [],
    })

    renderPage('21')
    expect(await screen.findByRole('heading', { level: 1, name: 'No Address Venue' })).toBeInTheDocument()

    expect(screen.queryByRole('link', { name: /Directions/i })).not.toBeInTheDocument()
    // Belt-and-suspenders: an <a> rendered with no href has no implicit
    // "link" ARIA role, so a role-only query would pass even against a dead
    // anchor with the text still visible. Assert on the visible text too.
    expect(screen.queryByText('Directions')).not.toBeInTheDocument()
  })

  // A whitespace-only address is truthy, and reachable: formatAddress() in
  // functions/api/venues/[id].js joins with filter(Boolean), which keeps a
  // "   " address_line1. Neither the address row nor the link may render.
  it('renders neither the address row nor a Directions link for a whitespace-only address', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venue: { id: 22, name: 'Blank Address Venue', location: 'Waterloo, ON', address: '   ', website: null },
      upcoming: [],
      past: [],
    })

    renderPage('22')
    expect(await screen.findByRole('heading', { level: 1, name: 'Blank Address Venue' })).toBeInTheDocument()

    expect(screen.queryByRole('link', { name: /Directions/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Directions')).not.toBeInTheDocument()
    // The row itself must be gone, not merely empty -- an empty <p> beside the
    // heading is a visible layout gap.
    expect(document.querySelector('p.mt-1.flex')).toBeNull()
  })
})
