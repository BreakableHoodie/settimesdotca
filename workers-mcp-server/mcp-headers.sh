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
secret="$(sed -n 's/^SHARED_SECRET=//p' "$dir/.dev.vars" | tr -d '"' | head -n 1)"
if [ -z "$secret" ]; then
  echo "SHARED_SECRET not found in $dir/.dev.vars" >&2
  exit 1
fi
printf '{"Authorization": "Bearer %s"}\n' "$secret"
