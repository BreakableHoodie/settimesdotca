import { slugifyBandName } from './slugify'

export function buildBandProfileHref(bandName, eventSlug) {
  const href = `/band/${slugifyBandName(bandName)}`

  if (!eventSlug) {
    return href
  }

  const params = new URLSearchParams({ fromEvent: eventSlug })
  return `${href}?${params.toString()}`
}
