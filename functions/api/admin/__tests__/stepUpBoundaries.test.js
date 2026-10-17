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
// "conditional" = only the dangerous variant does; the safe variants are
//                 asserted to work WITHOUT step-up so the condition cannot
//                 silently widen or narrow.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv, grantStepUp } from "../../test-utils.js";
import { STEP_UP_WINDOW_SECONDS } from "../../../utils/stepUp.js";

const STEP_UP_POLICY = {
  "DELETE /api/admin/users/[id]": "always",
  "PATCH /api/admin/users/[id]": "conditional",
  "POST /api/admin/users/[id]/toggle-status": "conditional",
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
const HANDLER_PATTERN = /export async function (onRequest(Post|Put|Patch|Delete))\(context\)\s*\{/g;

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
    const declarations = [...source.matchAll(HANDLER_PATTERN)];
    const rel = path.relative(ADMIN_ROOT, filePath).replaceAll(path.sep, "/").replace(/\.js$/, "");
    return declarations.map((declaration, index) => {
      const bodyStart = declaration.index + declaration[0].length;
      const bodyEnd = declarations[index + 1]?.index ?? source.length;
      const method = declaration[1].replace("onRequest", "").toUpperCase();
      return {
        key: `${method} /api/admin/${rel}`,
        filePath,
        handlerName: declaration[1],
        source,
        body: source.slice(bodyStart, bodyEnd),
      };
    });
  });
}

const HANDLERS = discover();
const BY_KEY = Object.fromEntries(HANDLERS.map((h) => [h.key, h]));

describe("step-up policy matches the code (#1324)", () => {
  it("discovers the identity handlers it is meant to police", () => {
    expect(HANDLERS.length).toBeGreaterThanOrEqual(Object.keys(STEP_UP_POLICY).length);
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
        expect(after).toEqual(before);
      });
    });
  }
});

describe("conditional step-up routes: only the dangerous variant needs it (#1324)", () => {
  const PATCH = "PATCH /api/admin/users/[id]";

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

  for (const body of [{ name: "Renamed" }, { role: "viewer" }, { isActive: true }]) {
    it(`PATCH ${JSON.stringify(body)} (not an identity change) needs none`, async () => {
      const s = setup(PATCH, body);
      const { response } = await call(s.route, PATCH, s);
      expect(response.status).toBe(200);
    });
  }

  it("toggle-status: reactivating needs no step-up", async () => {
    const key = "POST /api/admin/users/[id]/toggle-status";
    const s = setup(key);
    s.rawDb.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(Number(s.params.id));
    const { response } = await call(s.route, key, s);
    expect(response.status).toBe(200);
    expect(s.rawDb.prepare("SELECT is_active FROM users WHERE id = ?").get(Number(s.params.id)).is_active).toBe(1);
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
