import { parseOrigin } from '../../utils/parseOrigin'

function parseSocialLinks(raw) {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

const BLANK_SCHEDULE = {
  id: null,
  venue_id: '',
  start_time: '',
  end_time: '',
  duration: '',
}

export function buildPickerFormData(artist, eventId) {
  const parsedOrigin = parseOrigin(artist.origin)
  const socialLinks = parseSocialLinks(artist.social_links)

  return {
    ...BLANK_SCHEDULE,
    event_id: String(eventId),
    name: artist.name || '',
    genre: artist.genre || '',
    origin: artist.origin || '',
    origin_city: artist.origin_city || parsedOrigin.city,
    origin_region: artist.origin_region || parsedOrigin.region,
    contact_email: artist.contact_email || '',
    is_active: artist.is_active ?? 1,
    description: artist.description || '',
    photo_url: artist.photo_url || '',
    url: artist.url || '',
    website: socialLinks.website || '',
    instagram: socialLinks.instagram || '',
    bandcamp: socialLinks.bandcamp || '',
    facebook: socialLinks.facebook || '',
    youtube: socialLinks.youtube || '',
    spotify: socialLinks.spotify || '',
    apple_music: socialLinks.apple_music || '',
    linktree: socialLinks.linktree || '',
  }
}

export function buildEmptyPickerFormData(name, eventId) {
  return {
    ...BLANK_SCHEDULE,
    event_id: String(eventId),
    name: name || '',
    genre: '',
    origin: '',
    origin_city: '',
    origin_region: '',
    contact_email: '',
    is_active: 1,
    description: '',
    photo_url: '',
    url: '',
    website: '',
    instagram: '',
    bandcamp: '',
    facebook: '',
    youtube: '',
    spotify: '',
    apple_music: '',
    linktree: '',
  }
}
