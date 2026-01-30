#!/bin/bash
# Initialize the local dev database for wrangler pages dev
echo "Starting server and initializing database..."

# Start the server in the background
npx wrangler pages dev frontend/dist --port=8788 --d1 DB=bandcrawl-db > /tmp/wrangler-init.log 2>&1 &
SERVER_PID=$!

echo "Server started with PID $SERVER_PID"
echo "Waiting for database to be created..."

# Wait for the database file to be created
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
  kill $SERVER_PID
  exit 1
fi

echo "Initializing schema..."
sqlite3 "$DB_FILE" < database/schema.sql 2>&1 | grep -v "^--" | head -20

echo "Seeding data..."
sqlite3 "$DB_FILE" < database/seed.sql 2>&1 | grep -v "^--" | head -20

echo ""
echo "✓ Database initialized"
echo "✓ Server is running on http://localhost:8788"
echo ""
echo "Press Ctrl+C to stop the server"
echo "Server logs: /tmp/wrangler-init.log"
echo ""

# Keep the script running so the server continues
wait $SERVER_PID
