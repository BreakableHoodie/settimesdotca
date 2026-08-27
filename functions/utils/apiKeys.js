// API key utilities use a different hash strategy from password utilities.
// PBKDF2's 600,000 iterations cost about 105 ms per verification here, while
// a plain SHA-256 digest costs about 0.161 ms. API keys are verified on every
// request, so paying that cost forever would consume Workers CPU for no
// security benefit: this key contains 256 bits from getRandomValues and cannot
// be brute-forced at any practical hash speed. PBKDF2 remains mandatory for
// human-chosen passwords; fast hashing is appropriate for this high-entropy
// secret.
//
// The digest is deterministic and UNSALTED by design: verification looks a key
// up with WHERE key_hash = ?, so a per-row salt would make that lookup
// impossible. That is safe here for the same reason the fast hash is -- there
// is no dictionary to precompute against a 256-bit random space.

import { fromSqliteDateTime, toSqliteDateTime } from "./authAttempts.js";

export const API_KEY_PREFIX = "st_";
const KEY_BYTES = 32;
export const DISPLAY_PREFIX_LENGTH = 8;
// #744 calls for a short default and forced rotation. A bearer credential
// bypasses CSRF, MFA and the cookie boundary, so a default set here is what
// every endpoint built on this inherits.
const DEFAULT_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
// The ceiling is a policy, not an inherited default -- 365 was simply the old
// default and picking it as the maximum decided nothing. #744 asks for forced
// rotation, and this credential bypasses CSRF, MFA and the cookie boundary, so
// the escape hatch is half a year rather than a full one. Anything longer
// should be a conscious product decision made when a real consumer needs it,
// not a limit nobody chose.
const MAX_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

function encodeBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function digestApiKey(plaintext) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plaintext));
  return encodeBase64Url(new Uint8Array(digest));
}

export async function generateApiKey(expiresAt = new Date(Date.now() + DEFAULT_LIFETIME_MS)) {
  // Rejected rather than clamped: silently shortening a lifetime the caller
  // asked for produces a key that stops working at a time nobody recorded.
  // toSqliteDateTime also slices at 19 chars, so an out-of-range Date would
  // store a truncated value that verifies as valid forever -- this closes
  // that path too.
  const requested = expiresAt instanceof Date ? expiresAt.getTime() : Number.NaN;
  if (!Number.isFinite(requested)) {
    throw new Error("expiresAt must be a valid Date");
  }
  if (requested <= Date.now()) {
    throw new Error("expiresAt must be in the future");
  }
  if (requested - Date.now() > MAX_LIFETIME_MS) {
    throw new Error("expiresAt exceeds the maximum key lifetime");
  }

  // Validate what gets STORED, not what was handed in. toSqliteDateTime drops
  // sub-second precision, so an expiry a few hundred milliseconds out passes
  // the future check above and then serialises to the current second -- a key
  // born already dead. Round-tripping through the stored form is the only
  // check that sees what verification will later see.
  const sqliteExpiresAt = toSqliteDateTime(expiresAt);
  const storedExpiresAt = fromSqliteDateTime(sqliteExpiresAt);
  if (!storedExpiresAt || storedExpiresAt.getTime() <= Date.now()) {
    throw new Error("expiresAt must still be in the future once stored");
  }

  const randomBytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const plaintext = `${API_KEY_PREFIX}${encodeBase64Url(randomBytes)}`;

  return {
    plaintext,
    keyPrefix: plaintext.slice(0, DISPLAY_PREFIX_LENGTH),
    keyHash: await digestApiKey(plaintext),
    expiresAt: sqliteExpiresAt,
  };
}

export async function hashApiKey(plaintext) {
  return digestApiKey(plaintext);
}

export async function verifyApiKey(DB, presentedKey) {
  if (typeof presentedKey !== "string" || !presentedKey.startsWith(API_KEY_PREFIX)) {
    return undefined;
  }

  const presentedHash = await digestApiKey(presentedKey);
  // Columns are listed rather than SELECT *, and key_hash is deliberately NOT
  // among them: this row is what the endpoints built on top of this will hand
  // back, and a credential hash reaching a response body is how hashes leak.
  // The hash equality check lives in the WHERE clause -- an exact comparison
  // performed by SQLite -- so re-comparing the column in JS would prove nothing
  // that the lookup has not already established.
  //
  // The INNER JOIN on users is a backstop, not the primary control: every
  // deactivation path already revokes the account's keys explicitly, so this only
  // matters if a future path forgets to. It is here because forgetting is exactly
  // what happened -- users/[id]/toggle-status.js deactivated accounts and killed
  // their sessions for months while leaving their keys live, because it is a
  // separate endpoint from the PATCH one. A key is only ever as revoked as the
  // least careful path that can deactivate its owner; this makes that irrelevant.
  // The creator's display fields ARE projected, aliased creator_*: the middleware needs
  // them to populate context.data.user, and this JOIN is already running. A second
  // SELECT for the same row was a fourth D1 round-trip per key-authenticated request
  // buying nothing. Still no credential column crosses the boundary -- key_hash is
  // absent above and users' secrets are never named here.
  const row = await DB.prepare(
    `SELECT k.id, k.name, k.key_prefix, k.role, k.created_by, k.created_at,
            k.expires_at, k.last_used_at, k.revoked_at,
            u.email AS creator_email, u.name AS creator_name,
            u.first_name AS creator_first_name, u.last_name AS creator_last_name
     FROM api_keys k
     JOIN users u ON u.id = k.created_by
     WHERE k.key_hash = ? AND u.is_active = 1`,
  )
    .bind(presentedHash)
    .first();
  if (!row) {
    return undefined;
  }

  const expiresAt = fromSqliteDateTime(row.expires_at);
  if (row.revoked_at !== null || !expiresAt || expiresAt.getTime() <= Date.now()) {
    return undefined;
  }

  return row;
}
