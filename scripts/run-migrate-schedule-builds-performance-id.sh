#!/usr/bin/env bash
set -euo pipefail

mode="${1:---local}"
command=""

case "$mode" in
  --local|--remote)
    command="$mode"
    ;;
  --check)
    echo "Checking schedule_builds columns..."
    npx wrangler d1 execute settimes-db --command "PRAGMA table_info(schedule_builds);" --local
    exit 0
    ;;
  *)
    echo "Usage: $0 [--local|--remote|--check]"
    echo "  --local   Run migration against local D1 (default)"
    echo "  --remote  Run migration against remote D1"
    echo "  --check   Show schedule_builds columns (local only)"
    exit 1
    ;;
esac

echo "Checking schedule_builds columns..."
npx wrangler d1 execute settimes-db --command "PRAGMA table_info(schedule_builds);" "$command"
echo "If band_id exists and performance_id does not, run migration."
echo "Applying migration..."
npx wrangler d1 execute settimes-db --file=scripts/migrate-schedule-builds-performance-id.sql "$command"
