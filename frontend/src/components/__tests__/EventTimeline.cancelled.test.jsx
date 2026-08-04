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

// The collapsed "Featured Bands Preview" chips (event.bands, from
// /api/events/timeline) must mark a cancelled set the same way BandCard does
// on the live schedule (#732 Task 5b) -- struck through PLUS a visible
// "Cancelled" label, since the pill/label is the accessible carrier and
// line-through alone is not announced by screen readers. Before this fix,
// timeline.js's "upcoming"/"past" queries didn't even project is_cancelled,
// so a cancelled set on an upcoming event rendered identically to a live one.
describe('EventTimeline collapsed chips — cancelled sets (#732)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks a cancelled band struck through with a visible Cancelled label, leaving a scheduled band untouched', async () => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 5,
          // Deliberately NOT containing the word "cancelled" -- an earlier
          // draft of this fixture named the event "Cancelled Chip Fest",
          // which made the /cancelled/i assertion below pass trivially
          // against the event title instead of the band chip.
          name: 'Chip Sort Fest',
          slug: 'chip-sort-fest-cancelled',
          date: '2026-09-01',
          status: 'published',
          is_published: true,
          venues: [],
          bands: [
            { id: 1, name: 'Deer Fang', is_cancelled: 1 },
            { id: 2, name: 'Sam Nabi', is_cancelled: 0 },
          ],
          band_count: 2,
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

    // The accessible carrier: visible text, not just a style.
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument()

    // The cancelled band's name is struck through.
    const deerFangText = await screen.findByText('Deer Fang')
    expect(deerFangText.closest('s')).not.toBeNull()

    // The scheduled band is untouched: no <s>, and its own chip carries no
    // "Cancelled" label. (The page-level "cancelled" text found above must
    // belong to Deer Fang's chip, not leak onto every chip.)
    const samNabiText = await screen.findByText('Sam Nabi')
    expect(samNabiText.closest('s')).toBeNull()
    const samNabiChip = samNabiText.closest('a')
    expect(samNabiChip.textContent).not.toMatch(/cancelled/i)
  })
})

/**
 * CodeRabbit MAJOR 3 (#732) -- the collapsed chips above got the cancelled
 * treatment, but once a user expands an event, the "All Performers" grid
 * rendered `band.name` straight through with no cancelled treatment at all,
 * even though functions/api/events/[id]/details.js already projects
 * is_cancelled on every band -- the API half of this feature shipped, the
 * render half didn't. Same class of bug already fixed on VenuePage
 * (frontend/src/pages/VenuePage.jsx).
 *
 * The sweep for "any OTHER consumer of a band list on this page" turned up a
 * second gap: GenreDiscovery (the "Discover Bands" wall, fed the SAME
 * `allBands` list) let a fan tap a cancelled band's tile to add it to their
 * personal schedule, with no visual indication it was cancelled at all.
 */
describe('EventTimeline expanded details render cancellation on every band-list consumer (#732)', () => {
  beforeEach(() => {
    const timelineData = {
      now: [],
      upcoming: [
        {
          id: 1,
          name: 'Cancel Coverage Fest',
          slug: 'cancel-coverage-fest',
          date: '2026-08-02',
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

    global.fetch = vi.fn(url => {
      if (url.startsWith('/api/events/timeline')) {
        return Promise.resolve(jsonResponse(timelineData))
      }
      if (url === '/api/events/1/details') {
        return Promise.resolve(
          jsonResponse({
            venues: [{ id: 7, name: 'Blue Room', band_count: 2, address: '123 King St' }],
            bands: [
              {
                id: 9,
                performance_id: 101,
                name: 'Pulled Openers',
                venue_id: 7,
                venue_name: 'Blue Room',
                start_time: '19:00',
                end_time: '19:30',
                is_cancelled: 1,
              },
              {
                id: 10,
                performance_id: 102,
                name: 'Playing Headliner',
                venue_id: 7,
                venue_name: 'Blue Room',
                start_time: '20:00',
                end_time: '20:30',
                is_cancelled: 0,
              },
            ],
            band_count: 2,
            venue_count: 1,
          })
        )
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function expandDetails() {
    render(
      <MemoryRouter>
        <EventTimeline />
      </MemoryRouter>
    )

    expect(await screen.findByText('Cancel Coverage Fest')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /view details/i }))

    await waitFor(() => {
      expect(screen.queryByText(/loading performers and venues/i)).not.toBeInTheDocument()
    })
  }

  it('strikes through a cancelled performer with a Cancelled pill in the "All Performers" grid, leaving a scheduled one untouched', async () => {
    await expandDetails()

    // Card is a Link -- accessible name is its full text content, so a regex
    // anchored on the band name is enough to find the one card.
    const cancelledCard = await screen.findByRole('link', { name: /Pulled Openers/i })
    // Structural, not just text-presence: the NAME must be inside a real <s>
    // element. A CSS-only line-through (no <s>) would render identical
    // visible text but is invisible to a screen reader.
    expect(cancelledCard.querySelector('s')).toHaveTextContent('Pulled Openers')
    expect(cancelledCard).toHaveTextContent('Cancelled')

    const scheduledCard = await screen.findByRole('link', { name: /Playing Headliner/i })
    expect(scheduledCard.querySelector('s')).toBeNull()
    expect(scheduledCard).not.toHaveTextContent('Cancelled')
  })

  it('disables the Discover Bands tile for a cancelled band, leaving a scheduled band toggleable', async () => {
    await expandDetails()

    // GenreDiscovery renders a <button> per act -- the cancelled tile's
    // aria-label states its status rather than an Add/Remove instruction,
    // since tapping it must do nothing.
    const cancelledTile = await screen.findByRole('button', { name: /Pulled Openers/i })
    expect(cancelledTile).toBeDisabled()
    expect(cancelledTile.querySelector('s')).toHaveTextContent('Pulled Openers')
    expect(cancelledTile).toHaveTextContent('Cancelled')

    // Sibling proof: the scheduled band's tile is untouched -- still
    // clickable and still flips its own Add/Remove aria-label, proving the
    // suppression is scoped to is_cancelled rather than a global regression
    // that freezes every tile.
    const scheduledTile = await screen.findByRole('button', { name: /Add Playing Headliner to my schedule/i })
    expect(scheduledTile).not.toBeDisabled()
    fireEvent.click(scheduledTile)
    expect(screen.getByRole('button', { name: /Remove Playing Headliner from my schedule/i })).toBeInTheDocument()

    // Clicking the disabled cancelled tile must not toggle anything either --
    // there is no "Remove ... from my schedule" state to flip into.
    fireEvent.click(cancelledTile)
    expect(screen.getByRole('button', { name: /Pulled Openers/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove Pulled Openers/i })).not.toBeInTheDocument()
  })
})
