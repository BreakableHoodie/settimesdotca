import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import EventTimeline from '../EventTimeline'
import { POSTER_IMAGE_HOST } from '../../utils/posterImage'
import { formatPerformanceDayLabel } from '../../utils/timeFormat'

// EventTimeline expands details inside a React transition
// (`useTransition` in EventTimeline.jsx, ~line 48). React deliberately
// DEPRIORITISES transition work, so these waits are the ones that lose the CPU
// first when the full suite contends — the same tests pass 26/26 on an idle
// host in 1.5s. That deferral is the component's design, not a slow render to
// optimise away, which is why the fix is a scoped timeout rather than smaller
// fixtures. Scoped deliberately: raising the global default would hide a real
// regression anywhere else in the suite (#868).
const DETAILS_RENDER_TIMEOUT = 5000

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

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }

        if (url === '/api/events/1/details') {
          return detailsPromise
        }

        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )
  })

  afterEach(() => {
    // restoreAllMocks does NOT undo a direct assignment to global.fetch --
    // only unstubAllGlobals does, and only for vi.stubGlobal'd properties.
    vi.unstubAllGlobals()
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
    expect((await screen.findAllByText('Band One', {}, { timeout: DETAILS_RENDER_TIMEOUT }))[0]).toBeInTheDocument()
    expect(await screen.findByText('Stage A', {}, { timeout: DETAILS_RENDER_TIMEOUT })).toBeInTheDocument()
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

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        if (url === '/api/events/1/details') {
          return detailsPromise
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )
  })

  afterEach(() => {
    // restoreAllMocks does NOT undo a direct assignment to global.fetch --
    // only unstubAllGlobals does, and only for vi.stubGlobal'd properties.
    vi.unstubAllGlobals()
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
    const genreTiles = await screen.findAllByRole(
      'button',
      { name: /Two Set Band/i },
      { timeout: DETAILS_RENDER_TIMEOUT }
    )
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
    status: 'published',
  }

  beforeEach(() => {
    const timelineData = {
      now: [],
      upcoming: [{ ...baseEvent, id: 1, name: 'Upcoming Fest', slug: 'upcoming-fest', date: '2099-05-10' }],
      past: [{ ...baseEvent, id: 2, name: 'Past Fest', slug: 'past-fest', date: '2020-05-10' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )
  })

  afterEach(() => {
    // restoreAllMocks does NOT undo a direct assignment to global.fetch --
    // only unstubAllGlobals does, and only for vi.stubGlobal'd properties.
    vi.unstubAllGlobals()
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

// #743 — the "All Performers" grid rendered set times with no day, so a fan
// looking at a multi-day event's expanded lineup couldn't tell which day a
// set was on. formatPerformanceDayLabel() is the single source of truth for
// that label text (do not re-derive it here) — these tests only prove
// EventTimeline actually calls it with the right performance_date/event_date/
// event_end_date and renders the result, and that it's suppressed entirely
// for a single-day event (#540/#541: no lone "Day 1").
describe('EventTimeline performance day labels (#743)', () => {
  afterEach(() => {
    // restoreAllMocks does NOT undo a direct assignment to global.fetch --
    // only unstubAllGlobals does, and only for vi.stubGlobal'd properties.
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('labels each set with its own festival day for a multi-day event', async () => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Buddies Fest 2',
          slug: 'buddies-fest-2',
          date: '2026-08-07',
          end_date: '2026-08-09',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 2,
          venue_count: 1,
          ticket_url: null,
        },
      ],
      past: [],
    }

    let resolveDetails
    const detailsPromise = new Promise(resolve => {
      resolveDetails = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        if (url === '/api/events/1/details') {
          return detailsPromise
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Buddies Fest 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))
    expect(await screen.findByText(/loading performers and venues/i)).toBeInTheDocument()

    resolveDetails(
      jsonResponse({
        venues: [{ id: 7, name: 'The Mill', band_count: 2, address: '123 King St' }],
        bands: [
          {
            id: 20,
            performance_id: 201,
            name: 'Day One Band',
            venue_id: 7,
            venue_name: 'The Mill',
            start_time: '20:00',
            end_time: '20:45',
            performance_date: '2026-08-07',
          },
          {
            id: 21,
            performance_id: 202,
            name: 'Day Three Band',
            venue_id: 7,
            venue_name: 'The Mill',
            start_time: '16:10',
            end_time: '16:45',
            performance_date: '2026-08-09',
          },
        ],
        band_count: 2,
        venue_count: 1,
      })
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading performers and venues/i)).not.toBeInTheDocument()
    })

    const day1Label = formatPerformanceDayLabel({
      performance_date: '2026-08-07',
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
    })
    const day3Label = formatPerformanceDayLabel({
      performance_date: '2026-08-09',
      event_date: '2026-08-07',
      event_end_date: '2026-08-09',
    })

    expect(await screen.findByText(day1Label, {}, { timeout: DETAILS_RENDER_TIMEOUT })).toBeInTheDocument()
    expect(await screen.findByText(day3Label, {}, { timeout: DETAILS_RENDER_TIMEOUT })).toBeInTheDocument()
  })

  it('shows no day label at all for a single-day event', async () => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'One Night Only',
          slug: 'one-night-only',
          date: '2026-08-07',
          end_date: null,
          status: 'published',
          venues: [],
          bands: [],
          band_count: 1,
          venue_count: 1,
          ticket_url: null,
        },
      ],
      past: [],
    }

    let resolveDetails
    const detailsPromise = new Promise(resolve => {
      resolveDetails = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        if (url === '/api/events/1/details') {
          return detailsPromise
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('One Night Only')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))
    expect(await screen.findByText(/loading performers and venues/i)).toBeInTheDocument()

    resolveDetails(
      jsonResponse({
        venues: [{ id: 7, name: 'The Mill', band_count: 1, address: '123 King St' }],
        bands: [
          {
            id: 20,
            performance_id: 201,
            name: 'Only Band',
            venue_id: 7,
            venue_name: 'The Mill',
            start_time: '20:00',
            end_time: '20:45',
            // POPULATED, not null: the API supplies each set's own date, so a
            // null fixture would only exercise the missing-date path and
            // would not catch a regression that renders a label whenever
            // performance_date exists on a single-day event.
            performance_date: '2026-08-07',
          },
        ],
        band_count: 1,
        venue_count: 1,
      })
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading performers and venues/i)).not.toBeInTheDocument()
    })
    // Appears in both the GenreDiscovery wall and the All Performers grid.
    expect((await screen.findAllByText('Only Band', {}, { timeout: DETAILS_RENDER_TIMEOUT }))[0]).toBeInTheDocument()

    // A single-day event must not show a redundant date on every set (#540/#541).
    const soleDayLabel = formatPerformanceDayLabel({
      performance_date: '2026-08-07',
      event_date: '2026-08-07',
      event_end_date: null,
    })
    expect(screen.queryByText(soleDayLabel)).not.toBeInTheDocument()
  })
})

