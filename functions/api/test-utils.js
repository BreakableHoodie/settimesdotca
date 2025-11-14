import Database from "better-sqlite3";

export function createTestDB() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      role TEXT NOT NULL,
      name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_login TEXT,
      deactivated_at TEXT,
      deactivated_by INTEGER,
      deleted_at TEXT,
      deleted_by INTEGER
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      remember_me INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id INTEGER,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
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

    CREATE TABLE email_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      city TEXT NOT NULL,
      genre TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'weekly',
      verified BOOLEAN NOT NULL DEFAULT 0,
      verification_token TEXT UNIQUE,
      unsubscribe_token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_email_sent TEXT,
      UNIQUE(email, city, genre)
    );

    CREATE TABLE password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_by INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      used_at TEXT,
      ip_address TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE auth_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      success INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE subscription_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      ip_address TEXT,
      FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id) ON DELETE CASCADE
    );

    CREATE TABLE subscription_unsubscribes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id INTEGER NOT NULL,
      unsubscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
      reason TEXT,
      FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id) ON DELETE CASCADE
    );
  `);

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

export function insertBand(db, { name = "Test Band", event_id = null } = {}) {
  const stmt = db.prepare("INSERT INTO bands (name, event_id) VALUES (?, ?)");
  const info = stmt.run(name, event_id);
  return db
    .prepare("SELECT * FROM bands WHERE id = ?")
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

export function createDBEnv(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const wrapper = {
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
          const result = stmt.run();
          return {
            success: true,
            meta: {
              last_row_id: result.lastInsertRowid,
              changes: result.changes,
              duration: 0
            }
          };
        },
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
              const result = stmt.run(...bound);
              return {
                success: true,
                meta: {
                  last_row_id: result.lastInsertRowid,
                  changes: result.changes,
                  duration: 0
                }
              };
            },
          };
        },
      };

      return wrapper;
    },
  };
}

export function createTestEnv({ role = "editor" } = {}) {
  const rawDb = createTestDB();

  // Create a valid session for the test user
  const userId = role === "admin" ? 1 : role === "editor" ? 2 : 3;
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  rawDb.prepare(
    "INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).run(sessionId, userId, expiresAt, "127.0.0.1", "test-agent");

  return {
    env: { DB: createDBEnv(rawDb) },
    rawDb,
    role,
    headers: {
      "x-test-role": role,
      "Authorization": `Bearer ${sessionId}`
    },
  };
}
