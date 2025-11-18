#!/usr/bin/env node

/**
 * Create Admin Invite Code
 *
 * This script creates an invite code that can be used to create the first admin account.
 * Usage: node scripts/create-admin-invite.js [--local|--prod]
 *
 * For local development: node scripts/create-admin-invite.js --local
 * For production: node scripts/create-admin-invite.js --prod
 */

import { randomUUID } from 'crypto';

const isLocal = process.argv.includes('--local');
const isProd = process.argv.includes('--prod');

if (!isLocal && !isProd) {
  console.error('❌ Error: Please specify --local or --prod');
  console.error('Usage: node scripts/create-admin-invite.js [--local|--prod]');
  process.exit(1);
}

// Generate a secure invite code
const inviteCode = randomUUID();
const expiresIn = 7; // days
const expiryDate = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000).toISOString();

console.log('\n🔐 Admin Invite Code Generated\n');
console.log('═'.repeat(60));
console.log(`📧 Invite Code: ${inviteCode}`);
console.log(`⏰ Expires: ${new Date(expiryDate).toLocaleString()} (7 days)`);
console.log(`🎯 Role: admin`);
console.log('═'.repeat(60));

if (isLocal) {
  console.log('\n📝 To use this invite code locally:');
  console.log('\n1. Insert into your local database:');
  console.log('\n   wrangler d1 execute settimes-db --local --command=\\');
  console.log(`   "INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES ('${inviteCode}', 'admin', '${expiryDate}', 1);"`);
  console.log('\n2. Use this code when signing up at http://localhost:8788/admin');
} else {
  console.log('\n📝 To use this invite code in production:');
  console.log('\n1. Insert into your production database:');
  console.log('\n   wrangler d1 execute settimes-db --command=\\');
  console.log(`   "INSERT INTO invite_codes (code, role, expires_at, is_active) VALUES ('${inviteCode}', 'admin', '${expiryDate}', 1);"`);
  console.log('\n2. Use this code when signing up at your production URL');
}

console.log('\n⚠️  SECURITY REMINDER:');
console.log('   - Store this invite code securely (password manager)');
console.log('   - Do not share it via email or public channels');
console.log('   - The code can only be used once');
console.log('   - The code will expire in 7 days\n');
