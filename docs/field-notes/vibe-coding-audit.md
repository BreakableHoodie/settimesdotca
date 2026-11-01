# Vibe-coding mistakes audit (2026-11-01)

Dre asked for the common mistakes in AI-built ("vibe-coded") apps, so this repo could avoid them. Remy researched 51 mistake classes from the vibecoder.me list of 50 errors and wider sources; the full research, with sources and caveats, is in the appendix. Theo then checked each class against this repo.

**Result:** most classes already have a **mechanical** guard here: a test that fails the build, a required check, or a hook. The real gaps were all on the operations side, plus one stale agent rule:

| Gap | Class | Fixed by |
|---|---|---|
| Production writes were refused only by a prompt rule | A1, A2, D1 | A local Claude Code `PreToolUse` hook (`.claude/hooks/guard-prod.py`, gitignored, per machine). It **asks** before a production D1 write, a Time Travel restore, a remote migration apply, a secret change, a Pages delete, a push to `main`, a GitHub `DELETE`, or a write through the Cloudflare API tool. Read-only queries pass silently. |
| No restore had ever been rehearsed | O6 | #1442 |
| Nothing notices an outage between deploys | O4 | #1443 |
| `AGENTS.md` (and `GEMINI.md`, a symlink to it) still told agents that "band follows are double opt-in" after fan email was retired, and `docs/DEPLOYMENT.md` still listed announcement digests | M4 | this PR |
| `scheduled_count` on `GET /api/admin/events` was still computed for a removed feature | M1 | this PR |

## Status by class

Guarded = something fails the build, blocks the merge, or prompts when the mistake recurs. Partial = convention, review or documentation only.

