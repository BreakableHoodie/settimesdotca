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
