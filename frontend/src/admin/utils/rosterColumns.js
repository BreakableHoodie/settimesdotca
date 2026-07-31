import { formatOrigin, matchesGapFilter, countGaps } from './bandFields'

export const BLANK = '(Blanks)'

// Moved out of RosterTab so the Status column's filter and its badge agree.
// `is_active` is INTEGER NOT NULL DEFAULT 1 in D1, so it is always 0 or 1, but
// the legacy boolean shape is checked defensively too (#619).
export function isInactive(band) {
  return band.is_active === 0 || band.is_active === false
}

const single = value => {
  const text = String(value ?? '').trim()
  return text === '' ? [BLANK] : [text]
}

// Genre is the one multi-valued cell: "punk, indie rock" is two tokens, and the
// roster already splits it that way for autocomplete. Every other column
// returns a one-element array, so the `string[]` signature absorbs the whole
// special case.
const tokens = value => {
  const parts = String(value ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  return parts.length === 0 ? [BLANK] : parts
}

export const FILTERABLE_COLUMNS = [
  { key: 'name', label: 'Name', type: 'values', getValues: band => single(band.name) },
  { key: 'origin', label: 'Origin', type: 'values', getValues: band => single(formatOrigin(band)) },
  { key: 'genre', label: 'Genre', type: 'values', getValues: band => tokens(band.genre) },
  { key: 'is_active', label: 'Status', type: 'values', getValues: band => [isInactive(band) ? 'Inactive' : 'Active'] },
  { key: 'link_count', label: 'Links', type: 'links' },
  { key: 'contact_email', label: 'Contact', type: 'values', getValues: band => single(band.contact_email) },
  { key: 'follower_count', label: 'Followers', type: 'values', getValues: band => [String(band.follower_count ?? 0)] },
]

const COLUMN_BY_KEY = new Map(FILTERABLE_COLUMNS.map(column => [column.key, column]))

// A `values` filter with an empty/absent array is NOT a filter — it shows
// everything. Unchecking the last value therefore clears the column rather
// than emptying the table.
function columnPasses(band, column, filter) {
  if (!filter) return true
  if (column.type === 'links') return matchesGapFilter(band, filter)
  const selected = Array.isArray(filter.values) ? filter.values : []
  if (selected.length === 0) return true
  return column.getValues(band).some(value => selected.includes(value))
}

export function matchesColumnFilters(band, columnFilters) {
  if (!band) return false // fail-safe: a null/undefined row matches nothing rather than throwing
  const filters = columnFilters || {}
  return FILTERABLE_COLUMNS.every(column => columnPasses(band, column, filters[column.key]))
}

// Counts exclude THIS column's own filter (Excel behaviour) so unchecking a
// value doesn't make the rest of its list disappear.
export function valueCountsFor(columnKey, bands, columnFilters) {
  const column = COLUMN_BY_KEY.get(columnKey)
  if (!column || column.type === 'links') return new Map()
  const others = { ...(columnFilters || {}) }
  delete others[columnKey]
  const counts = new Map()
  for (const band of Array.isArray(bands) ? bands : []) {
    if (!matchesColumnFilters(band, others)) continue
    for (const value of column.getValues(band)) {
      counts.set(value, (counts.get(value) || 0) + 1)
    }
  }
  return counts
}

// Same exclusion rule, for the Links column's missing-counts.
export function linkCountsFor(bands, columnFilters) {
  const others = { ...(columnFilters || {}) }
  delete others.link_count
  return countGaps((Array.isArray(bands) ? bands : []).filter(band => matchesColumnFilters(band, others)))
}

export function isColumnFiltered(columnFilters, columnKey) {
  const filter = (columnFilters || {})[columnKey]
  if (!filter) return false
  if (columnKey === 'link_count') {
    return (Array.isArray(filter.keys) && filter.keys.length > 0) || filter.noLinks === true
  }
  return Array.isArray(filter.values) && filter.values.length > 0
}

export function activeFilterCount(columnFilters) {
  return FILTERABLE_COLUMNS.filter(column => isColumnFiltered(columnFilters, column.key)).length
}
