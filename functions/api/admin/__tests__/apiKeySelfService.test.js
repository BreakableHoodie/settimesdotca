// Guard: an API key must never reach an account self-service endpoint.
//
// The class this exists for, found by security review of #744 part 3: the key branch
// sets context.data.user.userId to the KEY'S CREATOR, because audit attribution and
// every ownership check need a real user id. A family of admin endpoints reads that
// same field as "the human holding this browser session" and acts on their credentials
// -- so a key reaching one edits its creator's account at whatever role it carries.
//
// A `viewer` key could POST /api/admin/mfa/setup then /mfa/enable and plant an
// attacker-controlled TOTP secret + backup codes on its admin creator (both gate at
// "viewer" and act on auth.user.userId); read that admin's live sessions and trusted
// devices with IPs (no role check at all); and revoke those devices. /sessions/revoke-all
// had no permission check whatsoever and mints a session -- it only failed because
// context.data.lucia happens to be undefined on the key path, which is a landmine, not
// a defence: the natural fix for that crash detonates it.
//
// KEY_FORBIDDEN_PREFIXES closes it. This file keeps it closed.
//
// SCOPE, stated honestly: assertion 1 catches an admin route with NO checkPermission
// call that a key can reach -- the shape of /sessions, /trusted-devices and /me, and
// the one a new endpoint is most likely to have. It does NOT catch a route that gates
// at "viewer" and then acts on data.user.userId as self, which is the MFA shape:
// nothing textual separates that from a viewer-gated route acting on params.id. The
// denylist covers the MFA family by name, and a new self-service family outside these
// prefixes would still need a human to notice. Treat this as a backstop against the
// ungated shape, not proof that no sixth endpoint can exist.

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ADMIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIDDLEWARE = join(ADMIN_DIR, "_middleware.js");

// A route is a file Cloudflare Pages will DISPATCH to, which means one exporting an
// onRequest handler -- not merely a .js file in the tree. maintenance/retention.js is
// the worked example: it lives under functions/api/admin/ and exports only
// runRetentionCleanup, a helper shared by the manual endpoint and the cron. Counting it
// as an unprotected route is a false positive, and a guard that cries wolf gets an
// exemption entry instead of a fix.
function collectRouteFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" ? [] : collectRouteFiles(full);
    }
    if (!entry.endsWith(".js") || entry === "_middleware.js") {
      return [];
    }
    return /export\s+(async\s+)?function\s+onRequest/.test(readFileSync(full, "utf8")) ? [full] : [];
  });
}

// functions/api/admin/mfa/setup.js -> /api/admin/mfa/setup
// Cloudflare Pages maps index.js to the directory itself and [id].js to a path segment,
// so the route path is the file path minus the .js (with /index stripped).
function routePathFor(file) {
  const rel = relative(ADMIN_DIR, file)
    .replace(/\.js$/, "")
    .replace(/\/index$/, "");
  return `/api/admin/${rel}`;
}

