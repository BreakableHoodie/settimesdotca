// Test helpers for admin events API tests
import { MockD1Database } from '../../../subscriptions/__tests__/mocks/d1.js'

export class AdminMockD1Database extends MockD1Database {
  constructor() {
    super()
    // Add admin-specific tables
    this.data.users = []
    this.idCounter = 1
  }

  prepare(query) {
    return {
      bind: (...params) => ({
        first: async () => this._executeSelectFirst(query, params),
        all: async () => this._executeSelect(query, params),
        run: async () => this._executeWrite(query, params)
      })
    }
  }

  _executeSelectFirst(query, params) {
    const result = this._executeSelect(query, params)
    return result.results && result.results.length > 0 ? result.results[0] : null
  }

  _executeSelect(query, params) {
    const queryLower = query.toLowerCase()

    // SELECT event by ID
    if (queryLower.includes('select * from events where id = ?')) {
      const [id] = params
      const event = this.data.events.find(e => e.id === id)
      return { results: event ? [event] : [] }
    }

    // SELECT event by slug (check duplicate)
    if (queryLower.includes('select id from events where slug = ?')) {
      const [slug] = params
      const event = this.data.events.find(e => e.slug === slug)
      return { results: event ? [{ id: event.id }] : [] }
    }

    // SELECT all events with archived filter
    if (queryLower.includes('select') && queryLower.includes('from events')) {
      let results = [...this.data.events]

      // Filter archived events
      if (!queryLower.includes('archived')) {
        results = results.filter(e => e.status !== 'archived')
      }

      // Order by date
      if (queryLower.includes('order by date desc')) {
        results.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      }

      return { results }
    }

    // SELECT band count for event
    if (queryLower.includes('select count(*) as count from bands where event_id = ?')) {
      const [eventId] = params
      const count = this.data.bands.filter(b => b.event_id === eventId).length
      return { results: [{ count }] }
    }

    // Fall back to parent class
    return super._executeSelect(query, params)
  }

  _executeWrite(query, params) {
    const queryLower = query.toLowerCase()

    // INSERT new event
    if (queryLower.includes('insert into events')) {
      const [name, slug, date, status, userId] = params

      const newEvent = {
        id: this.idCounter++,
        name,
        slug,
        date,
        status: status || 'draft',
        is_published: status === 'published' ? 1 : 0,
        archived_at: null,
        created_by_user_id: userId,
        created_at: new Date().toISOString()
      }

      this.data.events.push(newEvent)
      return { success: true, meta: { changes: 1, last_row_id: newEvent.id } }
    }

    // UPDATE event
    if (queryLower.includes('update events set')) {
      const eventId = params[params.length - 1]
      const event = this.data.events.find(e => e.id === eventId)

      if (!event) {
        return { success: true, meta: { changes: 0 } }
      }

      // Update status (publish/unpublish)
      if (queryLower.includes('set status = ?')) {
        const [status] = params
        event.status = status
        event.is_published = status === 'published' ? 1 : 0
        return { success: true, meta: { changes: 1 } }
      }

      // Update for archive
      if (queryLower.includes('set status = ?, archived_at = ?')) {
        const [status, archivedAt] = params
        event.status = status
        event.archived_at = archivedAt
        return { success: true, meta: { changes: 1 } }
      }

      // General update
      if (queryLower.includes('set name = ?, date = ?, slug = ?')) {
        const [name, date, slug] = params
        event.name = name
        event.date = date
        event.slug = slug
        return { success: true, meta: { changes: 1 } }
      }

      return { success: true, meta: { changes: 1 } }
    }

    // DELETE event
    if (queryLower.includes('delete from events where id = ?')) {
      const [id] = params
      const index = this.data.events.findIndex(e => e.id === id)

      if (index !== -1) {
        this.data.events.splice(index, 1)

        // Set bands' event_id to null (ON DELETE SET NULL)
        this.data.bands.forEach(band => {
          if (band.event_id === id) {
            band.event_id = null
          }
        })

        return { success: true, meta: { changes: 1 } }
      }

      return { success: true, meta: { changes: 0 } }
    }

    // Fall back to parent class
    return super._executeWrite(query, params)
  }
}

export function createMockUser({ id = 1, email = 'admin@test', role = 'admin' } = {}) {
  return { id, email, role, displayName: 'Test User' }
}

export function createMockEvent({ id = 1, name = 'Test Event', slug = 'test-event', date = '2025-12-15', status = 'draft' } = {}) {
  return {
    id,
    name,
    slug,
    date,
    status,
    is_published: status === 'published' ? 1 : 0,
    archived_at: status === 'archived' ? new Date().toISOString() : null,
    created_by_user_id: 1,
    created_at: new Date().toISOString()
  }
}

export function createTestContext({ role = 'editor', db = null } = {}) {
  const mockDB = db || new AdminMockD1Database()
  const mockUser = createMockUser({ role })

  return {
    env: {
      DB: mockDB,
      JWT_SECRET: 'test-secret'
    },
    request: {
      user: mockUser,
      headers: new Headers({
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      })
    },
    mockDB,
    mockUser
  }
}
