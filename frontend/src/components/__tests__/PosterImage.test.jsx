import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
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

  // The fallback belongs to the URL that failed, not to the component
  // instance. A PosterImage re-rendered with a new src (rather than
  // remounted) must start that URL fresh on the optimized path.
  it('resets the fallback when src changes, so a new poster retries the transform', () => {
    const OTHER_URL = `https://${POSTER_IMAGE_HOST}/event-posters/2-vol16.jpg`
    const { rerender } = render(<PosterImage src={POSTER_URL} alt="poster" width={200} />)

    const img = screen.getByRole('img', { name: 'poster' })
    fireEvent.error(img)
    expect(img).toHaveAttribute('src', POSTER_URL)
    expect(img).not.toHaveAttribute('srcset')

    rerender(<PosterImage src={OTHER_URL} alt="poster" width={200} />)

    const next = screen.getByRole('img', { name: 'poster' })
    expect(next).toHaveAttribute(
      'src',
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/2-vol16.jpg`
    )
    expect(next).toHaveAttribute('srcset')
  })

  it("invokes a caller's onError as well as falling back", () => {
    const onError = vi.fn()
    render(<PosterImage src={POSTER_URL} alt="poster" width={200} onError={onError} />)

    const img = screen.getByRole('img', { name: 'poster' })
    fireEvent.error(img)

    expect(onError).toHaveBeenCalledTimes(1)
    // The caller's handler must not suppress the fallback, nor vice versa.
    expect(img).toHaveAttribute('src', POSTER_URL)
    expect(img).not.toHaveAttribute('srcset')
  })

  it("keeps calling the caller's onError after the fallback guard has tripped", () => {
    const onError = vi.fn()
    render(<PosterImage src={POSTER_URL} alt="poster" width={200} onError={onError} />)

    const img = screen.getByRole('img', { name: 'poster' })
    fireEvent.error(img)
    fireEvent.error(img)

    // The ref guard suppresses only the duplicate fallback transition — the
    // caller still hears about every failure.
    expect(onError).toHaveBeenCalledTimes(2)
  })

  it('reports unavailable only when the original fails too, once per src (#1368)', () => {
    const onUnavailable = vi.fn()
    const { rerender } = render(<PosterImage src={POSTER_URL} alt="poster" width={200} onUnavailable={onUnavailable} />)
    const img = screen.getByRole('img', { name: 'poster' })

    fireEvent.error(img) // the transform failed: fall back, still a poster to try
    expect(onUnavailable).not.toHaveBeenCalled()

    fireEvent.error(img) // the original failed too
    fireEvent.error(img)
    expect(onUnavailable).toHaveBeenCalledTimes(1)

    // A new poster gets its own two chances.
    rerender(<PosterImage src={`${POSTER_URL}?v=2`} alt="poster" width={200} onUnavailable={onUnavailable} />)
    fireEvent.error(img)
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    fireEvent.error(img)
    expect(onUnavailable).toHaveBeenCalledTimes(2)
  })

  it('reports a foreign-host poster unavailable on its first error: there is no transform to fall back from', () => {
    const onUnavailable = vi.fn()
    render(<PosterImage src="https://example.com/poster.jpg" alt="poster" width={200} onUnavailable={onUnavailable} />)
    fireEvent.error(screen.getByRole('img', { name: 'poster' }))
    expect(onUnavailable).toHaveBeenCalledTimes(1)
  })

  // #1404: the guards used to be reset by an effect keyed on src, which also ran
  // on mount. A first error landing before that effect flushed was wiped by it,
  // so the original's failure was taken for the transform's and the broken
  // image stayed. Rendered outside act() so the mount effect really is pending
  // when the first error arrives.
  it('reports unavailable when the first error lands before the mount effect has run', async () => {
    const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onUnavailable = vi.fn()
    try {
      const secondErrorDone = new Promise(resolve => {
        const observer = new window.MutationObserver(() => {
          const img = container.querySelector('img')
          if (!img) return
          observer.disconnect()
          // A MutationObserver callback is a microtask after the commit, before
          // the passive effects' task.
          img.dispatchEvent(new Event('error'))
          // The original fails later, after the mount effect has flushed.
          setTimeout(() => {
            img.dispatchEvent(new Event('error'))
            setTimeout(resolve, 0)
          }, 20)
        })
        observer.observe(container, { childList: true, subtree: true })
      })
      root.render(<PosterImage src={POSTER_URL} alt="" width={200} onUnavailable={onUnavailable} />)
      await secondErrorDone
      expect(onUnavailable).toHaveBeenCalledTimes(1)
    } finally {
      root.unmount()
      container.remove()
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    }
  })
})
