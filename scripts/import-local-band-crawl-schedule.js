#!/usr/bin/env node

/**
 * Import a local-only Band Crawl schedule JSON into the local D1 sqlite database.
 *
 * Usage:
 *   node scripts/import-local-band-crawl-schedule.js --date 2026-02-15
 *   node scripts/import-local-band-crawl-schedule.js --date 2026-02-15 --slug lwbc-vol-14
 *   node scripts/import-local-band-crawl-schedule.js --date 2026-02-15 --allow-invalid
 *
 * Notes:
 * - This script only touches the local sqlite database under .wrangler.
 * - It never publishes the event (is_published = 0).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);

const getArgValue = (flag) => {
  const withEquals = args.find((arg) => arg.startsWith(`${flag}=`));
  if (withEquals) {
    return withEquals.split('=').slice(1).join('=');
  }
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
};

const schedulePath = getArgValue('--file') || 'band_crawl_schedule.json';
const overrideDate = getArgValue('--date');
const overrideSlug = getArgValue('--slug');
const allowInvalid = args.includes('--allow-invalid');
const dryRun = args.includes('--dry-run');

const PROJECT_ROOT = process.cwd();
const DB_DIR = path.join(
  PROJECT_ROOT,
  '.wrangler',
  'state',
  'v3',
  'd1',
  'miniflare-D1DatabaseObject',
);

const sqlEscape = (value) => {
  if (value == null) return 'NULL';
  const text = String(value);
  return `'${text.replace(/'/g, "''")}'`;
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeName = (value) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

const normalizeTime = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    if (allowInvalid) return raw;
    throw new Error(`Invalid time format: "${raw}"`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    if (allowInvalid) return raw;
    throw new Error(`Invalid time value: "${raw}"`);
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const runSql = (dbFile, sql) => {
  return execFileSync('sqlite3', ['-batch', dbFile, sql], {
    encoding: 'utf8',
  }).trim();
};

const findDbFile = () => {
  if (!fs.existsSync(DB_DIR)) {
    throw new Error(
      'Local database directory not found. Start wrangler dev first to create it.',
    );
  }
  const files = fs
    .readdirSync(DB_DIR)
    .filter((file) => file.endsWith('.sqlite'))
    .map((file) => path.join(DB_DIR, file));
  if (!files.length) {
    throw new Error(
      'No local sqlite files found. Start wrangler dev first to create one.',
    );
  }
  return files
    .map((file) => ({ file, size: fs.statSync(file).size }))
    .sort((a, b) => b.size - a.size)[0].file;
};

const resolveEventDate = (scheduleDate) => {
  if (overrideDate) return overrideDate;
  if (!scheduleDate) return null;
  const trimmed = String(scheduleDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
};

const main = () => {
  const absoluteSchedulePath = path.resolve(PROJECT_ROOT, schedulePath);
  if (!fs.existsSync(absoluteSchedulePath)) {
    throw new Error(`Schedule file not found: ${absoluteSchedulePath}`);
  }

  const schedule = JSON.parse(fs.readFileSync(absoluteSchedulePath, 'utf8'));
  if (!schedule || typeof schedule !== 'object') {
    throw new Error('Schedule JSON is empty or invalid.');
  }

  const eventName = schedule.event?.trim();
  if (!eventName) {
    throw new Error('Schedule JSON missing "event" name.');
  }

  const eventDate = resolveEventDate(schedule.date);
  if (!eventDate) {
    throw new Error(
      'Event date must be provided as YYYY-MM-DD (use --date).',
    );
  }

  const baseSlug = overrideSlug || slugify(eventName);
  if (!baseSlug) {
    throw new Error('Unable to derive a slug from the event name.');
  }

  const dbFile = findDbFile();

  let slug = baseSlug;
  let suffix = 0;
  while (runSql(dbFile, `SELECT id FROM events WHERE slug = ${sqlEscape(slug)} LIMIT 1;`)) {
    suffix += 1;
    slug = `${baseSlug}-local${suffix === 1 ? '' : `-${suffix}`}`;
  }

  const venues = Array.isArray(schedule.venues) ? schedule.venues : [];
  if (!venues.length) {
    throw new Error('Schedule JSON has no venues to import.');
  }

  const venueNames = new Set();
  const performances = [];
  const invalidTimes = [];

  venues.forEach((venue) => {
    const venueName = venue?.name?.trim();
    if (!venueName) return;
    venueNames.add(venueName);
    const sets = Array.isArray(venue.sets) ? venue.sets : [];
    sets.forEach((set) => {
      const bandName = set?.band?.trim();
      if (!bandName) return;
      let startTime = null;
      let endTime = null;
      try {
        startTime = normalizeTime(set?.start);
        endTime = normalizeTime(set?.end);
      } catch (error) {
        invalidTimes.push(error.message);
        if (!allowInvalid) return;
        startTime = set?.start?.trim() || null;
        endTime = set?.end?.trim() || null;
      }
      performances.push({
        bandName,
        venueName,
        startTime,
        endTime,
      });
    });
  });

  if (invalidTimes.length && !allowInvalid) {
    throw new Error(
      `Schedule contains invalid times. Fix them or re-run with --allow-invalid.\n${invalidTimes.join('\n')}`,
    );
  }

  if (!performances.length) {
    throw new Error('No performances found to import.');
  }

  if (dryRun) {
    console.log('Dry run: no database changes were made.');
    console.log(`Event: ${eventName}`);
    console.log(`Date: ${eventDate}`);
    console.log(`Slug: ${slug}`);
    console.log(`Venues: ${venueNames.size}`);
    console.log(`Performances: ${performances.length}`);
    if (invalidTimes.length) {
      console.log(`Warnings: ${invalidTimes.length} invalid time(s) detected.`);
    }
    return;
  }

  // Insert event (draft only)
  runSql(
    dbFile,
    `INSERT INTO events (name, date, slug, is_published, city) VALUES (${sqlEscape(eventName)}, ${sqlEscape(eventDate)}, ${sqlEscape(slug)}, 0, ${sqlEscape(schedule.location || null)});`,
  );
  const eventId = runSql(
    dbFile,
    `SELECT id FROM events WHERE slug = ${sqlEscape(slug)} LIMIT 1;`,
  );

  // Ensure venues exist
  const venueIdByName = new Map();
  venueNames.forEach((name) => {
    const existing = runSql(
      dbFile,
      `SELECT id FROM venues WHERE name = ${sqlEscape(name)} LIMIT 1;`,
    );
    if (existing) {
      venueIdByName.set(name, Number(existing));
      return;
    }
    runSql(
      dbFile,
      `INSERT INTO venues (name, city) VALUES (${sqlEscape(name)}, ${sqlEscape(schedule.location || null)});`,
    );
    const venueId = runSql(dbFile, 'SELECT last_insert_rowid();');
    venueIdByName.set(name, Number(venueId));
  });

  // Ensure band profiles exist
  const bandIdByNormalized = new Map();
  performances.forEach((performance) => {
    const normalized = normalizeName(performance.bandName);
    if (!normalized) return;
    if (bandIdByNormalized.has(normalized)) return;
    const existing = runSql(
      dbFile,
      `SELECT id FROM band_profiles WHERE name_normalized = ${sqlEscape(normalized)} LIMIT 1;`,
    );
    if (existing) {
      bandIdByNormalized.set(normalized, Number(existing));
      return;
    }
    runSql(
      dbFile,
      `INSERT INTO band_profiles (name, name_normalized) VALUES (${sqlEscape(performance.bandName)}, ${sqlEscape(normalized)});`,
    );
    const bandId = runSql(dbFile, 'SELECT last_insert_rowid();');
    bandIdByNormalized.set(normalized, Number(bandId));
  });

  // Insert performances
  performances.forEach((performance) => {
    const bandId = bandIdByNormalized.get(normalizeName(performance.bandName));
    const venueId = venueIdByName.get(performance.venueName);
    if (!bandId || !venueId) return;
    runSql(
      dbFile,
      `INSERT INTO performances (event_id, band_profile_id, venue_id, start_time, end_time) VALUES (${eventId}, ${bandId}, ${venueId}, ${sqlEscape(performance.startTime)}, ${sqlEscape(performance.endTime)});`,
    );
  });

  console.log('Local schedule import complete.');
  console.log(`Event ID: ${eventId}`);
  console.log(`Slug: ${slug}`);
  console.log(`Venues imported: ${venueNames.size}`);
  console.log(`Performances imported: ${performances.length}`);
  if (invalidTimes.length) {
    console.log(`Warnings: ${invalidTimes.length} invalid time(s) detected.`);
  }
};

try {
  main();
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
}