// The collapsed "Performers:" chips show names only, so they sort
// alphabetically with the article-stripped #587 convention ("The X" under X's
// first real word) — regardless of the set-time order the API returns.
describe('EventTimeline collapsed performer chips ordering', () => {
  afterEach(() => {
    // restoreAllMocks does NOT undo a direct assignment to global.fetch --
    // only unstubAllGlobals does, and only for vi.stubGlobal'd properties.
    vi.unstubAllGlobals()
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

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

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
    // restoreAllMocks does NOT undo a direct assignment to global.fetch --
    // only unstubAllGlobals does, and only for vi.stubGlobal'd properties.
    vi.unstubAllGlobals()
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

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

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

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

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
    // restoreAllMocks does NOT undo a direct assignment to global.fetch --
    // only unstubAllGlobals does, and only for vi.stubGlobal'd properties.
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not mount past poster <img> elements until History is expanded, then mounts them all', async () => {
    const pastEvent = (id, name) => ({
      id,
      name,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      date: '2020-05-10',
      status: 'archived',
      venues: [],
      bands: [],
      band_count: 0,
      venue_count: 0,
      ticket_url: null,
      poster_url: `https://cdn.example.com/posters/${id}.jpg`,
    })

    const timelineData = {
      now: [],
      // A non-empty upcoming bucket keeps Past collapsed by default (Past only
      // auto-expands when it's the sole non-empty bucket) -- this test is
      // about lazy mounting behind a MANUAL toggle, a different concern from
      // that auto-expand, so it needs Past to start collapsed to exercise it.
      upcoming: [{ ...pastEvent('upcoming', 'Unrelated Upcoming Event'), status: 'published', poster_url: null }],
      past: [pastEvent(1, 'Past Fest One'), pastEvent(2, 'Past Fest Two'), pastEvent(3, 'Past Fest Three')],
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

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

    // #700: poster and title are ONE labelled navigation link per card.
    // Previously the poster was a second, aria-labelled link with
    // tabindex="-1" beside the title link (#697), so a screen reader in
    // browse mode announced the event name twice per card. The poster img
    // must sit inside that single link; the link must carry no separate
    // aria-label (the accessible name comes from the title text inside it)
    // and no tabindex hack (it is the card's real, focusable link — one tab
    // stop). aria-hidden on the link stays forbidden: that would remove an
    // interactive element from the accessibility tree.
    posterImgs.forEach((img, i) => {
      const link = img.closest('a')
      expect(link).not.toBeNull()
      expect(link).toHaveAttribute('href', `/event/past-fest-${['one', 'two', 'three'][i]}`)
      expect(link).not.toHaveAttribute('aria-hidden')
      expect(link).not.toHaveAttribute('aria-label')
      expect(link).not.toHaveAttribute('tabindex')
    })

    // Exactly one link TO the event named by the event itself per card — the
    // poster+title link. The card also carries a "View Lineup"/"Build Your
    // Schedule" primary CTA that navigates to the same page, but that button
    // is labelled by its action, not by the event name, so it must not be
    // counted here; the event name is announced as a link exactly once.
    ;[
      ['Past Fest One', 'past-fest-one'],
      ['Past Fest Two', 'past-fest-two'],
      ['Past Fest Three', 'past-fest-three'],
    ].forEach(([name, slug]) => {
      const nameLinks = [...container.querySelectorAll(`a[href="/event/${slug}"]`)].filter(a =>
        a.textContent.includes(name)
      )
      expect(nameLinks).toHaveLength(1)
    })
    expect(screen.getAllByRole('link', { name: 'Past Fest One' })).toHaveLength(1)
  })

  it('raises no axe violation for the single event link', async () => {
    // Guards the accessibility contract (#700): one labelled navigation link
    // per card whose accessible name comes from visible text. Catches both a
    // regression to aria-hidden-on-interactive and an unlabelled link.
    const { axe, toHaveNoViolations } = await import('jest-axe')
    expect.extend(toHaveNoViolations)

    const timelineData = {
      now: [],
      // A non-empty upcoming bucket keeps Past collapsed by default (Past only
      // auto-expands when it's the sole non-empty bucket), which this test
      // relies on to exercise the manual "Show History" toggle below.
      upcoming: [
        {
          id: 2,
          name: 'Unrelated Upcoming Event',
          slug: 'unrelated-upcoming-event',
          date: '2099-01-01',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
          poster_url: null,
        },
      ],
      past: [
        {
          id: 1,
          name: 'Axe Fest',
          slug: 'axe-fest',
          date: '2020-05-10',
          status: 'archived',
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
      // A non-empty upcoming bucket keeps Past collapsed by default (Past only
      // auto-expands when it's the sole non-empty bucket), which this test
      // relies on to exercise the manual "Show History" toggle below.
      upcoming: [
        {
          id: 10,
          name: 'Unrelated Upcoming Event',
          slug: 'unrelated-upcoming-event',
          date: '2099-01-01',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
          poster_url: null,
        },
      ],
      past: [
        {
          id: 9,
          name: 'Slugless Fest',
          slug: null,
          date: '2020-05-10',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
          poster_url: 'https://cdn.example.com/posters/9.jpg',
        },
      ],
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

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

// #754 — the Venues grid (expanded event details) rendered a venue's address
// as inert text with no way to get directions. It now builds a
// buildDirectionsHref(name, address) link.
//
// Testing gotcha (per #753's postmortem): an <a> with no `href` has NO
// implicit ARIA `link` role, so `queryByRole('link', ...)` returns null even
// against a rendered dead anchor -- a "no link" assertion written that way
// would pass against the broken (pre-#754) implementation too. Every
// assertion here also checks the visible "Directions" text so a regression
// to inert text is caught either way.
describe('EventTimeline Venues grid directions (#754)', () => {
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
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
        },
      ],
      past: [],
    }

    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        if (url === '/api/events/1/details') {
          return Promise.resolve(
            jsonResponse({
              venues: [
                { id: 7, name: 'The Mill', band_count: 1, address: '20 John Pound Road, Tillsonburg, ON' },
                { id: 8, name: 'Roost', band_count: 1, address: null },
              ],
              bands: [],
              band_count: 2,
              venue_count: 2,
            })
          )
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders a directions link with the venue name in its accessible name', async () => {
    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Test Event')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))
    expect(await screen.findByText('The Mill', {}, { timeout: DETAILS_RENDER_TIMEOUT })).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Directions to The Mill' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveTextContent('Directions')
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('The Mill, 20 John Pound Road, Tillsonburg, ON')
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })

  it('renders no crash and no directions link/address row for a venue with no address', async () => {
    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Test Event')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))
    expect(await screen.findByText('Roost', {}, { timeout: DETAILS_RENDER_TIMEOUT })).toBeInTheDocument()

    expect(screen.queryByRole('link', { name: /directions to roost/i })).not.toBeInTheDocument()

    // The role query above is NOT sufficient on its own: an <a> with no href
    // has no implicit ARIA link role, so a rendered-but-dead "Directions"
    // anchor is invisible to queryByRole and this test would pass against the
    // broken implementation (the #753 trap). Assert on the visible label too,
    // and pin the count so a stray second control can't hide behind it —
    // only The Mill has an address in this fixture.
    expect(screen.getAllByText('Directions')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /directions to the mill/i })).toBeInTheDocument()
  })
})

// Between seasons (e.g. the last event archives and the next one is still a
// draft with an empty lineup), the timeline previously rendered a heading, a
// tagline claiming "upcoming" events, and 0 visible cards -- reading as
// broken. These cover the fix: an announced-but-unlineup'd event's stat row,
// and the page-level states when Now/Upcoming are both empty.
describe('EventTimeline empty lineup and between-seasons states', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    // Unconditional here rather than a trailing call inside the one test that
    // installs fake timers: if an assertion in that test throws, the trailing
    // call never runs and fake timers leak into every subsequent test in this
    // file, turning one real failure into a cascade of unrelated ones. A no-op
    // when no fake timers were installed.
    vi.useRealTimers()
  })

  function stubTimeline(timelineData) {
    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )
  }

  it('renders "Lineup TBA" instead of "0 Bands" for an upcoming event with no lineup yet', async () => {
    stubTimeline({
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Vol 18',
          slug: 'vol-18',
          date: '2026-10-11',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
        },
      ],
      past: [],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Vol 18')).toBeInTheDocument()
    expect(screen.getByText('Lineup TBA')).toBeInTheDocument()
    // The zero-count stat this replaces would have rendered its own "Bands"
    // label (plural, since 0 !== 1) right next to the numeral.
    expect(screen.queryByText('Bands')).not.toBeInTheDocument()
    // ...and it must not then invite the fan to expand for the lineup it just
    // said does not exist. Expanding a 0-band event loads nothing.
    expect(screen.queryByText('Expand to load performers and venues.')).not.toBeInTheDocument()
  })

  it('still offers the expand hint when the event has a lineup that is not loaded yet', async () => {
    // The complement of the assertion above: `featuredBands` is empty here too
    // (the collapsed card carries no band rows), but band_count proves there is
    // something to load — so the hint is correct and must survive. Without this,
    // the fix could be "delete the hint entirely" and still look green.
    stubTimeline({
      now: [],
      upcoming: [
        {
          id: 2,
          name: 'Booked Fest',
          slug: 'booked-fest',
          date: '2026-10-11',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 12,
          venue_count: 3,
          ticket_url: null,
        },
      ],
      past: [],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Booked Fest')).toBeInTheDocument()
    expect(screen.getByText('Expand to load performers and venues.')).toBeInTheDocument()
    expect(screen.queryByText('Lineup TBA')).not.toBeInTheDocument()
  })

  it('omits the lineup stat entirely for a past event with no recorded bands', async () => {
    stubTimeline({
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Upcoming Fest',
          slug: 'upcoming-fest',
          date: '2099-05-10',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 5,
          venue_count: 1,
          ticket_url: null,
        },
      ],
      past: [
        {
          id: 2,
          name: 'Undocumented Past Fest',
          slug: 'undocumented-past-fest',
          date: '2020-05-10',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
        },
      ],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Upcoming Fest')).toBeInTheDocument()
    // Past events sit behind the "Show History" toggle -- auto-expand does
    // NOT fire here because Upcoming Fest keeps hasUpcoming true.
    fireEvent.click(screen.getByRole('button', { name: /show history/i }))
    expect(await screen.findByText('Undocumented Past Fest')).toBeInTheDocument()

    const pastCard = screen
      .getAllByTestId('event-card')
      .find(card => within(card).queryByText('Undocumented Past Fest'))
    expect(pastCard).toBeTruthy()
    expect(within(pastCard).queryByText('Lineup TBA')).not.toBeInTheDocument()
    expect(within(pastCard).queryByText('Bands')).not.toBeInTheDocument()
    expect(within(pastCard).queryByText('Band')).not.toBeInTheDocument()
  })

  it('still renders "N Bands" for an event with a real lineup', async () => {
    stubTimeline({
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Booked Fest',
          slug: 'booked-fest',
          date: '2026-10-11',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 3,
          venue_count: 2,
          ticket_url: null,
        },
      ],
      past: [],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Booked Fest')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Bands')).toBeInTheDocument()
    expect(screen.queryByText('Lineup TBA')).not.toBeInTheDocument()
  })

  it('shows a between-seasons message (not the generic empty state) when only past events exist', async () => {
    stubTimeline({
      now: [],
      upcoming: [],
      past: [
        {
          id: 1,
          name: 'Long Weekend Band Crawl Vol 17',
          slug: 'lwbc-17',
          date: '2026-08-02',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 22,
          venue_count: 6,
          ticket_url: null,
        },
      ],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText(/no upcoming events right now/i)).toBeInTheDocument()
    expect(screen.queryByText('No events found')).not.toBeInTheDocument()
  })

  it('auto-expands the Past section when it is the only non-empty bucket', async () => {
    stubTimeline({
      now: [],
      upcoming: [],
      past: [
        {
          id: 1,
          name: 'Long Weekend Band Crawl Vol 17',
          slug: 'lwbc-17',
          date: '2026-08-02',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 22,
          venue_count: 6,
          ticket_url: null,
        },
      ],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    // No click on "Show History" -- the past event should already be visible.
    expect(await screen.findByText('Long Weekend Band Crawl Vol 17')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide history/i })).toBeInTheDocument()
  })

  it('reads the between-seasons tagline when there is nothing now/upcoming, and the original tagline otherwise', async () => {
    stubTimeline({
      now: [],
      upcoming: [],
      past: [
        {
          id: 1,
          name: 'Long Weekend Band Crawl Vol 17',
          slug: 'lwbc-17',
          date: '2026-08-02',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 22,
          venue_count: 6,
          ticket_url: null,
        },
      ],
    })

    const { unmount } = render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Browse past events — new dates will be announced here')).toBeInTheDocument()
    expect(screen.queryByText('Discover upcoming live music events')).not.toBeInTheDocument()
    unmount()

    stubTimeline({
      now: [],
      upcoming: [
        {
          id: 2,
          name: 'Vol 18',
          slug: 'vol-18',
          date: '2026-10-11',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
        },
      ],
      past: [],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Discover upcoming live music events')).toBeInTheDocument()
    expect(screen.queryByText('Browse past events — new dates will be announced here')).not.toBeInTheDocument()
  })

  // Regression: the auto-expand effect above is keyed on `[timeline]`, and
  // the 60s poll (fetchTimeline(true) in the main data-fetch effect) calls
  // setTimeline(data) with a fresh object identity every tick -- even when
  // the shape is unchanged. Without the wasPastOnlyRef transition guard,
  // that re-runs the auto-expand effect on every poll and calls
  // setShowPast(true) again, silently reopening a section a fan just
  // collapsed. This uses the same `vi.useFakeTimers({ shouldAdvanceTime:
  // true })` + `vi.advanceTimersByTimeAsync` pattern as
  // BandProfilePage.test.jsx (#739) -- shouldAdvanceTime keeps
  // findBy/waitFor's own polling working under fake timers.
  it('does not reopen a manually collapsed Past section on a later past-only poll', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const pastOnlyTimeline = name => ({
      now: [],
      upcoming: [],
      past: [
        {
          id: 1,
          name,
          slug: 'lwbc-17',
          date: '2026-08-02',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 22,
          venue_count: 6,
          ticket_url: null,
        },
      ],
    })

    let fetchCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          fetchCount += 1
          // The second (polled) response is a DISTINCT past-only payload --
          // not a byte-for-byte repeat -- so a passing assertion below
          // proves a real update was applied, not that the poll was a no-op.
          const name = fetchCount === 1 ? 'Long Weekend Band Crawl Vol 17' : 'Long Weekend Band Crawl Vol 17 (Updated)'
          return Promise.resolve(jsonResponse(pastOnlyTimeline(name)))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    // Past auto-expands because it's the only non-empty raw bucket.
    expect(await screen.findByText('Long Weekend Band Crawl Vol 17')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide history/i })).toBeInTheDocument()

    // Fan deliberately collapses it.
    fireEvent.click(screen.getByRole('button', { name: /hide history/i }))
    expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument()
    expect(screen.queryByText('Long Weekend Band Crawl Vol 17')).not.toBeInTheDocument()

    // Drive the 60s poll. It must fetch a genuinely new payload.
    await vi.advanceTimersByTimeAsync(60000)
    await waitFor(() => expect(fetchCount).toBeGreaterThan(1))

    // ...but the collapse must survive it: still "Show History", and no past
    // event content leaked back into the DOM under either name. Testing
    // Library's waitFor (not a bare synchronous assertion, and not vitest's
    // own vi.waitFor) is required here -- it wraps each retry in act(),
    // which is what actually flushes the setTimeline update from the
    // interval's fetch into React's effects. A synchronous assertion
    // immediately after advanceTimersByTimeAsync can read stale DOM and pass
    // even when the auto-expand effect WOULD have reopened the section --
    // confirmed by temporarily reverting the wasPastOnlyRef fix, which made
    // this test pass right up until this assertion was switched to waitFor.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /show history/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/Long Weekend Band Crawl Vol 17/)).not.toBeInTheDocument()
  })
})

