import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HistoryPage, { formatEditionDate } from '../HistoryPage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/metrics', () => ({ trackPageView: vi.fn() }))
vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

const POSTER = 'https://band-photos.settimes.ca/event-posters/vol18.jpg'

const DATA = {
  editions: [
    {
      slug: 'lwbc19',
      name: 'Vol. 19',
      date: '2027-02-14',
      end_date: null,
      poster_url: null,
      concluded: false,
      sets: 0,
      venues: 0,
    },
    {
      slug: 'blr3',
      name: "Bad Livin' Roadshow 3",
      date: '2026-07-10',
      end_date: '2026-07-12',
      poster_url: null,
      concluded: true,
      sets: 14,
      venues: 3,
    },
    {
      slug: 'lwbc18',
      name: 'Vol. 18',
      date: '2026-10-11',
      end_date: null,
      poster_url: POSTER,
      concluded: true,
      sets: 15,
      venues: 4,
    },
    {
      slug: 'lwbc01',
      name: 'Vol. 1',
      date: '2022-05-22',
      end_date: null,
      poster_url: null,
      concluded: true,
      sets: 8,
      venues: 2,
    },
  ],
  regulars: [
    {
      band_profile_id: 7,
      name: 'Arcade Allstars',
      editions: 5,
      first: { slug: 'lwbc03', name: 'Vol. 3', date: '2022-10-09' },
    },
  ],
  venues: [
    { venue_id: 2, name: 'Prohibition Warehouse', editions: 9, first_date: '2023-05-21', last_date: '2026-10-11' },
  ],
}

function renderPage() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

describe('formatEditionDate', () => {
  it('formats one day, a same-month range and a month-crossing range, never "Day 1"', () => {
    expect(formatEditionDate('2026-10-11', null)).toBe('Oct 11, 2026')
    expect(formatEditionDate('2026-07-10', '2026-07-12')).toBe('Jul 10–12, 2026')
    expect(formatEditionDate('2026-07-31', '2026-08-02')).toBe('Jul 31–Aug 2, 2026')
    expect(formatEditionDate('2026-10-11', '2026-10-11')).toBe('Oct 11, 2026')
  })
})

describe('HistoryPage (#1250)', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue(DATA)
  })

  it('links a concluded edition to its recap and an upcoming one to its live page', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: /Vol\. 18/ })).toHaveAttribute('href', '/events/lwbc18/recap')
    expect(screen.getByRole('link', { name: /Vol\. 19/ })).toHaveAttribute('href', '/event/lwbc19')
  })

  it('states the span of editions in the lead, oldest to newest', async () => {
    renderPage()
    expect(await screen.findByText('4 editions since May 2022, from Vol. 1 to Vol. 19.')).toBeInTheDocument()
  })

  it('shows a multi-day edition as a date range', async () => {
    renderPage()
    expect(await screen.findByText('Jul 10–12, 2026')).toBeInTheDocument()
  })

  it('puts a name card where an edition has no poster, and where its poster cannot load', async () => {
    renderPage()
    const tile = (await screen.findByRole('link', { name: /Vol\. 18/ })).closest('li')
    const img = within(tile).getByRole('presentation')
    // The transform fails, then the original fails too: nothing is left to show.
    fireEvent.error(img)
    fireEvent.error(img)
    expect(within(tile).queryByRole('presentation')).not.toBeInTheDocument()
    expect(within(tile).getAllByText('Vol. 18').length).toBe(2)
    // An edition with no poster at all never renders an image.
    const noPoster = screen.getByRole('link', { name: /Vol\. 1\b/ }).closest('li')
    expect(within(noPoster).queryByRole('presentation')).not.toBeInTheDocument()
  })

  it('lists regulars with links to their pages, and venues with their years', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: 'Arcade Allstars' })).toHaveAttribute('href', '/band/7')
    const regulars = screen.getByRole('heading', { name: 'Regulars' }).closest('section')
    expect(within(regulars).getByText('5')).toBeInTheDocument()
    expect(within(regulars).getByText('Vol. 3')).toBeInTheDocument()
    const venues = screen.getByRole('heading', { name: 'Venues across the years' }).closest('section')
    expect(within(venues).getByText('2023–2026')).toBeInTheDocument()
  })

  it('shows the error message when the editions cannot be loaded', async () => {
    fetchPublicJson.mockRejectedValue(new Error('Failed to load the editions'))
    renderPage()
    expect(await screen.findByText('Failed to load the editions')).toBeInTheDocument()
  })
})
