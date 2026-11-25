// Starts the repository's scheduled GitHub workflows on time (#1489).
//
// Every URL is a complete string literal chosen by the cron expression, never
// built from input: this Worker's only outbound address is api.github.com.

/** cron expression (as in wrangler.toml) -> workflow file and its dispatch URL. */
export const CRON_WORKFLOWS = {
  "0 * * * *": {
    workflow: "site-health.yml",
    url: "https://api.github.com/repos/BreakableHoodie/settimesdotca/actions/workflows/site-health.yml/dispatches",
  },
  "*/30 * * * *": {
    workflow: "deploy-reconcile.yml",
    url: "https://api.github.com/repos/BreakableHoodie/settimesdotca/actions/workflows/deploy-reconcile.yml/dispatches",
  },
  "17 7 * * *": {
    workflow: "scheduled-jobs.yml",
    url: "https://api.github.com/repos/BreakableHoodie/settimesdotca/actions/workflows/scheduled-jobs.yml/dispatches",
  },
};

const EXCERPT_LENGTH = 200;

export async function dispatchWorkflow(cron, env) {
  const target = Object.hasOwn(CRON_WORKFLOWS, cron) ? CRON_WORKFLOWS[cron] : undefined;
  if (!target) {
    console.error(`[settimes-cron] no workflow mapped to cron ${JSON.stringify(cron)}`);
    throw new Error(`Unmapped cron expression: ${cron}`);
  }
  if (!env?.GH_DISPATCH_TOKEN) {
    console.error(`[settimes-cron] GH_DISPATCH_TOKEN is not set; cannot dispatch ${target.workflow}`);
    throw new Error("GH_DISPATCH_TOKEN is not configured");
  }

  const response = await globalThis.fetch(target.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "settimes-cron",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (response.status !== 204) {
    let excerpt;
    try {
      excerpt = (await response.text()).slice(0, EXCERPT_LENGTH);
    } catch {
      excerpt = "(response body unreadable)";
    }
    console.error(`[settimes-cron] dispatch of ${target.workflow} failed: HTTP ${response.status} ${excerpt}`);
    throw new Error(`workflow_dispatch for ${target.workflow} failed with HTTP ${response.status}`);
  }
  return target.workflow;
}

export default {
  async scheduled(event, env) {
    await dispatchWorkflow(event.cron, env);
  },
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
