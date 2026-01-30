import Database from "better-sqlite3";

/**
 * createTestDB
 * Creates an in-memory SQLite database with minimal schema useful for event tests.
 * This is intentionally small and deterministic so tests are fast and isolated.
 */
export function createTestDB() {
  const db = new Database(":memory:");

  // Enable foreign key constraints to match production expectations
  db.pragma("foreign_keys = ON");

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
      description TEXT,
      city TEXT,
      ticket_url TEXT,
      venue_info TEXT,
      social_links TEXT,
      theme_colors TEXT,
      archived_at TEXT,
      created_by_user_id INTEGER REFERENCES users(id),
      updated_by_user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      city TEXT,
      address TEXT
    );

    CREATE TABLE band_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_normalized TEXT UNIQUE NOT NULL,
      genre TEXT,
      origin TEXT,
      description TEXT,
      photo_url TEXT,
      social_links TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE performances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
      band_profile_id INTEGER REFERENCES band_profiles(id) ON DELETE CASCADE,
      start_time TEXT,
      end_time TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Insert fixture users
  const insertUser = db.prepare(
    "INSERT INTO users (email, role) VALUES (?, ?)"
  );
  insertUser.run("admin@test", "admin");
  insertUser.run("editor@test", "editor");
  insertUser.run("viewer@test", "viewer");

  return db;
}

export const mockUsers = {
  admin: { id: 1, email: "admin@test", role: "admin" },
  editor: { id: 2, email: "editor@test", role: "editor" },
  viewer: { id: 3, email: "viewer@test", role: "viewer" },
};

export function insertEvent(
  db,
  {
    name = "Test Event",
    slug = "test-event",
    date = "2025-12-15",
    status = "draft",
    created_by = 1,
  } = {}
) {
  const stmt = db.prepare(
    "INSERT INTO events (name, slug, date, status, created_by_user_id) VALUES (?, ?, ?, ?, ?)"
  );
  const info = stmt.run(name, slug, date, status, created_by);
  return db
    .prepare("SELECT * FROM events WHERE id = ?")
    .get(info.lastInsertRowid);
}

export function insertBand(db, { name = "Test Band", event_id = null, venue_id = null, start_time = "20:00", end_time = "21:00" } = {}) {
  const nameNormalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const existingProfile = db.prepare("SELECT id FROM band_profiles WHERE name_normalized = ?").get(nameNormalized);
  const profileId = existingProfile
    ? existingProfile.id
    : db.prepare("INSERT INTO band_profiles (name, name_normalized) VALUES (?, ?)").run(name, nameNormalized).lastInsertRowid;

  const info = db.prepare(
    "INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time) VALUES (?, ?, ?, ?, ?)"
  ).run(event_id, venue_id, profileId, start_time, end_time);

  return db
    .prepare("SELECT * FROM performances WHERE id = ?")
    .get(info.lastInsertRowid);
}

export function insertVenue(
  db,
  { name = "Test Venue", city = "Portland", address = null } = {}
) {
  const stmt = db.prepare(
    "INSERT INTO venues (name, city, address) VALUES (?, ?, ?)"
  );
  const info = stmt.run(name, city, address);
  return db
    .prepare("SELECT * FROM venues WHERE id = ?")
    .get(info.lastInsertRowid);
}

/**
 * createTestEnv
 * Helper to build a test environment object with DB and a role header value.
 * Usage: const { env, headers } = createTestEnv({ role: 'admin' })
 */
export function createTestEnv({ role = "editor" } = {}) {
  const rawDb = createTestDB();
  return {
    env: { DB: createDBEnv(rawDb) },
    rawDb,
    role,
    headers: { "x-test-role": role },
  };
}

/**
 * createDBEnv
 * Wraps a better-sqlite3 Database instance and exposes a tiny API compatible
 * with the project's DB helper usage in handlers: DB.prepare(query).bind(...).first()/all()
 */
export function createDBEnv(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const wrapper = {
        // Support direct calls without bind: .prepare(...).all()
        first() {
          try {
            return stmt.get();
          } catch (err) {
            throw err;
          }
        },
        all() {
          try {
            const rows = stmt.all();
            return { results: rows };
          } catch (err) {
            throw err;
          }
        },
        run() {
          return stmt.run();
        },
        // Support bound form: .bind(...).first()/all()/run()
        bind(...params) {
          const bound = params;
          return {
            first() {
              try {
                return stmt.get(...bound);
              } catch (err) {
                throw err;
              }
            },
            all() {
              try {
                const rows = stmt.all(...bound);
                return { results: rows };
              } catch (err) {
                throw err;
              }
            },
            run() {
              return stmt.run(...bound);
            },
          };
        },
      };

      return wrapper;
    },
  };
}
