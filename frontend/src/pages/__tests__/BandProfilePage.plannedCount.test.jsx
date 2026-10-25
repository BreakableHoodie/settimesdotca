import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BandProfilePage from '../BandProfilePage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter initialEntries={['/band/206']}>
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

function mockProfile({ upcoming = [], past = [] }) {
  fetchPublicJson.mockReset()
  fetchPublicJson.mockResolvedValue({
    id: 206,
    name: 'Planned Case',
    photo_url: null,
    photo_alt_text: null,
    description: null,
    genre: null,
    origin: null,
    social: {},
    stats: null,
    upcoming,
    past,
  })
}

describe('BandProfilePage - planned count line (#1246)', () => {
  it('uses the future tense for an upcoming set', async () => {
    mockProfile({ upcoming: [performance({ planned_count: 12 })] })
    renderPage()
    expect(await screen.findByText('12 fans are planning to see this set')).toBeInTheDocument()
    expect(screen.queryByText(/fans planned this set/)).toBeNull()
  })

  it('uses the past tense for a past set', async () => {
    mockProfile({
      past: [performance({ id: 1002, event_date: '2020-08-02', event_status: 'archived', planned_count: 7 })],
    })
    renderPage()
    expect(await screen.findByText('7 fans planned this set')).toBeInTheDocument()
    expect(screen.queryByText(/are planning to see/)).toBeNull()
  })

  it('renders nothing when the count is null or absent', async () => {
    mockProfile({
      upcoming: [performance({ planned_count: null })],
      past: [performance({ id: 1002, event_date: '2020-08-02', event_status: 'archived' })],
    })
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Planned Case' })).toBeInTheDocument()
    expect(screen.queryByText(/fans/)).toBeNull()
  })
})
