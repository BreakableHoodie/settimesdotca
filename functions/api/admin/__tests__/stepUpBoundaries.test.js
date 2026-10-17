// Step-up re-authentication policy, stated once and checked against the code
// (#1324). Same shape as rbacBoundaries.test.js, and for the same reason: a
// guard that discovered "which routes need step-up" FROM the code could never
// catch a route losing its call. STEP_UP_POLICY is the independent source.
//
//   1. every mutating handler in the identity families (users, invite codes,
//      API keys) is either in STEP_UP_POLICY or in NOT_STEP_UP with a reason,
//      so a new identity route fails the build until someone decides;
//   2. every policy entry exists and its file imports AND calls
//      requireRecentStepUp inside that handler;
//   3. behaviour: with no step-up the route answers 403 STEP_UP_REQUIRED and
//      writes NOTHING; a step-up 10s old lets it through; 301s old does not;
//      a step-up on a DIFFERENT session of the same user does not count.
//
// "always"      = every call needs step-up.
// "conditional" = only identity changes do (PATCH: a different role,
//                 deactivation, or reactivation); the safe variants are
//                 asserted to work WITHOUT step-up so the condition cannot
//                 silently widen or narrow.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, grantStepUp } from "../../test-utils.js";
import { onRequest } from "../_middleware.js";
import { generateCSRFToken } from "../../../utils/csrf.js";
import { STEP_UP_WINDOW_SECONDS } from "../../../utils/stepUp.js";

const STEP_UP_POLICY = {
  "DELETE /api/admin/users/[id]": "always",
  "PATCH /api/admin/users/[id]": "conditional",
  "POST /api/admin/users/[id]/toggle-status": "always",
  "POST /api/admin/users/[id]/reset-mfa": "always",
  "POST /api/admin/users/[id]/reset-password": "always",
  "POST /api/admin/users": "always",
  "POST /api/admin/invite-codes": "always",
  "POST /api/admin/api-keys": "always",
  "DELETE /api/admin/api-keys/[id]": "always",
};

// Mutating identity-family handlers that deliberately need no step-up.
const NOT_STEP_UP = {
  "DELETE /api/admin/invite-codes/[code]":
    "revoking an unused invite only removes the ability to create an account; it grants nothing",
};

const ADMIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FAMILIES = ["users", "invite-codes", "api-keys"];
// Every exported onRequest* in any spelling: `export async function`,
// `export function`, `export const`. A match that is not a known method (a
// bare `onRequest`, `onRequestAll`) cannot be classified and FAILS the build
// rather than being skipped.
const HANDLER_PATTERN =
  /export\s+(?:async\s+)?function\s+(onRequest\w*)\s*\(|export\s+(?:const|let)\s+(onRequest\w*)\s*=/g;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_ONLY = new Set(["GET", "HEAD", "OPTIONS"]);

// Pure, so the detector itself can be tested against every spelling.
export function parseHandlers(source) {
  const declarations = [...source.matchAll(HANDLER_PATTERN)];
  return declarations.map((declaration, index) => {
    const handlerName = declaration[1] ?? declaration[2];
    const bodyStart = declaration.index + declaration[0].length;
    const bodyEnd = declarations[index + 1]?.index ?? source.length;
    return {
      handlerName,
      method: handlerName.replace(/^onRequest/, "").toUpperCase(),
      body: source.slice(bodyStart, bodyEnd),
    };
  });
}

function familyFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(entryPath);
      } else if (entry.name.endsWith(".js")) out.push(entryPath);
    }
  };
  for (const family of FAMILIES) {
    if (existsSync(path.join(ADMIN_ROOT, `${family}.js`))) out.push(path.join(ADMIN_ROOT, `${family}.js`));
    if (existsSync(path.join(ADMIN_ROOT, family))) walk(path.join(ADMIN_ROOT, family));
  }
  return out;
}

function discover() {
  return familyFiles().flatMap((filePath) => {
    const source = readFileSync(filePath, "utf8");
    const rel = path.relative(ADMIN_ROOT, filePath).replaceAll(path.sep, "/").replace(/\.js$/, "");
    return parseHandlers(source).map((handler) => ({
      ...handler,
      key: `${handler.method} /api/admin/${rel}`,
      filePath,
      source,
    }));
  });
}

