import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BandProfilePage from '../BandProfilePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage(id = '206') {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={[`/band/${id}`]}>
          <Routes>
            <Route path="/band/:id" element={<BandProfilePage />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

function performance(overrides = {}) {
  return {
    id: 1001,
    event_id: 55,
    event_name: 'Vol. 17',
    event_slug: 'vol-17',
    event_date: '2099-08-02',
    event_end_date: null,
    event_status: 'published',
    performance_date: null,
    notes: null,
    venue_id: 3,
    venue_name: 'Room 47',
    venue_address: null,
    start_time: '20:00',
    end_time: '20:30',
    is_cancelled: 0,
    ...overrides,
  }
}

// #732 — a cancelled set must stay VISIBLE on the artist page (never silently
// disappear), rendered with a strikethrough PLUS a visible "Cancelled" label
// (the label is the accessible carrier per WCAG 1.4.1 — strikethrough alone
// isn't announced by screen readers). Structural assertions throughout: text
// presence alone ("Cancelled" appears somewhere) would pass even if the <s>
// wrapper were missing or attached to the wrong performance.
describe('BandProfilePage — cancelled set rendering (#732)', () => {
  it('renders a cancelled UPCOMING set struck through with a visible Cancelled label', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      id: 206,
      name: 'Cancelled Case',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: null,
      origin: null,
      social: {},
      stats: null,
      upcoming: [performance({ is_cancelled: 1 })],
      past: [],
    })

    renderPage('206')
    expect(await screen.findByRole('heading', { level: 1, name: 'Cancelled Case' })).toBeInTheDocument()

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    // Structural: the event name itself must be inside an <s> element, not
    // merely near the word "Cancelled" somewhere on the page. Scoped to the
    // card's own h3 -- "Vol. 17" also appears in the breadcrumb link, which
    // is never struck through and would give this assertion a false pass.
    const heading = screen.getByRole('heading', { level: 3, name: 'Vol. 17' })
    expect(heading.querySelector('s')).not.toBeNull()
  })

  it('renders a NON-cancelled upcoming set with no strikethrough and no Cancelled label', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      id: 207,
      name: 'Still Playing',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: null,
      origin: null,
      social: {},
      stats: null,
      upcoming: [performance({ is_cancelled: 0 })],
      past: [],
    })

    renderPage('207')
    expect(await screen.findByRole('heading', { level: 1, name: 'Still Playing' })).toBeInTheDocument()

    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 3, name: 'Vol. 17' })
    expect(heading.querySelector('s')).toBeNull()
  })

  it('hides the "Add to Schedule" toggle for a cancelled upcoming set (not selectable)', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      id: 208,
      name: 'No Toggle Band',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: null,
      origin: null,
      social: {},
      stats: null,
      upcoming: [performance({ is_cancelled: 1 })],
      past: [],
    })

    renderPage('208')
    expect(await screen.findByRole('heading', { level: 1, name: 'No Toggle Band' })).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /add to schedule/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /in schedule/i })).not.toBeInTheDocument()
    // The "View Event" link must still be there -- only the schedule toggle is suppressed.
    expect(screen.getByRole('link', { name: /view event/i })).toBeInTheDocument()
  })

  it('renders a cancelled PAST set struck through with a visible Cancelled label, alongside the existing Archived badge', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      id: 209,
      name: 'Archived Cancelled Band',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: null,
      origin: null,
      social: {},
      stats: null,
      upcoming: [],
      past: [performance({ event_status: 'archived', is_cancelled: 1 })],
    })

    renderPage('209')
    expect(await screen.findByRole('heading', { level: 1, name: 'Archived Cancelled Band' })).toBeInTheDocument()

    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 3, name: 'Vol. 17' })
    expect(heading.querySelector('s')).not.toBeNull()
  })

  it('renders a NON-cancelled past set with no strikethrough or Cancelled label', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      id: 210,
      name: 'Clean History Band',
      photo_url: null,
      photo_alt_text: null,
      description: null,
      genre: null,
      origin: null,
      social: {},
      stats: null,
      upcoming: [],
      past: [performance({ is_cancelled: 0 })],
    })

    renderPage('210')
    expect(await screen.findByRole('heading', { level: 1, name: 'Clean History Band' })).toBeInTheDocument()

    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 3, name: 'Vol. 17' })
    expect(heading.querySelector('s')).toBeNull()
  })
})
