import { Globe } from 'lucide-react'
import { safeExternalHref, safeHttpsFallbackHref, safeInstagramHref } from '../../utils/urlSafety'
import {
  AppleMusicIcon,
  BandcampIcon,
  FacebookIcon,
  InstagramIcon,
  LinktreeIcon,
  SpotifyIcon,
  YouTubeIcon,
} from '../../components/ui/SocialIcons'

// Shared by every link anchor in the Links column. The per-field colours live
// in `accent` below.
export const LINK_BASE_CLASS =
  'text-white/70 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2'

// The single source of truth for "what is a link field". Consumed by BOTH
// SocialLinksIcons (rendering) and hasField (filtering), so the filter can
// never claim an artist has a link the column doesn't show.
//
// Order is the Links-column render order AND the filter popover's row order.
// The popover deliberately does not sort by gap count: rows that reorder as
// data is entered would move the checkbox out from under the cursor.
//
// `accent` MUST stay a complete literal string. Tailwind v4 scans source text
// for whole class names and never evaluates template expressions, so building
// these via a template literal with an interpolated colour segment would
// generate no CSS at all and silently drop every hover and focus style in
// the column. (A source-text scan in bandFields.test.js enforces this --
// deliberately not spelling out the forbidden template syntax verbatim here,
// so this very sentence can't trip that scan.)
//
// `ariaNoun` is separate from `label` for one reason: "website" is a common
// noun and reads correctly lowercase mid-sentence ("Open website for X"),
// while the other seven are proper nouns. This preserves the existing,
// correct labels rather than regularising them.
export const LINK_FIELDS = [
  {
    key: 'website',
    label: 'Website',
    ariaNoun: 'website',
    resolveHref: safeExternalHref,
    Icon: Globe,
    accent: 'hover:text-accent-400 focus-visible:outline-accent-400',
  },
  {
    key: 'instagram',
    label: 'Instagram',
    ariaNoun: 'Instagram',
    resolveHref: safeInstagramHref,
    Icon: InstagramIcon,
    accent: 'hover:text-pink-400 focus-visible:outline-pink-400',
  },
  {
    key: 'bandcamp',
    label: 'Bandcamp',
    ariaNoun: 'Bandcamp',
    resolveHref: safeHttpsFallbackHref,
    Icon: BandcampIcon,
    accent: 'hover:text-teal-400 focus-visible:outline-teal-400',
  },
  {
    key: 'facebook',
    label: 'Facebook',
    ariaNoun: 'Facebook',
    resolveHref: safeExternalHref,
    Icon: FacebookIcon,
    accent: 'hover:text-blue-400 focus-visible:outline-blue-400',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    ariaNoun: 'YouTube',
    resolveHref: safeExternalHref,
    Icon: YouTubeIcon,
    accent: 'hover:text-red-500 focus-visible:outline-red-500',
  },
  {
    key: 'spotify',
    label: 'Spotify',
    ariaNoun: 'Spotify',
    resolveHref: safeExternalHref,
    Icon: SpotifyIcon,
    accent: 'hover:text-green-400 focus-visible:outline-green-400',
  },
  {
    key: 'apple_music',
    label: 'Apple Music',
    ariaNoun: 'Apple Music',
    resolveHref: safeExternalHref,
    Icon: AppleMusicIcon,
    accent: 'hover:text-rose-400 focus-visible:outline-rose-400',
  },
  {
    key: 'linktree',
    label: 'Linktree',
    ariaNoun: 'Linktree',
    resolveHref: safeExternalHref,
    Icon: LinktreeIcon,
    accent: 'hover:text-lime-400 focus-visible:outline-lime-400',
  },
]

// Non-link profile blanks worth filling. `contact_email` is deliberately
// absent: it is empty on all 218 active profiles, so a filter for it would
// always match everything.
export const PROFILE_FIELDS = [
  { key: 'photo_url', label: 'Photo' },
  { key: 'genre', label: 'Genre' },
  { key: 'origin', label: 'Origin' },
  { key: 'description', label: 'Bio' },
]

