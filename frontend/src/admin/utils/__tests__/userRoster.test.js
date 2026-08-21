import { describe, expect, it } from 'vitest'
import { filterUsers, resolveUserDisplayName, sortUsers } from '../userRoster'

const user = (id, over = {}) => ({
  id,
  email: `user${id}@example.test`,
  role: 'viewer',
  isActive: true,
  ...over,
})

describe('resolveUserDisplayName', () => {
  it('joins firstName and lastName when both are present', () => {
    expect(resolveUserDisplayName(user(1, { firstName: 'Jamie', lastName: 'Fox' }))).toBe('Jamie Fox')
  })

  it('falls back to firstName alone when lastName is missing', () => {
    expect(resolveUserDisplayName(user(1, { firstName: 'Jamie', lastName: '' }))).toBe('Jamie')
  })

  it('falls back to lastName alone when firstName is missing', () => {
    expect(resolveUserDisplayName(user(1, { firstName: '', lastName: 'Fox' }))).toBe('Fox')
  })

  it('falls back to the legacy freeform name when neither structured field is set', () => {
    expect(resolveUserDisplayName(user(1, { name: 'Legacy Name' }))).toBe('Legacy Name')
  })

  it('prefers firstName/lastName over the legacy name when both exist', () => {
    // A user mid-migration to the structured fields carries both; the
    // structured value is the newer one and must win.
    expect(resolveUserDisplayName(user(1, { firstName: 'Jamie', lastName: 'Fox', name: 'Legacy Name' }))).toBe(
      'Jamie Fox'
    )
  })

  it('returns empty string when no name field is set at all', () => {
    expect(resolveUserDisplayName(user(1, {}))).toBe('')
  })

  it('returns empty string for null/undefined rather than throwing', () => {
    expect(resolveUserDisplayName(null)).toBe('')
    expect(resolveUserDisplayName(undefined)).toBe('')
  })
})

describe('filterUsers', () => {
  const users = [
    user(1, { firstName: 'Jamie', lastName: 'Fox', email: 'jamie@blue.test', role: 'admin', isActive: 1 }),
    user(2, { name: 'Sam Nabi', email: 'sam@room47.test', role: 'editor', isActive: 0 }),
    user(3, { firstName: 'Deer', lastName: 'Fang', email: 'deer@roost.test', role: 'viewer', isActive: true }),
  ]

  it('returns everything for an empty or whitespace-only search', () => {
    expect(filterUsers(users, { searchTerm: '' })).toHaveLength(3)
    expect(filterUsers(users, { searchTerm: '   ' })).toHaveLength(3)
  })

  it('matches search case-insensitively against the resolved display name', () => {
    // "jamie" only matches via firstName/lastName resolution, not a raw `name`
    // field — user 1 has no `name` at all.
    expect(filterUsers(users, { searchTerm: 'JAMIE' }).map(u => u.id)).toEqual([1])
  })

  it('matches search against email', () => {
    expect(filterUsers(users, { searchTerm: 'room47' }).map(u => u.id)).toEqual([2])
  })

  it('filters by role', () => {
    expect(filterUsers(users, { roleFilter: 'editor' }).map(u => u.id)).toEqual([2])
  })

  it('coerces isActive with Boolean(), matching integer 1/0 as well as true/false', () => {
    // The API returns isActive as an integer. A strict `user.isActive === true`
    // comparison would silently drop user 1 (isActive: 1) from the active set.
    expect(filterUsers(users, { statusFilter: 'active' }).map(u => u.id)).toEqual([1, 3])
    expect(filterUsers(users, { statusFilter: 'inactive' }).map(u => u.id)).toEqual([2])
  })

  it('composes search, role, and status filters', () => {
    const result = filterUsers(users, { searchTerm: 'e', roleFilter: 'viewer', statusFilter: 'active' })
    expect(result.map(u => u.id)).toEqual([3])
  })

  it('does not mutate the input', () => {
    const input = [...users]
    // Length alone misses reordering and in-place object mutation.
    const snapshot = input.map(item => ({ ...item }))
    filterUsers(input, { searchTerm: 'jamie' })
    expect(input).toEqual(snapshot)
  })

  it('does not throw on users with missing optional fields', () => {
    expect(() =>
      filterUsers([{ id: 9 }], { searchTerm: 'x', roleFilter: 'admin', statusFilter: 'active' })
    ).not.toThrow()
  })
})

