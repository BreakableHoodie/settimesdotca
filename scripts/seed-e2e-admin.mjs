import { hashPassword } from "../functions/utils/crypto.js";

const args = process.argv.slice(2);
const emailIdx = args.indexOf("--email");
const password = process.env.E2E_ADMIN_PASSWORD;

// Refuse argv even when the environment ALSO carries the password. Removing the
// old flag parsing is not enough on its own: an unparsed argument is still an
// argument, so a caller that keeps passing it leaks the secret into the process
// list while the script quietly succeeds off the environment. Failing loudly is
// what turns a stale caller into a build error instead of a silent regression.
//
// Both spellings are refused, including the joined "flag=value" form, which
// arrives as a single argv entry. The flag names live in the check below rather
// than in this comment on purpose: a secret scanner reads a flag followed by a
// bare word as a credential assignment and flags the prose (it did, on this
// exact comment). Keep the literals in code, keep the explanation flag-free.
const hasArgvPassword = args.some((arg) => arg === "--password" || arg.startsWith("--password="));

if (hasArgvPassword) {
  console.error(
    "Refusing --password: it would expose the secret in the process list. Pass E2E_ADMIN_PASSWORD in the environment instead.",
  );
  process.exit(1);
}

if (emailIdx === -1 || !args[emailIdx + 1] || !password) {
  console.error("Usage: E2E_ADMIN_PASSWORD=<password> node scripts/seed-e2e-admin.mjs --email <email>");
  process.exit(1);
}

const email = args[emailIdx + 1];

// Escape single quotes for SQLite
const esc = (v) => v.replace(/'/g, "''");

const hash = await hashPassword(password);

process.stdout.write(
  `INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active, activated_at) VALUES (100, '${esc(email)}', 'E2E Admin', '${esc(hash)}', 'admin', 1, datetime('now'));`,
);