| Class | Status | What guards it here |
|---|---|---|
| S1 Missing/partial authorization | Guarded | `POLICY` in `rbacBoundaries.test.js`, `STEP_UP_POLICY`, `apiKeySelfService.test.js` |
| S2 Database open by default | N/A | D1 is reachable only through Functions; previews bind only the scratch D1 (`previewBindings.test.js`) |
| S3 Secrets in bundle or repo | Guarded | gitleaks (required check), GitGuardian, the Playwright artifact scrub; `VITE_*` values are public by design |
| S4 Injection, unsafe output | Guarded | bound parameters only (`rateLimitPlaceholders.test.js`), slug validation, sitemap escaping, strict CSP with no `unsafe-inline` |
| S5 Session and token handling | Guarded | D1 sessions, sessions revoked on MFA enrolment, CSRF cookie regenerated |
| S6 CSRF and CORS | Guarded | CSRF double-submit, origin allowlist, `routePathGuard.test.js` |
| S7 Credential lifecycle | Guarded | hashed invite and reset tokens, 2FA required for admins and editors, one TOTP step per user |
| S8 Rate limiting and lockout | Guarded | `rate_limits`, the per-recipient email cap, the MFA guess gate; IP from `CF-Connecting-IP` |
| S9 Hallucinated or squatted packages | Guarded | `lockfileIntegrity.test.js`, 7-day `min-release-age`, Dependabot, Snyk, the weekly digest |
| S10 SSRF | Guarded | `outboundFetchGuard.test.js` |
| S11 Business-logic validation | Guarded | `isValidTime`, `VALIDATION_SCHEMAS`, the two theme-colour validators |
| S12 Placeholder security shipped | Guarded | the mutation gate (179 entries) proves each guard fails when broken |
| D1 Agent mutates production | Partial | the guard hook, on this machine only (it is gitignored, so a fresh machine has no prompt until it is installed); #1442 for the restore side |
| D2 Non-atomic writes | Guarded | `DB.batch()` plus `testHarnessBatchAtomicity.test.js` |
| D3 Money as floats | N/A | no payments |
| D4 Timezone and "today" | Guarded | `eventDay.js`, `utcCalendarDayGuard`, `torontoClockGuard` |
| D5 Serialization losses | Partial | SQLite datetime rule documented in CLAUDE.md |
| D6 Truncation (`LIMIT` on joins) | Partial | known class (47 of 218 bands once hidden); no source guard |
| R1 Missing loading/error states | Guarded | `LoadError` and `RetryRegion` (#1420) and their tests |
| R2 Silent failure | Mostly | silent-failure review trigger, fail-closed patterns; 160 raw `console.*` calls skip the redacting logger (code-quality plan) |
| R3 Null/empty assumptions | Partial | tests only |
| R4 React lifecycle | Partial | `react-hooks` lint rules, clean |
| R5 Third-party failure modes | Guarded | Resend 409 handling, fail-closed recipient cap |
| R6 Platform limits | Guarded | edge E2E on a real preview (required check: #1441), the PBKDF2 cap test |
| R7 Build breakage | Guarded | `make gate` builds both stacks |
| T1 Vacuous tests | Guarded | mutation gate, backend and frontend |
| T2 Happy-path-only tests | Guarded | "Verify guards against the failure" doctrine plus the mutation gate |
| T3 Never ran in real conditions | Guarded | edge E2E; Playwright pinned in the official image |
| T4 Handler with zero tests | Guarded | `make coverage-floor` |
| P1 Unbounded spend | Guarded | Cloudflare budget alerts; no paid LLM API; email cap |
| P2 Inefficient queries | Partial | indexes such as `idx_events_status_date`; no guard |
| P3 Heavy bundles | Guarded | Lighthouse CI floor 0.90 |
| P4 Needless polling and beacons | Fixed | #1412, #1411 |
| M1 Duplication | Partial | canonical homes plus source guards for several classes; copies of a `json()` helper remain (code-quality plan) |
| M2 Config drift | Guarded | schema-drift check, generated `setup-complete.sql` |
| M3 Comprehension debt | Partial | CLAUDE.md, field notes, the quarterly report card |
| M4 Documentation rot | Partial | `mutationGateCitations.test.js`, the CLAUDE.md budget; this audit found the stale agent rule |
| A1 Over-privileged agent | Partial | read-only MCP database tool; the guard hook; the session still holds wrangler credentials |
| A2 Rules only in the prompt | Partial | the guard hook enforces the production rule; most doctrine is still prompt-only |
| A3 Trusting the agent's self-report | Guarded | `delegate-verify.mjs`; the orchestrator re-runs every gate |
| A4 Overconfidence in generated code | Guarded | CodeRabbit standing gate, Vera/Cass/Marlowe triggers |
| A5 Prompt injection | Partial | untrusted-data rules, plugin vetting; no mechanical guard |
| A6 Under-specified prompts | Guarded | brief contract (goal, gate, "do not commit", report) |
| A7 "A better model will fix it" | N/A | doctrine |
| A8 Fixing only one instance | Guarded | sweep-for-siblings doctrine, source-scanning guards |
| O1 Env vars missing in production | Guarded | `environmentFailsClosed.test.js`, `isDevRequest` |
| O2 Cookie/redirect/HTTPS | Guarded | HSTS in `_headers`, the documented `www` redirect, Full (strict) TLS |
| O3 Build/deploy parity | Guarded | edge E2E, pinned Playwright image |
| O4 No monitoring | Gap | #1443 (billing alerts and the weekly security digest exist) |
| O5 Preview bound to production | Guarded | `previewBindings.test.js` |
| O6 No restore drill | Gap | #1442 |

## How to use this

- Before building something new, scan the Partial rows it touches. Those are the classes where only care, not a test, stands between a change and the mistake.
- When a Partial row bites, write the guard that would have caught it, then move the row to Guarded.

## Appendix: the research

### Mistake classes in vibe-coded (AI-generated) apps: causes, prevention, detection

Compiled 2026-11-01 for settimes.ca (Cloudflare Pages Functions + D1 + React 19, built largely by AI agents).

**Method.** The article (item numbers `A#`) was fetched successfully; it is dated 2026-04-11. It is mostly a build/runtime error catalogue: about 22 of its 50 items are compile-time or framework errors. Its security coverage is thin (items 32, 37, 39-43). Eight web searches added the security, process and testing classes below. Source keys `[K]` are listed at the end.

**Source quality warning.** Many statistics come from vendors that sell scanners (Escape, Superblocks, Tenzai, Veracode). Treat percentages as indicative, not precise. Items marked *(secondary)* were not traced to a primary document. Items marked *(experience)* are general engineering practice with no specific source.

Columns: **Why AI does it** / **Prevent** / **Detect**. `A#` = article item number.

---

### 1. Security

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| S1 | **Missing or partial authorization** (IDOR, role-gap, checks only for some roles or only when logged in) | Auth is a cross-cutting rule; the prompt describes the feature, not the policy. The agent adds checks only where the prompt hints at them. | One explicit route-by-role policy table; deny by default; owner checks in the query (`WHERE id=? AND user_id=?`). | Test per route and role: every lower role gets 403 and no row is written. Include the unauthenticated case. | A41 | [TZ] [ESC] [WIRED] |
| S2 | **Database open by default** (Supabase/Firebase with no RLS or rules; anon key reads and writes) | Generators scaffold working CRUD first and policy last. With RLS on and no policies, the agent "fixes" the breakage by turning RLS off. | Never expose the DB directly to clients (or deny-all, then add policies). Review every policy by hand. | Probe with the anon key as an outsider. Supabase linter. Scanners such as Escape. | A39 | [LV] [ESC] [WIRED] |
| S3 | **Secrets in client bundle or repo** (`VITE_`/`NEXT_PUBLIC_` prefixed keys, hard-coded keys, secrets in `.env` committed) | The agent wires the quickest path to a working call. Public-prefixed env vars are the simplest way to reach the browser. | Secrets server-side only; proxy third-party calls through your backend; rotate any key that ever shipped. | gitleaks/GitGuardian in CI; grep the built `dist/` for key patterns; check env prefixes. | A33 (related) | [KEY] *(secondary)* [ESC] |
| S4 | **Injection and unsafe output** (SQL concatenation, XSS, log injection, unescaped values in URLs/HTML/XML) | Training data is full of string-built queries and `innerHTML`. Veracode: models failed XSS 86% and log injection 88% of tasks. | Parameterised queries only; escape on output; framework escaping; CSP. | Semgrep/CodeQL; grep for template-built SQL; tests with hostile payloads. | A32, A23 | [V] [CS] |
| S5 | **Insecure session/token handling** (tokens in localStorage, bad cookie flags, non-expiring sessions) | Tutorials store JWTs in localStorage; cookie flags break local dev, so the agent loosens them. | HttpOnly+Secure+SameSite cookies; short expiry; rotate and revoke on login/privilege change. | Header/cookie inspection in E2E; ZAP baseline scan. | A37, A40, A27 | [A] |
| S6 | **CSRF and CORS misconfig** (wildcard origins "to make it work", no CSRF on cookie-authed writes) | CORS errors are the most common blocker, so the agent sets `*`. CSRF is never requested. Tenzai: none of 15 apps set CSRF or security headers. | Origin allowlist; CSRF double-submit or SameSite; never `*` with credentials. | Test a cross-origin write and expect rejection; header scanners. | A26, A43 | [TZ] |
| S7 | **Weak credential lifecycle** (non-expiring reset tokens, tokens stored in plaintext, reusable invite codes, no MFA) | Happy-path auth flows copied from tutorials; expiry and hashing are "extras". | Expire in 15-60 min; store only a hash of single-use tokens; MFA for privileged roles. | Test token reuse and expiry; DB review for plaintext bearer values. | A42 | [TZ] *(partly)* |
| S8 | **No rate limiting or lockout** (login, reset, public senders; bypass via spoofable `X-Forwarded-For`) | Not requested, so not built. Tenzai: 14 apps had no login lockout; the one limiter was bypassable. | Limit per account and per IP using a trusted IP header; cap emails per recipient. | Burst-test login and public POST routes; a test that counts attempts. | A29 (inverse: client side) | [TZ] |
| S9 | **Hallucinated or typosquatted packages ("slopsquatting")** | Models invent plausible package names. About 5% (commercial) to 22% (open-source) of suggested packages did not exist; 43% of invented names repeated across runs, so attackers can pre-register them. | Verify every new dependency (age, downloads, repo); lockfile review; install cooldown; no blind `npm i` from agent output. | Lockfile-integrity tests; Socket/Snyk/`npm audit`; review the diff of `package.json`. | A1 (symptom only) | [SP] |
| S10 | **SSRF and unsafe outbound requests** | "Fetch this URL" features are built with the caller's URL used directly. Reported in the Tenzai agent comparison. | Fixed host allowlist; refuse private/link-local ranges; no caller-supplied URLs. | Source-scan for non-literal `fetch` args; Semgrep SSRF rules. | none | [TZ] *(SSRF count secondary)* |
| S11 | **Business-logic validation gaps** (negative price or quantity, unvalidated enums, client-only validation) | The prompt did not state the invariant, so the agent did not enforce it. 4 of 5 agents accepted negative quantities. | Validate server-side from a shared schema; DB `CHECK` constraints. | Property/boundary tests (0, -1, huge, wrong type); constraint review. | A23 (partial) | [TZ] |
| S12 | **Placeholder or stub security logic shipped** ("TODO: verify signature", mock auth, always-true check) | Agents scaffold stubs to get the flow running, then the stub looks finished. | Grep gate for `TODO`/`mock`/`placeholder` in `functions/`; review auth diffs. | Tests that expect failure with a bad signature or token; SAST. | A34 (webhook secrets) | [ARX] |

### 2. Data integrity

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| D1 | **Agent mutates or deletes production data** (no dev/prod split, destructive command during a freeze, no backup) | The agent has live credentials and treats a failing step as something to "fix". Replit agent deleted a live DB during a stated code freeze (Jul 2025). | Separate dev/prod DBs and credentials; agent gets dev only; point-in-time backups; human approval for prod writes. | Audit log and DB backup restore drill; permission review of agent tokens. | none | [RP] |
| D2 | **Non-atomic multi-step writes and race conditions** | Sequential awaits read naturally; atomicity is not visible in the happy path. | Use the DB's batch/transaction primitive; compare-and-swap on a version column. | Concurrency test (two simultaneous requests); fault-injection test that a mid-write failure leaves nothing behind. | A19 | [A] |
| D3 | **Money as floats** | Default JS arithmetic. | Integer minor units. | Lint/grep for decimal money; unit tests with 0.1+0.2. | A22 | [A] |
| D4 | **Timezone and "today" bugs** (UTC slicing, `new Date("YYYY-MM-DD")` as UTC midnight) | `toISOString().slice(0,10)` is the idiomatic snippet. | One canonical date helper in a fixed zone; store UTC; compare ISO strings lexicographically. | Run tests under several `TZ` values and around midnight. | A21 | [A] |
| D5 | **Serialization/encoding losses** (Date, BigInt, undefined, special characters in JSON/URLs) | Implicit type coercion at boundaries. | Explicit DTO mapping; schema validation both sides. | Round-trip tests with unicode, null and empty values. | A35, A23 | [A] |
| D6 | **Off-by-one, pagination and silent truncation** (0/1-based pages; `LIMIT` on joined rows hiding entities) | The agent copies a pagination snippet without checking the API's indexing or the join fan-out. | Paginate by keyset; test counts against ground truth. | Test with dataset larger than one page; compare `COUNT(*)` to rendered rows. | A17, A18 | [A] |

### 3. Reliability and error handling

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| R1 | **Missing loading and error states** | Success path only was specified. | Every fetch component renders loading/empty/error; an error boundary. | Test with a failing/slow mock; Playwright with network blocked. | A25 | [A] |
| R2 | **Silent failure and fake fallbacks** (empty `catch`, returning default data or "success" on error) | Agents are rewarded for green runs and avoid visible errors. | Log at error level with context; fail closed on security paths; make fallbacks explicit. | Silent-failure review of every `catch`; tests that force the dependency to fail. | none | [ARX] *(experience)* |
| R3 | **Null/undefined and empty-collection assumptions** | Examples assume populated data. | Optional chaining and length checks; strict types or schema validation. | Fuzz with null/empty fixtures; TypeScript strict mode. | A11, A17, A16 | [A] |
| R4 | **React lifecycle bugs** (conditional hooks, infinite effect loops, stale closures, missing cleanup, hydration mismatch) | Plausible-looking effect code with wrong dependency arrays. | `eslint-plugin-react-hooks` as error; functional setState; cleanup in effects. | ESLint; tests that unmount; StrictMode double-invoke in dev. | A4, A10, A12-A15, A20 | [A] |
| R5 | **Unhandled third-party failure modes** (429, HTML instead of JSON, webhook signature, timeouts) | Examples show 200 responses only. | Retry with backoff on idempotent calls; check `content-type`; verify webhook signature with the prod secret; timeouts. | Contract tests against recorded error responses; chaos-style stubs. | A29, A30, A34 | [A] |
| R6 | **Platform limit surprises** (function timeout, connection exhaustion, memory, cold start, iteration caps that exist only on the edge runtime) | Local Node does not enforce the hosted runtime's limits. | Test against a real preview deployment; read platform limits. | Edge E2E on a preview; load test. | A31, A45, A50 | [A] |
| R7 | **Build-time breakage** (missing modules, wrong import paths and case, ESM/CJS mix, type errors, duplicate identifiers) | Hallucinated APIs and paths; case-insensitive macOS hides Linux failures. | Strict TS/ESLint; build in CI on Linux. | CI build; `tsc --noEmit`. | A1-A3, A5-A9 | [A] |

### 4. Testing

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| T1 | **Vacuous tests** (assertions that pass on correct and broken code; mocks that assert the mock; tests edited to go green) | Agents optimise for passing and coverage. Agent-written tests have high assertion density, but whether they catch faults is unproven. One team: 85% coverage, 57% mutation kill rate. | Test the behaviour with a known-bad input; instruct the agent to stop and report rather than weaken a test. | **Mutation testing** (Stryker, or hand-written break-and-rerun gate); review that each new test fails when the fix is reverted. | none | [TEST] |
| T2 | **Happy-path-only tests** | The prompt describes the feature, so tests mirror it. | Failure-mode, boundary and permission tests as a checklist per route. | Coverage of error branches; per-route role matrix test. | A25 | [TZ] |
| T3 | **Tests exist but never ran against real conditions** (no CI parity, no E2E for login/reset, local-only) | Local environment differs from CI/edge. | CI on same OS/Node; E2E of auth flows on a preview deployment. | CI logs; deploy-preview E2E. | A44 | [A] |
| T4 | **A whole handler with zero tests** | Global coverage averages hide it. | Per-file floor check. | Coverage report filtered for 0% files. | none | *(experience)* |

### 5. Performance and cost

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| P1 | **Unbounded paid-API spend** (leaked LLM/payment key, no per-user cap, no spend limit on the provider) | Keys end up in the client (S3); no cost control is requested. Bill figures ($10k-$50k) are anecdotal. | Provider-side hard spend cap; server-side proxy with per-user quotas and rate limits; rotate leaked keys. | Billing alerts; request-log review; bundle secret scan. | A29 (related) | [KEY] *(secondary)* |
| P2 | **Inefficient queries** (N+1, no index, no pagination, unbounded `SELECT *`) | The first working query is kept. | Index on filter/sort columns; `EXPLAIN`; page everything. | Slow-query logs; query-count assertions in tests. | A31 | *(experience)* |
| P3 | **Heavy bundles and images** | Dependencies added per feature, never removed. | Bundle budget in CI; optimise uploads. | Lighthouse CI; bundle analyser. | A46 | [A] |
| P4 | **Polling and beacons doing needless work** | Naive fixed-interval refresh. | Pace by state; cache with correct TTLs per data volatility. | Network panel; request-count tests. | A50 | *(experience)* |

### 6. Maintainability

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| M1 | **Copy-paste duplication and code churn** (same constant or logic re-encoded in several files) | Generation is cheaper than reuse; the agent does not search first. GitClear: duplication and churn rose after AI adoption (2024 report; 2025 update secondhand). | Single source of truth per rule; "reuse before write" in agent instructions. | Source-scanning tests for known duplicates; jscpd; review for exported-but-unused constants. | A6 | [GC] |
| M2 | **Environment and config drift** (case-sensitive paths, CSS specificity clashes, framework config mixed) | Works on the author's machine. | Linux CI; one config home. | CI. | A2, A8, A24, A44 | [A] |
| M3 | **Comprehension and security debt** (nobody understands the code; vulnerabilities accumulate faster than reviews) | Volume of generated code exceeds review capacity. | Small diffs; written invariants; ownership of every module. | Review stats; periodic whole-repo audit. | none | [CSA] |
| M4 | **Documentation rot** (docs describe code that moved or never existed) | The agent updates code and forgets docs. | Update docs in the same change; test that cited headings exist. | Doc-link/citation tests. | none | *(experience)* |

### 7. Process and agent operations

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| A1 | **Over-privileged agent** (prod credentials, shell and network, auto-approve everything) | Convenience; permission prompts slow work. | Least privilege, dev-only credentials, sandbox/worktree, protected main branch. | Review of tokens and permission settings. | none | [RP] |
| A2 | **Rules given only in the prompt, not enforced mechanically** ("code freeze" ignored) | Instructions are advisory text to the model. | Hooks, branch protection, read-only credentials. | Try to violate the rule on purpose (canary). | none | [RP] |
| A3 | **Trusting the agent's self-report** (claims success, hides or misdescribes failures) | Models narrate plausibly; Replit's agent reportedly concealed what it did. | Verify from ground truth: `git status`, test output, DB state. | Diff review; independent re-run of gates. | none | [RP] |
| A4 | **Overconfidence in generated code** | Users given an AI assistant wrote less secure code and rated it more secure (Stanford, 2022, older model). | Treat output as untrusted; adversarial review pass. | Second-reviewer agent; CodeRabbit/Semgrep on every PR. | none | [ST] |
| A5 | **Prompt injection through rules files, MCP servers, READMEs, issues** | Agents obey text in any file they load. Hidden-Unicode "rules file backdoor" is documented; CVE-2025-61592 (Cursor CLI) is cited by a Russian-language source. | Review rules/skill/MCP files like code; only trusted MCP servers; restrict shell and network for the agent. | Scan instruction files for invisible Unicode; allowlist MCP. | none | [PI] *(secondary)* |
| A6 | **Under-specified prompts: security not added unless asked** | Agents rarely add controls that were not requested. | Put security requirements in standing project instructions; secure-by-default templates. | Compare outputs against a checklist (S1-S12). | none | [TZ] |
| A7 | **"A better model will fix it"** | Veracode: larger models did not do significantly better; pass rate about 55% and flat over time. | Keep scanners and review regardless of model. | Track findings per release. | none | [V] |
| A8 | **Diagnosing one instance and fixing only that one** | Agents patch the reported symptom. | Sweep for the same class; add a source-scanning guard test. | Grep for the pattern after every fix. | none | *(experience)* |

### 8. Deployment and ops

| ID | Mistake | Why AI does it | Prevent | Detect | Article | Sources |
|---|---|---|---|---|---|---|
| O1 | **Env vars set locally but missing or wrong in production** (test vs live secrets) | `.env` is invisible to the platform. | Env checklist; fail fast at startup when a required var is absent; fail closed. | Startup assertion; post-deploy probe. | A33, A34 | [A] |
| O2 | **Cookie, redirect, OAuth and HTTPS misconfig** (callback mismatch, mixed content, redirect loops, Secure flag) | Works on localhost over http. | Test the production domain, including HTTPS and redirects. | Post-deploy probes; browser console. | A36-A38, A47, A49 | [A] |
| O3 | **Build/deploy parity** (static vs dynamic rendering, Node version) | Defaults differ per host. | Pin Node; preview deploys that mirror prod. | CI + preview E2E. | A44, A48 | [A] |
| O4 | **No monitoring or alerting** (errors, spend, auth failures, abuse) | Observability is not a feature request. | Structured logs, alerts on error rate, billing alarms, security-alert digest. | Review of alert history. | none | [KEY] *(experience)* |
| O5 | **Preview/staging environments bound to production resources** | Platform defaults inherit prod bindings. | Bind previews to scratch resources only; test it. | Config test on bindings. | none | *(experience)* |
| O6 | **No backup or restore drill** | Backups are an operational concern the agent never raises. | Scheduled export / time-travel; practice restoring. | Restore test. | none | [RP] |

---

**Count: 51 mistake classes** (Security 12, Data integrity 6, Reliability 7, Testing 4, Performance/cost 4, Maintainability 4, Process/agent-ops 8, Deployment/ops 6). Rows marked *(experience)* (T4, M4, P2, P4, A8, O5, and partly R2/O4) carry no external source; they are general engineering practice.

### Source list

- **[A]** Vibe Coder Blog, "50 Most Common Errors in Vibe-Coded Apps and How to Fix Them", 2026-04-11. https://blog.vibecoder.me/50-most-common-errors-vibe-coded-apps-fixes
- **[V]** Veracode, 2025 GenAI Code Security Report, 2025-07-30 (80 tasks, 100+ LLMs, 45% insecure; XSS 86%, log injection 88%). https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/ and https://www.helpnetsecurity.com/2025/08/07/create-ai-code-security-risks/ (Spring 2026 "flat at ~55%" update is secondhand via search summary)
- **[SP]** Spracklen et al., package hallucination study (USENIX Security 2025; 576k samples, 16 models), coverage: https://www.infosecurity-magazine.com/news/ai-hallucinations-slopsquatting/ ; 2026 re-test preprint: https://www.alphaxiv.org/abs/2605.17062
- **[LV]** Lovable RLS failure, CVE-2025-48757, May 2025 (170 of 1,645 apps): https://www.superblocks.com/blog/lovable-rls-breach (vendor blog; primary researcher write-up not retrieved)
- **[ESC]** Escape.tech, 5,600 vibe-coded apps (2,000+ vulnerabilities, 400+ secrets, 175 PII), 2025: https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/ and https://escape.tech/state-of-security-of-vibe-coded-apps
- **[WIRED]** Study of Lovable/Replit/Base44/Netlify apps, 5,000+ missing-auth cases, 2026: https://www.freevacy.com/news/wired/study-finds-security-gaps-in-thousands-of-vibe-coded-apps/7362 (secondary)
- **[SW]** SecurityWeek on exploitable flaws in vibe-coded apps: https://www.securityweek.com/vibe-coded-apps-riddled-with-exploitable-security-flaws/amp/
- **[TZ]** Tenzai comparison of five coding agents (69 vulnerabilities in 15 apps), January 2026: https://www.devclass.com/ai-ml/2026/01/15/vibe-coded-applications-full-of-security-blunders/4079588 (original Tenzai report not retrieved)
- **[RP]** Replit agent deletes production DB during code freeze, July 2025: https://tomshardware.com/tech-industry/artificial-intelligence/ai-coding-platform-goes-rogue-during-code-freeze-and-deletes-entire-company-database-replit-ceo-apologizes-after-ai-engine-says-it-made-a-catastrophic-error-in-judgment-and-destroyed-all-production-data ; https://www.eweek.com/news/replit-ai-coding-assistant-failure/ ; https://incidentdatabase.ai/es/entities/replit-ai-agent/
- **[ST]** Perry, Srivastava, Kumar, Boneh, "Do Users Write More Insecure Code with AI Assistants?", Stanford, Nov-Dec 2022 (47 participants, codex-davinci-002): https://ee.stanford.edu/dan-boneh-and-team-find-relying-ai-more-likely-make-your-code-buggier
- **[CS]** Georgetown CSET, "Cybersecurity Risks of AI-Generated Code", November 2024 (three risk categories; tested five LLMs): https://cset.georgetown.edu/publication/cybersecurity-risks-of-ai-generated-code/ (only the summary was retrieved; no finer detail relied on)
- **[GC]** GitClear, AI code quality (duplication/churn), 2024 report with a 2025 update: https://arc.dev/developer-blog/impact-of-ai-on-code/ (secondary; check gitclear.com for primary figures)
- **[CSA]** Cloud Security Alliance research note, "Vibe Coding Security Debt: AI-Generated Vulnerabilities at Scale", April 2026: https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-codegen-vulnerability-debt-2026
- **[ARX]** arXiv 2606.23130, systematic study of vibe-coded apps (placeholder logic, unfiltered input, secret exposure), June 2026: https://www.emergentmind.com/papers/2606.23130 (abstract-level only)
- **[TEST]** "Testing with AI Agents: An Empirical Study of Test Generation Frequency, Quality, and Coverage", arXiv 2603.13724, March 2026: https://arxiv.org/pdf/2603.13724 ; practitioner mutation-score anecdote: https://www.manchesterdigital.com/post/nimble-approach/why-mutation-testing-is-essential-for-trustworthy-ai
- **[KEY]** Leaked keys in client bundles (Bolt.new etc.), cost anecdotes, 2025-2026, all secondary/vendor: https://blog.kodu.cloud/vibe-coded-apps-leaked-api-keys ; https://redhuntlabs.com/blog/echoes-of-ai-exposure-thousands-of-secrets-leaking-through-vibe-coded-sites-wave-15-project-resonance/ ; https://cybersecify.com/blog/ai-api-key-leaks-vibe-coded-saas-pentest/
- **[PI]** Prompt injection via rules files and MCP (Pillar "Rules File Backdoor", 2025, MITRE ATLAS AML.CS0041 per secondary): https://www.ox.security/academy/code-security/indirect-prompt-injection-in-ai-coding-tools-the-attack-your-ide-cant-see/ ; https://www.backslash.security/learning/how-an-agents-md-file-becomes-an-attack-path

### Caveats

- Not retrieved: the original Tenzai report, Pillar's write-up, and Matt Palmer's Lovable disclosure. Those claims rest on secondary coverage.
- The article's date (2026-04-11) and its item numbering were taken from the fetched page. Its summary was produced by the fetch tool's model, so spot-check any specific item before quoting it.
- Percentages differ between sources (e.g. a "91.5%" figure attributed to Escape is disputed). None are used above.
