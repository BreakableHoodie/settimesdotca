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
      first_name TEXT,
      last_name TEXT,
      activation_token TEXT,
      activation_token_expires_at TEXT,
      activated_at TEXT,
      totp_secret TEXT,
      totp_enabled INTEGER DEFAULT 0,
      webauthn_enabled INTEGER DEFAULT 0,
      email_otp_enabled INTEGER DEFAULT 0,
      backup_codes TEXT,
      require_2fa INTEGER DEFAULT 1,
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
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_token TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      remember_me INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_activity_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE mfa_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    CREATE TABLE band_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_normalized TEXT UNIQUE NOT NULL,
      genre TEXT,
      origin TEXT,
      origin_city TEXT,
      origin_region TEXT,
      contact_email TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
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

    CREATE TABLE schedule_builds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      performance_id INTEGER,
      band_id INTEGER,
      user_session TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE venues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      region TEXT,
      postal_code TEXT,
      country TEXT,
      phone TEXT,
      contact_email TEXT,
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

    CREATE TABLE invite_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'editor',
      created_by_user_id INTEGER,
      used_by_user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      used_at TEXT,
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE auth_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT,
      ip_address TEXT,
      user_agent TEXT,
      attempt_type TEXT NOT NULL,
      success INTEGER NOT NULL,
      failure_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  const insertUser = db.prepare(
    "INSERT INTO users (email, role, activated_at) VALUES (?, ?, datetime('now'))"
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

export function insertBand(db, {
  name = 'Test Band',
  event_id = null,
  venue_id = null,
  start_time = '18:00',
  end_time = '19:00',
  url = null,
  genre = null,
  origin = null,
  description = null,
  photo_url = null,
  social_links = null
} = {}) {
  // Insert into band_profiles + performances (v2 schema)
  const nameNormalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  let profileId;
  const resolvedSocialLinks = social_links ?? (url ? JSON.stringify({ website: url }) : null);
  const existingProfile = db.prepare('SELECT * FROM band_profiles WHERE name_normalized = ?').get(nameNormalized);
  if (existingProfile) {
    profileId = existingProfile.id;
    const updates = [];
    const values = [];
    if (genre !== null) { updates.push('genre = ?'); values.push(genre); }
    if (origin !== null) { updates.push('origin = ?'); values.push(origin); }
    if (description !== null) { updates.push('description = ?'); values.push(description); }
    if (photo_url !== null) { updates.push('photo_url = ?'); values.push(photo_url); }
    if (resolvedSocialLinks !== null) { updates.push('social_links = ?'); values.push(resolvedSocialLinks); }
    if (updates.length > 0) {
      db.prepare(`UPDATE band_profiles SET ${updates.join(', ')} WHERE id = ?`).run(...values, profileId);
    }
  } else {
    const profileInfo = db.prepare(
      'INSERT INTO band_profiles (name, name_normalized, genre, origin, description, photo_url, social_links) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(name, nameNormalized, genre, origin, description, photo_url, resolvedSocialLinks);
    profileId = profileInfo.lastInsertRowid;
  }

  const perfInfo = db.prepare(
    'INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
  ).run(event_id, venue_id, profileId, start_time, end_time);

  return db.prepare(
    `
    SELECT p.*, bp.name, bp.id as band_profile_id
    FROM performances p
    JOIN band_profiles bp ON p.band_profile_id = bp.id
    WHERE p.id = ?
  `
  ).get(perfInfo.lastInsertRowid);
}

export function insertVenue(
  db,
  {
    name = 'Test Venue',
    city = 'Portland',
    region = null,
    address_line1 = null,
    address_line2 = null,
    postal_code = null,
    country = null,
    phone = null,
    contact_email = null,
    address = null,
  } = {}
) {
  const stmt = db.prepare(
    `INSERT INTO venues (
      name,
      address_line1,
      address_line2,
      city,
      region,
      postal_code,
      country,
      phone,
      contact_email,
      address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const info = stmt.run(
    name,
    address_line1,
    address_line2,
    city,
    region,
    postal_code,
    country,
    phone,
    contact_email,
    address,
  )
  return db.prepare('SELECT * FROM venues WHERE id = ?').get(info.lastInsertRowid)
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
    // Cloudflare D1 batch() method
    async batch(statements) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
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
    "INSERT INTO sessions (session_token, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)"
  ).run(sessionId, userId, expiresAt, "127.0.0.1", "test-agent");

  return {
    env: { DB: createDBEnv(rawDb), ALLOW_HEADER_AUTH: "true" },
    rawDb,
    role,
    headers: {
      "x-test-role": role,
      "Authorization": `Bearer ${sessionId}`
    },
  };
}
