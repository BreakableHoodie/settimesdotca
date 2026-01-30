#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SEED_FILE="$PROJECT_ROOT/database/seed-production.sql"
DB_NAME="settimes-production-db"

if [ ! -f "$SEED_FILE" ]; then
  echo "Seed file not found: $SEED_FILE"
  echo "Run scripts/export-local-data.sh first."
  exit 1
fi

if ! command -v wrangler &> /dev/null; then
  echo "❌ Error: 'wrangler' is not installed."
  echo "   Please run: npm install -g wrangler"
  exit 1
fi

echo "🚀 Importing local data into production D1"
echo "Database: $DB_NAME"
echo "Seed file: $SEED_FILE"
echo ""
read -p "This will overwrite core data (events/venues/bands). Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

wrangler d1 execute "$DB_NAME" --file="$SEED_FILE" --remote

echo ""
echo "✅ Import complete."
