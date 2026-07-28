import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'
import PosterImage from '../PosterImage'
import { POSTER_IMAGE_HOST } from '../../utils/posterImage'

const POSTER_URL = `https://${POSTER_IMAGE_HOST}/event-posters/1-vol17.jpg`

describe('PosterImage', () => {
  it('renders the transformed src and a matching 1x/2x srcset', () => {
    render(<PosterImage src={POSTER_URL} alt="LWBC Vol17 poster" width={200} />)

    const img = screen.getByRole('img', { name: 'LWBC Vol17 poster' })
    expect(img).toHaveAttribute(
      'src',
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1-vol17.jpg`
    )
    expect(img).toHaveAttribute(
      'srcset',
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1-vol17.jpg 1x, ` +
        `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=400,format=auto/event-posters/1-vol17.jpg 2x`
    )
  })

  it('defaults to loading="lazy" and decoding="async"', () => {
    render(<PosterImage src={POSTER_URL} alt="poster" width={200} />)
    const img = screen.getByRole('img', { name: 'poster' })
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('decoding', 'async')
  })

  it('passes through unchanged for a foreign-host URL (no srcset)', () => {
    const foreignUrl = 'https://cdn.example.com/posters/poster-fest.jpg'
    render(<PosterImage src={foreignUrl} alt="poster" width={200} />)
    const img = screen.getByRole('img', { name: 'poster' })
    expect(img).toHaveAttribute('src', foreignUrl)
    expect(img).not.toHaveAttribute('srcset')
  })

  it('falls back to the untransformed original src on error, exactly once', () => {
    render(<PosterImage src={POSTER_URL} alt="LWBC Vol17 poster" width={200} />)
    const img = screen.getByRole('img', { name: 'LWBC Vol17 poster' })

    expect(img).toHaveAttribute(
      'src',
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1-vol17.jpg`
    )

    fireEvent.error(img)

    expect(img).toHaveAttribute('src', POSTER_URL)
    expect(img).not.toHaveAttribute('srcset')

    // A second error (e.g. the untransformed original also fails to load)
    // must not loop back to re-request the transform URL — the guard trips
    // once and stays tripped.
    fireEvent.error(img)
    expect(img).toHaveAttribute('src', POSTER_URL)
    expect(img).not.toHaveAttribute('srcset')
  })

  it('passes through extra props (e.g. className) to the underlying <img>', () => {
    render(<PosterImage src={POSTER_URL} alt="poster" width={200} className="max-h-96 w-full" />)
    const img = screen.getByRole('img', { name: 'poster' })
    expect(img).toHaveClass('max-h-96', 'w-full')
  })
})
