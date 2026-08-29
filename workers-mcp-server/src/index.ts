import { WorkerEntrypoint } from "cloudflare:workers";
import { ProxyToSelf } from "workers-mcp";
import { assertReadOnlySelect } from "./sqlGuard.js";

/**
 * MCP tool surface over the settimes.ca production D1 database.
 *
 * Reconstructed from the deployed bundle (version ed8c71c5, uploaded
 * 2026-04-29) because no source existed in any repository — see the README.
 * Behaviour is preserved verbatim except for `queryDB`'s guard, which did not
 * enforce the read-only contract it advertised.
 *
 * Every tool here reads production data, including sessions and the auth
 * audit log. Treat the JSDoc as the tool contract: `workers-mcp` publishes
 * these comments as the MCP tool descriptions.
 */
export default class SetTimesTools extends WorkerEntrypoint<Env> {
  /**
   * Run a read-only SQL query against the settimesdotca D1 database.
   * Only a single SELECT statement is permitted. Use for ad-hoc data inspection.
   * @param {string} sql - SQL SELECT statement to execute
   * @return {string} JSON array of result rows
   */
  async queryDB(sql: string) {
    // Enforcement lives in sqlGuard.js, which explains why a prefix test was
    // not enough: D1 executes every statement in the string.
    const statement = assertReadOnlySelect(sql);
    const result = await this.env.DB.prepare(statement).all();
    return JSON.stringify(result.results);
  }

  /**
   * Get recent auth audit log entries.
   * @param {number} limit - Max rows to return (default 20, max 100)
   * @return {string} JSON array of auth_audit rows
   */
  async getRecentAuditLog(limit = 20) {
    const n = Math.min(Math.max(1, limit), 100);
    const result = await this.env.DB.prepare(
      "SELECT * FROM auth_audit ORDER BY timestamp DESC LIMIT ?",
    )
      .bind(n)
      .all();
    return JSON.stringify(result.results);
  }

  /**
   * Get active sessions. Omits raw session IDs.
   * @param {string} userId - Optional user ID to filter by
   * @return {string} JSON array of session records without raw lucia_sessions.id values
   */
  async getActiveSessions(userId?: string) {
    if (userId) {
      const scoped = await this.env.DB.prepare(
        "SELECT user_id, ip_address, user_agent, created_at, last_activity_at, expires_at FROM lucia_sessions WHERE user_id = ? ORDER BY last_activity_at DESC",
      )
        .bind(userId)
        .all();
      return JSON.stringify(scoped.results);
    }
    const result = await this.env.DB.prepare(
      "SELECT user_id, ip_address, user_agent, created_at, last_activity_at, expires_at FROM lucia_sessions ORDER BY last_activity_at DESC LIMIT 50",
    ).all();
    return JSON.stringify(result.results);
  }

  /**
   * Get recent authentication attempts.
   * @param {number} limit - Max rows to return (default 20, max 100)
   * @return {string} JSON array of auth_attempts rows
   */
  async getRecentAuthAttempts(limit = 20) {
    const n = Math.min(Math.max(1, limit), 100);
    const result = await this.env.DB.prepare(
      "SELECT * FROM auth_attempts ORDER BY created_at DESC LIMIT ?",
    )
      .bind(n)
      .all();
    return JSON.stringify(result.results);
  }

  /**
   * List all admin users. Never returns password hashes, TOTP secrets, or backup codes.
   * @return {string} JSON array of user records
   */
  async getUsers() {
    const result = await this.env.DB.prepare(
      "SELECT id, email, role, is_active, totp_enabled, created_at, updated_at FROM users ORDER BY created_at DESC",
    ).all();
    return JSON.stringify(result.results);
  }

  /**
   * Get current rate limit state for all keys.
   * @return {string} JSON array of rate_limits rows
   */
  async getRateLimits() {
    const result = await this.env.DB.prepare(
      "SELECT * FROM rate_limits ORDER BY updated_at DESC",
    ).all();
    return JSON.stringify(result.results);
  }

  /**
   * Get schema info for a table (column names, types, nullability).
   * @param {string} table - Table name to inspect
   * @return {string} JSON array of PRAGMA table_info rows
   */
  async getTableSchema(table: string) {
    // PRAGMA takes no bound parameters, so the name is interpolated — the
    // allowlist is what makes that safe. It admits no quote, space or
    // semicolon, so no second statement and no string break-out.
    if (!/^[A-Za-z0-9_]+$/.test(table)) {
      throw new Error("Invalid table name");
    }
    const result = await this.env.DB.prepare(`PRAGMA table_info(${table})`).all();
    return JSON.stringify(result.results);
  }

  async fetch(request: Request) {
    return new ProxyToSelf(this).fetch(request);
  }
}