export const GAP_FIELDS = [...LINK_FIELDS, ...PROFILE_FIELDS]

// Bucket key for the "no links at all" preset. Not a real field: it means
// "missing ALL eight links", which the ANY-semantics of `keys` cannot express.
export const NO_LINKS_KEY = '__noLinks__'

// Frozen: this object is handed directly into React state as the default
// filter value, and is shared by every consumer that resets to "no filter".
// Freezing prevents an accidental in-place mutation (e.g. `filter.keys.push(...)`)
// from leaking across components that all point at the same reference.
export const EMPTY_GAP_FILTER = Object.freeze({ mode: 'missing', keys: Object.freeze([]), noLinks: false })

const LINK_FIELD_BY_KEY = new Map(LINK_FIELDS.map(field => [field.key, field]))

export function parseSocialLinks(band) {
  const raw = band?.social_links
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    // JSON.parse('null') === null and JSON.parse('"x"') === 'x'; neither is a
    // usable link map, so normalise both to {}.
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (_e) {
    return {}
  }
}

export function formatOrigin(band) {
  if (!band) return ''
  // Trim every source so a whitespace-only value (e.g. origin_city: '   ')
  // is treated as absent, consistent with the profile-field branch of
  // hasField below (which trims genre/description the same way) rather than
  // reading as present because the raw string was non-empty.
  const city = String(band.origin_city ?? '').trim()
  const region = String(band.origin_region ?? '').trim()
  const legacy = String(band.origin ?? '').trim()
  return [city, region].filter(Boolean).join(', ') || legacy
}

// Presence means "renders as a real link", not "non-empty in the DB": a value
// that fails URL sanitisation shows nothing in the Links column, so the filter
// must agree it is missing.
export function hasField(band, key) {
  const linkField = LINK_FIELD_BY_KEY.get(key)
  if (linkField) {
    return linkField.resolveHref(parseSocialLinks(band)[key]) !== '#'
  }
  if (key === 'origin') return formatOrigin(band) !== ''
  return String(band?.[key] ?? '').trim() !== ''
}

export function countLinks(band) {
  const links = parseSocialLinks(band)
  return LINK_FIELDS.filter(field => field.resolveHref(links[field.key]) !== '#').length
}

export function hasAnyLink(band) {
  return countLinks(band) > 0
}

// Returns MISSING counts, which is what the filter popover displays.
// `bands` is guarded against non-array input (e.g. a still-loading `undefined`
// from the roster fetch) the same way `keys` is guarded below: destructuring
// defaults only fire on `undefined`, and a bare `for...of` over `null` or a
// non-iterable throws instead of returning zero counts.
export function countGaps(bands) {
  const counts = { [NO_LINKS_KEY]: 0 }
  for (const field of GAP_FIELDS) counts[field.key] = 0

  const bandList = Array.isArray(bands) ? bands : []
  for (const band of bandList) {
    for (const field of GAP_FIELDS) {
      if (!hasField(band, field.key)) counts[field.key] += 1
    }
    if (!hasAnyLink(band)) counts[NO_LINKS_KEY] += 1
  }
  return counts
}

// Checked fields combine as ANY (a union worklist: one pass fills them all),
// with the noLinks preset ANDed on top.
export function matchesGapFilter(band, gapFilter) {
  const { mode = 'missing', keys, noLinks = false } = gapFilter || {}
  // Destructuring defaults only fire on `undefined`, so a caller passing
  // `keys: null` (or any non-array) would otherwise throw on `.length`/`.some`
  // below instead of degrading to "no keys selected".
  const keyList = Array.isArray(keys) ? keys : []
  if (noLinks && hasAnyLink(band)) return false
  if (keyList.length === 0) return true
  return keyList.some(key => (mode === 'missing' ? !hasField(band, key) : hasField(band, key)))
}

export function isGapFilterActive(gapFilter) {
  const { keys, noLinks = false } = gapFilter || {}
  const keyList = Array.isArray(keys) ? keys : []
  return keyList.length > 0 || noLinks
}
