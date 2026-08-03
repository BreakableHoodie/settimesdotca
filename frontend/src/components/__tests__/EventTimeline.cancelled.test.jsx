import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
