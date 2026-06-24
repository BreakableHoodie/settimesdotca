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

    expect(await screen.findByText('Band One')).toBeInTheDocument()
    expect(await screen.findByText('Stage A')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText(/loading performers and venues/i)).not.toBeInTheDocument()
    })
  })
})
