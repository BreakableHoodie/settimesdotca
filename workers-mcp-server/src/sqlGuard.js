/**
 * Read-only enforcement for the ad-hoc `queryDB` tool.
 *
 * THE BUG THIS REPLACES: the guard was
 *
 *   if (!sql.trim().toLowerCase().startsWith("select")) throw ...
 *
 * a prefix test — while D1's `.prepare().all()` executes EVERY statement in the
 * string. Both halves were verified against the live Worker with read-only
 * payloads:
 *
 *   "SELECT 1 AS first; SELECT 2 AS second"      -> [{"second":2}]
 *   "SELECT 1; SELECT * FROM __nope__"           -> D1_ERROR: no such table
 *
 * The second is conclusive: execution reached statement two. So anything after
 * `SELECT 1;` ran — including DML and DDL — against the production database.
 * The tool advertised read-only and did not enforce it, which mattered because
 * read-only is exactly the bound that should contain a mistake or a
 * compromised caller.
 *
 * THE FIX is to make a second statement unreachable rather than to enumerate
 * forbidden keywords. A denylist of DELETE/DROP/UPDATE/... is the tempting
 * shape and it is the wrong one: it fails open on anything not listed
 * (REPLACE, VACUUM, ATTACH, a future keyword), and keyword matching inside
 * string literals produces false rejections. SQLite requires `;` between
 * statements, so forbidding an interior `;` forbids the whole class.
 *
 * Deliberately strict, and it fails CLOSED:
 *   - `SELECT 1 -- ; not really a statement` is rejected even though the `;`
 *     is inside a comment. Detecting that needs a real tokenizer; refusing a
 *     rare valid query is the cheaper error.
 *   - `WITH ... SELECT` is rejected. It is read-only in SQLite, but allowing
 *     it widens the surface for no current caller, and this module's job is
 *     the narrow one.
 */

/** Message thrown for any rejected statement. Asserted by the tests. */
export const READ_ONLY_ERROR = "Only a single read-only SELECT statement is allowed";

/**
 * Throw unless `sql` is exactly one SELECT statement.
 *
 * @param {string} sql - candidate SQL
 * @returns {string} the statement with any single trailing `;` removed, ready to prepare
 * @throws {Error} READ_ONLY_ERROR if it is not a lone SELECT
 */
export function assertReadOnlySelect(sql) {
  if (typeof sql !== "string") {
    throw new Error(READ_ONLY_ERROR);
  }

  // One trailing semicolon is idiomatic and harmless; strip it before the
  // interior-semicolon test so `SELECT 1;` is not treated as two statements.
  const statement = sql.trim().replace(/;+\s*$/, "").trim();

  // `\s` after the keyword, so `selectfoo` cannot pass as `select`. A bare
  // `SELECT` with no argument is not a valid query anyway.
  if (!/^select\s/i.test(statement)) {
    throw new Error(READ_ONLY_ERROR);
  }

  // The load-bearing line: no interior `;`, so no second statement.
  if (statement.includes(";")) {
    throw new Error(READ_ONLY_ERROR);
  }

  return statement;
}
