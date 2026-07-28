import { describe, expect, it } from 'vitest'
import { POSTER_IMAGE_HOST, posterImageSrcSet, posterImageUrl } from '../posterImage'

const POSTER_URL = `https://${POSTER_IMAGE_HOST}/event-posters/1785199290009-lwbc-vol-17-poster.jpg`

describe('posterImageUrl', () => {
  it('rewrites a poster-host URL to a width/format=auto transform, preserving the path', () => {
    expect(posterImageUrl(POSTER_URL, 200)).toBe(
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1785199290009-lwbc-vol-17-poster.jpg`
    )
  })

  it('rounds a fractional width', () => {
    expect(posterImageUrl(POSTER_URL, 199.6)).toBe(
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1785199290009-lwbc-vol-17-poster.jpg`
    )
  })

  it('preserves query string and hash on the original URL', () => {
    const url = `https://${POSTER_IMAGE_HOST}/event-posters/poster.jpg?v=2#frag`
    expect(posterImageUrl(url, 400)).toBe(
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=400,format=auto/event-posters/poster.jpg?v=2#frag`
    )
  })

  it.each([[null], [undefined], ['']])('passes through %p unchanged', value => {
    expect(posterImageUrl(value, 200)).toBe(value)
  })

  it('passes through a foreign-host URL unchanged', () => {
    const url = 'https://cdn.example.com/posters/poster-fest.jpg'
    expect(posterImageUrl(url, 200)).toBe(url)
  })

  it('passes through a URL that is already a transform URL unchanged', () => {
    const url = `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/poster.jpg`
    expect(posterImageUrl(url, 800)).toBe(url)
  })

  it('passes through unchanged when width is missing, zero, negative, or non-finite', () => {
    expect(posterImageUrl(POSTER_URL, undefined)).toBe(POSTER_URL)
    expect(posterImageUrl(POSTER_URL, 0)).toBe(POSTER_URL)
    expect(posterImageUrl(POSTER_URL, -200)).toBe(POSTER_URL)
    expect(posterImageUrl(POSTER_URL, NaN)).toBe(POSTER_URL)
    expect(posterImageUrl(POSTER_URL, Infinity)).toBe(POSTER_URL)
  })

  it('never throws on a malformed URL string — passes it through unchanged', () => {
    expect(posterImageUrl('not a url', 200)).toBe('not a url')
  })
})

describe('posterImageSrcSet', () => {
  it('formats a 1x/2x srcset from the given base width', () => {
    expect(posterImageSrcSet(POSTER_URL, 200)).toBe(
      `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/1785199290009-lwbc-vol-17-poster.jpg 1x, ` +
        `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=400,format=auto/event-posters/1785199290009-lwbc-vol-17-poster.jpg 2x`
    )
  })

  it('returns undefined for a foreign-host URL rather than a repeated-URL srcset', () => {
    expect(posterImageSrcSet('https://cdn.example.com/posters/poster-fest.jpg', 200)).toBeUndefined()
  })

  it('returns undefined for null/undefined/empty input', () => {
    expect(posterImageSrcSet(null, 200)).toBeUndefined()
    expect(posterImageSrcSet(undefined, 200)).toBeUndefined()
    expect(posterImageSrcSet('', 200)).toBeUndefined()
  })

  it('returns undefined for an already-transformed URL', () => {
    const url = `https://${POSTER_IMAGE_HOST}/cdn-cgi/image/width=200,format=auto/event-posters/poster.jpg`
    expect(posterImageSrcSet(url, 800)).toBeUndefined()
  })
})
