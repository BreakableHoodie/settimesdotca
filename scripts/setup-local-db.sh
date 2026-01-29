#!/bin/bash
# Setup local D1 database for development
# Run this whenever you need to reset or initialize the local database

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_DIR="$PROJECT_ROOT/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"

echo "=== Setting up local D1 database ==="

# Find the most recently modified sqlite database
if [ -d "$DB_DIR" ]; then
    # Find largest database file (most likely to be the active one)
    DB_FILE=$(ls -S "$DB_DIR"/*.sqlite 2>/dev/null | head -1)

    if [ -z "$DB_FILE" ]; then
        echo "No database files found. Start wrangler first to create one:"
        echo "  npx wrangler pages dev frontend/dist --port 8788"
        exit 1
    fi

    echo "Found database: $DB_FILE"
else
    echo "Database directory not found. Start wrangler first to create one:"
    echo "  npx wrangler pages dev frontend/dist --port 8788"
    exit 1
fi

# Run the complete setup SQL
echo "Running setup-complete.sql..."
sqlite3 "$DB_FILE" < "$PROJECT_ROOT/database/setup-complete.sql"

echo ""
echo "Updating local account passwords..."

if [ -z "$LOCAL_ADMIN_PASSWORD" ]; then
    LOCAL_ADMIN_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")
fi
if [ -z "$LOCAL_EDITOR_PASSWORD" ]; then
    LOCAL_EDITOR_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")
fi
if [ -z "$LOCAL_VIEWER_PASSWORD" ]; then
    LOCAL_VIEWER_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))")
fi

ADMIN_HASH=$(node "$PROJECT_ROOT/scripts/hash-password.mjs" "$LOCAL_ADMIN_PASSWORD")
EDITOR_HASH=$(node "$PROJECT_ROOT/scripts/hash-password.mjs" "$LOCAL_EDITOR_PASSWORD")
VIEWER_HASH=$(node "$PROJECT_ROOT/scripts/hash-password.mjs" "$LOCAL_VIEWER_PASSWORD")

sqlite3 "$DB_FILE" "UPDATE users SET password_hash = '$ADMIN_HASH' WHERE email = 'admin@settimes.ca';"
sqlite3 "$DB_FILE" "UPDATE users SET password_hash = '$EDITOR_HASH' WHERE email = 'editor@settimes.ca';"
sqlite3 "$DB_FILE" "UPDATE users SET password_hash = '$VIEWER_HASH' WHERE email = 'viewer@settimes.ca';"

echo ""
echo "=== Database setup complete ==="
echo ""
echo "Tables created:"
sqlite3 "$DB_FILE" ".tables"
echo ""
echo "Local accounts:"
echo "  admin@settimes.ca / $LOCAL_ADMIN_PASSWORD"
echo "  editor@settimes.ca / $LOCAL_EDITOR_PASSWORD"
echo "  viewer@settimes.ca / $LOCAL_VIEWER_PASSWORD"
