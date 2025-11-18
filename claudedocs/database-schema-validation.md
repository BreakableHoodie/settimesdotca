# Database Schema Validation

## Problem Addressed

**Issue**: Runtime errors due to database schema mismatches between code expectations and actual database state.

**Example**: The "Failed to update band" error occurred because the code tried to use `origin` and `genre` columns that weren't in the database yet. This should have been caught at build time, not at runtime.

## Solution Implemented

### Automatic Schema Validation

Created a proactive validation system that runs **before every build** to catch schema mismatches early.

#### Location
- **Script**: `scripts/validate-db-schema.js`
- **Runs**: Automatically before `npm run build` in frontend

#### What It Checks

Validates that the local D1 database has all expected columns for each table:

**bands table** (12 columns):
- id, event_id, venue_id, name, start_time, end_time, url, created_at
- origin, genre (added by migration)
- description, photo_url (added by migration)

**venues table** (3 columns):
- id, name, address

**events table** (6 columns):
- id, name, date, slug, is_published, created_at

#### How It Works

```bash
# Manual validation
npm run validate:schema

# Automatic during build (frontend)
npm run build  # Runs validation first

# Automatic during deploy
npm run deploy:dev   # Runs build which runs validation
npm run deploy:prod  # Runs build which runs validation
```

#### Output Examples

**✅ Success**:
```
🔍 Validating database schema...

✅ bands: All 12 columns present
✅ venues: All 3 columns present
✅ events: All 6 columns present

✅ Schema validation PASSED - All tables match expected schema
```

**❌ Failure**:
```
🔍 Validating database schema...

❌ bands: Missing columns: genre
   Expected: id, event_id, venue_id, name, start_time, end_time, url, created_at, origin, genre, description, photo_url
   Actual:   id, event_id, venue_id, name, start_time, end_time, url, created_at, origin, description, photo_url
   → Run migrations to add missing columns

❌ Schema validation FAILED

💡 To fix schema issues:
   1. Check database/migrations/ for available migrations
   2. Run: npx wrangler d1 execute bandcrawl-db --local --file=database/migrations/<migration>.sql
   3. Re-run this validation: npm run validate:schema
```

### When Schema Mismatches Are Caught

1. **Before build** - npm run build fails if schema is wrong
2. **Before deploy** - deploy fails if schema is wrong (since it runs build)
3. **Manual check** - npm run validate:schema can be run anytime

### Benefits

✅ **Catches issues at build time** instead of runtime
✅ **Clear error messages** show exactly what's missing
✅ **Prevents deployment** of code with schema mismatches
✅ **Saves debugging time** by failing fast with clear guidance
✅ **Documents schema** expectations in code

### Maintenance

When adding new columns to the database:

1. Create migration file in `database/migrations/`
2. Apply migration locally: `npx wrangler d1 execute bandcrawl-db --local --file=database/migrations/your_migration.sql`
3. Update `scripts/validate-db-schema.js` to expect the new columns
4. Run `npm run validate:schema` to verify
5. Commit both migration and updated validation script

### Related Files

- `scripts/validate-db-schema.js` - Validation script
- `package.json` - Root package with validation command
- `frontend/package.json` - Frontend package that runs validation before build
- `database/migrations/` - All database migrations

### Testing

To verify the validation catches issues:

1. Temporarily add a fake column to the expected schema in `validate-db-schema.js`
2. Run `npm run validate:schema` - should fail with clear error
3. Remove the fake column - should pass
4. Run `npm run build` - should validate then build successfully

This ensures the validation system is working correctly and will catch real schema mismatches.
