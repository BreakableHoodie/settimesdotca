import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VenuesPage from '../VenuesPage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/metrics', () => ({ trackPageView: vi.fn() }))
vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter>
          <VenuesPage />
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

describe('VenuesPage', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      venues: [
        {
          id: 7,
          name: 'Roost',
          location: 'Waterloo, ON',
          performance_count: 5,
          event_count: 2,
        },
      ],
      hasMore: false,
    })
  })

  it('renders the search box and fetched venues', async () => {
    renderPage()
    expect(screen.getByRole('searchbox', { name: /search venues/i })).toBeInTheDocument()
    expect(await screen.findByText('Roost')).toBeInTheDocument()
    expect(screen.getByText(/Waterloo, ON/)).toBeInTheDocument()
    expect(screen.getByText(/5 sets · 2 events/)).toBeInTheDocument()
  })

  it('queries the API with the search term', async () => {
    renderPage()
    await screen.findByText('Roost')

    fireEvent.change(screen.getByRole('searchbox', { name: /search venues/i }), {
      target: { value: 'kitchener' },
    })

    await waitFor(() => {
      expect(fetchPublicJson).toHaveBeenCalledWith(
        expect.stringContaining('q=kitchener'),
        expect.anything(),
        expect.anything()
      )
    })
  })
})
