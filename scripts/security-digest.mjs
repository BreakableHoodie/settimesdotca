import { execFileSync } from "node:child_process";
import { cwd as currentWorkingDirectory } from "node:process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DAY_MS = 24 * 60 * 60 * 1000;
const ALERT_AGE_DAYS = 7;
const ANALYSIS_STALE_DAYS = 14;
// Scanners that MUST be uploading. Each maps to the tool names it may report
// under. A scanner with NO analysis at all is a problem, never a skip: the
// whole point is to catch a scanner that has stopped uploading (Semgrep's
// last upload was 2026-09-14 while its alerts sat frozen for weeks).
export const REQUIRED_SCANNERS = {
  CodeQL: ["CodeQL"],
  Semgrep: ["Semgrep OSS", "Semgrep PRO", "Semgrep"],
};
const ANALYSIS_TOOLS = Object.values(REQUIRED_SCANNERS).flat();
const REPOSITORY = "BreakableHoodie/settimesdotca";

// npm audit advisories that are KNOWN AND DELIBERATELY ACCEPTED, each with its
// reason. Everything else opens the digest. Without this list the digest would
// sit open permanently on advisories nobody intends to fix, and an alarm that
// is always on gets ignored, which is the failure this tool exists to prevent.
// Same discipline as the override ratchet (scripts/__tests__/overrideRanges.test.js):
// add an entry only for a recorded decision, and remove entries the digest
// reports as no longer flagged.
//
// Keyed `lockfile|package|advisory`, never by package alone: one package can
// carry several advisories, so a package-level acceptance silently accepts the
// NEXT advisory published against it. That happened before this list shipped:
// the September decision to accept the Lighthouse CI toolchain (#1208) would
// have covered basic-ftp and compression advisories published in October.
export const ACCEPTED_NPM_AUDIT = {
  "frontend/package-lock.json|postcss-selector-parser|GHSA-rj75-hqrm-r3gf":
    "build-time only, pinned by @tailwindcss/typography; re-check on its next release (#1267)",
};

// The issue lists at most this many alerts. GitHub rejects an issue body over
// 65,536 characters (~400 alert lines), which would fail the digest exactly
// when the backlog is largest. The counts above the list stay exact.
const MAX_LISTED_ALERTS = 50;

function ageInDays(createdAt, now) {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid security data timestamp: ${createdAt || "missing"}`);
  return Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS));
}

function alertDate(alert) {
  return alert.created_at ?? alert.updated_at ?? "";
}

function dependabotDetails(alert) {
  return {
    number: alert.number,
    severity: alert.security_vulnerability?.severity ?? alert.security_advisory?.severity ?? "unknown",
    subject: alert.dependency?.package?.name ?? "unknown package",
    file: alert.dependency?.manifest_path ?? alert.dependency?.package?.ecosystem ?? "unknown file",
    link: `https://github.com/${REPOSITORY}/security/dependabot/${alert.number}`,
    createdAt: alertDate(alert),
  };
}

function codeScanningDetails(alert) {
  const instance = alert.most_recent_instance ?? {};
  const rule = alert.rule ?? {};
  return {
    number: alert.number ?? alert.alert_number,
    severity: rule.security_severity_level ?? rule.severity ?? "unknown",
    subject: rule.description ?? rule.id ?? "unknown rule",
    file: instance.location?.path ?? "unknown file",
    link: `https://github.com/${REPOSITORY}/security/code-scanning/${alert.number ?? alert.alert_number}`,
    createdAt: alertDate(alert),
  };
}

function formatAlert(alert, now) {
  const age = ageInDays(alert.createdAt, now);
  return `- [#${alert.number}](${alert.link}) ${alert.severity} ${alert.subject} in \`${alert.file}\` — ${age} days old`;
}

function formatCount(label, alerts, now) {
  const old = alerts.filter((alert) => ageInDays(alert.createdAt, now) > ALERT_AGE_DAYS).length;
  const fresh = alerts.length - old;
  return `- ${label}: ${alerts.length} open (${old} older than 7 days, ${fresh} newer)`;
}

