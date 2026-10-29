#!/usr/bin/env bash
# Prints the MCP Authorization header for Claude Code's `headersHelper`, read
# from this directory's gitignored .dev.vars at connect time, so the secret is
# never written into ~/.claude.json or any other client config.
#
# Node's util.parseEnv reads the file the way dotenv (and so wrangler) does:
# `export`, quotes, spaces around `=` and inline comments. JSON.stringify
# escapes the value, and the secret never appears in argv.
set -euo pipefail
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DEV_VARS="$dir/.dev.vars" node -e '
const fs = require("node:fs");
const { parseEnv } = require("node:util");
const file = process.env.MCP_DEV_VARS;
if (!fs.existsSync(file)) {
  console.error("No .dev.vars at " + file);
  process.exit(1);
}
const secret = parseEnv(fs.readFileSync(file, "utf8")).SHARED_SECRET;
if (!secret) {
  console.error("SHARED_SECRET not found in " + file);
  process.exit(1);
}
process.stdout.write(JSON.stringify({ Authorization: "Bearer " + secret }) + "\n");
'
