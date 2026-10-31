import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BandProfilePage from '../BandProfilePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage(id) {
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

const upcoming = {
  id: 1001,
  event_id: 55,
  event_name: 'Vol. 19',
  event_slug: 'vol-19',
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
}

const profile = (over = {}) => ({
  id: 312,
  name: 'Calendar Band',
  photo_url: null,
  photo_alt_text: null,
  description: null,
  genre: null,
  origin: null,
  social: {},
  stats: null,
  upcoming: [],
  past: [],
  ...over,
})

describe('BandProfilePage — "Add to my calendar" replaces the email follow', () => {
  const host = window.location.host
  const webcal = `webcal://${host}/api/feeds/ical?band=312`

  async function expectLinks() {
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendar Band' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add to my calendar' })).toHaveAttribute('href', webcal)
    expect(screen.getByRole('link', { name: 'Google Calendar' })).toHaveAttribute(
      'href',
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`
    )
    expect(screen.getByRole('link', { name: 'Download .ics' })).toHaveAttribute(
      'href',
      `${window.location.protocol}//${host}/api/feeds/ical?band=312`
    )
    expect(
      screen.getByText(/New sets show up in your calendar automatically as they're announced\./)
    ).toBeInTheDocument()
  }

  it('offers the band feed when the band has upcoming sets', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue(profile({ upcoming: [upcoming] }))
    renderPage('312')
    await expectLinks()
  })

  it('still offers it when the band has no upcoming sets (the feed fills in later)', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue(profile())
    renderPage('312')
    await expectLinks()
  })
})
