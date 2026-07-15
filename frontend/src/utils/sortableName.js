/**
 * Alphabetical sort key for a band/artist name that ignores a leading
 * article ("The ", "A ", "An ") — standard library/catalog alphabetization
 * convention. "The Anti-Queens" must sort under A, not T (#587).
 *
 * Sort-key only — never mutates the displayed name. Callers keep showing
 * `band.name` as-is; only the value fed to a comparator changes.
 *
 * The article must be followed by whitespace to strip, so a band literally
 * named "The" or "A" (no following word) and names like "Theory" or
 * "Anthem" (no space after "the"/"an") are left untouched.
 *
 * Mirrored in `functions/utils/sortableName.js` — the frontend and Cloudflare
 * Pages Functions don't share a module graph, so this helper is duplicated
 * rather than imported across the boundary (same precedent as `FIELD_LIMITS`
 * between this file's `validation.js` and `functions/utils/validation.js`).
 * Keep the two copies' behavior identical; update both together.
 *
 * @param {string|null|undefined} name
 * @returns {string} Lowercased sort key, safe to feed to `<`/`>`/`localeCompare`.
 */

const LEADING_ARTICLE_REGEX = /^(the|an?)\s+/i

export function sortableName(name) {
  if (typeof name !== 'string') return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  const stripped = trimmed.replace(LEADING_ARTICLE_REGEX, '').trim()
  return (stripped || trimmed).toLowerCase()
}

/**
 * Comparator for `Array.prototype.sort` that compares two names via
 * `sortableName` (article-stripped) using `localeCompare`. Accepts either a
 * raw name string or an object with a `.name` property, since call sites sort
 * both plain strings and band/performance records.
 *
 * @param {string|{name?: string}|null|undefined} a
 * @param {string|{name?: string}|null|undefined} b
 * @returns {number}
 */
export function compareByName(a, b) {
  const nameA = typeof a === 'string' ? a : a?.name
  const nameB = typeof b === 'string' ? b : b?.name
  return sortableName(nameA).localeCompare(sortableName(nameB))
}
