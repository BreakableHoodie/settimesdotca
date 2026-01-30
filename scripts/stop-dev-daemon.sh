#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_DIR="$ROOT_DIR/.dev"
PID_FILE="$DEV_DIR/wrangler-dev.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No PID file found at $PID_FILE"
  exit 0
fi

pid="$(cat "$PID_FILE")"
if [[ -z "$pid" ]]; then
  echo "PID file is empty. Removing."
  rm -f "$PID_FILE"
  exit 0
fi

if ! kill -0 "$pid" 2>/dev/null; then
  echo "Process $pid not running. Removing PID file."
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping wrangler dev (pid: $pid)..."
kill "$pid"

for _ in {1..20}; do
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Stopped."
    exit 0
  fi
  sleep 0.2
done

echo "Process still running; sending SIGKILL..."
kill -9 "$pid"
rm -f "$PID_FILE"
echo "Stopped."
