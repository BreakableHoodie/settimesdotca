// Run with: node scripts/reset-admin-password.js <new-password>
// Then use the output SQL in wrangler d1 execute

const SALT_LENGTH = 16;
const DEFAULT_ITERATIONS = 100000; // CF Workers limit: max 100,000 iterations
const KEY_LENGTH = 32;

async function hashPassword(password) {
  const { webcrypto } = await import('crypto');
  const crypto = webcrypto;
  
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  const key = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: DEFAULT_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    KEY_LENGTH * 8
  );

  const hashArray = new Uint8Array(derivedBits);
  const saltBase64 = Buffer.from(salt).toString('base64');
  const hashBase64 = Buffer.from(hashArray).toString('base64');

  return `pbkdf2$${DEFAULT_ITERATIONS}$${saltBase64}$${hashBase64}`;
}

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node scripts/reset-admin-password.js <new-password>');
    process.exit(1);
  }

  const hash = await hashPassword(password);
  console.log('\n=== Password Hash Generated ===\n');
  console.log('Hash:', hash);
  console.log('\n=== Run this SQL in production ===\n');
  console.log(`npx wrangler d1 execute settimes-prod --remote --command "UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@settimes.ca';"`);
}

main();
