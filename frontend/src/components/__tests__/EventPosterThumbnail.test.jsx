import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import EventPosterThumbnail from '../EventPosterThumbnail'
import { POSTER_IMAGE_HOST } from '../../utils/posterImage'

const POSTER_URL = `https://${POSTER_IMAGE_HOST}/event-posters/36-buddiesfest2.jpg`

// #655: the poster thumbnail on the live event page must render nothing when
// poster_url is absent (the common case — most events have no poster yet).
describe('EventPosterThumbnail', () => {
  it('renders nothing when posterUrl is null', () => {
    const { container } = render(<EventPosterThumbnail posterUrl={null} eventName="Buddies Fest 2" onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when posterUrl is undefined', () => {
    const { container } = render(<EventPosterThumbnail eventName="Buddies Fest 2" onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a real button with a lazy-loaded image and correct alt text when posterUrl is present', () => {
    render(<EventPosterThumbnail posterUrl={POSTER_URL} eventName="Buddies Fest 2" onOpen={vi.fn()} />)

    const button = screen.getByRole('button', { name: 'View Buddies Fest 2 poster' })
    expect(button.tagName).toBe('BUTTON')

    const image = screen.getByRole('img', { name: 'Buddies Fest 2 poster' })
    expect(image).toHaveAttribute('loading', 'lazy')
  })

  // #664: the thumbnail must request a right-sized Cloudflare derivative —
  // a 200-wide 1x src and a 400-wide 2x srcset candidate.
  it('requests a Cloudflare image-transform derivative rather than the full-size original', () => {
    render(<EventPosterThumbnail posterUrl={POSTER_URL} eventName="Buddies Fest 2" onOpen={vi.fn()} />)

    const image = screen.getByRole('img', { name: 'Buddies Fest 2 poster' })
    expect(image).toHaveAttribute(
      'src',
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/36-buddiesfest2.jpg`
    )
    expect(image).toHaveAttribute(
      'srcset',
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/36-buddiesfest2.jpg 1x, ` +
        `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=400,format=auto/event-posters/36-buddiesfest2.jpg 2x`
    )
  })

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn()
    render(
      <EventPosterThumbnail posterUrl="https://example.test/poster.jpg" eventName="Buddies Fest 2" onOpen={onOpen} />
    )

    fireEvent.click(screen.getByRole('button', { name: 'View Buddies Fest 2 poster' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('falls back to a generic label when eventName is absent', () => {
    render(<EventPosterThumbnail posterUrl="https://example.test/poster.jpg" onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'View Event poster' })).toBeInTheDocument()
  })

  // #666: `variant="inline"` is the mobile, beside-the-title-and-stats
  // layout used inside LiveContextBar — a smaller derivative than the
  // desktop `standalone` row, and no outer `flex justify-start` wrapper
  // since its parent flex row now supplies the layout.
  describe('variant="inline"', () => {
    it('renders nothing when posterUrl is null', () => {
      const { container } = render(
        <EventPosterThumbnail posterUrl={null} eventName="Buddies Fest 2" onOpen={vi.fn()} variant="inline" />
      )
      expect(container).toBeEmptyDOMElement()
    })

    // The inline variant renders above the fold in the sticky bar — lazy
    // loading it would delay LCP and cause a visible pop-in. Unrelated to
    // #690's scroll-collapse transition fix, but that fix touches the same
    // identity block this poster lives inside, so this regression guard
    // keeps the two changes from silently interacting.
    it('renders eagerly with high fetch priority, unlike the standalone variant', () => {
      render(
        <EventPosterThumbnail posterUrl={POSTER_URL} eventName="Buddies Fest 2" onOpen={vi.fn()} variant="inline" />
      )

      const image = screen.getByRole('img', { name: 'Buddies Fest 2 poster' })
      expect(image).toHaveAttribute('loading', 'eager')
      expect(image).toHaveAttribute('fetchpriority', 'high')
    })

    it('requests a smaller derivative than the standalone variant', () => {
      render(
        <EventPosterThumbnail posterUrl={POSTER_URL} eventName="Buddies Fest 2" onOpen={vi.fn()} variant="inline" />
      )

      const image = screen.getByRole('img', { name: 'Buddies Fest 2 poster' })
      expect(image).toHaveAttribute(
        'src',
        `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=80,format=auto/event-posters/36-buddiesfest2.jpg`
      )
      expect(image).toHaveAttribute(
        'srcset',
        `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=80,format=auto/event-posters/36-buddiesfest2.jpg 1x, ` +
          `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=160,format=auto/event-posters/36-buddiesfest2.jpg 2x`
      )
    })

    it('still opens the lightbox and keeps a real button tap target', () => {
      const onOpen = vi.fn()
      render(
        <EventPosterThumbnail posterUrl={POSTER_URL} eventName="Buddies Fest 2" onOpen={onOpen} variant="inline" />
      )

      const button = screen.getByRole('button', { name: 'View Buddies Fest 2 poster' })
      fireEvent.click(button)
      expect(onOpen).toHaveBeenCalledTimes(1)
    })
  })
})
