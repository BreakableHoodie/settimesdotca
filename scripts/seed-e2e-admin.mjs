import { hashPassword } from '../functions/utils/crypto.js'

const args = process.argv.slice(2)
const emailIdx = args.indexOf('--email')
const passwordIdx = args.indexOf('--password')

if (emailIdx === -1 || passwordIdx === -1 || !args[emailIdx + 1] || !args[passwordIdx + 1]) {
  console.error('Usage: node scripts/seed-e2e-admin.mjs --email <email> --password <password>')
  process.exit(1)
}

const email = args[emailIdx + 1]
const password = args[passwordIdx + 1]

// Escape single quotes for SQLite
const esc = v => v.replace(/'/g, "''")

const hash = await hashPassword(password)

process.stdout.write(
  `INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active, activated_at) VALUES (100, '${esc(email)}', 'E2E Admin', '${esc(hash)}', 'admin', 1, datetime('now'));`
)
