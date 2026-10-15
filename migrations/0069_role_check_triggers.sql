-- Migration 0069: refuse any role outside viewer/editor/admin at the database
-- (#1287).
--
-- users.role and invite_codes.role have no CHECK constraint, unlike
-- api_keys.role. checkPermission once read the role with a bare
-- roleHierarchy[role], so a stored role of "constructor" or "__proto__"
-- passed every check (#1258 fixed the lookup). Every write path validates the
-- role, so that needed a bad direct write, but nothing in the schema refused
-- one. invite_codes.role is in scope because signup copies it into users.role.
--
-- Triggers, not a table rebuild. Adding a CHECK means recreating the table,
-- and D1 ignores PRAGMA foreign_keys = OFF: dropping users would run an
-- implicit DELETE that cascades to every session and fails on api_keys'
-- ON DELETE RESTRICT. A BEFORE trigger refuses the same writes with no
-- rebuild. Production held only valid roles when this was written
-- (users: admin; invite_codes: editor, viewer).

CREATE TRIGGER IF NOT EXISTS users_role_valid_insert
BEFORE INSERT ON users
WHEN NEW.role NOT IN ('viewer', 'editor', 'admin')
BEGIN
  SELECT RAISE(ABORT, 'users.role must be viewer, editor or admin');
END;

CREATE TRIGGER IF NOT EXISTS users_role_valid_update
BEFORE UPDATE OF role ON users
WHEN NEW.role NOT IN ('viewer', 'editor', 'admin')
BEGIN
  SELECT RAISE(ABORT, 'users.role must be viewer, editor or admin');
END;

CREATE TRIGGER IF NOT EXISTS invite_codes_role_valid_insert
BEFORE INSERT ON invite_codes
WHEN NEW.role NOT IN ('viewer', 'editor', 'admin')
BEGIN
  SELECT RAISE(ABORT, 'invite_codes.role must be viewer, editor or admin');
END;

CREATE TRIGGER IF NOT EXISTS invite_codes_role_valid_update
BEFORE UPDATE OF role ON invite_codes
WHEN NEW.role NOT IN ('viewer', 'editor', 'admin')
BEGIN
  SELECT RAISE(ABORT, 'invite_codes.role must be viewer, editor or admin');
END;
