// Subscribe-a-calendar links for the iCal feed (`/api/feeds/ical`, optionally
// `?band=<band_profiles.id>`). The feed stores nothing about the fan: the
// calendar app polls it, so new and moved sets arrive without email or an
// account. The same URL is offered three ways because no single link works in
// every calendar app.

export const SITE_FEED_PATH = '/api/feeds/ical'

/** Feed path for one artist's upcoming sets. */
export function bandFeedPath(bandId) {
  return `${SITE_FEED_PATH}?band=${encodeURIComponent(bandId)}`
}

function currentHost() {
  return typeof window !== 'undefined' ? window.location.host : ''
}

// The download keeps the page's own scheme, so local http dev still works.
function currentProtocol() {
  return typeof window !== 'undefined' ? window.location.protocol : 'https:'
}

/**
 * @param {string} path - feed path starting with "/"
 * @returns {{ webcal: string, google: string, download: string }}
 *   `webcal`: Apple Calendar, Outlook and most phones subscribe on tap.
 *   `google`: Google Calendar's "add by URL" deep link, which wants the webcal URL.
 *   `download`: the plain http(s) URL, for "Download .ics".
 */
export function calendarLinks(path) {
  const host = currentHost()
  const webcal = `webcal://${host}${path}`
  return {
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    download: `${currentProtocol()}//${host}${path}`,
  }
}
