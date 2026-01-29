#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_DIR="$PROJECT_ROOT/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
OUT_FILE="$PROJECT_ROOT/database/seed-production.sql"

echo "=== Exporting local D1 data ==="

if [ ! -d "$DB_DIR" ]; then
  echo "Database directory not found. Start wrangler first:"
  echo "  npm --prefix frontend run build"
  echo "  npx wrangler pages dev frontend/dist --port 8788"
  exit 1
fi

DB_FILE=$(ls -S "$DB_DIR"/*.sqlite 2>/dev/null | head -1 || true)
if [ -z "$DB_FILE" ]; then
  echo "No database files found. Start wrangler first:"
  echo "  npm --prefix frontend run build"
  echo "  npx wrangler pages dev frontend/dist --port 8788"
  exit 1
fi

table_exists() {
  local table="$1"
  sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='$table';" | grep -q "$table"
}

column_exists() {
  local table="$1"
  local column="$2"
  sqlite3 "$DB_FILE" "PRAGMA table_info($table);" | awk -F'|' '{print $2}' | grep -qx "$column"
}

TABLES=("venues" "band_profiles" "events" "performances")
CLEAR_ORDER=("performances" "events" "band_profiles" "venues")

echo "-- Seed exported from local D1 on $(date -u +"%Y-%m-%dT%H:%M:%SZ")" > "$OUT_FILE"
echo "PRAGMA foreign_keys=OFF;" >> "$OUT_FILE"
echo "BEGIN;" >> "$OUT_FILE"

for table in "${CLEAR_ORDER[@]}"; do
  if table_exists "$table"; then
    echo "DELETE FROM $table;" >> "$OUT_FILE"
  fi
done

for table in "${TABLES[@]}"; do
  if table_exists "$table"; then
    sqlite3 "$DB_FILE" <<SQL >> "$OUT_FILE"
.mode insert $table
SELECT * FROM $table;
SQL
  fi
done

if table_exists "events"; then
  echo "UPDATE events SET is_published = 0;" >> "$OUT_FILE"
  if column_exists "events" "created_by_user_id"; then
    echo "UPDATE events SET created_by_user_id = NULL, updated_by_user_id = NULL;" >> "$OUT_FILE"
  fi
fi

if table_exists "venues" && column_exists "venues" "created_by_user_id"; then
  echo "UPDATE venues SET created_by_user_id = NULL, updated_by_user_id = NULL;" >> "$OUT_FILE"
fi

if table_exists "band_profiles" && column_exists "band_profiles" "created_by_user_id"; then
  echo "UPDATE band_profiles SET created_by_user_id = NULL;" >> "$OUT_FILE"
fi

if table_exists "performances" && column_exists "performances" "created_by_user_id"; then
  echo "UPDATE performances SET created_by_user_id = NULL, updated_by_user_id = NULL;" >> "$OUT_FILE"
fi

echo "COMMIT;" >> "$OUT_FILE"
echo "PRAGMA foreign_keys=ON;" >> "$OUT_FILE"

echo ""
echo "✅ Export complete:"
echo "  $OUT_FILE"
