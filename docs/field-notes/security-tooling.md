# Security tooling

Moved verbatim from `CLAUDE.md` on 2026-10-16, when it passed the 150k-character
limit. `CLAUDE.md` keeps the rules; this file keeps the incidents, measurements
and reasoning behind them. Read it before changing the code a section guards.

## The security tooling this repo actually has

**Restored 2026-09-25, when the repo went public again:** `codeql.yml`,
`secret-scan.yml` (gitleaks) and `dependency-review.yml`, unchanged from their
last working versions. `protect-main` requires the **"Detect Secrets
(gitleaks)"** check, so that workflow must exist. When the rulesets came back
into force with it missing, every PR to `main` waited on a check that could
never run. **If the repo goes private again, remove that check from the ruleset
in the same change that deletes the workflow.**

The history below is kept because it happens again whenever the repo goes
private. On the **Free** plan a private repo has no GitHub Advanced Security.
The job logs recorded in #1174 show how each one failed. CodeQL's SARIF upload
needs code scanning. gitleaks' scan completed (_"is an individual user. No
license key is required"_), but the action's next API call returned `403`
(job `104837284604`). dependency-review is refused outright (_"Dependency
review is not supported on this repository ... along with GitHub Advanced
Security"_). All three failed on every PR and were removed on 2026-09-16. **A permanently red check is worse than no check.** Red that always
means nothing teaches you to stop reading red.

**What ran while the repo was private, each verified on a private Free-plan repo rather than assumed.** All of it still runs:

| Concern               | Covered by                                                            | How we know it works here                                                                                    |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Secrets               | GitGuardian; CodeRabbit's own gitleaks pass (`.coderabbit.yaml`)      | GitGuardian passed on #1171 and #1172 after the privacy change                                               |
| Dependency advisories | Snyk PR check; Dependabot alerts + security updates                   | the push that privatised the repo was answered with _"GitHub found 3 vulnerabilities on …'s default branch"_ |
| Lockfile tampering    | `scripts/__tests__/lockfileIntegrity.test.js`                         | a plain test in the suite — no plan tier involved, which is now the point                                    |
| Review                | CodeRabbit                                                            | passed on both PRs                                                                                           |
| SAST                  | `semgrep.yml` (rebuilt in #1173, Pro ruleset via `SEMGREP_APP_TOKEN`) | a planted finding turned the PR job red and named it; the same PR without it went green (#1185)              |

**SAST is back, but read the right check.** `semgrep-cloud-platform/scan` is
posted by the Semgrep **GitHub App** and reports **pass** on every PR no matter
what it finds: the org's rules sit in the Rule Board's _Audit_ column, which
records to semgrep.dev and posts nothing. **That check means nothing. The
`Semgrep / Scan` job is the gate.**

How the rebuilt `semgrep.yml` works (#1173):

- **On a PR it is diff-aware and fails on any finding the PR introduces.** On
  push and weekly it scans the full tree and _reports_ (warnings plus a job
  summary) without failing, because `main` carries pre-existing findings (19 on
  2026-09-22, 16 of them `detect-non-literal-regexp`) and a job that is red on
  every push is noise, not a gate.
- **Findings come from the JSON; the exit code only ever signals a failure to
  run — and not reliably.** `semgrep ci` exits **0 with findings** (Audit-column
  rules are non-blocking; verified with a planted finding), so the job counts
  results in the JSON. Exit **1** means blocking findings and goes on to that
  count. Exit **> 1** means "could not run" and fails the job. But semgrep also
  exits **0 when it could not run** ("will succeed because there were no
  blocking findings") and writes no JSON: seen twice on #1185, once from its own
  `git fetch` and once in a semgrep.dev outage. The `test -s semgrep.json` guard
  is what makes both red. Never remove it as redundant.
- **It runs in plain-git mode, and needs full history.** When semgrep detects
  GitHub Actions it runs its own `git fetch`, which fails with "could not read
  Username" on a private repo with no persisted credentials (the #1184 trap).
  So `semgrep ci` runs under `env -u GITHUB_ACTIONS`, diffing against
  `SEMGREP_BASELINE_REF` using history that `fetch-depth: 0` already checked
  out; `SEMGREP_*` variables restore the metadata. On a PR it checks out the
  **head** commit, not GitHub's merge commit, so commits landed on `main` after
  the PR opened are not scanned as this PR's.
- **Dependabot and fork PRs skip, loudly.** Neither receives Actions secrets;
  the job posts a notice and a "NOT SCANNED" summary rather than passing
  silently. Any other run without the token **fails**: an OSS-only scan reports
  all-clear while missing every rule that has found a real issue here.

Do not "fix" the App's check by moving the Rule Board to "Comment": that is a
dashboard setting, not in git, not reviewable in a PR, and silently reversible
by anyone with account access. The gate lives in the workflow on purpose.

**The weekly security digest** (`.github/workflows/security-digest.yml`, `scripts/security-digest.mjs`, #1247) opens, updates or closes ONE issue labelled `security-digest`. It exists because 23 code-scanning and 8 Dependabot alerts sat unnoticed for weeks in October 2026. It opens when any Dependabot or code-scanning alert is older than 7 days, when a required scanner (`REQUIRED_SCANNERS`: CodeQL, Semgrep) has NO analysis or none newer than 14 days, or when `npm audit` (both lockfiles) reports an advisory not in `ACCEPTED_NPM_AUDIT`. Three properties are load-bearing:

- **A failed read fails the job; it never reports zero.** A digest that says "0" because it could not look is exactly the silent failure it replaces. The only tolerated failure is the API's `404 "no analysis found"` for one tool name, which means "none", and the required-scanner rule then flags it.
- **Analyses are fetched per tool by name**, never as "the newest N". A dead scanner falls off a shared page behind a live one's frequent runs and looks absent instead of stale.
- **`ACCEPTED_NPM_AUDIT` holds recorded decisions only, keyed `lockfile|package|advisory`** (today: two entries, #1267 and basic-ftp under Lighthouse CI). Never key by package alone: one package can carry several advisories, so a package-level entry silently accepts the next one published. The September Lighthouse CI decision (#1208) was package-level and would have hidden two October advisories. Without the list the issue stays open permanently, and an alarm that is always on gets ignored. The digest lists accepted entries that are no longer flagged, so the list shrinks.

Semgrep SARIF is uploaded again (category `semgrep`) on push and schedule runs. Before that, the Security tab's Semgrep alerts were frozen at 2026-09-14 and never closed.

**Snyk Code (Snyk's SAST) is deliberately not enabled** (decided 2026-09-22).
The Snyk PR check covers dependency manifests only. Semgrep was chosen because
its gate is in git and its Pro ruleset is measured on this repo; Snyk Code would
spend the Free plan's monthly Code-test allowance on every PR and keep its gate
in Snyk's dashboard.

## The security tooling this repo actually has — `CLAUDE.md` text as of 2026-10-24

| Concern               | Covered by                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Secrets               | gitleaks (`secret-scan.yml`, required check "Detect Secrets (gitleaks)"); GitGuardian; CodeRabbit's gitleaks |
| Dependency advisories | Snyk PR check; Dependabot alerts and security updates; `dependency-review.yml`                               |
| Lockfile tampering    | `scripts/__tests__/lockfileIntegrity.test.js`                                                                |
| SAST                  | CodeQL (`codeql.yml`); Semgrep (`semgrep.yml`, #1173)                                                        |
| Review                | CodeRabbit                                                                                                   |

- **If the repo goes private again**, CodeQL, gitleaks and dependency-review fail on the Free plan, which has no Advanced Security. Remove "Detect Secrets (gitleaks)" from the `protect-main` ruleset in the same change that deletes its workflow, or every PR waits on a check that cannot run. A permanently red check is worse than none.
- **The gitleaks PR check scans every commit in the PR's range**, so a later commit cannot clear a fixture that trips it: rewrite the commit, or add its fingerprint to `.gitleaksignore` with a reason. Name test credentials so gitleaks' `generic-api-key` rule (a secret-like identifier assigned a high-entropy string) does not match.
- **Semgrep's gate is the `Semgrep / Scan` job.** The Semgrep App's `semgrep-cloud-platform/scan` check passes regardless of findings. On a PR the job is diff-aware and fails on new findings; on push and weekly it reports without failing and uploads SARIF (category `semgrep`). Findings come from the JSON, never the exit code: semgrep can exit 0 with findings, and exit 0 without having run, so never remove the `test -s semgrep.json` guard. Exit 1 means blocking findings and goes on to the count; exit >1 means it could not run and fails the job. It runs under `env -u GITHUB_ACTIONS` (semgrep's own `git fetch` fails without persisted credentials) with `fetch-depth: 0` on the PR's head commit, diffing against `SEMGREP_BASELINE_REF`; `SEMGREP_*` variables restore the metadata. Dependabot and fork PRs skip loudly; any other run without `SEMGREP_APP_TOKEN` fails. Keep the gate in the workflow, not the Rule Board, which lives outside git.
- **The weekly security digest** (`security-digest.yml`, `scripts/security-digest.mjs`, #1247) keeps one `security-digest` issue. It opens for any alert older than 7 days, a required scanner (`REQUIRED_SCANNERS`: CodeQL, Semgrep) with no analysis in 14 days, or an `npm audit` advisory not in `ACCEPTED_NPM_AUDIT`. A failed read fails the job; only a per-tool `404 "no analysis found"` means "none". Analyses are fetched per tool by name. `ACCEPTED_NPM_AUDIT` holds recorded decisions keyed `lockfile|package|advisory`, never by package alone; the digest lists accepted entries no longer flagged, so the list shrinks.
- **Snyk Code is deliberately not enabled** (2026-09-22): Semgrep's gate lives in git.

Plan-tier history, the job logs and the Semgrep investigation: `docs/field-notes/security-tooling.md`.
