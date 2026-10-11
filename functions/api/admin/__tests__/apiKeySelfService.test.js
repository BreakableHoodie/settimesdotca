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
import { readFileSync, readdirSync, statSync } from "node:fs";
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

function forbiddenPrefixes() {
  const source = readFileSync(MIDDLEWARE, "utf8");
  const block = source.match(/const KEY_FORBIDDEN_PREFIXES = \[([\s\S]*?)\];/);
  expect(block, "KEY_FORBIDDEN_PREFIXES must exist in _middleware.js").not.toBeNull();
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// A write to any table that defines who can sign in, at what role, or with what
// credential. Case-insensitive because SQL is.
const PRINCIPAL_WRITE =
  /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+(?:users|invite_codes|api_keys|lucia_sessions|sessions|trusted_devices|mfa_challenges|password_reset_tokens|email_otp_codes|webauthn_credentials)\b/i;

// The route's own source AND every relative module it imports, one hop. A write
// made inside an imported helper is the same write: cleanup-sessions reaches
// lucia_sessions only through runRetentionCleanup in retention.js, and a
// file-only scan never saw it (security review, 2026-10-11). utils/ is skipped:
// it is shared by every route, and following it would flag the whole tree.
function writesPrincipalTable(file) {
  const source = readFileSync(file, "utf8");
  if (PRINCIPAL_WRITE.test(source)) return true;
  return [...source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)]
    .map((m) => join(dirname(file), m[1]))
    .filter((dep) => !dep.includes(join("functions", "utils")) && !dep.endsWith("_middleware.js"))
    .some((dep) => PRINCIPAL_WRITE.test(readFileSync(dep, "utf8")));
}

// Reachable by a key and acting only on data it was given explicitly (params, body),
// never on the caller's own account. Each entry is a decision that must be argued, not
// a way to silence the test -- adding one without a reason is the failure mode here.
const REVIEWED_UNGATED_ROUTES = {
  "/api/admin/me":
    "read-only; on the key path returns only the key's own prefix and role, never its creator's identity",
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
      .filter((route) => !prefixes.some((prefix) => route.startsWith(prefix)))
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
    ]) {
      expect(
        prefixes.some((prefix) => route.startsWith(prefix)),
        `${route} must be denied to API keys`,
      ).toBe(true);
    }
  });

  // The account-management class (owner decision 2026-10-11), by what a route DOES
  // rather than what it is called: any dispatchable route that writes an account or
  // credential table can create, promote, or keep alive a principal, so a key must
  // never reach it. A new route of that shape fails here until it is denylisted.
  it("every route that writes an account or credential table is denied to API keys", () => {
    const writers = routes.filter((file) => writesPrincipalTable(file)).map(routePathFor);
    // The scan must still find what it hunts, or it reports all-clear forever.
    expect(writers).toEqual(
      expect.arrayContaining([
        "/api/admin/users",
        "/api/admin/invite-codes",
        "/api/admin/api-keys",
        // Reachable only through the import hop: proves the hop still works.
        "/api/admin/maintenance/cleanup-sessions",
      ]),
    );

    const reachable = writers.filter((route) => !prefixes.some((prefix) => route.startsWith(prefix)));
    expect(
      reachable,
      "These admin routes write an account or credential table and are reachable by an API key. " +
        "Add them to KEY_FORBIDDEN_PREFIXES in _middleware.js.",
    ).toEqual([]);
  });

  it("the account-management families are all covered", () => {
    for (const route of [
      "/api/admin/users",
      "/api/admin/users/[id]",
      "/api/admin/users/[id]/reset-password",
      "/api/admin/users/[id]/toggle-status",
      "/api/admin/invite-codes",
      "/api/admin/invite-codes/[code]",
      "/api/admin/api-keys",
      "/api/admin/api-keys/[id]",
    ]) {
      expect(
        prefixes.some((prefix) => route.startsWith(prefix)),
        `${route} must be denied to API keys`,
      ).toBe(true);
    }
  });

  it("has no dead denylist entries", () => {
    const routes_ = routes.map(routePathFor);
    for (const prefix of prefixes) {
      expect(
        routes_.some((route) => route.startsWith(prefix)),
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
