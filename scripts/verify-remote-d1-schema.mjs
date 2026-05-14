#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const MAX_ERROR_OUTPUT_LENGTH = 500;

const REQUIRED_SCHEMA = {
  events: ['id', 'slug', 'city', 'is_published', 'reveal_mode'],
  venues: ['id', 'name', 'city'],
  band_profiles: ['id', 'name', 'name_normalized', 'genre', 'photo_url'],
  performances: [
    'id',
    'event_id',
    'venue_id',
    'band_profile_id',
    'start_time',
    'end_time',
    'is_announced',
    'band_follow_notified',
  ],
  users: [
    'id',
    'email',
    'password_hash',
    'role',
    'is_active',
    'totp_enabled',
    'totp_secret',
    'backup_codes',
  ],
  lucia_sessions: ['id', 'user_id', 'expires_at', 'ip_address', 'user_agent', 'created_at', 'last_activity_at'],
  invite_codes: ['id', 'code', 'role', 'is_active', 'expires_at'],
  password_reset_tokens: [
    'id',
    'token',
    'user_id',
    'created_by',
    'used',
    'expires_at',
  ],
  mfa_challenges: [
    'id',
    'token',
    'user_id',
    'ip_address',
    'user_agent',
    'expires_at',
    'used',
    'used_at',
    'created_at',
  ],
  auth_attempts: [
    'id',
    'user_id',
    'email',
    'ip_address',
    'user_agent',
    'attempt_type',
    'success',
    'failure_reason',
    'created_at',
  ],
  auth_audit: ['id', 'action', 'success', 'ip_address', 'user_agent', 'timestamp'],
  rate_limits: ['key', 'count', 'window_start', 'updated_at'],
  trusted_devices: ['id', 'token', 'user_id', 'expires_at'],
  email_otp_codes: ['id', 'user_id', 'code_hash', 'expires_at', 'verified'],
  audit_log: ['id', 'user_id', 'action', 'resource_type', 'created_at'],
  band_follows: [
    'id',
    'email',
    'band_profile_id',
    'verified',
    'verification_token',
    'unsubscribe_token',
    'created_at',
  ],
};

const wranglerBin = path.join(
  process.cwd(),
  'frontend',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler'
);

function getDatabaseName() {
  const databaseName =
    process.argv[2]?.trim() || process.env.D1_DATABASE_NAME?.trim();

  if (!databaseName) {
    throw new Error(
      'Provide a D1 database name as the first argument or via D1_DATABASE_NAME.'
    );
  }

  if (!/^[A-Za-z0-9_-]+$/.test(databaseName)) {
    throw new Error(`Invalid D1 database name: ${databaseName}`);
  }

  return databaseName;
}

async function checkWranglerExists() {
  try {
    await access(wranglerBin);
  } catch {
    throw new Error(
      `Wrangler binary not found at ${wranglerBin}. Run \`npm ci\` inside the frontend directory to install dependencies.`
    );
  }
}

async function runWranglerQuery(databaseName, query) {
  const { stdout, stderr } = await execFileAsync(
    wranglerBin,
    ['d1', 'execute', databaseName, '--remote', '--json', '--command', query],
    {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 1024 * 1024 * 8,
    }
  );

  return { stdout, stderr };
}

function parseWranglerJson(stdout) {
  const jsonMatch = stdout.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return { parsedOk: false, headers: [], rows: [] };

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { parsedOk: false, headers: [], rows: [] };
  }

  const results = parsed[0]?.results;
  if (!Array.isArray(results)) return { parsedOk: false, headers: [], rows: [] };
  if (results.length === 0) return { parsedOk: true, headers: [], rows: [] };

  const headers = Object.keys(results[0]);
  const rows = results.map((obj) => headers.map((h) => obj[h] ?? null));

  return { parsedOk: true, headers, rows };
}

async function verifyTables(databaseName) {
  const tableNames = Object.keys(REQUIRED_SCHEMA);
  const query = `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${tableNames
    .map((table) => `'${table}'`)
    .join(', ')}) ORDER BY name;`;
  const { stdout, stderr } = await runWranglerQuery(databaseName, query);
  const parsed = parseWranglerJson(stdout);

  if (!parsed.parsedOk) {
    const stdoutSnippet = stdout.trim().slice(0, MAX_ERROR_OUTPUT_LENGTH);
    throw new Error(
      [
        'Could not parse table list from Wrangler output.',
        stderr.trim() && `stderr: ${stderr.trim()}`,
        stdoutSnippet && `stdout: ${stdoutSnippet}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  const existingTables = new Set(
    parsed.rows.map((row) => row[0]).filter(Boolean)
  );

  const missingTables = tableNames.filter(
    (table) => !existingTables.has(table)
  );

  if (missingTables.length > 0) {
    throw new Error(
      `Remote D1 schema is missing required tables: ${missingTables.join(', ')}`
    );
  }

  return tableNames;
}

async function verifyColumns(databaseName, table, columns) {
  const { stdout, stderr } = await runWranglerQuery(
    databaseName,
    `PRAGMA table_info(${table});`
  );
  const parsed = parseWranglerJson(stdout);
  const nameIndex = parsed.headers.indexOf('name');

  if (!parsed.parsedOk || nameIndex === -1) {
    const stdoutSnippet = stdout.trim().slice(0, MAX_ERROR_OUTPUT_LENGTH);
    throw new Error(
      [
        `Could not parse column list for ${table} from Wrangler output.`,
        stderr.trim() && `stderr: ${stderr.trim()}`,
        stdoutSnippet && `stdout: ${stdoutSnippet}`,
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  const existingColumns = new Set(
    parsed.rows.map((row) => row[nameIndex]).filter(Boolean)
  );
  const missingColumns = columns.filter(
    (column) => !existingColumns.has(column)
  );

  if (missingColumns.length > 0) {
    throw new Error(
      `Remote D1 schema is missing required columns for ${table}: ${missingColumns.join(', ')}`
    );
  }
}

async function main() {
  try {
    const databaseName = getDatabaseName();

    await checkWranglerExists();

    console.log(`Verifying remote D1 schema for ${databaseName}...`);

    const tables = await verifyTables(databaseName);

    for (const table of tables) {
      await verifyColumns(databaseName, table, REQUIRED_SCHEMA[table]);
      console.log(`  ok ${table}`);
    }

    console.log(`Remote D1 schema verified for ${databaseName}`);
  } catch (error) {
    console.error('Remote D1 schema verification failed:');
    console.error(error.message);
    process.exit(1);
  }
}

main();
