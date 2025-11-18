# Wrangler Multiple Databases Issue

## Problem

**Issue**: Wrangler creates multiple SQLite database files, and migrations applied to one don't affect the others.

**Root Cause**: Wrangler hashes database files based on HOW you access D1:
- `npx wrangler d1 execute bandcrawl-db --local` → Creates one database file
- `npx wrangler pages dev --d1 DB=bandcrawl-db` → Creates a DIFFERENT database file

This leads to schema mismatches where code expects columns that don't exist in the runtime database.

## Example Failure

```
1. Developer adds origin/genre columns
2. Runs: npx wrangler d1 execute bandcrawl-db --local --file=migrations/add_origin_genre.sql
3. Migration applied to Database A ✅
4. Starts: npx wrangler pages dev
5. Runtime uses Database B (no origin/genre columns) ❌
6. Update fails: "no such column: genre"
```

## Solution Implemented

### 1. Unified Migration Script

**Location**: `scripts/migrate-local-db.sh`

**What it does**:
- Finds ALL local database files in `.wrangler/state/v3/d1/`
- Applies ALL migrations to ALL databases
- Handles "already applied" errors gracefully
- Shows final schema for verification

**Usage**:
```bash
npm run migrate:local
```

**Output Example**:
```
🔧 Local Database Migration Script
==================================

📦 Found 2 local database file(s)

📄 Found 2 migration file(s):
  - add_origin_genre_to_bands.sql
  - add_description_photo_to_bands.sql

🚀 Applying migrations...

📦 Database: 8a7693927811007ff812b96567df0362797566c2acf571241d041866120b7a54.sqlite
  ✅ add_origin_genre_to_bands.sql
  ✅ add_description_photo_to_bands.sql
  📋 Final schema:
     id (INTEGER)
     event_id (INTEGER)
     venue_id (INTEGER)
     name (TEXT)
     start_time (TEXT)
     end_time (TEXT)
     url (TEXT)
     created_at (TEXT)
     origin (TEXT)
     genre (TEXT)
     description (TEXT)
     photo_url (TEXT)

📦 Database: f203ed0592165ec4f3b8e2e8ae4290d6f715c563ac7f21131fc6c0f75c8cdd56.sqlite
  ✅ add_origin_genre_to_bands.sql
  ✅ add_description_photo_to_bands.sql
  📋 Final schema:
     (same as above)

✅ Migration complete!
```

### 2. Multi-Database Validation

**Updated**: `scripts/validate-db-schema.js`

**What changed**:
- Now validates ALL database files, not just one
- Shows which specific database file has issues
- Clear error messages indicating which database needs migration

**Usage**:
```bash
npm run validate:schema
```

**Output Example** (all databases valid):
```
🔍 Validating database schema...

📦 Found 2 local database file(s)

Checking: 8a7693927811007ff812b96567df0362797566c2acf571241d041866120b7a54.sqlite
  ✅ bands: All 12 columns present
  ✅ venues: All 3 columns present
  ✅ events: All 6 columns present

Checking: f203ed0592165ec4f3b8e2e8ae4290d6f715c563ac7f21131fc6c0f75c8cdd56.sqlite
  ✅ bands: All 12 columns present
  ✅ venues: All 3 columns present
  ✅ events: All 6 columns present

✅ Schema validation PASSED - All database files match expected schema
```

**Output Example** (mismatch detected):
```
🔍 Validating database schema...

📦 Found 2 local database file(s)

Checking: f203ed0592165ec4f3b8e2e8ae4290d6f715c563ac7f21131fc6c0f75c8cdd56.sqlite
  ❌ bands: Missing columns: origin, genre
     Expected: id, event_id, venue_id, name, start_time, end_time, url, created_at, origin, genre, description, photo_url
     Actual:   id, event_id, venue_id, name, start_time, end_time, url, created_at

❌ Schema validation FAILED

💡 To fix schema issues:
   1. Run: bash scripts/migrate-local-db.sh
   2. Re-run this validation: npm run validate:schema
   3. Restart wrangler if it's running
```

## Correct Workflow

### Adding New Database Columns

**Old (Wrong) Way**:
```bash
# ❌ Only migrates one database file
npx wrangler d1 execute bandcrawl-db --local --file=migrations/new_migration.sql
```

**New (Correct) Way**:
```bash
# ✅ Migrates ALL database files
npm run migrate:local
```

### Development Workflow

```bash
# 1. Make schema changes
vim database/migrations/add_new_columns.sql

# 2. Apply to ALL local databases
npm run migrate:local

# 3. Verify all databases updated
npm run validate:schema

# 4. Restart wrangler (if running)
pkill -f "wrangler pages dev"
npx wrangler pages dev frontend/dist --port 8788 --d1 DB=bandcrawl-db

# 5. Build runs validation automatically
npm run build
```

### Before Deployment

```bash
# Validation runs automatically during build
npm run build  # Fails if any database has schema mismatch

# If validation fails:
npm run migrate:local     # Fix all databases
npm run validate:schema   # Verify fix
npm run build            # Try again
```

## Prevention Mechanisms

### 1. Automatic Validation Before Build

**Package.json**:
```json
{
  "scripts": {
    "build": "npm run validate:schema && vite build"
  }
}
```

Build fails if ANY local database has schema mismatch.

### 2. Clear Error Messages

Validation errors now:
- Show which database file has issues
- List exact missing columns
- Provide clear fix instructions

### 3. Unified Migration Tool

Single command migrates all databases:
```bash
npm run migrate:local
```

No need to remember complex wrangler commands or worry about which database file to target.

## Why Multiple Databases Exist

Wrangler creates different database files for different access patterns:

1. **`wrangler d1 execute`**: Uses database_id from wrangler.toml to create hash
2. **`wrangler pages dev`**: Uses command-line binding to create hash
3. **Different workers**: Each worker configuration may use different hashes

**Hash Formula**: Based on binding name + configuration + access method

**File Location**: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/{hash}.sqlite`

## Related Files

- `scripts/migrate-local-db.sh` - Unified migration script
- `scripts/validate-db-schema.js` - Multi-database validation
- `database/migrations/` - All migration SQL files
- `.wrangler/state/v3/d1/` - Local database files
- `package.json` - Commands: migrate:local, validate:schema

## Troubleshooting

### Problem: "Failed to update band: no such column: genre"

**Cause**: Runtime database missing columns

**Fix**:
```bash
npm run migrate:local      # Migrate all databases
npm run validate:schema    # Verify
# Restart wrangler
```

### Problem: Build failing with schema validation error

**Cause**: At least one database file has wrong schema

**Fix**:
```bash
npm run migrate:local      # Fix all databases
npm run validate:schema    # Verify
npm run build             # Build should now succeed
```

### Problem: Migrations keep saying "already applied"

**Cause**: Migrations ARE applied, this is normal

**Explanation**: The migration script is idempotent - it's safe to run multiple times. "Already applied" means the column exists, which is what you want.

## Best Practices

1. **Always use `npm run migrate:local`** instead of direct wrangler commands
2. **Run `npm run validate:schema`** after migrations
3. **Restart wrangler** after migrations for clean state
4. **Commit migrations** to git so team stays in sync
5. **Document schema changes** in migration file comments

## Future Improvements

Potential enhancements:
- Detect which database wrangler pages dev actually uses
- Auto-migrate before starting wrangler
- Track applied migrations in database
- Warn when databases have different schemas
- Auto-cleanup old database files
