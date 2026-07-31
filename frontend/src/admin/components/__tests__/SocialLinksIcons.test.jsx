import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SocialLinksIcons from '../SocialLinksIcons'

const ALL_LINKS = {
  website: 'https://example.com',
  instagram: '@testband',
  bandcamp: 'testband.bandcamp.com',
  facebook: 'https://facebook.com/testband',
  youtube: 'https://youtube.com/@testband',
  spotify: 'https://open.spotify.com/artist/abc',
  apple_music: 'https://music.apple.com/ca/artist/testband/1',
  linktree: 'https://linktr.ee/testband',
}

const bandWith = links => ({ name: 'Test Band', social_links: JSON.stringify(links) })

describe('SocialLinksIcons — characterization', () => {
  it('renders all eight links with their exact aria-labels, in column order', () => {
    render(<SocialLinksIcons band={bandWith(ALL_LINKS)} />)

    const expectedOrder = [
      'Open website for Test Band',
      'Open Instagram for Test Band',
      'Open Bandcamp for Test Band',
      'Open Facebook for Test Band',
      'Open YouTube for Test Band',
      'Open Spotify for Test Band',
      'Open Apple Music for Test Band',
      'Open Linktree for Test Band',
    ]
    const rendered = screen.getAllByRole('link').map(a => a.getAttribute('aria-label'))
    expect(rendered).toEqual(expectedOrder)
  })

  it('resolves each href through its own safety helper', () => {
    render(<SocialLinksIcons band={bandWith(ALL_LINKS)} />)

    // Bare handle -> full profile URL (safeInstagramHref)
    expect(screen.getByLabelText('Open Instagram for Test Band')).toHaveAttribute(
      'href',
      'https://instagram.com/testband'
    )
    // Bare domain -> https:// prefixed (safeHttpsFallbackHref)
    expect(screen.getByLabelText('Open Bandcamp for Test Band')).toHaveAttribute(
      'href',
      'https://testband.bandcamp.com/'
    )
  })

  it('opens every link in a new tab with a safe rel', () => {
    render(<SocialLinksIcons band={bandWith(ALL_LINKS)} />)
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('omits a link whose value sanitizes to "#"', () => {
    render(<SocialLinksIcons band={bandWith({ ...ALL_LINKS, website: 'javascript:alert(1)' })} />)
    expect(screen.queryByLabelText('Open website for Test Band')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(7)
  })

  it('renders a dash placeholder when no link resolves', () => {
    render(<SocialLinksIcons band={bandWith({})} />)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('treats malformed social_links JSON as no links', () => {
    render(<SocialLinksIcons band={{ name: 'Test Band', social_links: 'not json' }} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })
})
