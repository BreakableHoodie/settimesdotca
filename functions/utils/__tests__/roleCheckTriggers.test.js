import { describe, expect, it } from "vitest";
import { createTestDB } from "../../api/test-utils.js";

// #1287: users.role and invite_codes.role have no CHECK constraint, so
// migration 0069 refuses any other value with BEFORE triggers. A role of
// "constructor" or "__proto__" once passed every checkPermission call (#1258);
// the lookup is fixed, and this is the second layer.
const BAD_ROLES = ["constructor", "__proto__", "toString", "superadmin", "", "Admin"];

describe("role values are refused at the database (#1287)", () => {
  it.each(BAD_ROLES)("users INSERT with role %j fails at execution", (role) => {
    const db = createTestDB();
    expect(() =>
      db
        .prepare("INSERT INTO users (email, role, password_hash) VALUES (?, ?, 'test-placeholder')")
        .run(`bad-${role.length}@settimes.ca`, role),
    ).toThrow(/users\.role must be viewer, editor or admin/);
  });

  it.each(BAD_ROLES)("users UPDATE to role %j fails and leaves the row unchanged", (role) => {
    const db = createTestDB();
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (email, role, password_hash) VALUES ('ok@settimes.ca', 'viewer', 'test-placeholder')")
      .run();
    expect(() => db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, lastInsertRowid)).toThrow(
      /users\.role must be viewer, editor or admin/,
    );
    expect(db.prepare("SELECT role FROM users WHERE id = ?").get(lastInsertRowid).role).toBe("viewer");
  });

  it.each(BAD_ROLES)("invite_codes INSERT with role %j fails at execution", (role) => {
    const db = createTestDB();
    expect(() =>
      db
        .prepare("INSERT INTO invite_codes (code, role, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')")
        .run(`code-${role.length}`, role),
    ).toThrow(/invite_codes\.role must be viewer, editor or admin/);
  });

  it.each(BAD_ROLES)("invite_codes UPDATE to role %j fails and leaves the row unchanged", (role) => {
    const db = createTestDB();
    const { lastInsertRowid } = db
      .prepare("INSERT INTO invite_codes (code, role, expires_at) VALUES ('code-ok', 'editor', '2099-01-01 00:00:00')")
      .run();
    expect(() => db.prepare("UPDATE invite_codes SET role = ? WHERE id = ?").run(role, lastInsertRowid)).toThrow(
      /invite_codes\.role must be viewer, editor or admin/,
    );
    expect(db.prepare("SELECT role FROM invite_codes WHERE id = ?").get(lastInsertRowid).role).toBe("editor");
  });

  it.each(["viewer", "editor", "admin"])("accepts %j in both tables, and updates that leave role alone", (role) => {
    const db = createTestDB();
    const user = db
      .prepare("INSERT INTO users (email, role, password_hash) VALUES (?, ?, 'test-placeholder')")
      .run(`${role}@settimes.ca`, role);
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(`${role}2@settimes.ca`, user.lastInsertRowid);
    db.prepare("INSERT INTO invite_codes (code, role, expires_at) VALUES (?, ?, '2099-01-01 00:00:00')").run(
      `code-${role}`,
      role,
    );
    expect(db.prepare("SELECT role FROM users WHERE id = ?").get(user.lastInsertRowid).role).toBe(role);
  });
});