const ALL_HANDLERS = discover();
const UNCLASSIFIED = ALL_HANDLERS.filter((h) => !MUTATING.has(h.method) && !READ_ONLY.has(h.method));
const HANDLERS = ALL_HANDLERS.filter((h) => MUTATING.has(h.method));
const BY_KEY = Object.fromEntries(HANDLERS.map((h) => [h.key, h]));

describe("step-up policy matches the code (#1324)", () => {
  it("discovers the identity handlers it is meant to police", () => {
    expect(HANDLERS.length).toBeGreaterThanOrEqual(Object.keys(STEP_UP_POLICY).length);
  });

  it("classifies every exported onRequest* (a bare onRequest or an odd name fails, never skips)", () => {
    expect(UNCLASSIFIED.map((h) => `${h.key} (${h.handlerName})`)).toEqual([]);
  });

  it("the detector matches every export spelling and flags what it cannot classify", () => {
    const sample = [
      "export async function onRequestPost(context) {}",
      "export function onRequestPatch(context) {}",
      "export const onRequestDelete = async (context) => {};",
      "export async function onRequest(context) {}",
      "export const onRequestGet = async () => {};",
    ].join("\n");
    const parsed = parseHandlers(sample);
    expect(parsed.map((h) => h.method)).toEqual(["POST", "PATCH", "DELETE", "", "GET"]);
    const mutating = parsed.filter((h) => MUTATING.has(h.method)).length;
    const unclassified = parsed.filter((h) => !MUTATING.has(h.method) && !READ_ONLY.has(h.method)).length;
    expect(mutating).toBe(3);
    expect(unclassified).toBe(1);
  });

  it("every mutating identity handler is in the policy or explicitly exempt", () => {
    const undeclared = HANDLERS.filter((h) => !(h.key in STEP_UP_POLICY) && !(h.key in NOT_STEP_UP)).map((h) => h.key);
    expect(undeclared).toEqual([]);
  });

  it("no stale policy or exemption entries", () => {
    const stale = [...Object.keys(STEP_UP_POLICY), ...Object.keys(NOT_STEP_UP)].filter((key) => !(key in BY_KEY));
    expect(stale).toEqual([]);
  });

  it("every policy handler imports and calls requireRecentStepUp", () => {
    const missing = Object.keys(STEP_UP_POLICY).filter((key) => {
      const h = BY_KEY[key];
      return (
        !h ||
        !/import \{[^}]*\brequireRecentStepUp\b[^}]*\} from/.test(h.source) ||
        !/await requireRecentStepUp\(context\)/.test(h.body)
      );
    });
    expect(missing).toEqual([]);
  });

  it("exempt handlers do not call it (an exemption must be real)", () => {
    const calling = Object.keys(NOT_STEP_UP).filter((key) => BY_KEY[key]?.body.includes("requireRecentStepUp"));
    expect(calling).toEqual([]);
  });
});

// ---- behaviour ------------------------------------------------------------

