// Read or seed the D1 that the app under test uses, for flows whose token is
// only ever emailed (password reset, activation) (#1292). Previews and local E2E have no email provider, so the
// token is in the database and nowhere else.
//
// Two targets, never production:
//   E2E_D1_REMOTE=1  the edge job's scratch D1, by the SAME constant the reset
//                    script's safety check uses (needs CLOUDFLARE_* in env);
//   otherwise        the local wrangler state (--local, persisted to
//                    E2E_D1_PERSIST_TO or .wrangler/state, the directory
//                    .github/actions/e2e-env seeds and serves).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SCRATCH_D1_NAME } from "../../scripts/reset-e2e-db.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const wrangler = join(root, "frontend/node_modules/.bin/wrangler");
// The wrangler.toml binding name; only ever used with --local.
const LOCAL_D1_NAME = "settimes-production-db";

export const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

export function d1(sql) {
  const args =
    process.env.E2E_D1_REMOTE === "1"
      ? ["d1", "execute", SCRATCH_D1_NAME, "--remote", "--json", "--command", sql]
      : [
          "d1",
          "execute",
          LOCAL_D1_NAME,
          "--local",
          "--json",
          "--command",
          sql,
          "--persist-to",
          process.env.E2E_D1_PERSIST_TO || join(root, ".wrangler/state"),
        ];
  // Bounded: a stalled remote call must fail this spec, not hold the job to its
  // own timeout and skip the preview teardown after it.
  const output = execFileSync(wrangler, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
    killSignal: "SIGKILL",
    maxBuffer: 10 * 1024 * 1024,
  });
  const json = output.match(/\[[\s\S]*\]/u)?.[0];
  if (!json) throw new Error(`wrangler returned no JSON for: ${sql}`);
  const results = JSON.parse(json).at(-1)?.results;
  if (!Array.isArray(results)) throw new Error(`wrangler returned no result rows for: ${sql}`);
  return results;
}
