import { hashPassword } from '../functions/utils/crypto.js'

const password = process.argv[2]

if (!password) {
  console.error('Usage: node scripts/hash-password.mjs <password>')
  process.exit(1)
}

const hash = await hashPassword(password)
process.stdout.write(hash)
