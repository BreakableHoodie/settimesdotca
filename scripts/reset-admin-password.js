// Run with: node scripts/reset-admin-password.js <new-password>
// Then use the output SQL in wrangler d1 execute
//
// Hashes with the SAME module production uses (functions/utils/crypto.js), so
// the iteration count cannot drift from the Workers cap. This script used to
// keep a private copy of the hashing code and its constant.
import { hashPassword } from "../functions/utils/crypto.js";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error("Usage: node scripts/reset-admin-password.js <new-password>");
    process.exit(1);
  }

  const hash = await hashPassword(password);
  console.log("\n=== Password Hash Generated ===\n");
  console.log("Hash:", hash);
  console.log("\n=== Run this SQL in production ===\n");
  console.log(
    `npx wrangler d1 execute settimes-production-db --remote --command "UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@settimes.ca';"`,
  );
}

main();
