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

  it('renders icon links for an artist with bandcamp and instagram, and keeps the profile Link intact', async () => {
    fetchPublicJson.mockResolvedValue({
      artists: [
        {
          id: 7,
          name: 'Cross Dog',
          genre: 'rock',
          origin: 'Kitchener, ON',
          photo_url: null,
          performance_count: 2,
          social: {
            bandcamp: 'https://crossdog.bandcamp.com',
            instagram: 'crossdogband',
          },
        },
      ],
      hasMore: false,
    })
    renderPage()
    await screen.findByText('Cross Dog')

    const bandcampLink = screen.getByRole('link', { name: 'Cross Dog on Bandcamp' })
    expect(bandcampLink).toHaveAttribute('href', 'https://crossdog.bandcamp.com/')
    expect(bandcampLink).toHaveAttribute('target', '_blank')
    expect(bandcampLink).toHaveAttribute('rel', 'noopener noreferrer')

    const instagramLink = screen.getByRole('link', { name: 'Cross Dog on Instagram' })
    expect(instagramLink).toHaveAttribute('href', 'https://instagram.com/crossdogband')

    const profileLink = screen.getByRole('heading', { name: 'Cross Dog' }).closest('a')
    expect(profileLink).toHaveAttribute('href', '/band/cross-dog')
  })

  it('caps the icon cluster at 4 links and preserves priority order', async () => {
    fetchPublicJson.mockResolvedValue({
      artists: [
        {
          id: 8,
          name: 'Many Links',
          genre: 'pop',
          origin: null,
          photo_url: null,
          performance_count: 1,
          social: {
            linktree: 'https://linktr.ee/manylinks',
            facebook: 'https://facebook.com/manylinks',
            youtube: 'https://youtube.com/manylinks',
            website: 'https://manylinks.example',
            instagram: 'manylinks',
            spotify: 'https://open.spotify.com/artist/manylinks',
            bandcamp: 'https://manylinks.bandcamp.com',
          },
        },
      ],
      hasMore: false,
    })
    renderPage()
    await screen.findByText('Many Links')

    // Priority order: bandcamp, spotify, instagram, website, youtube, facebook, apple_music, linktree.
    // Only the first 4 valid links should render.
    expect(screen.getByRole('link', { name: 'Many Links on Bandcamp' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Many Links on Spotify' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Many Links on Instagram' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Many Links on Website' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Many Links on YouTube' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Many Links on Facebook' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Many Links on Linktree' })).not.toBeInTheDocument()
  })

  it('renders no icon cluster when social is null', async () => {
    fetchPublicJson.mockResolvedValue({
      artists: [
        {
          id: 9,
          name: 'No Links Band',
          genre: 'folk',
          origin: null,
          photo_url: null,
          performance_count: 1,
          social: null,
        },
      ],
      hasMore: false,
    })
    renderPage()
    await screen.findByText('No Links Band')

    // No social icon anchors for this artist — icon links are the only ones
    // whose accessible name follows the "<artist> on <platform>" pattern
    // (distinguishes from the Footer's unrelated target="_blank" links).
    expect(screen.queryByRole('link', { name: /No Links Band on/ })).not.toBeInTheDocument()
  })

  it('drops unsafe javascript: URLs so no icon renders for that link', async () => {
    fetchPublicJson.mockResolvedValue({
      artists: [
        {
          id: 10,
          name: 'Unsafe Band',
          genre: 'punk',
          origin: null,
          photo_url: null,
          performance_count: 1,
          social: {
            website: 'javascript:alert(1)',
          },
        },
      ],
      hasMore: false,
    })
    renderPage()
    await screen.findByText('Unsafe Band')

    expect(screen.queryByRole('link', { name: 'Unsafe Band on Website' })).not.toBeInTheDocument()
  })
})
