/**
 * Pure venue-roster logic for VenuesTab — address rendering, search, ordering.
 *
 * Extracted so it can be tested without mounting a 644-line component (#905).
 * `formatAddress` in particular earns its own tests: it feeds the table cell,
 * the search predicate AND the address sort, so one bug there breaks three
 * things that look unrelated from the UI.
 */

/**
 * Compose a venue's display address from its structured columns.
 *
 * Falls back to the legacy freeform `address` only when every structured field
 * is empty — a venue mid-migration has both, and the structured columns are
 * the newer truth. Empty segments are dropped rather than leaving ", ," gaps.
 *
 * @param {object|null|undefined} venue
 * @returns {string} '' when there is nothing to show
 */
export function formatVenueAddress(venue) {
  if (!venue) return ''
  const line1 = [venue.address_line1, venue.address_line2].filter(Boolean).join(', ')
  const line2 = [venue.city, venue.region].filter(Boolean).join(', ')
  const line3 = [venue.postal_code, venue.country].filter(Boolean).join(' ').trim()
  return [line1, line2, line3].filter(Boolean).join(', ') || venue.address || ''
}

/**
 * Narrow venues by a single search box that spans name, address, city, region,
 * contact email and phone.
 *
 * Searching the COMPOSED address rather than the raw columns is deliberate: an
 * operator types what they see in the table.
 *
 * @param {Array<object>} venues
 * @param {string} searchTerm
 * @returns {Array<object>}
 */
export function filterVenues(venues, searchTerm) {
  const list = venues ?? []
  if (!searchTerm?.trim()) return list
  const query = searchTerm.trim().toLowerCase()
  return list.filter(venue => {
    if (formatVenueAddress(venue).toLowerCase().includes(query)) return true
    return ['name', 'city', 'region', 'contact_email', 'phone'].some(field =>
      venue[field]?.toLowerCase().includes(query)
    )
  })
}

/**
 * Order venues. `band_count` sorts numerically; everything else is a
 * case-insensitive string compare, with `address` going through the composed
 * form so the order matches what the table renders.
 *
 * @param {Array<object>} venues
 * @param {{key: string|null, direction: 'asc'|'desc'}} sortConfig
 * @returns {Array<object>} a new array; the input is not mutated
 */
export function sortVenues(venues, sortConfig) {
  const list = venues ?? []
  if (!sortConfig?.key) return list
  const direction = sortConfig.direction === 'asc' ? 1 : -1

  return [...list].sort((a, b) => {
    if (sortConfig.key === 'band_count') {
      // Numeric, not lexicographic: a string compare puts 10 before 9.
      return ((a.band_count || 0) - (b.band_count || 0)) * direction
    }
    if (sortConfig.key === 'address') {
      return formatVenueAddress(a).toLowerCase().localeCompare(formatVenueAddress(b).toLowerCase()) * direction
    }
    return (a[sortConfig.key] || '').toLowerCase().localeCompare((b[sortConfig.key] || '').toLowerCase()) * direction
  })
}