// Every row of every table. lucia_sessions.last_activity_at is stamped by
// session validation on each request, not by the route.
function tableSnapshot(rawDb) {
  const tables = rawDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  return Object.fromEntries(
    tables.map(({ name }) => {
      const rows = rawDb.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY 1`).all();
      return [
        name,
        rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([column]) => !(name === "lucia_sessions" && column === "last_activity_at")),
          ),
        ),
      ];
    }),
  );
}

function addUser(rawDb, email, role = "viewer", active = 1) {
  rawDb
    .prepare("INSERT INTO users (email, role, name, password_hash, is_active) VALUES (?, ?, ?, 'placeholder', ?)")
    .run(email, role, email, active);
  return rawDb.prepare("SELECT id FROM users WHERE email = ?").get(email).id;
}

// One entry per policy route: how to seed a target, what to send, what a
// successful call answers.
const ROUTES = {
  "DELETE /api/admin/users/[id]": {
    file: "users/[id].js",
    handler: "onRequestDelete",
    seed: (db) => ({ id: String(addUser(db, "victim@test.com")) }),
    ok: 200,
  },
  "PATCH /api/admin/users/[id]": {
    file: "users/[id].js",
    handler: "onRequestPatch",
    seed: (db) => ({ id: String(addUser(db, "target@test.com", "viewer")) }),
    body: { role: "admin" },
    ok: 200,
  },
  "POST /api/admin/users/[id]/toggle-status": {
    file: "users/[id]/toggle-status.js",
    handler: "onRequestPost",
    seed: (db) => ({ id: String(addUser(db, "target@test.com", "viewer", 1)) }),
    ok: 200,
  },
  "POST /api/admin/users/[id]/reset-mfa": {
    file: "users/[id]/reset-mfa.js",
    handler: "onRequestPost",
    seed: () => ({ id: "2" }),
    ok: 200,
  },
  "POST /api/admin/users/[id]/reset-password": {
    file: "users/[id]/reset-password.js",
    handler: "onRequestPost",
    seed: (db) => ({ id: String(addUser(db, "resetme@test.com")) }),
    body: { reason: "forgot" },
    ok: 200,
  },
  "POST /api/admin/users": {
    file: "users.js",
    handler: "onRequestPost",
    seed: () => ({}),
    body: { email: "newbie@test.com", role: "admin", firstName: "New", lastName: "Bie" },
    ok: 201,
  },
  "POST /api/admin/invite-codes": {
    file: "invite-codes.js",
    handler: "onRequestPost",
    seed: () => ({}),
    body: { role: "admin" },
    ok: 201,
  },
  "POST /api/admin/api-keys": {
    file: "api-keys.js",
    handler: "onRequestPost",
    seed: () => ({}),
    body: { name: "ci key", role: "viewer" },
    ok: 201,
  },
  "DELETE /api/admin/api-keys/[id]": {
    file: "api-keys/[id].js",
    handler: "onRequestDelete",
    seed: (db) => {
      db.prepare(
        "INSERT INTO api_keys (name, key_prefix, key_hash, role, created_by, expires_at) VALUES ('k', 'st_test', 'test-hash-stepup', 'viewer', 1, datetime('now', '+30 days'))",
      ).run();
      return { id: String(db.prepare("SELECT id FROM api_keys").get().id) };
    },
    ok: 200,
  },
};

async function call(route, key, { env, headers, params, body, rawDb }) {
  const module = await import(pathToFileURL(path.join(ADMIN_ROOT, route.file)).href);
  const method = key.split(" ")[0];
  const init = { method, headers: { ...headers, "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await module[route.handler]({
    request: new Request(`https://example.test${key.split(" ")[1]}`, init),
    env,
    params,
    data: {},
  });
  return { response, after: tableSnapshot(rawDb) };
}

function setup(key, bodyOverride) {
  const route = ROUTES[key];
  const ctx = createTestEnv({ role: "admin" });
  // Mail is configured so the allowed path can complete; the denied path must
  // never reach it (asserted below through the fetch stub).
  ctx.env.EMAIL_PROVIDER = "mailchannels";
  ctx.env.EMAIL_FROM = "no-reply@settimes.ca";
  const params = route.seed(ctx.rawDb);
  const body = bodyOverride ?? route.body;
  return { route, ...ctx, params, body };
}

describe("step-up routes refuse a session that has not stepped up, and write nothing (#1324)", () => {
  const sent = vi.fn(async () => ({ ok: true, text: async () => "" }));
  beforeEach(() => {
    sent.mockClear();
    vi.stubGlobal("fetch", sent);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("covers every policy route (a new entry needs behavioural coverage)", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(Object.keys(STEP_UP_POLICY).sort());
  });

  for (const key of Object.keys(ROUTES)) {
    describe(key, () => {
      it("403 STEP_UP_REQUIRED with no step-up, and no row changes", async () => {
        const s = setup(key);
        const before = tableSnapshot(s.rawDb);
        const { response, after } = await call(s.route, key, s);
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe("STEP_UP_REQUIRED");
        expect(after).toEqual(before);
        expect(sent).not.toHaveBeenCalled(); // no email, no outbound call
      });

      it("succeeds, and writes something, with a step-up stamped 10s ago", async () => {
        const s = setup(key);
        grantStepUp(s.rawDb, s.sessionId, 10);
        const before = tableSnapshot(s.rawDb);
        const { response, after } = await call(s.route, key, s);
        expect(response.status).toBe(s.route.ok);
        expect(after).not.toEqual(before);
      });

      it(`403s once the step-up is ${STEP_UP_WINDOW_SECONDS + 1}s old`, async () => {
        const s = setup(key);
        grantStepUp(s.rawDb, s.sessionId, STEP_UP_WINDOW_SECONDS + 1);
        const before = tableSnapshot(s.rawDb);
        const { response, after } = await call(s.route, key, s);
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe("STEP_UP_REQUIRED");
        expect(after).toEqual(before);
      });

      it("does not accept a step-up stamped on a DIFFERENT session of the same user", async () => {
        const s = setup(key);
        const otherSession = crypto.randomUUID();
        s.rawDb
          .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES (?, 1, ?)")
          .run(otherSession, Math.floor(Date.now() / 1000) + 3600);
        grantStepUp(s.rawDb, otherSession);
        const before = tableSnapshot(s.rawDb);
        const { response, after } = await call(s.route, key, s);
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe("STEP_UP_REQUIRED");
        expect(after).toEqual(before);
      });
    });
  }
});

describe("conditional step-up routes: only identity changes need it (#1324)", () => {
  const PATCH = "PATCH /api/admin/users/[id]";
  const TOGGLE = "POST /api/admin/users/[id]/toggle-status";

  const inactive = (s) => s.rawDb.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(Number(s.params.id));

  for (const body of [{ role: "editor" }, { isActive: 0 }, { isActive: false }]) {
    it(`PATCH ${JSON.stringify(body)} needs step-up and writes nothing without it`, async () => {
      const s = setup(PATCH, body);
      const before = tableSnapshot(s.rawDb);
      const { response, after } = await call(s.route, PATCH, s);
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("STEP_UP_REQUIRED");
      expect(after).toEqual(before);
    });
  }

  it("PATCH {isActive: true} on an INACTIVE user (reactivation) needs step-up and writes nothing without it", async () => {
    const s = setup(PATCH, { isActive: true });
    inactive(s);
    const before = tableSnapshot(s.rawDb);
    const { response, after } = await call(s.route, PATCH, s);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("STEP_UP_REQUIRED");
    expect(after).toEqual(before);

    grantStepUp(s.rawDb, s.sessionId);
    expect((await call(s.route, PATCH, s)).response.status).toBe(200);
    expect(s.rawDb.prepare("SELECT is_active FROM users WHERE id = ?").get(Number(s.params.id)).is_active).toBe(1);
  });

  for (const body of [{ name: "Renamed" }, { role: "viewer" }, { isActive: true }]) {
    it(`PATCH ${JSON.stringify(body)} (not an identity change) needs none`, async () => {
      const s = setup(PATCH, body);
      const { response } = await call(s.route, PATCH, s);
      expect(response.status).toBe(200);
    });
  }

  it("toggle-status needs step-up in BOTH directions: reactivation is refused without it", async () => {
    const s = setup(TOGGLE);
    inactive(s);
    const before = tableSnapshot(s.rawDb);
    const { response, after } = await call(s.route, TOGGLE, s);
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("STEP_UP_REQUIRED");
    expect(after).toEqual(before);

    grantStepUp(s.rawDb, s.sessionId);
    expect((await call(s.route, TOGGLE, s)).response.status).toBe(200);
    expect(s.rawDb.prepare("SELECT is_active FROM users WHERE id = ?").get(Number(s.params.id)).is_active).toBe(1);
  });

  // A same-state send skips step-up, so its UPDATE is pinned to the state it
  // read. A concurrent change by another admin then makes it lose with a 409
  // instead of silently undoing that change without a step-up.
  it("PATCH {role: <current role>} loses to a concurrent demotion with 409, writing nothing", async () => {
    const s = setup(PATCH, { role: "editor" });
    s.rawDb.prepare("UPDATE users SET role = 'editor' WHERE id = ?").run(Number(s.params.id));
    const realPrepare = s.env.DB.prepare.bind(s.env.DB);
    s.env.DB = {
      ...s.env.DB,
      prepare(sql) {
        // Between the read and the write, another admin demotes the user.
        if (/^\s*UPDATE users\s+SET/.test(sql)) {
          s.rawDb.prepare("UPDATE users SET role = 'viewer' WHERE id = ?").run(Number(s.params.id));
        }
        return realPrepare(sql);
      },
    };
    const { response } = await call(s.route, PATCH, s);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("USER_STATE_CHANGED");
    expect(s.rawDb.prepare("SELECT role FROM users WHERE id = ?").get(Number(s.params.id)).role).toBe("viewer");
    expect(s.rawDb.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'user.updated'").get().n).toBe(0);
  });

  it("PATCH {isActive: true} on an active user loses to a concurrent deactivation with 409", async () => {
    const s = setup(PATCH, { isActive: true });
    const realPrepare = s.env.DB.prepare.bind(s.env.DB);
    s.env.DB = {
      ...s.env.DB,
      prepare(sql) {
        if (/^\s*UPDATE users\s+SET/.test(sql)) {
          s.rawDb.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(Number(s.params.id));
        }
        return realPrepare(sql);
      },
    };
    const { response } = await call(s.route, PATCH, s);
    expect(response.status).toBe(409);
    expect(s.rawDb.prepare("SELECT is_active FROM users WHERE id = ?").get(Number(s.params.id)).is_active).toBe(0);
  });
});

// The real middleware path (#1324): session cookie + CSRF, `next` bound to the
// handler. The direct-call cases above rely on checkPermission's fallback to
// find the session; this is the path production runs.
describe("step-up through the real admin middleware", () => {
  async function viaMiddleware(key, s, { body } = {}) {
    const route = ROUTES[key];
    const module = await import(pathToFileURL(path.join(ADMIN_ROOT, route.file)).href);
    const [method, routePath] = key.split(" ");
    const concretePath = routePath.replace("[id]", s.params.id ?? "1");
    const url = `https://example.test${concretePath}`;
    const cookie = `session_token=${s.sessionId}`;
    const csrfToken = generateCSRFToken(new Request(url, { method, headers: { Cookie: cookie } }), s.env);
    const init = {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: `${cookie}; csrf_token=${csrfToken}`,
        "X-CSRF-Token": csrfToken,
      },
    };
    const payload = body ?? route.body;
    if (payload !== undefined) init.body = JSON.stringify(payload);
    const context = { env: s.env, request: new Request(url, init), data: {}, params: s.params };
    context.next = async () => module[route.handler](context);
    return onRequest(context);
  }

  for (const key of Object.keys(ROUTES)) {
    it(`${key}: 403 STEP_UP_REQUIRED unstamped (nothing written), success once stamped`, async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, text: async () => "" })),
      );
      try {
        const s = setup(key);
        const before = tableSnapshot(s.rawDb);
        const denied = await viaMiddleware(key, s);
        expect(denied.status).toBe(403);
        expect((await denied.json()).code).toBe("STEP_UP_REQUIRED");
        expect(tableSnapshot(s.rawDb)).toEqual(before);

        grantStepUp(s.rawDb, s.sessionId);
        const allowed = await viaMiddleware(key, s);
        expect(allowed.status).toBe(ROUTES[key].ok);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  }

  it("a step-up stamped on another session of the same user does not satisfy the middleware path", async () => {
    const key = "POST /api/admin/users/[id]/reset-mfa";
    const s = setup(key);
    s.rawDb
      .prepare("INSERT INTO lucia_sessions (id, user_id, expires_at) VALUES ('other-session', 1, ?)")
      .run(Math.floor(Date.now() / 1000) + 3600);
    grantStepUp(s.rawDb, "other-session");
    const denied = await viaMiddleware(key, s);
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("STEP_UP_REQUIRED");
  });
});

describe("API keys never satisfy step-up (#1324)", () => {
  it("requireRecentStepUp refuses a key even on a stamped session", async () => {
    const { requireRecentStepUp } = await import("../../../utils/stepUp.js");
    const s = createTestEnv({ role: "admin" });
    grantStepUp(s.rawDb, s.sessionId);
    const denied = await requireRecentStepUp({
      env: s.env,
      data: { apiKey: { id: 1 }, session: { id: s.sessionId, user_id: 1 } },
    });
    expect(denied.status).toBe(403);
    expect((await denied.json()).code).toBe("STEP_UP_KEY_FORBIDDEN");
  });

  it("requireRecentStepUp fails closed with no session and on a database error", async () => {
    const { requireRecentStepUp } = await import("../../../utils/stepUp.js");
    const s = createTestEnv({ role: "admin" });
    const noSession = await requireRecentStepUp({ env: s.env, data: {} });
    expect(noSession.status).toBe(403);
    const broken = await requireRecentStepUp({
      env: { DB: { prepare: () => ({ bind: () => ({ first: async () => Promise.reject(new Error("d1 down")) }) }) } },
      data: { session: { id: "x", user_id: 1 } },
    });
    expect(broken.status).toBe(503);
  });
});