export function buildDigest({ now, dependabot = [], codeScanning = [], analyses = [], npmAudit = [] }) {
  const currentTime = now instanceof Date ? now : new Date(now);
  const dependabotAlerts = dependabot.map(dependabotDetails);
  const codeScanningAlerts = codeScanning.map(codeScanningDetails);
  const alerts = [...dependabotAlerts, ...codeScanningAlerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const problems = [];

  for (const [scanner, toolNames] of Object.entries(REQUIRED_SCANNERS)) {
    const toolAnalyses = analyses.filter((analysis) => toolNames.includes(analysis.tool?.name));
    if (toolAnalyses.length === 0) {
      problems.push(`${scanner} has no code-scanning analysis at all; it is not uploading results`);
      continue;
    }
    toolAnalyses.forEach((analysis) => ageInDays(analysis.created_at, currentTime));
    const newest = toolAnalyses.reduce((latest, analysis) =>
      new Date(analysis.created_at).getTime() > new Date(latest.created_at).getTime() ? analysis : latest,
    );
    if (ageInDays(newest.created_at, currentTime) > ANALYSIS_STALE_DAYS) {
      problems.push(`${newest.tool.name} analysis is stale; newest analysis is ${newest.created_at}`);
    }
  }

  const acceptedNoLongerFlagged = [];
  for (const summary of npmAudit) {
    const total = [summary.critical, summary.high, summary.moderate, summary.low].reduce(
      (sum, count) => sum + Number(count || 0),
      0,
    );
    const findings = summary.findings ?? [];
    const keyOf = ({ name, advisory }) => `${summary.lockfile}|${name}|${advisory}`;
    // A finding with no advisory id can never match an acceptance.
    const unaccepted = findings.filter((finding) => !finding.advisory || !(keyOf(finding) in ACCEPTED_NPM_AUDIT));
    if (unaccepted.length > 0) {
      problems.push(
        `${summary.lockfile}: ${unaccepted.length} npm audit advisor${unaccepted.length === 1 ? "y" : "ies"} not on the accepted list: ` +
          unaccepted
            .map(({ name, advisory, severity }) => `${name} ${advisory || "(no advisory id)"} (${severity})`)
            .join(", "),
      );
    } else if (total > 0 && findings.length === 0) {
      // Counts the digest cannot attribute to an advisory cannot be judged
      // accepted. Fail closed rather than assume they are the known ones.
      problems.push(`${summary.lockfile} reports ${total} npm audit vulnerabilities with no advisory detail`);
    }
    const flagged = new Set(findings.map(keyOf));
    for (const key of Object.keys(ACCEPTED_NPM_AUDIT)) {
      if (key.startsWith(`${summary.lockfile}|`) && !flagged.has(key)) acceptedNoLongerFlagged.push(key);
    }
  }

  const oldAlertExists = alerts.some((alert) => ageInDays(alert.createdAt, currentTime) > ALERT_AGE_DAYS);
  const auditLines = npmAudit.map(
    ({ lockfile, critical = 0, high = 0, moderate = 0, low = 0 }) =>
      `- \`${lockfile}\`: critical ${critical}, high ${high}, moderate ${moderate}, low ${low}`,
  );
  const body = [
    `## Security digest as of ${currentTime.toISOString().slice(0, 10)}`,
    "",
    formatCount("Dependabot", dependabotAlerts, currentTime),
    formatCount("Code scanning", codeScanningAlerts, currentTime),
    "",
    problems.length > 0
      ? "### Problems\n\n" + problems.map((problem) => `- ${problem}`).join("\n")
      : "### Problems\n\n- None",
    "",
    "### npm audit summaries",
    "",
    auditLines.length > 0 ? auditLines.join("\n") : "- None",
    "",
    "### Accepted npm audit entries that can be removed (no longer flagged)",
    "",
    acceptedNoLongerFlagged.length > 0 ? acceptedNoLongerFlagged.map((key) => `- \`${key}\``).join("\n") : "- None",
    "",
    "### Open alerts",
    "",
    alerts.length > 0
      ? alerts
          .slice(0, MAX_LISTED_ALERTS)
          .map((alert) => formatAlert(alert, currentTime))
          .concat(
            alerts.length > MAX_LISTED_ALERTS
              ? [
                  `- …and ${alerts.length - MAX_LISTED_ALERTS} more, newest first above; see https://github.com/${REPOSITORY}/security`,
                ]
              : [],
          )
          .join("\n")
      : "- None",
  ].join("\n");

  return {
    shouldOpen: oldAlertExists || problems.length > 0,
    title: `Security digest: ${oldAlertExists || problems.length > 0 ? "action required" : "all clear"}`,
    body,
    problems,
  };
}

// execFileSync's defaults are a 1 MiB stdout cap and no timeout. Paginated
// alert lists outgrow 1 MiB exactly when alerts pile up, and a stalled gh/npm
// would hold the job until the runner kills it.
export const RUNNER_LIMITS = { maxBuffer: 64 * 1024 * 1024, timeout: 120_000 };

export function defaultRunner(file, args, options = {}) {
  try {
    return { status: 0, stdout: execFileSync(file, args, { encoding: "utf8", ...RUNNER_LIMITS, ...options }) };
  } catch (error) {
    return {
      // A buffer overflow or timeout has no exit status; still a failure.
      status: error.status ?? 1,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() || error.message,
    };
  }
}

function parseCommandJson(result, description, { allowNonZero = false } = {}) {
  if (result.status !== 0 && !allowNonZero) {
    throw new Error(`${description} failed with exit code ${result.status}: ${result.stderr || "no error output"}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${description} returned missing or unparseable JSON`);
  }
}

function flattenPages(value) {
  return Array.isArray(value) ? value.flat(Infinity) : value;
}

function auditSummary(lockfile, audit) {
  if (!audit || typeof audit !== "object" || !audit.metadata?.vulnerabilities) {
    throw new Error(`npm audit (${lockfile}) returned an invalid JSON report`);
  }
  const counts = audit.metadata?.vulnerabilities ?? {};
  // One finding per ADVISORY. A string in `via` names the dependency that
  // carries the advisory; that dependency's own entry reports it, so only the
  // advisory objects are findings.
  const findings = Object.entries(audit.vulnerabilities ?? {}).flatMap(([name, detail]) =>
    (detail?.via ?? [])
      .filter((via) => via && typeof via === "object")
      .map((via) => ({
        name,
        advisory: (typeof via.url === "string" && via.url.split("/").pop()) || (via.source ? `npm-${via.source}` : ""),
        severity: via.severity ?? detail?.severity ?? "unknown",
      })),
  );
  return {
    lockfile,
    findings,
    critical: counts.critical ?? 0,
    high: counts.high ?? 0,
    moderate: counts.moderate ?? 0,
    low: counts.low ?? 0,
  };
}

export function collectSecurityData({ runner = defaultRunner, root = currentWorkingDirectory() } = {}) {
  // REST paths need the `repos/` prefix: without it every call 404s. That
  // shipped in the first draft and only a dry run against the real API caught
  // it, because the unit tests inject a runner. The contract test now asserts
  // these exact arguments.
  const ghJson = (endpoint, description, { paginate = true } = {}) =>
    flattenPages(
      parseCommandJson(
        runner("gh", paginate ? ["api", "--paginate", "--slurp", endpoint] : ["api", endpoint], { cwd: root }),
        description,
      ),
    );
  const dependabot = ghJson(`repos/${REPOSITORY}/dependabot/alerts?state=open&per_page=100`, "Dependabot alert fetch");
  const codeScanning = ghJson(
    `repos/${REPOSITORY}/code-scanning/alerts?state=open&per_page=100`,
    "code-scanning alert fetch",
  );
  // The NEWEST analysis per tool, asked for by name. Reading "the newest N
  // analyses" instead would let a dead scanner fall off the page behind the
  // live one's frequent runs, and look absent rather than stale. A tool with
  // no analyses comes back either as [] or as a 404 "no analysis found"; that
  // one 404 means "none" (which REQUIRED_SCANNERS then flags). Any other
  // failure still fails closed.
  const analyses = ANALYSIS_TOOLS.flatMap((tool) => {
    const endpoint = `repos/${REPOSITORY}/code-scanning/analyses?tool_name=${encodeURIComponent(tool)}&per_page=1`;
    const result = runner("gh", ["api", endpoint], { cwd: root });
    if (result.status !== 0 && /no analysis found/i.test(`${result.stderr ?? ""}${result.stdout ?? ""}`)) return [];
    return flattenPages(parseCommandJson(result, `code-scanning analysis fetch (${tool})`));
  });
  const npmAudit = ["package-lock.json", "frontend/package-lock.json"].map((lockfile) => {
    const audit = parseCommandJson(
      runner("npm", ["audit", "--json", "--package-lock-only"], {
        cwd: root + (lockfile.startsWith("frontend/") ? "/frontend" : ""),
      }),
      `npm audit (${lockfile})`,
      { allowNonZero: true },
    );
    return auditSummary(lockfile, audit);
  });
  return { dependabot, codeScanning, analyses, npmAudit };
}

function runGh(runner, args, root) {
  const result = runner("gh", args, { cwd: root });
  if (result.status !== 0) throw new Error(`GitHub command failed with exit code ${result.status}`);
  return result.stdout;
}

export function main({ runner = defaultRunner, now = new Date(), root = currentWorkingDirectory() } = {}) {
  const data = collectSecurityData({ runner, root });
  const digest = buildDigest({ now, ...data });
  const issues = parseCommandJson(
    runner("gh", ["issue", "list", "--label", "security-digest", "--state", "open", "--json", "number,title"], {
      cwd: root,
    }),
    "security digest issue lookup",
  );
  const issue = issues[0];

  if (digest.shouldOpen && !issue) {
    // gh issue create fails outright on a label the repo does not have, so the
    // first digest that needs to open would fail. --force makes this idempotent.
    runGh(
      runner,
      [
        "label",
        "create",
        "security-digest",
        "--force",
        "--color",
        "B60205",
        "--description",
        "Opened by the weekly security digest",
      ],
      root,
    );
    runGh(
      runner,
      ["issue", "create", "--title", digest.title, "--body", digest.body, "--label", "security-digest"],
      root,
    );
  } else if (digest.shouldOpen && issue) {
    runGh(runner, ["issue", "edit", String(issue.number), "--title", digest.title, "--body", digest.body], root);
  } else if (!digest.shouldOpen && issue) {
    const date = new Date(now).toISOString().slice(0, 10);
    runGh(runner, ["issue", "comment", String(issue.number), "--body", `All clear as of ${date}`], root);
    runGh(runner, ["issue", "close", String(issue.number)], root);
  }
  return digest;
}

// Real paths, not `file://${argv[1]}`: import.meta.url is percent-encoded AND
// symlink-resolved, so a checkout path with a space, a #, or a symlink in it
// never matched, and the job "succeeded" without running.
function isEntryPoint() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  try {
    main();
  } catch (error) {
    console.error(`Security digest failed: ${error.message}`);
    process.exitCode = 1;
  }
}
