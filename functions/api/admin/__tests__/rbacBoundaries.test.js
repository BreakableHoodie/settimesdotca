// The admin route permission policy, stated once and checked against the code
// (#1255).
//
// WHY AN EXPLICIT TABLE: a guard that reads each route's required role FROM
// THE CODE can never catch the code being weakened. Lower publish.js to
// "viewer" and its expectation drops with it, so the test stays green. The
// first draft of this file did exactly that and survived the mutation. The
// policy below is the independent source of truth:
//
//   1. every admin handler must appear here, so a new route cannot ship
//      without someone deciding who may call it;
//   2. every entry must still exist, so the table cannot go stale;
//   3. the role in the code must EQUAL the role here (static);
//   4. calling each handler as every role BELOW its policy role returns 403
//      and writes nothing (behavioural: proves the check actually runs first).
//
// "self" = no role check: self-service routes scoped to the caller's own
// session (me, sessions, trusted-devices). They stay listed so that adding
// an ungated route still fails property 1. API keys are kept off them
// separately by KEY_FORBIDDEN_PREFIXES (apiKeySelfService.test.js).
//
// Owner decisions 2026-10-10: editors run editions end to end, so archive,
// the event wizard and CREATING a venue are editor. Editing or deleting a
// venue, deleting an event, and users, API keys, invites, the audit log and
// maintenance stay admin.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { createTestEnv, grantStepUp, insertBand, insertEvent, insertVenue } from "../../test-utils.js";

const POLICY = {
  "GET /api/admin/analytics/subscriptions": "admin",
  "GET /api/admin/api-keys": "admin",
  "POST /api/admin/api-keys": "admin",
  "DELETE /api/admin/api-keys/[id]": "admin",
  "GET /api/admin/audit-log": "admin",
  "GET /api/admin/bands": "viewer",
  "POST /api/admin/bands": "editor",
  "PUT /api/admin/bands/[id]": "editor",
  "PATCH /api/admin/bands/[id]": "editor",
  "DELETE /api/admin/bands/[id]": "editor",
  "POST /api/admin/bands/[id]/resend-announcement": "editor",
  "POST /api/admin/bands/bulk-preview": "editor",
  "DELETE /api/admin/bands/bulk": "editor",
  "POST /api/admin/bands/bulk": "editor",
  "PATCH /api/admin/bands/bulk": "editor",
  "POST /api/admin/bands/import": "editor",
  "POST /api/admin/bands/photos": "editor",
  "GET /api/admin/bands/stats/[name]": "viewer",
  "GET /api/admin/events": "viewer",
  "POST /api/admin/events": "editor",
  "PATCH /api/admin/events/[id]": "editor",
  "PUT /api/admin/events/[id]": "editor",
  "DELETE /api/admin/events/[id]": "admin",
  "POST /api/admin/events/[id]/archive": "editor",
  "POST /api/admin/events/[id]/duplicate": "editor",
  "PUT /api/admin/events/[id]/edit": "editor",
  "GET /api/admin/events/[id]/metrics": "viewer",
  "POST /api/admin/events/[id]/notify-subscribers": "editor",
  "POST /api/admin/events/[id]/publish": "editor",
  "POST /api/admin/events/[id]/reveal-mode": "editor",
  "PUT /api/admin/events/[id]/schedule": "editor",
  "GET /api/admin/events/[id]/venue-delays": "viewer",
  "POST /api/admin/events/[id]/venues/[venueId]/delay": "editor",
  "DELETE /api/admin/events/[id]/venues/[venueId]/delay": "editor",
  "POST /api/admin/events/posters": "editor",
  "GET /api/admin/events/posters": "editor",
  "POST /api/admin/events/wizard": "editor",
  "POST /api/admin/flush-announce-digest": "editor",
  "GET /api/admin/invite-codes": "admin",
  "POST /api/admin/invite-codes": "admin",
  "DELETE /api/admin/invite-codes/[id]": "admin",
  "POST /api/admin/maintenance/cleanup-sessions": "admin",
  "GET /api/admin/me": "self",
  "POST /api/admin/mfa/backup-codes": "viewer",
  "POST /api/admin/mfa/disable": "viewer",
  "POST /api/admin/mfa/enable": "viewer",
  "POST /api/admin/mfa/setup": "viewer",
  "POST /api/admin/mfa/step-up": "viewer",
  "GET /api/admin/mfa/status": "viewer",
  "GET /api/admin/sessions": "self",
  "DELETE /api/admin/sessions": "self",
  "POST /api/admin/sessions/revoke-all": "viewer",
  "GET /api/admin/trusted-devices": "self",
  "DELETE /api/admin/trusted-devices": "self",
  "GET /api/admin/users": "admin",
  "POST /api/admin/users": "admin",
  "PATCH /api/admin/users/[id]": "admin",
  "DELETE /api/admin/users/[id]": "admin",
  "POST /api/admin/users/[id]/reset-password": "admin",
  "POST /api/admin/users/[id]/toggle-status": "admin",
  "POST /api/admin/users/[id]/reset-mfa": "admin",
  "GET /api/admin/venues": "viewer",
  "POST /api/admin/venues": "editor",
  "PUT /api/admin/venues/[id]": "admin",
  "DELETE /api/admin/venues/[id]": "admin",
};

const ADMIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROLE_LEVEL = { viewer: 1, editor: 2, admin: 3 };
const HANDLER_PATTERN = /export async function (onRequest(?:Get|Post|Put|Patch|Delete))\(context\)\s*\{/g;
const ROLE_PATTERN = /checkPermission\(context,\s*"(viewer|editor|admin)"\)/g;
const BELOW = { viewer: [], editor: ["viewer"], admin: ["viewer", "editor"], self: [] };

function listHandlerFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // auth/ is intentionally public (login, logout, signup, MFA verify);
      // the middleware exempts exactly that prefix.
      if (entry.name === "__tests__" || entry.name === "auth") return [];
      return listHandlerFiles(entryPath);
    }
    if (entry.name === "_middleware.js" || !entry.name.endsWith(".js")) return [];
    return [entryPath];
  });
}

// What the CODE says: one record per exported handler, with the highest role
// its body passes to checkPermission ("self" when it passes none).
function discoverHandlers() {
  return listHandlerFiles(ADMIN_ROOT).flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8");
    const declarations = [...source.matchAll(HANDLER_PATTERN)];
    const relativePath = path.relative(ADMIN_ROOT, filePath).replaceAll(path.sep, "/").replace(/\.js$/, "");
    return declarations.map((declaration, index) => {
      const bodyStart = declaration.index + declaration[0].length;
      const bodyEnd = declarations[index + 1]?.index ?? source.length;
      const roles = [...source.slice(bodyStart, bodyEnd).matchAll(ROLE_PATTERN)].map((match) => match[1]);
      const codeRole = roles.length
        ? roles.reduce((highest, role) => (ROLE_LEVEL[role] > ROLE_LEVEL[highest] ? role : highest))
        : "self";
      const method = declaration[1].replace("onRequest", "").toUpperCase();
      return {
        key: `${method} /api/admin/${relativePath}`,
        filePath,
        handlerName: declaration[1],
        method,
        path: `/api/admin/${relativePath}`,
        codeRole,
      };
    });
  });
}

// Every row of every table, not just counts: a handler that UPDATES an
// existing row before refusing changes no count, and only the contents show it.
// Table names come from sqlite_master, never from input.
//
// One column is excluded: session validation stamps
// lucia_sessions.last_activity_at with datetime('now') on EVERY request, before
// any handler runs. It changes whenever the clock crosses a second mid-test
// (it did in CI, never locally), and it is the middleware's write, not the
// route's. The rest of the sessions table is still compared.
const BOOKKEEPING_COLUMNS = { lucia_sessions: ["last_activity_at"] };

