import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EventTimeline from '../EventTimeline'

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: header => (header.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: vi.fn().mockResolvedValue(data),
  }
}

describe('EventTimeline', () => {
  let resolveDetails

  beforeEach(() => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Test Event',
          slug: 'test-event',
          date: '2026-05-10',
          status: 'published',
          is_published: true,
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
        },
      ],
      past: [],
    }

    const detailsPromise = new Promise(resolve => {
      resolveDetails = resolve
    })

    global.fetch = vi.fn(url => {
      if (url.startsWith('/api/events/timeline')) {
        return Promise.resolve(jsonResponse(timelineData))
      }

      if (url === '/api/events/1/details') {
        return detailsPromise
      }

      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading feedback while event details are being fetched', async () => {
    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Test Event')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /view details/i }))

    expect(await screen.findByText(/loading performers and venues/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /loading details/i })).toBeInTheDocument()

    resolveDetails(
      jsonResponse({
        venues: [{ id: 7, name: 'Stage A', band_count: 1, address: '123 King St' }],
        bands: [{ id: 9, name: 'Band One' }],
        band_count: 1,
        venue_count: 1,
      })
    )

    // Band One now appears in both the genre discovery wall and the All Performers grid
    expect((await screen.findAllByText('Band One'))[0]).toBeInTheDocument()
    expect(await screen.findByText('Stage A')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText(/loading performers and venues/i)).not.toBeInTheDocument()
    })
  })
})

// Regression: a band playing two sets at one event rendered as duplicate
// entries wherever the frontend treated per-performance rows as per-band
// rows. The details endpoint's `bands` array stays per-performance (each
// set carries its own `performance_id`), so this exercises both consumers:
// GenreDiscovery must dedupe by band id (one photo tile per act), while the
// "All Performers" grid intentionally keeps one card per set.
describe('EventTimeline duplicate performer chips (#605)', () => {
  let resolveDetails

  beforeEach(() => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Two-Set Event',
          slug: 'two-set-event',
          date: '2026-05-10',
          status: 'published',
          is_published: true,
          venues: [],
          bands: [],
          band_count: 2,
          venue_count: 1,
          ticket_url: null,
        },
      ],
      past: [],
    }

    const detailsPromise = new Promise(resolve => {
      resolveDetails = resolve
    })

    global.fetch = vi.fn(url => {
      if (url.startsWith('/api/events/timeline')) {
        return Promise.resolve(jsonResponse(timelineData))
      }
      if (url === '/api/events/1/details') {
        return detailsPromise
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders one GenreDiscovery tile but two All Performers cards for a two-set band', async () => {
    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Two-Set Event')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))
    expect(await screen.findByText(/loading performers and venues/i)).toBeInTheDocument()

    resolveDetails(
      jsonResponse({
        venues: [{ id: 7, name: 'Blue Room', band_count: 2, address: '123 King St' }],
        bands: [
          {
            id: 9,
            performance_id: 101,
            name: 'Two Set Band',
            genre: 'Punk',
            venue_id: 7,
            venue_name: 'Blue Room',
            start_time: '19:00',
            end_time: '20:00',
          },
          {
            id: 10,
            performance_id: 102,
            name: 'Solo Band',
            genre: 'Rock',
            venue_id: 7,
            venue_name: 'Blue Room',
            start_time: '20:30',
            end_time: '21:30',
          },
          {
            id: 9,
            performance_id: 103,
            name: 'Two Set Band',
            genre: 'Punk',
            venue_id: 7,
            venue_name: 'Blue Room',
            start_time: '22:00',
            end_time: '23:00',
          },
        ],
        band_count: 2,
        venue_count: 1,
      })
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading performers and venues/i)).not.toBeInTheDocument()
    })

    // GenreDiscovery wall: one photo-tile button per ACT — the two-set band
    // must be deduped to a single tile, not one per performance.
    const genreTiles = await screen.findAllByRole('button', { name: /Two Set Band/i })
    expect(genreTiles).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Solo Band/i })).toHaveLength(1)

    // All Performers grid: per-performance cards — the two-set band
    // legitimately renders twice (once per set), each with a distinct key.
    const performerCards = screen.getAllByRole('link', { name: /Two Set Band/i })
    expect(performerCards).toHaveLength(2)
  })
})

// Recap links on past editions (#555): the recap page was previously
// unreachable except by typing the URL.
describe('EventTimeline recap links', () => {
  const baseEvent = {
    venues: [],
    bands: [],
    band_count: 0,
    venue_count: 0,
    ticket_url: null,
    is_published: true,
    status: 'published',
  }

  beforeEach(() => {
    const timelineData = {
      now: [],
      upcoming: [{ ...baseEvent, id: 1, name: 'Upcoming Fest', slug: 'upcoming-fest', date: '2099-05-10' }],
      past: [{ ...baseEvent, id: 2, name: 'Past Fest', slug: 'past-fest', date: '2020-05-10' }],
    }
    global.fetch = vi.fn(url => {
      if (url.startsWith('/api/events/timeline')) {
        return Promise.resolve(jsonResponse(timelineData))
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('past event cards link to the recap; upcoming cards do not', async () => {
    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Upcoming Fest')).toBeInTheDocument()

    // Past events sit behind the "Show History" toggle
    fireEvent.click(screen.getByRole('button', { name: /show history/i }))
    expect(await screen.findByText('Past Fest')).toBeInTheDocument()

    const recapLinks = screen.getAllByRole('link', { name: 'Recap' })
    expect(recapLinks).toHaveLength(1)
    expect(recapLinks[0]).toHaveAttribute('href', '/events/past-fest/recap')
  })
})

// The collapsed "Performers:" chips show names only, so they sort
// alphabetically with the article-stripped #587 convention ("The X" under X's
// first real word) — regardless of the set-time order the API returns.
describe('EventTimeline collapsed performer chips ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders chips alphabetically, ignoring leading articles', async () => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 3,
          name: 'Chip Sort Fest',
          slug: 'chip-sort-fest',
          date: '2026-09-01',
          status: 'published',
          is_published: true,
          venues: [],
          // API order is set-time order — deliberately unalphabetical.
          bands: [
            { id: 1, name: 'Zebra Mussels' },
            { id: 2, name: 'The Anti-Queens' },
            { id: 3, name: 'Mango Static' },
          ],
          band_count: 3,
          venue_count: 0,
          ticket_url: null,
        },
      ],
      past: [],
    }

    global.fetch = vi.fn(url => {
      if (url.startsWith('/api/events/timeline')) {
        return Promise.resolve(jsonResponse(timelineData))
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Chip Sort Fest')).toBeInTheDocument()

    const chips = screen
      .getAllByRole('link')
      .map(el => el.textContent)
      .filter(text => ['Zebra Mussels', 'The Anti-Queens', 'Mango Static'].includes(text))

    // "The Anti-Queens" files under A (article stripped), then M, then Z.
    expect(chips).toEqual(['The Anti-Queens', 'Mango Static', 'Zebra Mussels'])
  })
})
