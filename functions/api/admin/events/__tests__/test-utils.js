import Database from 'better-sqlite3'

/**
 * createTestDB
 * Creates an in-memory SQLite database with minimal schema useful for event tests.
 * This is intentionally small and deterministic so tests are fast and isolated.
 */
export function createTestDB() {
  const db = new Database(':memory:')

  // Enable foreign key constraints to match production expectations
  db.pragma('foreign_keys = ON')

  // Minimal users table for RBAC checks
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      role TEXT NOT NULL
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      is_published INTEGER DEFAULT 0,
      archived_at TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      updated_by_user_id INTEGER
    );

    CREATE TABLE bands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
      venue_id INTEGER,
      start_time TEXT,
      end_time TEXT,
      url TEXT
    );

    CREATE TABLE venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      city TEXT,
      address TEXT
    );
  `)

  // Insert fixture users
  const insertUser = db.prepare('INSERT INTO users (email, role) VALUES (?, ?)')
  insertUser.run('admin@test', 'admin')
  insertUser.run('editor@test', 'editor')
  insertUser.run('viewer@test', 'viewer')

  return db
}

export const mockUsers = {
  admin: { id: 1, email: 'admin@test', role: 'admin' },
  editor: { id: 2, email: 'editor@test', role: 'editor' },
  viewer: { id: 3, email: 'viewer@test', role: 'viewer' },
}

export function insertEvent(db, { name = 'Test Event', slug = 'test-event', date = '2025-12-15', status = 'draft', created_by = 1 } = {}) {
  const stmt = db.prepare('INSERT INTO events (name, slug, date, status, created_by_user_id) VALUES (?, ?, ?, ?, ?)')
  const info = stmt.run(name, slug, date, status, created_by)
  return db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid)
}

export function insertBand(db, { name = 'Test Band', event_id = null } = {}) {
  const stmt = db.prepare('INSERT INTO bands (name, event_id) VALUES (?, ?)')
  const info = stmt.run(name, event_id)
  return db.prepare('SELECT * FROM bands WHERE id = ?').get(info.lastInsertRowid)
}

export function insertVenue(db, { name = 'Test Venue', city = 'Portland', address = null } = {}) {
  const stmt = db.prepare('INSERT INTO venues (name, city, address) VALUES (?, ?, ?)')
  const info = stmt.run(name, city, address)
  return db.prepare('SELECT * FROM venues WHERE id = ?').get(info.lastInsertRowid)
}

/**
 * createTestEnv
 * Helper to build a test environment object with DB and a role header value.
 * Usage: const { env, headers } = createTestEnv({ role: 'admin' })
 */
export function createTestEnv({ role = 'editor' } = {}) {
  const rawDb = createTestDB()
  return {
    env: { DB: createDBEnv(rawDb) },
    rawDb,
    role,
    headers: { 'x-test-role': role },
  }
}

/**
 * createDBEnv
 * Wraps a better-sqlite3 Database instance and exposes a tiny API compatible
 * with the project's DB helper usage in handlers: DB.prepare(query).bind(...).first()/all()
 */
export function createDBEnv(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql)
      const wrapper = {
        // Support direct calls without bind: .prepare(...).all()
        first() {
          try {
            return stmt.get()
          } catch (err) {
            throw err
          }
        },
        all() {
          try {
            const rows = stmt.all()
            return { results: rows }
          } catch (err) {
            throw err
          }
        },
        run() {
          return stmt.run()
        },
        // Support bound form: .bind(...).first()/all()/run()
        bind(...params) {
          const bound = params
          return {
            first() {
              try {
                return stmt.get(...bound)
              } catch (err) {
                throw err
              }
            },
            all() {
              try {
                const rows = stmt.all(...bound)
                return { results: rows }
              } catch (err) {
                throw err
              }
            },
            run() {
              return stmt.run(...bound)
            },
          }
        },
      }

      return wrapper
    },
  }
}