function tableSnapshot(rawDb) {
  const tables = rawDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => {
      const rows = rawDb.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY 1`).all();
      const skip = BOOKKEEPING_COLUMNS[name] ?? [];
      return [
        name,
        rows.map((row) => Object.fromEntries(Object.entries(row).filter(([column]) => !skip.includes(column)))),
      ];
    }),
  );
}

// Real rows for the fixed `id: "1"` params to resolve to, so a handler that
// wrote before its permission check would have something to change. The body
// carries the fields admin writes most often for the same reason.
function seedTargets(rawDb) {
  const venue = insertVenue(rawDb, { name: "Boundary Venue" });
  const event = insertEvent(rawDb, { name: "Boundary Event", slug: "boundary-event", status: "published" });
  insertBand(rawDb, { name: "Boundary Band", event_id: event.id, venue_id: venue.id });
}
const WRITE_BODY = {
  name: "changed",
  status: "archived",
  role: "admin",
  isActive: false,
  is_cancelled: true,
  date: "2030-01-01",
};

const HANDLERS = discoverHandlers();
const BY_KEY = Object.fromEntries(HANDLERS.map((h) => [h.key, h]));
const CASES = HANDLERS.flatMap((h) => (BELOW[POLICY[h.key]] ?? []).map((role) => ({ ...h, role })));

describe("admin route policy matches the code (#1255)", () => {
  // Guards against the discovery silently matching nothing, which would make
  // every property below pass vacuously.
  it("discovers the admin handlers it is meant to police", () => {
    expect(HANDLERS.length).toBeGreaterThanOrEqual(55);
    expect(CASES.length).toBeGreaterThanOrEqual(30);
  });

  // HANDLER_PATTERN matches one spelling (`export async function onRequestX(context) {`).
  // A handler written any other way (`export const onRequestPost = ...`, a
  // `(ctx)` parameter) would be invisible to every check below. Count every
  // exported onRequest* by a looser pattern and require the two to agree.
  it("sees every exported handler, however it is written", () => {
    const loose = listHandlerFiles(ADMIN_ROOT).flatMap((filePath) => [
      ...readFileSync(filePath, "utf8").matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+(onRequest\w*)/gm),
    ]);
    expect(loose.length).toBe(HANDLERS.length);
  });

  it("every admin handler has a declared policy (a new route must state who may call it)", () => {
    const undeclared = HANDLERS.filter((h) => !(h.key in POLICY)).map((h) => `${h.key} (code: ${h.codeRole})`);
    expect(undeclared).toEqual([]);
  });

  it("every declared policy still names a real handler (no stale entries)", () => {
    const stale = Object.keys(POLICY).filter((key) => !(key in BY_KEY));
    expect(stale).toEqual([]);
  });

  it("the role each handler checks in code equals its declared policy", () => {
    const drift = HANDLERS.filter((h) => h.key in POLICY && POLICY[h.key] !== h.codeRole).map(
      (h) => `${h.key}: policy ${POLICY[h.key]}, code ${h.codeRole}`,
    );
    expect(drift).toEqual([]);
  });
});

describe("admin RBAC boundaries: a lower role is refused and nothing is written", () => {
  for (const testCase of CASES) {
    it(`${testCase.method} ${testCase.path} refuses ${testCase.role}`, async () => {
      const module = await import(pathToFileURL(testCase.filePath).href);
      const { env, rawDb, headers, sessionId } = createTestEnv({ role: testCase.role });
      // Stepped up, so ONLY the role check can refuse this call (#1324). Without
      // it identity routes answer STEP_UP_REQUIRED first and a broken role
      // check on them would go unnoticed.
      grantStepUp(rawDb, sessionId);
      seedTargets(rawDb);
      const requestInit = { method: testCase.method, headers };
      // The platform rejects a body on GET/HEAD.
      if (testCase.method !== "GET" && testCase.method !== "HEAD") {
        requestInit.body = JSON.stringify(WRITE_BODY);
        requestInit.headers = { ...headers, "Content-Type": "application/json" };
      }
      const before = tableSnapshot(rawDb);
      const response = await module[testCase.handlerName]({
        request: new Request(`https://example.test${testCase.path}`, requestInit),
        env,
        params: { id: "1", code: "x", name: "x" },
      });

      expect(response.status).toBe(403);
      const refusal = await response.json();
      expect(refusal.code).not.toBe("STEP_UP_REQUIRED");
      expect(refusal.message).toBe("Insufficient permissions");
      expect(tableSnapshot(rawDb)).toEqual(before);
    });
  }
});
