// The read-only guard for the MCP `queryDB` tool.
//
// The bug being fixed was NOT hypothetical. Against the live Worker, with
// read-only payloads:
//
//   "SELECT 1 AS first; SELECT 2 AS second"  -> [{"second":2}]
//   "SELECT 1; SELECT * FROM __nope__"       -> D1_ERROR: no such table
//
// The second proves execution reached statement two, so the old prefix check
// (`sql.trim().toLowerCase().startsWith("select")`) let any DML or DDL run
// against production behind a leading `SELECT 1;`.
//
// These tests exist to keep the multi-statement door shut. The bypass cases
// below are the point of the file; the acceptance cases only stop the fix
// from being "reject everything", which would also pass a naive suite.
import { describe, expect, it } from "vitest";
import { assertReadOnlySelect, READ_ONLY_ERROR } from "../src/sqlGuard.js";

describe("assertReadOnlySelect", () => {
  describe("rejects the bypass that was live in production", () => {
    it.each([
      ["SELECT 1; DELETE FROM users", "DML riding along behind a SELECT"],
      ["SELECT 1; DROP TABLE users", "DDL riding along"],
      ["SELECT 1; UPDATE users SET role = 'admin'", "privilege escalation via UPDATE"],
      ["SELECT 1; INSERT INTO users (email) VALUES ('x')", "INSERT"],
      ["  select 1 ;  delete from users  ", "whitespace and lowercase do not help"],
      ["SELECT 1;SELECT 2", "no space around the semicolon"],
      ["SELECT 1; PRAGMA writable_schema = 1", "PRAGMA as the second statement"],
      ["SELECT 1; ATTACH DATABASE 'x' AS y", "ATTACH"],
      ["SELECT 1; VACUUM", "a verb no keyword denylist would have listed"],
    ])("%s — %s", (sql) => {
      expect(() => assertReadOnlySelect(sql)).toThrow(READ_ONLY_ERROR);
    });
  });

  describe("rejects anything that is not a SELECT", () => {
    it.each([
      ["DELETE FROM users"],
      ["UPDATE users SET role = 'admin'"],
      ["DROP TABLE users"],
      ["PRAGMA table_info(users)"],
      ["WITH x AS (SELECT 1) SELECT * FROM x"], // read-only, but deliberately out of scope
      ["selectfoo bar"], // the \s after the keyword is what catches this
      ["/* comment */ SELECT 1"],
      [""],
      ["   "],
    ])("%s", (sql) => {
      expect(() => assertReadOnlySelect(sql)).toThrow(READ_ONLY_ERROR);
    });

    it.each([[null], [undefined], [42], [{}], [["SELECT 1"]]])("non-string %s", (sql) => {
      expect(() => assertReadOnlySelect(sql)).toThrow(READ_ONLY_ERROR);
    });
  });

  describe("still accepts real single-statement reads", () => {
    it.each([
      ["SELECT 1"],
      ["SELECT * FROM users"],
      ["select id, email from users where role = 'admin' order by created_at desc limit 10"],
      ["SELECT COUNT(*) FROM performances WHERE event_id = 37"],
      ["SELECT name FROM sqlite_master WHERE type = 'table'"],
    ])("%s", (sql) => {
      expect(() => assertReadOnlySelect(sql)).not.toThrow();
    });

    it("strips a single trailing semicolon rather than rejecting it", () => {
      expect(assertReadOnlySelect("SELECT 1;")).toBe("SELECT 1");
      expect(assertReadOnlySelect("  SELECT 1 ;  ")).toBe("SELECT 1");
    });

    it("rejects a repeated delimiter rather than stripping it", () => {
      // `;;` is a trailing EMPTY statement. Stripping it would be harmless in
      // practice, but a guard that quietly normalises unexpected input is how
      // the original prefix check got its confidence. Fail closed.
      expect(() => assertReadOnlySelect("SELECT 1;;")).toThrow(READ_ONLY_ERROR);
    });

    it("returns the statement it validated, so the caller cannot prepare the raw input", () => {
      // If queryDB prepared `sql` instead of the return value, a trailing
      // semicolon would reach D1 and this guard's stripping would be pointless.
      expect(assertReadOnlySelect("SELECT 42;")).toBe("SELECT 42");
    });
  });

  it("fails closed on a semicolon inside a comment or literal", () => {
    // Both are read-only and legal SQL. Distinguishing them needs a tokenizer;
    // rejecting a rare valid query is the cheaper error than parsing wrong.
    expect(() => assertReadOnlySelect("SELECT 1 -- ; not a statement")).toThrow(READ_ONLY_ERROR);
    expect(() => assertReadOnlySelect("SELECT ';'")).toThrow(READ_ONLY_ERROR);
  });
});
