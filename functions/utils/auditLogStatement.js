// Audit-log statement builders.
//
// Both return a prepared statement rather than executing it, so callers can put the
// audit row in the SAME `DB.batch()` as the change it records. That atomicity is the
// point: a split write leaves either a change with no record or a record with no
// change, which this repo fixed across seven sites.

// api_key_id is NULL for a cookie-authenticated action and carries the key id for a
// bearer-authenticated one -- "which credential did this" is the first question in an
// incident. Both builders below render from this one list; a hand-written INSERT
// elsewhere is a third copy waiting to drift.
const AUDIT_LOG_COLUMNS = "user_id, action, resource_type, resource_id, details, ip_address, api_key_id";

function normalize(resourceType, resourceId, details, ipAddress, apiKeyId) {
  return [
    resourceType || null,
    resourceId || null,
    details ? JSON.stringify(details) : null,
    ipAddress || "unknown",
    apiKeyId ?? null,
  ];
}

export function auditLogStatement(env, userId, action, resourceType, resourceId, details, ipAddress, apiKeyId) {
  const [type, id, detailsJson, ip, keyId] = normalize(resourceType, resourceId, details, ipAddress, apiKeyId);
  return env.DB.prepare(
    `
    INSERT INTO audit_log (${AUDIT_LOG_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).bind(userId, action, type, id, detailsJson, ip, keyId);
}

// Bare SQL identifier. Table and column names cannot be bound as parameters, so they
// are interpolated -- and therefore must be proven to be identifiers first. Callers
// pass literals today; this is what keeps that true if one ever passes a variable.
// Note the typeof: RegExp.prototype.test coerces its argument with String(), so a
// bare `IDENTIFIER.test(undefined)` tests the string "undefined" -- and passes,
// building `FROM undefined WHERE ...`. Same for null. The type check is the guard.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const isIdentifier = (value) => typeof value === "string" && IDENTIFIER.test(value);

/**
 * Audit a row by looking its id up in `table` rather than passing a literal, so the
 * record can be written in the SAME batch as the change it describes. Two cases need
 * this, and they are the same shape:
 *
 * - **Creation**, where the id does not exist until the INSERT ahead of it has run:
 *   `{ table: "api_keys", where: { key_hash: hash } }`
 * - **A conditional change**, where the audit row must appear only if the change
 *   actually applied. Give the audit row the SAME predicate as the UPDATE and put it
 *   FIRST in the batch, so a request that loses a race writes neither:
 *   `{ table: "api_keys", where: { id, revoked_at: null } }`
 *
 * Deliberately takes identifiers and bound values rather than a SQL string: a
 * `sql`-shaped parameter on a shared helper is the signature a future caller reaches
 * for with a table name off a request body. A `null` value renders as `IS NULL`.
 *
 * `where` must select at most one row, or the lookup can resolve to a different one.
 * Note that `INSERT ... SELECT` over zero rows inserts nothing and does NOT error --
 * that silence is the point in the conditional case and a hazard in the creation
 * case, where you must pass a value the preceding INSERT just wrote.
 */
export function auditLogStatementForInsertedRow(
  env,
  userId,
  action,
  resourceType,
  { table, where },
  details,
  ipAddress,
  apiKeyId,
) {
  const columns = Object.keys(where || {});
  if (!isIdentifier(table) || columns.length === 0 || !columns.every(isIdentifier)) {
    throw new Error("auditLogStatementForInsertedRow: table and where keys must be bare SQL identifiers");
  }
  const predicate = columns.map((c) => (where[c] === null ? `${c} IS NULL` : `${c} = ?`)).join(" AND ");
  const values = columns.filter((c) => where[c] !== null).map((c) => where[c]);
  const [type, , detailsJson, ip, keyId] = normalize(resourceType, null, details, ipAddress, apiKeyId);
  return env.DB.prepare(
    `
    INSERT INTO audit_log (${AUDIT_LOG_COLUMNS})
    SELECT ?, ?, ?, id, ?, ?, ? FROM ${table} WHERE ${predicate}
  `,
  ).bind(userId, action, type, detailsJson, ip, keyId, ...values);
}
