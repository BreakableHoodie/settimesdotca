import { McpServer } from "@modelcontextprotocol/server";
import { env as workerEnv } from "cloudflare:workers";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import { routeRequest } from "./router.js";
import { assertReadOnlySelect } from "./sqlGuard.js";

/**
 * MCP tool surface over the settimes.ca production D1 database.
 *
 * Every tool here reads production data, including sessions and the auth
 * audit log. Treat the descriptions below as the tool contract.
 */
function createServer() {
  const server = new McpServer({ name: "settimesdotca", version: "1.0.0" });

  server.registerTool(
    "queryDB",
    {
      description:
        "Run a read-only SQL query against the settimesdotca D1 database. Only a single SELECT statement is permitted. Use for ad-hoc data inspection.",
      inputSchema: z.object({ sql: z.string().describe("SQL SELECT statement to execute") }),
    },
    async ({ sql }) => {
      // Enforcement lives in sqlGuard.js, which explains why a prefix test was
      // not enough: D1 executes every statement in the string.
      const statement = assertReadOnlySelect(sql);
      const result = await workerEnv.DB.prepare(statement).all();
      return { content: [{ type: "text", text: JSON.stringify(result.results) }] };
    },
  );

  server.registerTool(
    "getRecentAuditLog",
    {
      description: "Get recent auth audit log entries.",
      inputSchema: z.object({
        limit: z.number().int().optional().describe("Max rows to return (default 20, max 100)"),
      }),
    },
    async ({ limit = 20 }) => {
      const n = Math.min(Math.max(1, limit), 100);
      const result = await workerEnv.DB.prepare("SELECT * FROM auth_audit ORDER BY timestamp DESC LIMIT ?")
        .bind(n)
        .all();
      return { content: [{ type: "text", text: JSON.stringify(result.results) }] };
    },
  );

  server.registerTool(
    "getActiveSessions",
    {
      description: "Get active sessions. Omits raw session IDs.",
      inputSchema: z.object({ userId: z.string().optional().describe("Optional user ID to filter by") }),
    },
    async ({ userId }) => {
      if (userId) {
        const scoped = await workerEnv.DB.prepare(
          "SELECT user_id, ip_address, user_agent, created_at, last_activity_at, expires_at FROM lucia_sessions WHERE user_id = ? ORDER BY last_activity_at DESC",
        )
          .bind(userId)
          .all();
        return { content: [{ type: "text", text: JSON.stringify(scoped.results) }] };
      }
      const result = await workerEnv.DB.prepare(
        "SELECT user_id, ip_address, user_agent, created_at, last_activity_at, expires_at FROM lucia_sessions ORDER BY last_activity_at DESC LIMIT 50",
      ).all();
      return { content: [{ type: "text", text: JSON.stringify(result.results) }] };
    },
  );

  server.registerTool(
    "getRecentAuthAttempts",
    {
      description: "Get recent authentication attempts.",
      inputSchema: z.object({
        limit: z.number().int().optional().describe("Max rows to return (default 20, max 100)"),
      }),
    },
    async ({ limit = 20 }) => {
      const n = Math.min(Math.max(1, limit), 100);
      const result = await workerEnv.DB.prepare("SELECT * FROM auth_attempts ORDER BY created_at DESC LIMIT ?")
        .bind(n)
        .all();
      return { content: [{ type: "text", text: JSON.stringify(result.results) }] };
    },
  );

  server.registerTool(
    "getUsers",
    {
      description: "List all admin users. Never returns password hashes, TOTP secrets, or backup codes.",
    },
    async () => {
      const result = await workerEnv.DB.prepare(
        "SELECT id, email, role, is_active, totp_enabled, created_at, updated_at FROM users ORDER BY created_at DESC",
      ).all();
      return { content: [{ type: "text", text: JSON.stringify(result.results) }] };
    },
  );

  server.registerTool("getRateLimits", { description: "Get current rate limit state for all keys." }, async () => {
    const result = await workerEnv.DB.prepare("SELECT * FROM rate_limits ORDER BY updated_at DESC").all();
    return { content: [{ type: "text", text: JSON.stringify(result.results) }] };
  });

  server.registerTool(
    "getTableSchema",
    {
      description: "Get schema info for a table (column names, types, nullability).",
      inputSchema: z.object({ table: z.string().describe("Table name to inspect") }),
    },
    async ({ table }) => {
      // PRAGMA takes no bound parameters, so the name is interpolated — the
      // allowlist is what makes that safe. It admits no quote, space or
      // semicolon, so no second statement and no string break-out.
      if (!/^[A-Za-z0-9_]+$/.test(table)) {
        throw new Error("Invalid table name");
      }
      const result = await workerEnv.DB.prepare(`PRAGMA table_info(${table})`).all();
      return { content: [{ type: "text", text: JSON.stringify(result.results) }] };
    },
  );

  return server;
}

// corsOptions: false — no browser has any business reading this endpoint, so
// it sends no Access-Control-* headers at all (the agents default is `*`).
const handler = createMcpHandler(createServer, { route: "/mcp", corsOptions: false });

export default {
  // Everything goes through routeRequest, which authorizes first.
  // __tests__/router.test.js holds this file to that.
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return routeRequest(request, env, ctx, handler);
  },
};
