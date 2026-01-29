#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_DIR="$ROOT_DIR/.dev"
PID_FILE="$DEV_DIR/wrangler-dev.pid"
LOG_FILE="$DEV_DIR/wrangler-dev.log"

mkdir -p "$DEV_DIR"

if [[ -f "$PID_FILE" ]]; then
  existing_pid="$(cat "$PID_FILE")"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    echo "Wrangler dev already running (pid: $existing_pid)"
    echo "Log: $LOG_FILE"
    exit 0
  fi
fi

echo "Building frontend..."
npm --prefix "$ROOT_DIR/frontend" run build

echo "Starting wrangler pages dev on port 8788..."
cd "$ROOT_DIR"
nohup npx wrangler pages dev frontend/dist --port 8788 > "$LOG_FILE" 2>&1 &
pid="$!"
echo "$pid" > "$PID_FILE"

echo "Wrangler dev started (pid: $pid)"
echo "Log: $LOG_FILE"
