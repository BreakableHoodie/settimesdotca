// Audit-log statement builders.
//
// Both return a prepared statement rather than executing it, so callers can put the
// audit row in the SAME `DB.batch()` as the change it records. That atomicity is the
// point: a split write leaves either a change with no record or a record with no
// change, which this repo fixed across seven sites.

const AUDIT_LOG_COLUMNS = "user_id, action, resource_type, resource_id, details, ip_address";

function normalize(resourceType, resourceId, details, ipAddress) {
  return [resourceType || null, resourceId || null, details ? JSON.stringify(details) : null, ipAddress || "unknown"];
}

export function auditLogStatement(env, userId, action, resourceType, resourceId, details, ipAddress) {
  const [type, id, detailsJson, ip] = normalize(resourceType, resourceId, details, ipAddress);
  return env.DB.prepare(
    `
    INSERT INTO audit_log (${AUDIT_LOG_COLUMNS})
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).bind(userId, action, type, id, detailsJson, ip);
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
 * Audit a row whose id does not exist until the INSERT ahead of it in the same batch
 * has run, by resolving `resource_id` with a lookup instead of a literal.
 *
 * Deliberately takes an identifier and a bound value rather than a SQL string: a
 * `sql`-shaped parameter on a shared helper is the signature a future caller reaches
 * for with a table name off a request body.
 *
 * `matchColumn` must be UNIQUE, or the lookup can resolve to a different row. Note
 * that `INSERT ... SELECT` over zero rows inserts nothing and does NOT error, so a
 * value that matches no row silently produces no audit record -- pass the value the
 * preceding INSERT just wrote, never one that might be absent.
 */
export function auditLogStatementForInsertedRow(
  env,
  userId,
  action,
  resourceType,
  { table, matchColumn, matchValue },
  details,
  ipAddress,
) {
  if (!isIdentifier(table) || !isIdentifier(matchColumn)) {
    throw new Error("auditLogStatementForInsertedRow: table and matchColumn must be bare SQL identifiers");
  }
  const [type, , detailsJson, ip] = normalize(resourceType, null, details, ipAddress);
  return env.DB.prepare(
    `
    INSERT INTO audit_log (${AUDIT_LOG_COLUMNS})
    SELECT ?, ?, ?, id, ?, ? FROM ${table} WHERE ${matchColumn} = ?
  `,
  ).bind(userId, action, type, detailsJson, ip, matchValue);
}
