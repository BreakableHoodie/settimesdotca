#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_DIR="$ROOT_DIR/.dev"
PID_FILE="$DEV_DIR/wrangler-dev.pid"
LOG_FILE="$DEV_DIR/wrangler-dev.log"

if [[ ! -f "$PID_FILE" ]]; then
  echo "wrangler dev: not running (no PID file)"
  exit 1
fi

pid="$(cat "$PID_FILE")"
if [[ -z "$pid" ]]; then
  echo "wrangler dev: PID file empty"
  exit 1
fi

if kill -0 "$pid" 2>/dev/null; then
  echo "wrangler dev: running (pid: $pid)"
  echo "log: $LOG_FILE"
  exit 0
fi

echo "wrangler dev: not running (stale PID $pid)"
exit 1
