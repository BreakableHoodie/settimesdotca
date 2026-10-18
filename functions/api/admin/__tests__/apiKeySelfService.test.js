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
// WHAT IS GUARDED, stated honestly: (a) an admin route with no checkPermission call that a
// key can reach, and (b) a key-reachable route whose source writes an account or credential
// table (the behavioural scan below). A gated route that only READS the caller's own data,
// for example `SELECT ... FROM auth_attempts WHERE user_id = ?` bound to user.userId, is
// neither, and still needs a human to notice. Assertion 1 alone catches an admin route
// with NO checkPermission call that a key can reach -- the shape of /sessions,
// /trusted-devices and /me, and the one a new endpoint is most likely to have. It cannot
// tell a route that gates at "viewer" and acts on data.user.userId as self (the MFA shape)
// from a viewer-gated route acting on params.id; the scan covers that only when the route
// WRITES a credential table. Treat this as a backstop, not proof that no sixth endpoint
// can exist.
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
// Every way a module can export a Pages handler: a function declaration, a const/let/var,
// or a re-export with an alias (`export { x as onRequestPost }`).
const ROUTE_EXPORT =
  /export\s+(?:async\s+)?function\s+onRequest|export\s+(?:const|let|var)\s+onRequest|export\s*\{[^}]*\bas\s+onRequest|export\s*\{[^}]*\bonRequest/;

function collectRouteFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" ? [] : collectRouteFiles(full);
    }
    if (!entry.endsWith(".js") || entry === "_middleware.js") {
      return [];
    }
    return ROUTE_EXPORT.test(readFileSync(full, "utf8")) ? [full] : [];
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
    // An optional quote may precede the table name ("users", `users`).
    const PRINCIPAL_WRITE =
      /\b(?:INSERT\s+(?:OR\s+\w+\s+)?INTO|UPDATE|DELETE\s+FROM|REPLACE\s+INTO)\s+["`]?(?:users|invite_codes|api_keys|lucia_sessions|sessions|trusted_devices|mfa_challenges|password_reset_tokens|email_otp_codes|webauthn_credentials)\b/i;
    // A table name built at runtime cannot be matched against the list: a human decides.
    // Judged on the route's own reachable source only: shared helpers such as
    // auditLogStatement.js build an identifier-validated name for every caller.
    const DYNAMIC_TABLE = /\b(?:INTO|UPDATE|FROM)\s+["`]?\$\{/i;
    const IMPORT_RE = /import\s+([\s\S]*?)\s+from\s+["'](\.{1,2}\/[^"']+)["'];?/g;

    // The file split into top-level declarations (prettier keeps them at column 0), each
    // tagged with the handler name it exports, if any.
    function declarations(text) {
      return text.split(/\n(?=(?:export\s+)?(?:async\s+function|function|const|let|var|class)\s)/).map((chunk) => ({
        chunk,
        handler: chunk.match(/^export\s+(?:async\s+function|function|const|let|var)\s+(onRequest\w*)/)?.[1] ?? null,
      }));
    }

    // The source a key can reach. `methods` is null for "every method" or a list of handler
    // names the key may reach (a generic onRequest always counts). Other handlers are
    // sliced out, but everything else in the WHOLE file stays: same-file helpers wherever
    // they are defined, and the imports those helpers use. An aliased re-export
    // (`export { x as onRequestPost }`) cannot be sliced, so the file is judged whole.
    function reachableSources(file, text, methods = null) {
      const aliased = /export\s*\{[^}]*\bonRequest/.test(text);
      const kept = declarations(text)
        .filter(
          ({ handler }) => aliased || !methods || !handler || handler === "onRequest" || methods.includes(handler),
        )
        .map(({ chunk }) => chunk)
        .join("\n");
      const body = kept.replace(IMPORT_RE, "");
      // Imports ONE hop, only those whose bindings the reachable code actually uses.
      // _middleware.js is skipped: every route imports it and it writes lucia_sessions and
      // api_keys for its own bookkeeping, which would flag the whole tree.
      const deps = [...text.matchAll(IMPORT_RE)]
        .filter(([, clause]) =>
          (clause.match(/[A-Za-z_$][\w$]*/g) ?? []).some((n) => new RegExp(`\\b${n}\\b`).test(body)),
        )
        .map(([, , spec]) => join(dirname(file), spec))
        .filter((dep) => !dep.endsWith("_middleware.js"))
        .map((dep) => readFileSync(dep, "utf8"));
      return [body, ...deps];
    }
    const writesPrincipalTable = (file, text = readFileSync(file, "utf8"), methods = null) =>
      reachableSources(file, text, methods).some((src) => PRINCIPAL_WRITE.test(src));
    const buildsTableName = (file, text = readFileSync(file, "utf8"), methods = null) =>
      DYNAMIC_TABLE.test(reachableSources(file, text, methods)[0]);

    // For a route under KEY_READ_ONLY_PREFIXES the middleware refuses every method but GET
    // and HEAD, so only those handlers (and a generic onRequest) are key-reachable.
    const READ_METHODS = ["onRequestGet", "onRequestHead"];

    function keyReachable(files, forbidden, readOnly, judge) {
      return files
        .filter((file) => {
          const route = routePathFor(file);
          if (forbidden.some((prefix) => covers(prefix, route))) return false;
          return judge(file, readOnly.some((prefix) => covers(prefix, route)) ? READ_METHODS : null);
        })
        .map(routePathFor);
    }
    const keyReachableWriters = (files, forbidden, readOnly) =>
      keyReachable(files, forbidden, readOnly, (file, methods) => writesPrincipalTable(file, undefined, methods));
    const keyReachableDynamic = (files, forbidden, readOnly) =>
      keyReachable(files, forbidden, readOnly, (file, methods) => buildsTableName(file, undefined, methods));

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
        const write = (name, body) => {
          const file = join(dir, name);
          writeFileSync(file, body);
          return file;
        };
        write("helper.js", 'export const x = "DELETE FROM lucia_sessions WHERE 1";\n');
        const direct = write(
          "direct.js",
          'export async function onRequestPost(c){ c.env.DB.prepare("update users set role = ?"); }\n',
        );
        const hopped = write(
          "hopped.js",
          'import { x } from "./helper.js";\nexport async function onRequestPost(){ return x; }\n',
        );
        const clean = write(
          "clean.js",
          'export async function onRequestGet(c){ c.env.DB.prepare("SELECT * FROM users"); }\n',
        );
        expect(writesPrincipalTable(direct)).toBe(true);
        expect(writesPrincipalTable(hopped)).toBe(true);
        expect(writesPrincipalTable(clean)).toBe(false);

        // A read-only family's GET handler that writes through an import is flagged,
        // even though the import sits ABOVE the handler slice...
        const getHop = write(
          "getHop.js",
          'import { x } from "./helper.js";\nexport async function onRequestGet(){ return x; }\n',
        );
        expect(writesPrincipalTable(getHop, undefined, READ_METHODS)).toBe(true);
        // ...and a same-file helper defined above it counts too.
        const getHelper = write(
          "getHelper.js",
          'async function purge(db){ await db.prepare("DELETE FROM lucia_sessions"); }\nexport async function onRequestGet({env}){ await purge(env.DB); }\n',
        );
        expect(writesPrincipalTable(getHelper, undefined, READ_METHODS)).toBe(true);
        // Only the HEAD handler writes: HEAD is as key-reachable as GET on a read-only family.
        const headOnly = write(
          "headOnly.js",
          'import { x } from "./helper.js";\nexport async function onRequestGet(){ return 1; }\nexport async function onRequestHead(){ return x; }\n',
        );
        expect(writesPrincipalTable(headOnly, undefined, READ_METHODS)).toBe(true);
        // A POST-only write in the same file is not reachable by a key.
        const postOnly = write(
          "postOnly.js",
          'import { x } from "./helper.js";\nexport async function onRequestGet(){ return 1; }\nexport async function onRequestPost(){ return x; }\n',
        );
        expect(writesPrincipalTable(postOnly, undefined, READ_METHODS)).toBe(false);
        expect(writesPrincipalTable(postOnly)).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("detects quoted table names and every handler export shape; flags interpolated names", () => {
      const dir = mkdtempSync(join(tmpdir(), "key-scan-"));
      try {
        const write = (name, body) => {
          const file = join(dir, name);
          writeFileSync(file, body);
          return file;
        };
        const quoted = write(
          "q.js",
          'export const onRequestPost = async (c) => c.env.DB.prepare(`UPDATE "users" SET role = ?`);\n',
        );
        expect(ROUTE_EXPORT.test(readFileSync(quoted, "utf8"))).toBe(true);
        expect(writesPrincipalTable(quoted)).toBe(true);
        const backtick = write("b.js", "const q = 'DELETE FROM `lucia_sessions`';\nexport { q as onRequestPost };\n");
        expect(ROUTE_EXPORT.test(readFileSync(backtick, "utf8"))).toBe(true);
        expect(writesPrincipalTable(backtick)).toBe(true);
        expect(writesPrincipalTable(backtick, undefined, READ_METHODS)).toBe(true);
        const dynamic = write(
          "d.js",
          "export async function onRequestPost(c){ c.env.DB.prepare(`UPDATE ${c.params.t} SET a = 1`); }\n",
        );
        expect(writesPrincipalTable(dynamic)).toBe(false);
        expect(buildsTableName(dynamic)).toBe(true);
        expect(buildsTableName(quoted)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("no key-reachable route builds a table name at runtime", () => {
      expect(
        keyReachableDynamic(routes, prefixes, readOnlyPrefixes()),
        "These key-reachable routes interpolate a table name into SQL, so the scan cannot tell " +
          "whether it is an account or credential table. Review each by hand: use a literal name, " +
          "or deny the family to API keys.",
      ).toEqual([]);
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
