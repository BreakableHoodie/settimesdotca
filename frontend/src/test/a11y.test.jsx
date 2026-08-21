import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'
import { HelmetProvider } from 'react-helmet-async'
import App from '../App'
import { ThemeProvider } from '../components/ThemeProvider.jsx'

expect.extend(toHaveNoViolations)

// Mock schedule data, shaped like the real GET /api/schedule response
// (functions/api/schedule.js): `{ bands: [...], event: {...} }`, not a bare
// array. App.jsx (`data.bands` / `data.event`) reads the `event` key to
// populate eventData — a bare-array mock leaves eventData permanently null,
// which silently skips the Header event chrome, EventPosterThumbnail, and
// LiveContextBar (it returns null without `eventData?.name`, see
// LiveContextBar.jsx) from ever being axe-scanned (#674).
const mockEvent = {
  id: 1,
  name: 'Test Band Crawl',
  date: '2025-10-12',
  end_date: null,
  city: 'Waterloo',
  slug: 'test-event',
  ticket_url: 'https://example.com/tickets',
  poster_url: 'https://example.com/poster.jpg',
  is_archived: false,
  theme_colors: null,
  venue_info: null,
  social_links: null,
  doors_json: null,
  reveal_mode: 0,
}

const mockBands = [
  {
    id: 'test-band-1',
    performance_id: 1,
    band_profile_id: 1,
    name: 'Test Band',
    photo_url: 'https://example.com/band.jpg',
    venue: 'Test Venue',
    venue_lat: 43.4643,
    venue_lng: -80.5204,
    date: '2025-10-12',
    startTime: '20:00',
    endTime: '20:30',
    url: 'https://example.com/test-band',
    notes: null,
  },
]

// Mock fetch for /api/schedule.
//
// `headers` is required, not optional: App.jsx loads through fetchPublicJson,
// which reads `response.headers.get('content-type')` before parsing. A mock
// without it throws inside the helper, the load fails, and the page renders its
// error state with no images — which the length guard below catches.
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ event: mockEvent, bands: mockBands }),
  })
)

const waitForAppToSettle = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 100))
  })
}

function renderApp() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

describe('Accessibility Tests', () => {
  it('App should have no accessibility violations', async () => {
    const { container } = renderApp()

    // Wait for data to load
    await waitForAppToSettle()

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  }, 10000) // Increase timeout for axe

  it('should have proper heading hierarchy', async () => {
    const { container } = renderApp()
    await waitForAppToSettle()

    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
    expect(headings.length).toBeGreaterThan(0)
  })

  it('should have alt text for images', async () => {
    const { container } = renderApp()
    await waitForAppToSettle()

    const images = container.querySelectorAll('img')
    // A `forEach` over an empty NodeList runs zero assertions and still
    // passes (#674) — assert the mock actually rendered images (the event
    // poster, at minimum) before checking each one has an alt attribute.
    expect(images.length).toBeGreaterThan(0)
    images.forEach(img => {
      expect(img).toHaveAttribute('alt')
    })
  })

  it('should have accessible buttons', async () => {
    const { container } = renderApp()
    await waitForAppToSettle()

    const buttons = container.querySelectorAll('button')
    // Same vacuous-pass guard as the images test above (#674).
    expect(buttons.length).toBeGreaterThan(0)
    buttons.forEach(button => {
      const hasText = button.textContent.trim().length > 0
      const hasAriaLabel = button.hasAttribute('aria-label')
      expect(hasText || hasAriaLabel).toBe(true)
    })
  })
})
