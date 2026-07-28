import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventRecapPage from '../EventRecapPage.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage(slug = 'lwbc01') {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/events/${slug}/recap`]}>
        <Routes>
          <Route path="/events/:slug/recap" element={<EventRecapPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  )
}

// #614: roster-only historical archives (Vols 1-14) have no venue or time
// data — the recap page must not render "we don't know" noise for them.
describe('EventRecapPage — roster-only archive (no venue/time data)', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      event: { id: 1, name: 'LWBC Vol1', slug: 'lwbc01', date: '2022-05-22' },
      stats: { total_sets: 2, venue_count: 0, first_timers: 2, returning_acts: 0 },
      bands: [
        {
          id: 10,
          performance_id: 100,
          name: 'Roster Band A',
          genre: 'Rock',
          photo_url: null,
          start_time: null,
          end_time: null,
          venue_id: null,
          venue_name: null,
          is_returning: false,
        },
        {
          id: 11,
          performance_id: 101,
          name: 'Roster Band B',
          genre: 'Punk',
          photo_url: null,
          start_time: null,
          end_time: null,
          venue_id: null,
          venue_name: null,
          is_returning: false,
        },
      ],
    })
  })

  it('omits the Venues stat tile entirely', async () => {
    renderPage()
    expect(await screen.findByText('LWBC Vol1')).toBeInTheDocument()

    const statsRegion = screen.getByRole('region', { name: 'Event statistics' })
    expect(within(statsRegion).queryByText('Venues')).not.toBeInTheDocument()
    expect(within(statsRegion).queryByText(/^Venues:/)).not.toBeInTheDocument()
    // Sibling stats are unaffected.
    expect(within(statsRegion).getByText('Total Sets')).toBeInTheDocument()
    expect(within(statsRegion).getByText('First Timers')).toBeInTheDocument()
  })

  it('never renders "TBD–TBD" time ranges', async () => {
    renderPage()
    await screen.findByText('LWBC Vol1')

    expect(screen.queryByText(/TBD.{1,3}TBD/)).not.toBeInTheDocument()
  })

  it('labels the lone no-venue group "Lineup", not "Unscheduled"', async () => {
    renderPage()
    await screen.findByText('LWBC Vol1')

    expect(screen.getByRole('heading', { level: 3, name: 'Lineup' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Unscheduled' })).not.toBeInTheDocument()
  })
})

describe('EventRecapPage — fully-scheduled event', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      event: { id: 2, name: 'LWBC Vol17', slug: 'lwbc17', date: '2026-08-02' },
      stats: { total_sets: 2, venue_count: 1, first_timers: 1, returning_acts: 1 },
      bands: [
        {
          id: 20,
          performance_id: 200,
          name: 'Scheduled Band A',
          genre: 'Indie',
          photo_url: null,
          start_time: '19:00',
          end_time: '20:00',
          venue_id: 5,
          venue_name: 'Main Stage',
          is_returning: true,
        },
        {
          id: 21,
          performance_id: 201,
          name: 'Scheduled Band B',
          genre: 'Folk',
          photo_url: null,
          start_time: '20:15',
          end_time: '21:00',
          venue_id: 5,
          venue_name: 'Main Stage',
          is_returning: false,
        },
      ],
    })
  })

  it('shows the Venues stat tile and real venue names as headings', async () => {
    renderPage('lwbc17')
    expect(await screen.findByText('LWBC Vol17')).toBeInTheDocument()

    const statsRegion = screen.getByRole('region', { name: 'Event statistics' })
    expect(within(statsRegion).getByText('Venues')).toBeInTheDocument()

    expect(screen.getByRole('heading', { level: 3, name: 'Main Stage' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Lineup' })).not.toBeInTheDocument()
  })

  it('renders real start/end times', async () => {
    renderPage('lwbc17')
    await screen.findByText('LWBC Vol17')

    // EventRecapPage renders raw 24-hour start/end times as-is (no AM/PM
    // conversion) — assert the actual values pass through, not "TBD".
    expect(screen.getAllByText(/19:00.{1,3}20:00/).length).toBeGreaterThan(0)
  })
})

describe('EventRecapPage — poster (#616)', () => {
  it('renders the poster, lazy-loaded, when poster_url is present', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      event: {
        id: 4,
        name: 'LWBC Vol16',
        slug: 'lwbc16',
        date: '2025-08-02',
        poster_url: 'https://band-photos.settimes.ca/event-posters/1-vol16.jpg',
      },
      stats: { total_sets: 0, venue_count: 0, first_timers: 0, returning_acts: 0 },
      bands: [],
    })

    renderPage('lwbc16')
    expect(await screen.findByText('LWBC Vol16')).toBeInTheDocument()

    const poster = screen.getByRole('img', { name: 'LWBC Vol16 poster' })
    expect(poster).toHaveAttribute('src', 'https://band-photos.settimes.ca/event-posters/1-vol16.jpg')
    expect(poster).toHaveAttribute('loading', 'lazy')
  })

  // #655: the poster is now click-to-enlarge via a shared ImageLightbox.
  it('opens the lightbox when the poster is clicked', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      event: {
        id: 4,
        name: 'LWBC Vol16',
        slug: 'lwbc16',
        date: '2025-08-02',
        poster_url: 'https://band-photos.settimes.ca/event-posters/1-vol16.jpg',
      },
      stats: { total_sets: 0, venue_count: 0, first_timers: 0, returning_acts: 0 },
      bands: [],
    })

    renderPage('lwbc16')
    expect(await screen.findByText('LWBC Vol16')).toBeInTheDocument()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View LWBC Vol16 poster' }))

    const dialog = screen.getByRole('dialog', { name: 'LWBC Vol16 poster' })
    expect(dialog).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close poster' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('omits the poster entirely when poster_url is absent', async () => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      event: { id: 5, name: 'LWBC Vol15', slug: 'lwbc15b', date: '2024-08-03', poster_url: null },
      stats: { total_sets: 0, venue_count: 0, first_timers: 0, returning_acts: 0 },
      bands: [],
    })

    renderPage('lwbc15b')
    expect(await screen.findByText('LWBC Vol15')).toBeInTheDocument()

    expect(screen.queryByRole('img', { name: /poster/i })).not.toBeInTheDocument()
  })
})

describe('EventRecapPage — partially-scheduled event', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      event: { id: 3, name: 'LWBC Vol15', slug: 'lwbc15', date: '2024-08-03' },
      stats: { total_sets: 2, venue_count: 1, first_timers: 2, returning_acts: 0 },
      bands: [
        {
          id: 30,
          performance_id: 300,
          name: 'Assigned Band',
          genre: 'Rock',
          photo_url: null,
          start_time: '19:00',
          end_time: '20:00',
          venue_id: 5,
          venue_name: 'Main Stage',
          is_returning: false,
        },
        {
          id: 31,
          performance_id: 301,
          name: 'Unassigned Band',
          genre: 'Pop',
          photo_url: null,
          start_time: null,
          end_time: null,
          venue_id: null,
          venue_name: null,
          is_returning: false,
        },
      ],
    })
  })

  it('keeps "Unscheduled" for the leftover no-venue group alongside a real venue group', async () => {
    renderPage('lwbc15')
    expect(await screen.findByText('LWBC Vol15')).toBeInTheDocument()

    expect(screen.getByRole('heading', { level: 3, name: 'Main Stage' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Unscheduled' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Lineup' })).not.toBeInTheDocument()
  })
})
