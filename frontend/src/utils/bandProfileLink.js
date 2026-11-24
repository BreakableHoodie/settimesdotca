import { slugifyBandName } from './slugify'

export function buildBandProfileHref(band) {
  if (Number.isInteger(band?.id) || (typeof band?.id === 'string' && /^\d+$/.test(band.id))) {
    return `/band/${band.id}`
  }

  return `/band/${slugifyBandName(band?.name)}`
}

export function buildBandProfileState(eventSlug) {
  return eventSlug ? { fromEventSlug: eventSlug } : undefined
}