// Finding 2 companion to the between-seasons tests above: hasActiveFilters
// only proves a filter is SET, not that it hid an upcoming event. These
// cover both directions of that distinction using the between-seasons block
// (`!hasNow && !hasUpcoming && hasPast`), which is the only place
// filtersHideFutureEvents is consulted.
describe('EventTimeline between-seasons filter copy accuracy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function stubTimeline(timelineData) {
    vi.stubGlobal(
      'fetch',
      vi.fn(url => {
        if (url.startsWith('/api/events/timeline')) {
          return Promise.resolve(jsonResponse(timelineData))
        }
        return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
      })
    )
  }

  it('shows the between-seasons message, not the filter-recovery copy, when the raw timeline is genuinely past-only', async () => {
    // Raw timeline has ONLY past events -- a real between-seasons gap. The
    // active month filter still matches that past event (2026-08), so it
    // does not empty the past bucket; it just happens to be set. Under the
    // bug (hasActiveFilters), this would render "No upcoming events match
    // your filters" / "Your filters are hiding every upcoming event" -- both
    // false, since there was never a raw upcoming event to hide, and
    // clearing filters would land the fan in the exact same state.
    stubTimeline({
      now: [],
      upcoming: [],
      past: [
        {
          id: 1,
          name: 'Long Weekend Band Crawl Vol 17',
          slug: 'lwbc-17',
          date: '2026-08-02',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 22,
          venue_count: 6,
          ticket_url: null,
        },
      ],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText(/no upcoming events right now/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show filters/i }))
    fireEvent.change(screen.getByLabelText(/filter by month/i), { target: { value: '2026-08' } })

    const alertBox = await screen.findByRole('alert')
    expect(within(alertBox).getByText(/no upcoming events right now/i)).toBeInTheDocument()
    expect(within(alertBox).queryByText(/no upcoming events match your filters/i)).not.toBeInTheDocument()
    expect(within(alertBox).queryByText(/your filters are hiding every upcoming event/i)).not.toBeInTheDocument()
    expect(within(alertBox).getByRole('link', { name: /subscribe for updates/i })).toBeInTheDocument()
    expect(within(alertBox).queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument()
  })

  it('shows the filter-recovery copy when a filter genuinely hides every raw upcoming event', async () => {
    // Raw timeline HAS an upcoming event. The month filter excludes it
    // (2020-05 vs. the event's 2026-10) while still matching the past event,
    // so filteredUpcoming is empty but the raw bucket was not -- the filter
    // is the actual cause, and this copy should stay.
    stubTimeline({
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Vol 18',
          slug: 'vol-18',
          date: '2026-10-11',
          status: 'published',
          venues: [],
          bands: [],
          band_count: 0,
          venue_count: 0,
          ticket_url: null,
        },
      ],
      past: [
        {
          id: 2,
          name: 'Long Weekend Band Crawl Vol 17',
          slug: 'lwbc-17',
          date: '2020-05-10',
          status: 'archived',
          venues: [],
          bands: [],
          band_count: 22,
          venue_count: 6,
          ticket_url: null,
        },
      ],
    })

    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Vol 18')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show filters/i }))
    fireEvent.change(screen.getByLabelText(/filter by month/i), { target: { value: '2020-05' } })

    const alertBox = await screen.findByRole('alert')
    expect(within(alertBox).getByText(/no upcoming events match your filters/i)).toBeInTheDocument()
    expect(within(alertBox).getByText(/your filters are hiding every upcoming event/i)).toBeInTheDocument()
    expect(within(alertBox).getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    expect(within(alertBox).queryByRole('link', { name: /subscribe for updates/i })).not.toBeInTheDocument()

    // Regression: the HEADER must agree with the alert above. hasNow/hasUpcoming
    // read the FILTERED buckets, so both go false here even though Vol 18 exists
    // and is merely hidden. Without filtersHideFutureEvents in the header
    // condition the same screen says "new dates will be announced here" directly
    // above an alert explaining that filters are hiding the upcoming events --
    // two contradictory claims, one of them false.
    expect(screen.getByText('Discover upcoming live music events')).toBeInTheDocument()
    expect(screen.queryByText('Browse past events — new dates will be announced here')).not.toBeInTheDocument()
  })
})
