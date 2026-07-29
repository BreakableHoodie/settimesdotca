import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EventTimeline from '../EventTimeline'
import { POSTER_IMAGE_HOST } from '../../utils/posterImage'

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

// Poster thumbnails on the listing (#658): the card is decorative-only (no
// lightbox — that lives on the event page, #656) and must render nothing
// when poster_url is absent, which is still the common case for events that
// haven't had a poster uploaded yet.
describe('EventTimeline poster thumbnails (#658)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // #659: the listing thumbnail renders through PosterImage, which requests
  // a Cloudflare image-transform derivative (width=200,format=auto, plus a
  // 200/400 1x/2x srcset) rather than the full-size original — the poster
  // URL here deliberately uses the real poster host so the transform
  // actually applies; a foreign host would silently pass through unchanged
  // and this test would stop proving anything.
  it('renders a decorative, transformed poster image when poster_url is present', async () => {
    const originalUrl = `https://${POSTER_IMAGE_HOST}/event-posters/1-poster-fest.jpg`
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Poster Fest',
          slug: 'poster-fest',
          date: '2026-08-02',
          status: 'published',
          is_published: true,
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
          poster_url: originalUrl,
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

    const { container } = render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Poster Fest')).toBeInTheDocument()

    const transformedSrc = `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1-poster-fest.jpg`
    const posterImg = container.querySelector(`img[src="${transformedSrc}"]`)
    expect(posterImg).toBeInTheDocument()
    expect(posterImg).toHaveAttribute(
      'srcset',
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1-poster-fest.jpg 1x, ` +
        `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=400,format=auto/event-posters/1-poster-fest.jpg 2x`
    )
    expect(posterImg).toHaveAttribute('alt', '')
    expect(posterImg).toHaveAttribute('loading', 'lazy')
    expect(posterImg).toHaveAttribute('decoding', 'async')
    // Decorative only — must not be wrapped in a button/lightbox trigger.
    expect(posterImg.closest('button')).toBeNull()
  })

  it('renders no poster element when poster_url is null', async () => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 2,
          name: 'No Poster Fest',
          slug: 'no-poster-fest',
          date: '2026-08-07',
          status: 'published',
          is_published: true,
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
          poster_url: null,
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

    const { container } = render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('No Poster Fest')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})

// Past-section poster performance (#658 follow-up): every past event now has
// a poster (240KB-663KB originals). Rendering all of them unconditionally
// would ship multiple megabytes on every homepage load even though the past
// list starts collapsed. The past cards — and therefore their <img> tags —
// must be conditionally rendered (not just CSS-hidden), so the browser never
// fetches a single past poster until "Show History" is clicked.
describe('EventTimeline past-section poster lazy mounting (#658)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not mount past poster <img> elements until History is expanded, then mounts them all', async () => {
    const pastEvent = (id, name) => ({
      id,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      date: '2020-05-10',
      status: 'archived',
      is_published: true,
      venues: [],
      bands: [],
      band_count: 0,
      venue_count: 0,
      ticket_url: null,
      poster_url: `https://cdn.example.com/posters/${id}.jpg`,
    })

    const timelineData = {
      now: [],
      upcoming: [],
      past: [pastEvent(1, 'Past Fest One'), pastEvent(2, 'Past Fest Two'), pastEvent(3, 'Past Fest Three')],
    }

    global.fetch = vi.fn(url => {
      if (url.startsWith('/api/events/timeline')) {
        return Promise.resolve(jsonResponse(timelineData))
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })

    const { container } = render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    const toggle = await screen.findByRole('button', { name: /show history/i })

    // Collapsed: none of the past posters are in the DOM at all — a
    // display:none/hidden approach would still leave <img> tags present
    // (and the browser would still fetch them), so this asserts the
    // stronger conditional-render requirement.
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByText('Past Fest One')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(await screen.findByText('Past Fest One')).toBeInTheDocument()
    const posterImgs = container.querySelectorAll('img')
    expect(posterImgs).toHaveLength(3)
    posterImgs.forEach(img => {
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(img).toHaveAttribute('decoding', 'async')
      expect(img).toHaveAttribute('alt', '')
    })

    // #697: each poster links to its event, like the title does — but must NOT
    // add a tab stop or an unlabelled link, since the image is alt="".
    posterImgs.forEach((img, i) => {
      const link = img.closest('a')
      expect(link).not.toBeNull()
      expect(link).toHaveAttribute('href', `/event/past-fest-${['one', 'two', 'three'][i]}`)
      expect(link).toHaveAttribute('aria-hidden', 'true')
      expect(link).toHaveAttribute('tabindex', '-1')
    })
  })

  it('raises no axe violation for the aria-hidden poster link', async () => {
    // The poster link is aria-hidden with tabIndex={-1}. axe's
    // `aria-hidden-focus` rule fires when an aria-hidden subtree contains
    // FOCUSABLE content; tabIndex={-1} removes it from the tab order, so the
    // contract is valid. This asserts that rather than assuming it.
    const { axe, toHaveNoViolations } = await import('jest-axe')
    expect.extend(toHaveNoViolations)

    const timelineData = {
      now: [],
      upcoming: [],
      past: [
        {
          id: 1,
          name: 'Axe Fest',
          slug: 'axe-fest',
          date: '2020-05-10',
          status: 'archived',
          is_published: true,
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
          poster_url: 'https://cdn.example.com/posters/1.jpg',
        },
      ],
    }
    global.fetch = vi.fn(url =>
      url.startsWith('/api/events/timeline')
        ? Promise.resolve(jsonResponse(timelineData))
        : Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    )

    const { container } = render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )
    fireEvent.click(await screen.findByRole('button', { name: /show history/i }))
    await screen.findByText('Axe Fest')

    expect(await axe(container)).toHaveNoViolations()
  }, 20000)

  it('renders the poster unlinked when the event has no slug', async () => {
    // Mirrors the title's own slug guard — otherwise this links to
    // /event/undefined.
    const timelineData = {
      now: [],
      upcoming: [],
      past: [
        {
          id: 9,
          name: 'Slugless Fest',
          slug: null,
          date: '2020-05-10',
          status: 'archived',
          is_published: true,
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
          poster_url: 'https://cdn.example.com/posters/9.jpg',
        },
      ],
    }

    global.fetch = vi.fn(url => {
      if (url.startsWith('/api/events/timeline')) {
        return Promise.resolve(jsonResponse(timelineData))
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })

    const { container } = render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    fireEvent.click(await screen.findByRole('button', { name: /show history/i }))
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img.closest('a')).toBeNull()
  })
})
