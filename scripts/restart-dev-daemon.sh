#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"$SCRIPT_DIR/stop-dev-daemon.sh"
"$SCRIPT_DIR/start-dev-daemon.sh"
