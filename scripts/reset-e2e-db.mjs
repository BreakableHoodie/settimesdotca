import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../functions/utils/crypto.js";

export const SCRATCH_D1_NAME = "settimes-e2e-db";
export const SCRATCH_D1_ID = "c06cc3e7-92e3-4044-a705-608330c1f4ba";

export function assertScratchD1Target(name, id) {
  if (name !== SCRATCH_D1_NAME || id !== SCRATCH_D1_ID) {
    throw new Error("Refusing to reset D1: target is not the exact E2E scratch database");
  }
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrangler = join(root, "frontend/node_modules/.bin/wrangler");
const schema = join(root, "database/setup-complete.sql");

const runWrangler = (args) =>
  execFileSync(wrangler, ["d1", "execute", SCRATCH_D1_NAME, "--remote", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const parseRows = (output) => {
  const json = output.match(/\[[\s\S]*\]/u)?.[0];
  if (!json) throw new Error("Wrangler did not return a JSON result for the table query");
  const results = JSON.parse(json)[0]?.results;
  if (!Array.isArray(results)) throw new Error("Wrangler returned an unexpected table query result");
  return results;
};

// Children before parents. rows: [{ name, parent }] with one row per foreign
// key (parent null when a table has none). Self-references are ignored.
export function dropOrder(rows) {
  const parents = new Map();
  for (const { name, parent } of rows) {
    if (!name) continue;
    if (!parents.has(name)) parents.set(name, new Set());
    if (parent && parent !== name) parents.get(name).add(parent);
  }
  const order = [];
  const remaining = new Set(parents.keys());
  while (remaining.size) {
    // A table is droppable once no remaining table names it as a parent.
    const ready = [...remaining].filter((t) => ![...remaining].some((c) => parents.get(c).has(t)));
    if (!ready.length) throw new Error(`Foreign-key cycle among: ${[...remaining].join(", ")}`);
    for (const t of ready.sort()) {
      order.push(t);
      remaining.delete(t);
    }
  }
  return order;
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteSql = (value) => `'${value.replaceAll("'", "''")}'`;

const resetDatabase = async () => {
  assertScratchD1Target(SCRATCH_D1_NAME, SCRATCH_D1_ID);
  // Before anything destructive: a missing secret must not leave the scratch
  // D1 rebuilt with no accounts.
  if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
    throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required to seed the scratch database");
  }

  // Table names plus each table's foreign-key parents, in one query.
  const graphOutput = runWrangler([
    "--json",
    "--command",
    "SELECT m.name AS name, p.\"table\" AS parent FROM sqlite_master m LEFT JOIN pragma_foreign_key_list(m.name) p WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'",
  ]);
  const drops = dropOrder(parseRows(graphOutput)).map((table) => `DROP TABLE IF EXISTS ${quoteIdentifier(table)};`);
  // A child's DROP runs an implicit DELETE that still checks its parent, so
  // children must go first; deferring FK checks does not avoid that on D1.
  if (drops.length) runWrangler(["--command", drops.join(" ")]);

  runWrangler(["--file", schema]);
  runWrangler(["--command", "DELETE FROM users"]);

  const tempDirectory = mkdtempSync(join(tmpdir(), "settimes-e2e-seed-"));
  const seedFile = join(tempDirectory, "admin.sql");
  try {
    const seedSql = execFileSync(
      process.execPath,
      [join(root, "scripts/seed-e2e-admin.mjs"), "--email", process.env.E2E_ADMIN_EMAIL],
      {
        cwd: root,
        env: { ...process.env },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    // user-management.spec.js edits and toggles viewer@settimes.ca, which the
    // schema file seeds and the DELETE above removed. It never logs in, so its
    // password is random and discarded: no second account shares the admin's.
    const viewerHash = await hashPassword(crypto.randomUUID());
    const viewerSql = `INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active, activated_at) VALUES (101, 'viewer@settimes.ca', 'Viewer User', ${quoteSql(viewerHash)}, 'viewer', 1, datetime('now'));`;
    writeFileSync(seedFile, `${seedSql}\n${viewerSql}`, { mode: 0o600 });
    runWrangler(["--file", seedFile]);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) await resetDatabase();
