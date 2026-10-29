#!/usr/bin/env bash
# Prints the MCP Authorization header for Claude Code's `headersHelper`, read
# from this directory's gitignored .dev.vars at connect time, so the secret is
# never written into ~/.claude.json or any other client config.
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "$dir/.dev.vars" ]; then
  echo "No .dev.vars in $dir" >&2
  exit 1
fi
# Same tolerance as wrangler's dotenv parse: spaces around `=` and trailing
# space are allowed (a valid secret contains none).
secret="$(sed -n 's/^[[:space:]]*SHARED_SECRET[[:space:]]*=[[:space:]]*//p' "$dir/.dev.vars" | head -n 1 | sed 's/[[:space:]]*$//')"
# Strip one pair of surrounding quotes only; quotes inside the value are kept.
if [[ "$secret" =~ ^\"(.*)\"$ || "$secret" =~ ^\'(.*)\'$ ]]; then
  secret="${BASH_REMATCH[1]}"
fi
if [ -z "$secret" ]; then
  echo "SHARED_SECRET not found in $dir/.dev.vars" >&2
  exit 1
fi
# JSON.stringify escapes anything JSON-significant. The secret travels by
# environment, not argv, so it never shows in a process listing.
MCP_SECRET="$secret" node -e 'process.stdout.write(JSON.stringify({ Authorization: "Bearer " + process.env.MCP_SECRET }) + "\n")'