describe('sortUsers', () => {
  it('returns the list untouched when no sort key is set', () => {
    const users = [user(2, { name: 'Zed' }), user(1, { name: 'Alpha' })]
    expect(sortUsers(users, { key: null }).map(u => u.id)).toEqual([2, 1])
  })

  it('sorts by status, coercing isActive with Boolean() for integers and booleans alike', () => {
    // Mixed representations by design: id order (1,2,3,4) must NOT equal the
    // sorted order, so a test that forgot to coerce truthiness would still
    // produce a plausible-looking but wrong order.
    const users = [
      user(1, { isActive: 1 }),
      user(2, { isActive: false }),
      user(3, { isActive: 0 }),
      user(4, { isActive: true }),
    ]
    const result = sortUsers(users, { key: 'status', direction: 'asc' }, {}).map(u => u.id)
    expect(result.slice(0, 2).sort()).toEqual([2, 3])
    expect(result.slice(2).sort()).toEqual([1, 4])
  })

  it('sorts by last_login chronologically, treating a missing value as earliest', () => {
    const users = [
      user(1, { last_login: '2026-01-15T10:00:00Z' }),
      user(2, { last_login: null }),
      user(3, { last_login: '2020-06-01T00:00:00Z' }),
    ]
    // id order is 1,2,3 but chronological order is 2 (none => 0), 3 (2020), 1 (2026).
    expect(sortUsers(users, { key: 'last_login', direction: 'asc' }).map(u => u.id)).toEqual([2, 3, 1])
    expect(sortUsers(users, { key: 'last_login', direction: 'desc' }).map(u => u.id)).toEqual([1, 3, 2])
  })

  it('sorts by role RANK, not alphabetically', () => {
    // Alphabetical would read admin, editor, viewer — identical to rank order,
    // so use id order that disagrees with rank order to catch a swapped map,
    // and include an unrecognised role that must sort below all three.
    const users = [
      user(1, { role: 'admin' }),
      user(2, { role: 'viewer' }),
      user(3, { role: 'editor' }),
      user(4, { role: 'nobody' }),
    ]
    expect(sortUsers(users, { key: 'role', direction: 'asc' }).map(u => u.id)).toEqual([4, 2, 3, 1])
  })

  it('sorts by email', () => {
    const users = [user(1, { email: 'zed@example.test' }), user(2, { email: 'alpha@example.test' })]
    expect(sortUsers(users, { key: 'email', direction: 'asc' }).map(u => u.id)).toEqual([2, 1])
  })

  it('falls back to display-name order for an unrecognised key, using the RESOLVED name', () => {
    // One user has only firstName/lastName, the other only the legacy `name` —
    // proves the default branch goes through resolveUserDisplayName rather
    // than reading `user.name` directly.
    const users = [user(1, { firstName: 'Zebra' }), user(2, { name: 'Alpha' })]
    expect(sortUsers(users, { key: 'name', direction: 'asc' }).map(u => u.id)).toEqual([2, 1])
  })

  it('reverses on desc', () => {
    const users = [user(1, { firstName: 'Alpha' }), user(2, { firstName: 'Zebra' })]
    expect(sortUsers(users, { key: 'name', direction: 'desc' }).map(u => u.id)).toEqual([2, 1])
  })

  it('does not mutate the input array', () => {
    const users = [user(2, { firstName: 'Zebra' }), user(1, { firstName: 'Alpha' })]
    // Full contents, not just id order: an id check misses a sort that reorders
    // correctly while mutating an element in place.
    const snapshot = users.map(item => ({ ...item }))
    sortUsers(users, { key: 'name', direction: 'asc' })
    expect(users).toEqual(snapshot)
  })

  it('does not throw on users with missing optional fields', () => {
    const users = [{ id: 1 }, { id: 2 }]
    expect(() => sortUsers(users, { key: 'last_login', direction: 'asc' })).not.toThrow()
    expect(() => sortUsers(users, { key: 'role', direction: 'asc' })).not.toThrow()
    expect(() => sortUsers(users, { key: 'email', direction: 'asc' })).not.toThrow()
    expect(() => sortUsers(users, { key: 'name', direction: 'asc' })).not.toThrow()
  })
})
