/**
 * Pure roster logic for UserManagement — display name resolution, search /
 * role / status filtering, and sort ordering for the admin user list.
 *
 * Extracted so it can be tested without mounting a 576-line component (#905),
 * which currently loads in zero tests. Mounting it to reach this logic would
 * pull its whole uncovered surface into the coverage denominator while only
 * exercising this slice.
 *
 * Every function here takes its collaborators as arguments instead of closing
 * over component state, so a test supplies them without a render.
 */

/**
 * Resolve a user's display name.
 *
 * `firstName`/`lastName` win whenever either is present, even the legacy
 * freeform `name` is also set — a user mid-migration to the structured fields
 * still shows the newer value. Falls through to `''` rather than throwing
 * when a caller passes null/undefined.
 *
 * @param {object|null|undefined} user
 * @returns {string}
 */
export function resolveUserDisplayName(user) {
  if (user?.firstName || user?.lastName) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ')
  }
  return user?.name || ''
}

/**
 * Narrow the roster by a single search box (name + email), a role filter, and
 * an active/inactive status filter.
 *
 * The search matches against the RESOLVED display name, not the raw `name`
 * field, so a user with only `firstName`/`lastName` set is still searchable.
 * `statusFilter` coerces `isActive` with `Boolean(...)` before comparing —
 * the API returns it as an integer (`1`/`0`), not a boolean, so a strict
 * `=== true` compare would silently match nothing.
 *
 * @param {Array<object>} users
 * @param {object} [options]
 * @param {string} [options.searchTerm]
 * @param {string} [options.roleFilter] - 'all' for no filter
 * @param {string} [options.statusFilter] - 'all' | 'active' | 'inactive'
 * @returns {Array<object>}
 */
export function filterUsers(users, { searchTerm, roleFilter, statusFilter } = {}) {
  let list = users ?? []
  if (searchTerm?.trim()) {
    const query = searchTerm.trim().toLowerCase()
    list = list.filter(user => {
      const name = resolveUserDisplayName(user).toLowerCase()
      const email = (user.email || '').toLowerCase()
      return name.includes(query) || email.includes(query)
    })
  }
  if (roleFilter !== undefined && roleFilter !== 'all') {
    list = list.filter(user => user.role === roleFilter)
  }
  if (statusFilter !== undefined && statusFilter !== 'all') {
    const shouldBeActive = statusFilter === 'active'
    list = list.filter(user => Boolean(user.isActive) === shouldBeActive)
  }
  return list
}

/**
 * Order the roster. With no sort key set, the list is returned as-is — the
 * caller (search/filter) has already decided the order in that case.
 *
 * @param {Array<object>} users
 * @param {{key: string|null, direction: 'asc'|'desc'}} sortConfig
 * @returns {Array<object>} a new array; the input is not mutated
 */
export function sortUsers(users, sortConfig) {
  const list = users ?? []
  if (!sortConfig?.key) return list
  const direction = sortConfig.direction === 'asc' ? 1 : -1

  return [...list].sort((a, b) => {
    if (sortConfig.key === 'status') {
      const aVal = a.isActive ? 1 : 0
      const bVal = b.isActive ? 1 : 0
      return (aVal - bVal) * direction
    }
    if (sortConfig.key === 'last_login') {
      const aVal = a.last_login ? new Date(a.last_login).getTime() : 0
      const bVal = b.last_login ? new Date(b.last_login).getTime() : 0
      return (aVal - bVal) * direction
    }
    if (sortConfig.key === 'role') {
      // Rank order, not alphabetical — admin outranks editor outranks viewer.
      // An unrecognised role sorts below all three rather than throwing.
      const order = { admin: 3, editor: 2, viewer: 1 }
      const aVal = order[a.role] || 0
      const bVal = order[b.role] || 0
      return (aVal - bVal) * direction
    }
    if (sortConfig.key === 'email') {
      return (a.email || '').localeCompare(b.email || '') * direction
    }

    const aVal = resolveUserDisplayName(a).toLowerCase()
    const bVal = resolveUserDisplayName(b).toLowerCase()
    return aVal.localeCompare(bVal) * direction
  })
}
