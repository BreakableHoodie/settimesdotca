const GENRE_ALIASES = {
  'hip hop': 'Hip-Hop',
  'hip-hop': 'Hip-Hop',
  'r&b': 'R&B',
  rnb: 'R&B',
  edm: 'EDM',
}

export const DEFAULT_GENRES = [
  'Alternative',
  'Ambient',
  'Blues',
  'Classical',
  'Country',
  'Dance',
  'EDM',
  'Electronic',
  'Experimental',
  'Folk',
  'Funk',
  'Hip-Hop',
  'Indie',
  'Jazz',
  'Metal',
  'Pop',
  'Punk',
  'R&B',
  'Rock',
  'Soul',
]

function titleCaseGenre(value) {
  return value
    .split(' ')
    .map(word =>
      word
        .split('-')
        .map(part => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join('-')
    )
    .join(' ')
}

function normalizeGenre(value, canonicalMap, aliasMap) {
  if (!value) return null
  const cleaned = value.trim().replace(/\s+/g, ' ')
  if (!cleaned) return null

  const lower = cleaned.toLowerCase()
  if (aliasMap.has(lower)) return aliasMap.get(lower)
  if (canonicalMap.has(lower)) return canonicalMap.get(lower)
  if (cleaned === cleaned.toUpperCase()) return cleaned
  return titleCaseGenre(cleaned)
}

export function getNormalizedGenreSuggestions(values = [], canonicalGenres = DEFAULT_GENRES) {
  const canonicalMap = new Map(canonicalGenres.map(genre => [genre.toLowerCase(), genre]))
  const aliasMap = new Map(
    Object.entries(GENRE_ALIASES).map(([key, value]) => [
      key.toLowerCase(),
      canonicalMap.get(value.toLowerCase()) || value,
    ])
  )

  const normalized = new Map()
  values.forEach(value => {
    const genre = normalizeGenre(value, canonicalMap, aliasMap)
    if (!genre) return
    const key = genre.toLowerCase()
    if (!normalized.has(key)) {
      normalized.set(key, genre)
    }
  })

  return Array.from(normalized.values()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
