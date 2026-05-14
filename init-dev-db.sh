#!/bin/bash
set -euo pipefail
# Build the frontend, start wrangler pages dev, and initialize the local D1 database

WRANGLER_BIN="./frontend/node_modules/.bin/wrangler"
LOG_FILE="/tmp/wrangler-init.log"

# Ensure background server is cleaned up on exit or error
SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT ERR INT TERM

if [ ! -x "$WRANGLER_BIN" ]; then
  echo "ERROR: Wrangler binary not found at $WRANGLER_BIN"
  echo "Run ./setup.sh first."
  exit 1
fi

echo "Building frontend bundle..."
npm --prefix frontend run build

echo "Starting Wrangler and initializing database..."

# Start the server in the background
"$WRANGLER_BIN" pages dev frontend/dist --port=8788 --persist-to .wrangler/state > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

echo "Server started with PID $SERVER_PID"
echo "Waiting for database to be created..."

# Wait for the database file to be created
DB_FILE=""
for i in {1..30}; do
  DB_FILE=$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -name "*.sqlite" 2>/dev/null | head -1)
  if [ -n "$DB_FILE" ]; then
    echo "Found database: $DB_FILE"
    break
  fi
  sleep 1
done

if [ -z "$DB_FILE" ]; then
  echo "ERROR: No database file found after 30 seconds"
  exit 1
fi

echo "Bootstrapping local data..."
./scripts/setup-local-db.sh

echo ""
echo "✓ Database initialized"
echo "✓ Server is running on http://localhost:8788"
echo ""
echo "Press Ctrl+C to stop the server"
echo "Server logs: $LOG_FILE"
echo ""

# Keep the script running so the server continues
# Disable the EXIT trap since we want the server to keep running until interrupted
trap - EXIT
wait $SERVER_PID
