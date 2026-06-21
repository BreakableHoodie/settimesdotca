import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ArtistsPage from '../ArtistsPage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'
import { fetchPublicJson } from '../../utils/publicApi'

vi.mock('../../utils/metrics', () => ({ trackPageView: vi.fn() }))
vi.mock('../../utils/publicApi', () => ({ fetchPublicJson: vi.fn() }))

function renderPage() {
  return render(
    <ThemeProvider>
      <HelmetProvider>
        <MemoryRouter>
          <ArtistsPage />
        </MemoryRouter>
      </HelmetProvider>
    </ThemeProvider>
  )
}

describe('ArtistsPage', () => {
  beforeEach(() => {
    fetchPublicJson.mockReset()
    fetchPublicJson.mockResolvedValue({
      artists: [
        {
          id: 1,
          name: 'The Creepshow',
          genre: 'horror punk',
          origin: 'Burlington, ON',
          photo_url: null,
          performance_count: 3,
        },
      ],
      hasMore: false,
    })
  })

  it('renders the search box and fetched artists', async () => {
    renderPage()
    expect(screen.getByRole('searchbox', { name: /search artists/i })).toBeInTheDocument()
    expect(await screen.findByText('The Creepshow')).toBeInTheDocument()
    expect(screen.getByText(/horror punk/)).toBeInTheDocument()
    expect(screen.getByText('3 shows')).toBeInTheDocument()
  })

  it('queries the API with the search term', async () => {
    renderPage()
    await screen.findByText('The Creepshow')

    fireEvent.change(screen.getByRole('searchbox', { name: /search artists/i }), {
      target: { value: 'jazz' },
    })

    await waitFor(() => {
      expect(fetchPublicJson).toHaveBeenCalledWith(
        expect.stringContaining('q=jazz'),
        expect.anything(),
        expect.anything()
      )
    })
  })
})
