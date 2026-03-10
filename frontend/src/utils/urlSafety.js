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

  const normalized = text.replace(/^@/, '').replace(/^\/+/, '')
  if (!normalized || /\s/.test(normalized)) {
    return '#'
  }

  return safeExternalHref(`${baseUrl.replace(/\/$/, '')}/${normalized}`)
}

export function safeInstagramHref(value) {
  return safeSocialProfileHref(value, 'https://instagram.com')
}