function middlewareList(name) {
  const source = readFileSync(MIDDLEWARE, "utf8");
  const block = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  expect(block, `${name} must exist in _middleware.js`).not.toBeNull();
  // Strip comments first: the denylist carries prose that contains quoted words.
  const code = block[1].replace(/\/\/.*$/gm, "");
  return [...code.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const forbiddenPrefixes = () => middlewareList("KEY_FORBIDDEN_PREFIXES");
const readOnlyPrefixes = () => middlewareList("KEY_READ_ONLY_PREFIXES");

// The middleware matches whole path segments: an entry covers itself and its children.
const covers = (prefix, route) => route === prefix || route.startsWith(`${prefix}/`);

// Reachable by a key and acting only on data it was given explicitly (params, body),
// never on the caller's own account. Each entry is a decision that must be argued, not
// a way to silence the test -- adding one without a reason is the failure mode here.
const REVIEWED_UNGATED_ROUTES = {
  "/api/admin/me": "read-only; returns the identity the key holder already has from the admin who minted the key",
};

describe("API keys cannot reach account self-service endpoints", () => {
  const prefixes = forbiddenPrefixes();
  const routes = collectRouteFiles(ADMIN_DIR);

  it("finds the admin routes to scan", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it("every admin route without a checkPermission call is denied to API keys", () => {
    const unprotected = routes
      .filter((file) => !readFileSync(file, "utf8").includes("checkPermission"))
      .map(routePathFor)
      .filter((route) => !prefixes.some((prefix) => covers(prefix, route)))
      .filter((route) => !(route in REVIEWED_UNGATED_ROUTES));

    expect(
      unprotected,
      "These admin routes have no checkPermission call and are reachable by an API key, " +
        "which authorises as the key's CREATOR. Either add a role gate, or add the route " +
        "to KEY_FORBIDDEN_PREFIXES in _middleware.js, or -- if it provably acts only on " +
        "data passed to it and never on the caller's own account -- record it in " +
        "REVIEWED_UNGATED_ROUTES with the reason.",
    ).toEqual([]);
  });

  it("the MFA, session, trusted-device and pre-auth families are all covered", () => {
    // Named explicitly: assertion 1 cannot see the MFA shape (it gates at "viewer"),
    // so if someone trims the denylist these must still fail.
    for (const route of [
      "/api/admin/mfa/setup",
      "/api/admin/mfa/enable",
      "/api/admin/sessions",
      "/api/admin/sessions/revoke-all",
      "/api/admin/trusted-devices",
      "/api/admin/auth/login",
      "/api/admin/maintenance/retention",
      "/api/admin/maintenance/cleanup-sessions",
      "/api/admin/audit-log",
    ]) {
      expect(
        prefixes.some((prefix) => covers(prefix, route)),
        `${route} must be denied to API keys`,
      ).toBe(true);
    }
  });

  // The behavioural half (#1331, from #1263): by what a route DOES rather than what it is
  // called. A dispatchable route whose source writes an account or credential table can
  // create, promote or keep alive a principal, so a key must never reach it. This is the
  // check that catches the MFA shape the textual assertion above cannot see.
  describe("every route that writes an account or credential table is key-denied", () => {
    // auth_attempts and auth_audit are rate-limit and telemetry ledgers, not credentials.
    const PRINCIPAL_WRITE =
      /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:users|invite_codes|api_keys|lucia_sessions|sessions|trusted_devices|mfa_challenges|password_reset_tokens|email_otp_codes|webauthn_credentials)\b/i;

    // The route's own source plus every relative module it imports, ONE hop: a write made
    // inside an imported helper is the same write. cleanup-sessions reaches lucia_sessions
    // only through runRetentionCleanup in retention.js, and a file-only scan never saw it.
    // _middleware.js is skipped: every route imports it and it writes lucia_sessions and
    // api_keys for its own bookkeeping, which would flag the whole tree.
    function sourcesOf(file, text = readFileSync(file, "utf8")) {
      const deps = [...text.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)]
        .map((m) => join(dirname(file), m[1]))
        .filter((dep) => !dep.endsWith("_middleware.js"))
        .map((dep) => readFileSync(dep, "utf8"));
      return [text, ...deps];
    }
    const writesPrincipalTable = (file, text) => sourcesOf(file, text).some((src) => PRINCIPAL_WRITE.test(src));

    // For a route under KEY_READ_ONLY_PREFIXES the middleware refuses every method but GET
    // and HEAD, so only the read handler is key-reachable. A generic onRequest serves all
    // methods and is judged whole.
    function readHandlerText(text) {
      if (/export\s+(async\s+)?function\s+onRequest\s*\(/.test(text)) return text;
      const start = text.search(/export\s+(async\s+)?function\s+onRequest(Get|Head)\b/);
      if (start === -1) return "";
      const rest = text.slice(start + 1);
      const next = rest.search(/\nexport\s/);
      return text.slice(start, next === -1 ? undefined : start + 1 + next);
    }

    function keyReachableWriters(files, forbidden, readOnly) {
      return files
        .filter((file) => {
          const route = routePathFor(file);
          if (forbidden.some((prefix) => covers(prefix, route))) return false;
          const text = readFileSync(file, "utf8");
          if (readOnly.some((prefix) => covers(prefix, route))) {
            // Judge the GET handler's own text, then the file's imports (conservative).
            const handler = readHandlerText(text);
            return handler !== "" && writesPrincipalTable(file, handler);
          }
          return writesPrincipalTable(file, text);
        })
        .map(routePathFor);
    }

    it("the scan still finds what it hunts (self-check)", () => {
      // With NO denylist the scan must flag the refused families, including the one
      // reachable only through the import hop. Otherwise it reports all-clear forever.
      const flagged = keyReachableWriters(routes, [], []);
      expect(flagged).toEqual(
        expect.arrayContaining([
          "/api/admin/users",
          "/api/admin/invite-codes",
          "/api/admin/api-keys",
          "/api/admin/maintenance/cleanup-sessions",
        ]),
      );
    });

    it("flags a synthetic unprotected writer, own source and one import hop", () => {
      const dir = mkdtempSync(join(tmpdir(), "key-scan-"));
      try {
        const helper = join(dir, "helper.js");
        writeFileSync(helper, 'export const x = "DELETE FROM lucia_sessions WHERE 1";\n');
        const direct = join(dir, "direct.js");
        writeFileSync(
          direct,
          'export async function onRequestPost(c){ c.env.DB.prepare("update users set role = ?"); }\n',
        );
        const hopped = join(dir, "hopped.js");
        writeFileSync(hopped, 'import { x } from "./helper.js";\nexport async function onRequestPost(){ return x; }\n');
        const clean = join(dir, "clean.js");
        writeFileSync(clean, 'export async function onRequestGet(c){ c.env.DB.prepare("SELECT * FROM users"); }\n');
        expect(writesPrincipalTable(direct)).toBe(true);
        expect(writesPrincipalTable(hopped)).toBe(true);
        expect(writesPrincipalTable(clean)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("no key-reachable route writes an account or credential table", () => {
      const reachable = keyReachableWriters(routes, prefixes, readOnlyPrefixes());
      expect(
        reachable,
        "These admin routes write an account or credential table and an API key can reach " +
          "them. Add the family to KEY_FORBIDDEN_PREFIXES (or KEY_READ_ONLY_PREFIXES if only " +
          "its mutations write) in _middleware.js.",
      ).toEqual([]);
    });
  });

  it("has no dead denylist entries", () => {
    const routes_ = routes.map(routePathFor);
    for (const prefix of prefixes) {
      expect(
        routes_.some((route) => covers(prefix, route)),
        `KEY_FORBIDDEN_PREFIXES contains "${prefix}", which matches no admin route`,
      ).toBe(true);
    }
  });

  it("session-minting routes state their own permission requirement", () => {
    // revoke-all had none and relied entirely on middleware shape. An endpoint that
    // calls createSession must not be one denylist edit away from being reachable.
    const source = readFileSync(join(ADMIN_DIR, "sessions", "revoke-all.js"), "utf8");
    expect(source).toContain("checkPermission");
  });
});
