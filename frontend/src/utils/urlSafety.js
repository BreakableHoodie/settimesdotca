export function safeExternalHref(value) {
  if (!value) return '#'

  try {
    const parsed = new URL(String(value).trim())
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '#'
  } catch {
    return '#'
  }
}

export function safeHttpsFallbackHref(value) {
  if (!value) return '#'

  const text = String(value).trim()
  if (!text) return '#'

  if (/^https?:\/\//i.test(text)) {
    return safeExternalHref(text)
  }

  if (/^[a-z0-9.-]+(?:\/[^\s]*)?$/i.test(text)) {
    return safeExternalHref(`https://${text.replace(/^\/+/, '')}`)
  }

  return '#'
}

export function safeSocialProfileHref(value, baseUrl) {
  if (!value) return '#'

  const text = String(value).trim()
  if (!text) return '#'

  if (/^https?:\/\//i.test(text)) {
    return safeExternalHref(text)
  }

  // A colon is the necessary condition for any URL scheme (javascript:,
  // data:, vbscript:, ...), and no real platform handle contains one, so
  // reject it here too — mirrors the read-path guard in
  // functions/utils/validation.js safeReflectHandleOrUrl.
  const normalized = text.replace(/^@/, '').replace(/^\/+/, '')
  if (!normalized || /\s/.test(normalized) || normalized.includes(':')) {
    return '#'
  }

  return safeExternalHref(`${baseUrl.replace(/\/$/, '')}/${normalized}`)
}

export function safeInstagramHref(value) {
  return safeSocialProfileHref(value, 'https://instagram.com')
}

export function safeXHref(value) {
  return safeSocialProfileHref(value, 'https://x.com')
}

// TikTok profile URLs require the leading `@` inside the path itself
// (https://www.tiktok.com/@handle) — unlike Instagram/X, where the bare
// username follows the domain. safeSocialProfileHref strips a leading `@`
// as decoration, so it can't be reused here; this always re-adds exactly
// one `@` after normalizing the input.
export function safeTikTokHref(value) {
  if (!value) return '#'

  const text = String(value).trim()
  if (!text) return '#'

  if (/^https?:\/\//i.test(text)) {
    return safeExternalHref(text)
  }

  const normalized = text.replace(/^@/, '').replace(/^\/+/, '')
  if (!normalized || /\s/.test(normalized) || normalized.includes(':')) {
    return '#'
  }

  return safeExternalHref(`https://www.tiktok.com/@${normalized}`)
}
