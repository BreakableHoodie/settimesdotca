import { describe, expect, it } from 'vitest'
import { bandFeedPath, calendarLinks, SITE_FEED_PATH } from '../calendarLinks'

describe('calendarLinks', () => {
  it('builds the webcal, Google and download links from the current host', () => {
    const { webcal, google, download } = calendarLinks(SITE_FEED_PATH)
    const host = window.location.host
    expect(webcal).toBe(`webcal://${host}/api/feeds/ical`)
    expect(download).toBe(`${window.location.protocol}//${host}/api/feeds/ical`)
    expect(google).toBe(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`)
  })

  it('encodes the whole webcal URL, query included, for Google', () => {
    const { google } = calendarLinks(bandFeedPath(42))
    expect(google).toContain('cid=webcal%3A%2F%2F')
    expect(google).toContain('%3Fband%3D42')
    expect(google).not.toContain('?band=')
  })

  it('points the band feed at ?band=<id>', () => {
    expect(bandFeedPath(42)).toBe('/api/feeds/ical?band=42')
    expect(calendarLinks(bandFeedPath(42)).webcal).toMatch(/^webcal:\/\/.+\/api\/feeds\/ical\?band=42$/)
  })
})
