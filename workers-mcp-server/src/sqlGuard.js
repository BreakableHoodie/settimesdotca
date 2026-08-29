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

/**
 * Tables holding credentials or authentication material. `queryDB` refuses to
 * touch them.
 *
 * WHY: `getActiveSessions` deliberately omits `lucia_sessions.id` — its JSDoc
 * says so — because that column IS the session token. `functions/utils/auth.js`
 * binds the value straight from the session cookie
 * (`DELETE FROM lucia_sessions WHERE id = ?`), so anyone reading it can
 * impersonate a logged-in admin. `SELECT id FROM lucia_sessions` through
 * `queryDB` walked straight around that redaction, turning "read production
 * data" into "take over any live session".
 *
 * The same argument covers password hashes, TOTP secrets and backup codes in
 * `users`, `api_keys.key_hash`, reset and verification tokens, OTP codes and
 * WebAuthn credentials. A redaction one tool enforces and another ignores is
 * not a control.
 *
 * The curated tools remain the supported way in: `getUsers` and
 * `getActiveSessions` return vetted projections of exactly these tables.
 */
export const SENSITIVE_TABLES = Object.freeze([
  "api_keys",
  "band_follows",
  "email_otp_codes",
  "invite_codes",
  "lucia_sessions",
  "mfa_challenges",
  "password_reset_tokens",
  "sessions",
  "trusted_devices",
  "users",
  "webauthn_credentials",
]);

/** Message thrown when a statement names a credential-bearing table. */
export const SENSITIVE_TABLE_ERROR =
  "Query touches a table holding credentials or auth material. Use getUsers or " +
  "getActiveSessions, which return vetted projections";

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

  // Exactly ONE trailing semicolon is idiomatic and harmless; strip it before
  // the interior-semicolon test so `SELECT 1;` is not read as two statements.
  // `;;` is deliberately NOT accepted: after stripping one, an interior `;`
  // remains and the check below rejects it. A repeated delimiter is a trailing
  // empty statement, and a guard should fail closed on input it did not expect.
  const statement = sql.trim().replace(/;\s*$/, "").trim();

  // `\s` after the keyword, so `selectfoo` cannot pass as `select`. A bare
  // `SELECT` with no argument is not a valid query anyway.
  if (!/^select\s/i.test(statement)) {
    throw new Error(READ_ONLY_ERROR);
  }

  // The load-bearing line: no interior `;`, so no second statement.
  if (statement.includes(";")) {
    throw new Error(READ_ONLY_ERROR);
  }

  // Word-boundary match, so `users` is refused but `band_users_view` would not
  // be caught by accident and `performances` is unaffected. It matches the name
  // ANYWHERE in the statement — subquery, join or CTE — because a table cannot
  // be read without being named. It over-blocks a string literal that happens
  // to contain one of these words; that is the intended direction to err.
  const named = SENSITIVE_TABLES.filter((table) =>
    new RegExp(`\\b${table}\\b`, "i").test(statement),
  );
  if (named.length > 0) {
    throw new Error(`${SENSITIVE_TABLE_ERROR} (matched: ${named.join(", ")})`);
  }

  return statement;
}
