#!/bin/bash

# Local Database Migration Script
#
# Problem: Wrangler creates multiple database files depending on how you access D1:
# - `wrangler d1 execute` uses one database file
# - `wrangler pages dev` uses a different database file
#
# Solution: Apply migrations to ALL local database files to ensure consistency

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WRANGLER_DB_DIR="$PROJECT_ROOT/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"

echo "🔧 Local Database Migration Script"
echo "=================================="
echo ""

# Check if .wrangler directory exists
if [ ! -d "$WRANGLER_DB_DIR" ]; then
    echo "❌ No local databases found at: $WRANGLER_DB_DIR"
    echo "   Run './init-dev-db.sh' or start Wrangler first:"
    echo "   ./frontend/node_modules/.bin/wrangler pages dev frontend/dist --port 8788 --persist-to .wrangler/state"
    exit 1
fi

# Find all SQLite database files
DB_FILES=$(find "$WRANGLER_DB_DIR" -name "*.sqlite" -type f 2>/dev/null)

if [ -z "$DB_FILES" ]; then
    echo "❌ No .sqlite files found in $WRANGLER_DB_DIR"
    exit 1
fi

DB_COUNT=$(echo "$DB_FILES" | wc -l | tr -d ' ')
echo "📦 Found $DB_COUNT local database file(s)"
echo ""

# Get all migration files (exclude legacy/rollback and destructive local resets)
MIGRATION_FILES=$(find "$PROJECT_ROOT/migrations" -maxdepth 1 -name "*.sql" -type f | sort | grep -v "0002_migration-single-org.sql")

if [ -z "$MIGRATION_FILES" ]; then
    echo "❌ No migration files found in migrations/"
    exit 1
fi

MIGRATION_COUNT=$(echo "$MIGRATION_FILES" | wc -l | tr -d ' ')
echo "📄 Found $MIGRATION_COUNT migration file(s):"
echo "$MIGRATION_FILES" | sed 's/^/  - /'
echo ""

# Apply each migration to each database
echo "🚀 Applying migrations..."
echo ""

for DB_FILE in $DB_FILES; do
    DB_NAME=$(basename "$DB_FILE")
    echo "📦 Database: $DB_NAME"

    for MIGRATION_FILE in $MIGRATION_FILES; do
        MIGRATION_NAME=$(basename "$MIGRATION_FILE")

        # Capture output once; || true prevents set -e from exiting on non-zero sqlite3 status
        RESULT=$(sqlite3 "$DB_FILE" < "$MIGRATION_FILE" 2>&1) || true
        if echo "$RESULT" | grep -q "duplicate column"; then
            echo "  ⏭️  $MIGRATION_NAME (already applied)"
        elif echo "$RESULT" | grep -q "error"; then
            echo "  ⚠️  $MIGRATION_NAME (error - may already be applied)"
        else
            echo "  ✅ $MIGRATION_NAME"
        fi
    done

    # Show final schema
    echo "  📋 Tables present:"
    sqlite3 "$DB_FILE" ".tables" | tr ' ' '\n' | sed '/^$/d' | sed 's/^/     /' | head -20
    echo ""
done

echo "✅ Migration complete!"
echo ""
echo "💡 Next steps:"
echo "   1. Run: npm run validate:schema"
echo "   2. Restart wrangler if it's running"
echo ""
