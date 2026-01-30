#!/usr/bin/env node
/**
 * Migration script to import existing bands.json into D1 database
 *
 * Usage:
 *   node database/migrate-bands-json.js
 *
 * This script will:
 * 1. Read frontend/public/bands.json
 * 2. Extract unique venues
 * 3. Create a new event
 * 4. Import all bands with proper relationships
 * 5. Generate SQL that can be executed via wrangler
 *
 * The script outputs SQL to stdout which can be saved and executed:
 *   node database/migrate-bands-json.js > database/migration.sql
 *   wrangler d1 execute bandcrawl-db --file=database/migration.sql
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function escapeSQL(str) {
  if (str === null || str === undefined) return "NULL";
  return `'${String(str).replace(/'/g, "''")}'`;
}

async function main() {
  try {
    // Read bands.json
    const bandsPath = path.join(
      __dirname,
      "..",
      "frontend",
      "public",
      "bands.json",
    );

    if (!fs.existsSync(bandsPath)) {
      console.error(`Error: bands.json not found at ${bandsPath}`);
      process.exit(1);
    }

    const bandsData = JSON.parse(fs.readFileSync(bandsPath, "utf8"));

    if (!Array.isArray(bandsData) || bandsData.length === 0) {
      console.error("Error: bands.json is empty or invalid");
      process.exit(1);
    }

    console.error(`\n=== Long Weekend Band Crawl - Database Migration ===\n`);
    console.error(`Found ${bandsData.length} bands in bands.json\n`);

    // Get event details from user
    const eventName = await question(
      'Event name (e.g., "Long Weekend Band Crawl - October 2025"): ',
    );
    const eventDate =
      bandsData[0]?.date || (await question("Event date (YYYY-MM-DD): "));
    const eventSlug = await question('Event slug (e.g., "october-2025"): ');
    const shouldPublish = await question("Publish event? (y/n): ");

    rl.close();

    const isPublished = shouldPublish.toLowerCase() === "y" ? 1 : 0;

    // Extract unique venues
    const venueNames = [...new Set(bandsData.map((b) => b.venue))];
    const venues = venueNames.map((name, index) => ({
      id: index + 1,
      name,
    }));

    console.error(`\nExtracted ${venues.length} unique venues`);
    console.error(
      `Event will be ${isPublished ? "published" : "unpublished"}\n`,
    );
    console.error("Generating SQL...\n");

    // Generate SQL
    const sql = [];

    // Add header
    sql.push("-- Migration: Import bands.json into D1 database");
    sql.push(`-- Generated: ${new Date().toISOString()}`);
    sql.push("-- Event: " + eventName);
    sql.push("");

    // Insert event
    sql.push("-- Insert event");
    sql.push(
      `INSERT INTO events (name, date, slug, is_published) VALUES (${escapeSQL(
        eventName,
      )}, ${escapeSQL(eventDate)}, ${escapeSQL(eventSlug)}, ${isPublished});`,
    );
    sql.push("");

    // Insert venues
    sql.push("-- Insert venues");
    venues.forEach((venue) => {
      sql.push(
        `INSERT INTO venues (name, address) VALUES (${escapeSQL(
          venue.name,
        )}, NULL);`,
      );
    });
    sql.push("");

    // Insert bands
    sql.push("-- Insert bands");
    sql.push(
      "-- Note: event_id = 1 assumes this is the first event in the database",
    );
    sql.push("-- Adjust if needed based on your database state");
    sql.push("");

    bandsData.forEach((band) => {
      const venue = venues.find((v) => v.name === band.venue);
      const venueId = venue ? venue.id : 1;

      const eventId = 1; // Assumes this is the first event
      const url = band.url || null;

      sql.push(
        `INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url) VALUES (${eventId}, ${venueId}, ${escapeSQL(
          band.name,
        )}, ${escapeSQL(band.startTime)}, ${escapeSQL(
          band.endTime,
        )}, ${escapeSQL(url)});`,
      );
    });

    // Output SQL
    console.log(sql.join("\n"));

    console.error("\n=== Migration SQL Generated Successfully ===\n");
    console.error("To execute this migration:");
    console.error("  1. Save the output to a file:");
    console.error(
      "     node database/migrate-bands-json.js > database/migration.sql",
    );
    console.error("");
    console.error("  2. Execute with wrangler:");
    console.error(
      "     wrangler d1 execute bandcrawl-db --file=database/migration.sql",
    );
    console.error("");
    console.error("  3. Or execute locally for testing:");
    console.error(
      "     wrangler d1 execute bandcrawl-db --local --file=database/migration.sql",
    );
    console.error("");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
