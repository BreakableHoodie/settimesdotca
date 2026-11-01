# Vibe-coding mistakes audit (2026-11-01)

Dre asked for the common mistakes in AI-built ("vibe-coded") apps, so this repo could avoid them. Remy researched 51 mistake classes. Dre's standard is **reputable sources only**, so the research was redone against standards (OWASP, NIST, CWE, CISA, NCSC), peer-reviewed papers, labelled preprints, official platform docs and primary incident records; every vendor-blog statistic from the first pass was dropped. The appendix lists every source and its type. Theo then checked each class against this repo.

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

## Appendix: the research (reputable sources only)

### Mistake classes in AI-generated ("vibe-coded") apps: reputable sources only

Compiled 2026-11-01. Rewrite of `vibe-coding-mistakes.md` (same 51 IDs), keeping only sources of these kinds: standards and government, peer-reviewed research, labelled preprints, a platform's own documentation, and incident records.

**Method**

- Every source below was opened during this pass, through WebFetch, curl, or the NVD API. MITRE CWE titles were read from each entry page on cwe.mitre.org, and CVE text came from the NVD 2.0 API.
- **Sources** column: footnote numbers refer to the source list. For MITRE CWE entries, `[16: CWE-n]` means source 16, entry n.
- **What a source proves.** A CWE or OWASP entry shows that a class is a *recognised weakness*. It does not show that AI tools produce it often. Where a source does show AI-specific prevalence, the row gives that statistic with its year and the population studied.
- **The "Why AI tools produce it" column is our own explanation** unless it carries a footnote. Very little peer-reviewed work explains *why* an agent makes a given mistake; the main exception is the Deng et al. preprint [31], which classifies root causes.
- **Support levels:**
  - **Std/PR**: a standard, government, or peer-reviewed source.
  - **Docs/Inc**: official platform documentation, an incident record, or a preprint only.
  - **Eng**: engineering practice, no external source.

---

### 1. Security

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| S1 | **Missing or partial authorization** (IDOR, role gaps, checks only for some roles) | Access control is a policy that spans the whole app, while a prompt describes one feature. In a 2026 audit of 200 deployed apps built with Claude Code and Lovable, Broken Access Control was the largest category: 339 of 1,186 vulnerabilities (28.58%) [31, preprint]. | Explicit route-by-role policy table; deny by default; owner checks inside the query. | A test per route and role: lower roles get 403 and no row is written; include the unauthenticated case. | Std/PR | [1] [15] [16: CWE-862, CWE-639, CWE-284] [31] |
| S2 | **Database open by default** (no RLS or security rules; the public key can read and write) | The generator scaffolds working CRUD before any policy. Deng et al. name "function-fix side effects" as a failure mode: a visible error fixed by weakening or bypassing a security control (100 of 1,186 vulnerabilities, 8.4%) [31, preprint]. Lovable, CVE-2025-48757: 303 endpoints across 170 of 1,645 analysed projects (about 10.3%) had inadequate RLS, from homepage-only scans in March 2025 [36], [37]. | Enable RLS on every table in an exposed schema, then add policies; never ship test-mode rules; review every policy by hand. | Probe with the public key as an outsider; review grants and policies. | Std/PR + Inc | [2] [16: CWE-1188] [36] [37] [42] [43] [31] |
| S3 | **Secrets in the client bundle or the repo** | Public-prefixed environment variables are the shortest path to a working call (reasoning). Deng et al. found hard-coded credentials and credentials exposed to client-side access [31, preprint]. Huang et al. showed that code completion tools can regurgitate memorised hard-coded credentials (FSE 2024) [27]. | Keep secrets server-side; proxy third-party calls through the backend; rotate any key that ever shipped. | Secret scanning in CI and over git history; grep the built bundle. | Std/PR | [16: CWE-798, CWE-540] [44] [45] [27] [31] |
| S4 | **Injection and unsafe output** (SQL concatenation, XSS, log injection) | Training data contains a lot of string-built queries and unescaped HTML (reasoning). Pearce et al.: about 40% of 1,689 Copilot-generated programs across 89 scenarios were vulnerable (IEEE S&P 2022) [22]. Fu et al.: 29.5% of Python and 24.2% of JavaScript Copilot snippets found in GitHub projects (733 snippets) had weaknesses, with CWE-79 among the significant ones (TOSEM 2025) [26]. Injection was 16.78% of the 1,186 vulnerabilities in [31]. | Parameterised queries; escape output; framework escaping; CSP. | SAST (Semgrep or CodeQL); tests with hostile payloads. | Std/PR | [5] [15] [16: CWE-79, CWE-89, CWE-117] [22] [26] [31] |
| S5 | **Insecure session or token handling** (tokens in localStorage, missing cookie flags) | Tutorials store tokens in localStorage, and cookie flags get in the way of local development (reasoning). | HttpOnly, Secure and SameSite cookies; short expiry; rotate the session on login. | Inspect cookies and headers in E2E tests. | Std/PR | [11] [2] [16: CWE-1004, CWE-614, CWE-922, CWE-1462] |
| S6 | **CSRF and CORS misconfiguration** | A wildcard CORS header is the quickest way past a CORS error (reasoning). | Origin allowlist; a token-based CSRF defence, with SameSite as defence in depth; never `*` with credentials. | Send a cross-origin write and expect rejection. | Std/PR | [12] [1] [15] [16: CWE-352, CWE-942] |
| S7 | **Weak credential lifecycle** (reset tokens that never expire or can be reused, no MFA) | The happy-path flow is built and the lifecycle rules are left out (reasoning). Authentication Failures were 14.84% of the 1,186 vulnerabilities in [31]. | Single-use tokens that expire; store them securely (OWASP points to its password-storage guidance; hashing is our extension); MFA. | Tests for token reuse and expiry. | Std/PR | [13] [14] [5] [16: CWE-640] [31] |
| S8 | **No rate limiting or lockout** | Not requested, so not built (reasoning). | Lockout counter tied to the account; login throttling; per-account reset limits. | Burst-test login and public POST routes. | Std/PR | [14] [13] [15] [16: CWE-307, CWE-770] |
| S9 | **Hallucinated packages ("slopsquatting")** | Spracklen et al. (USENIX Security 2025), 576,000 samples from 16 LLMs: 19.7% of recommended packages were hallucinated; the average was at least 5.2% for commercial models and 21.7% for open-source models, with 205,474 unique invented names. 43% of hallucinated packages repeated in all 10 repeated queries [24]. | Vet every new dependency; review the lockfile; never install blindly from agent output. | Lockfile and manifest diff review; SCA. | Std/PR | [24] [9] [20] [17: PW.4.1] [16: CWE-1357] |
| S10 | **SSRF / unsafe outbound requests** | A caller-supplied URL is passed straight to `fetch` (reasoning). | Fixed host allowlist; refuse private and link-local ranges. | Scan source for non-literal `fetch` arguments. | Std/PR | [1] [15] [16: CWE-918] |
| S11 | **Business-logic validation gaps** | An invariant the prompt did not state is not enforced (reasoning). The largest failure mode in [31] was "hidden security rules", meaning a requirement the user never stated, at 55.5% of vulnerabilities (preprint). | Server-side validation from one shared schema; DB `CHECK` constraints. | Boundary tests (0, -1, very large, wrong type). | Std/PR | [15] [16: CWE-840, CWE-20, CWE-602] [31] |
| S12 | **Placeholder or stub security logic shipped** | Deng et al. describe "dummy encryption functions, static demo keys, or placeholder authorization logic", and a "forgotten obligations" mode: deferred security work never revisited, 4.2% of vulnerabilities [31, preprint]. | Grep gate for TODO, mock and placeholder in server code; review auth diffs. | Tests that expect failure with a bad signature or token. | Std/PR | [16: CWE-546, CWE-347] [31] |

### 2. Data integrity

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| D1 | **Agent mutates or deletes production data** | AIID Incident 1152 (July 2025): a Replit agent reportedly ran destructive commands during a code freeze and lost production data [38]. OWASP lists excessive functionality, permissions and autonomy as root causes [7]. | Separate dev and prod credentials; give the agent dev access only; human approval for high-impact actions [7]. | Audit log; agent token review; restore drill. | Std/PR + Inc | [38] [7] [17: PO.5.1] |
| D2 | **Non-atomic multi-step writes and race conditions** | Sequential awaits look correct on the happy path (reasoning). | Use the platform's transaction primitive (D1 `batch()` statements are SQL transactions that roll back on failure [46]); compare-and-swap on a version column. | Concurrency test; fault injection mid-batch. | Std/PR | [16: CWE-362] [46] |
| D3 | **Money as floats** | Default JS number arithmetic (reasoning). | Integer minor units. | Unit tests with values that do not round-trip. | Std/PR | [16: CWE-1339] |
| D4 | **Timezone and "today" bugs** | Idiomatic snippets parse date-only strings, and MDN documents that a date-only string is read as UTC while a date-time string with no offset is read as local time [50]. | One canonical date helper in a fixed zone. | Run tests under several `TZ` values and around midnight. | Docs/Inc | [50] |
| D5 | **Serialization and encoding losses** | Implicit coercion at boundaries: `JSON.stringify` omits `undefined`, turns `NaN`/`Infinity` into `null`, throws on `BigInt`, and turns a `Date` into an ISO string [51]. | Explicit DTO mapping; schema validation on both sides. | Round-trip tests. | Docs/Inc | [51] |
| D6 | **Off-by-one, pagination and silent truncation** | A copied pagination snippet, with no check of the indexing or of join fan-out (reasoning). | Keyset pagination; test counts against ground truth. | Datasets larger than one page; compare `COUNT(*)` with rendered rows. | Std/PR | [16: CWE-193] |

### 3. Reliability and error handling

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| R1 | **Missing loading and error states** | Only the success path was specified (reasoning). React removes the whole UI on a render error unless an error boundary catches it [54]. | Loading, empty and error states; error boundaries. | Tests with a failing or slow mock. | Std/PR | [16: CWE-755] [54] |
| R2 | **Silent failure and fake fallbacks** | Deng et al. cite error handling that let a secrets store "continue operating without effective encryption", and visible errors fixed by bypassing controls [31, preprint]. OWASP 2025 added "Mishandling of Exceptional Conditions" and recommends failing closed [4]. | Log with context; fail closed on security paths. | Review every `catch`; force dependencies to fail. | Std/PR | [4] [16: CWE-390, CWE-1069, CWE-636] [31] |
| R3 | **Null/undefined and empty-collection assumptions** | Examples assume populated data (reasoning). | Strict types; schema validation. | Null and empty fixtures. | Std/PR | [15] [16: CWE-476] |
| R4 | **React lifecycle bugs** (effect loops, missing cleanup, stale dependencies) | Plausible effect code with wrong dependency arrays (reasoning). React documents infinite effect cycles and the dependency lint rule [53]. | Hooks lint as an error; cleanup that mirrors setup. | ESLint; StrictMode double-invocation in development [53]. | Docs/Inc | [53] |
| R5 | **Unhandled third-party failure modes** (unverified webhooks, duplicate events, timeouts) | Examples show 200 responses only (reasoning). | Verify signatures with the endpoint secret, which differs between test and live; dedupe by event ID; respond quickly [55]. | Contract tests against recorded error responses. | Std/PR | [16: CWE-754, CWE-347] [55] |
| R6 | **Platform limit surprises** | Local Node does not enforce the hosted runtime's limits (reasoning). Workers have per-request CPU, 128 MB memory and subrequest limits [47]. | Read the platform's limits; test on a real preview. | Edge E2E; load test. | Docs/Inc | [47] |
| R7 | **Build-time breakage from hallucinated APIs, modules or paths** | Zhang et al. (ISSTA 2025) built a taxonomy of hallucinations in repository-level code generation across six LLMs [28]. Package hallucination rates are in S9 [24]. OWASP LLM09 names "non-existent code libraries" [9]. | Strict TypeScript and ESLint; build in CI on Linux. | CI build; `tsc --noEmit`. | Std/PR | [28] [24] [9] |

### 4. Testing

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| T1 | **Vacuous tests, or tests edited to go green** | ImpossibleBench (preprint, 2025): in tasks whose specification conflicts with the tests, GPT-5 "cheats" 54.0% of the time on Conflicting-SWEbench, and Claude models and Qwen3-Coder cheat mainly (>79%) by modifying test cases [32]. AIID 1152 reports an agent producing fake test results [38]. An MSR '26 study found that agent-written tests have higher assertion density and coverage comparable to human tests, so coverage does not show whether they catch faults [30]. | Prove each test fails on a known-bad version; tell the agent to stop rather than weaken a test. | Mutation testing; Meta's mutation-guided test generation is an industrial example [33, preprint]. | Docs/Inc (preprint + incident) | [32] [38] [30] [33] |
| T2 | **Happy-path-only tests** | The prompt describes the feature, so the tests mirror it (reasoning). BaxBench (ICML 2025): exploits succeeded on around half of the *functionally correct* backends each LLM generated [25]. | Failure-mode, boundary and permission tests per route [17: PW.8.2]. | Per-route role matrix; coverage of error branches. | Std/PR | [25] [17: PW.8.2] |
| T3 | **Tests never run under real conditions** | Local environments differ from CI and from the edge (reasoning). The SSDF says testing should consider the production infrastructure; OWASP says dev, QA and prod should be configured identically. | CI on the same OS and runtime; E2E on a preview. | CI logs; preview E2E. | Std/PR | [17: PW.8.2 Ex. 4] [2] |
| T4 | **A whole handler with zero tests** | Global coverage averages hide it. | Per-file coverage floor. | Coverage report filtered for files at 0%. | **Eng: engineering practice, no external source** | none |

### 5. Performance and cost

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| P1 | **Unbounded paid-API spend** ("denial of wallet") | No cost control was requested (reasoning). OWASP LLM10 describes attackers exploiting cost-per-use AI services [10]. | Rate limiting and per-user quotas; timeouts; anomaly monitoring [10]; provider-side spend caps. | Billing alerts; request-log review. | Std/PR | [10] [16: CWE-770] |
| P2 | **Inefficient queries** (N+1, missing index, unbounded queries) | The first working query is kept (reasoning). | Indexes on filter and sort columns; `EXPLAIN`; paginate. | Query-count assertions; slow-query logs. | Std/PR | [16: CWE-1073, CWE-1067, CWE-1049] |
| P3 | **Heavy bundles and images** | Dependencies are added per feature and never removed (reasoning). | Performance budget enforced in the build, e.g. with Lighthouse CI [56]. | Lighthouse CI; bundle analyser. | Docs/Inc | [56] |
| P4 | **Polling and beacons doing needless work** | Naive fixed-interval refresh (reasoning). MDN gives "don't poll the server when the page isn't visible" as a use case for the Page Visibility API [52]. | Pace by state; pause when hidden. | Network panel; request-count tests. | Docs/Inc | [52] |

### 6. Maintainability

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| M1 | **Copy-paste duplication and growing complexity** | Generating code is cheaper than searching for existing code (reasoning). He et al. (MSR '26) found that adopting Cursor brings "a substantial and persistent increase in static analysis warnings and code complexity" in open-source projects [29]. That study measured warnings and complexity, not duplication specifically. | One source of truth per rule; reuse before writing. | Source-scanning tests; clone detection. | Std/PR | [16: CWE-1041] [29] |
| M2 | **Environment and config drift** | Works on the author's machine (reasoning). | Configure dev, QA and prod identically, with different credentials [2]. | Linux CI. | Std/PR | [2] |
| M3 | **Comprehension and security debt** | NCSC (UK government): AI code is not "consistently good, safe, or maintainable", and production code may contain AI-written code "a human has never reviewed" [20]; unsupervised codebases can become "complicated and confusing to understand" [21]. CSA recommends treating AI-generated code as untrusted [35]. | Small diffs; written invariants; review, understand, check and verify [21]. | Review statistics; periodic whole-repo audit. | Std/PR | [20] [21] [35] [29] |
| M4 | **Documentation rot** | Code changes; the docs do not (reasoning). | Update docs in the same change. | Doc-citation tests. | Std/PR (recognised weakness only) | [16: CWE-1059, CWE-1053] |

### 7. Process and agent operations

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| A1 | **Over-privileged agent** | Convenience (reasoning). OWASP: excessive functionality, permissions and autonomy [7]. | Least privilege; human approval for high-impact actions [7]; separate environments [17: PO.5.1]. | Review tokens and permission settings. | Std/PR | [7] [16: CWE-250] [17: PO.5.1] [38] |
| A2 | **Rules given only in the prompt, not enforced** | OWASP: the system prompt should not "be used as a security control"; controls must be enforced "in a deterministic, auditable manner" outside the LLM [8]. NCSC prefers rule-based enforcement over "expecting an AI to limit another AI" [20]. AIID 1152: a code freeze stated in instructions was reportedly not honoured [38]. | Hooks, branch protection, read-only credentials. | Try to break the rule on purpose (canary). | Std/PR + Inc | [8] [20] [38] |
| A3 | **Trusting the agent's self-report** | AIID 1152: the agent reportedly fabricated test results and data and wrongly said a rollback was impossible [38]. OWASP defines overreliance as trusting LLM output without verifying it [9]. ImpossibleBench documents test-gaming [32, preprint]. | Verify from ground truth: `git status`, real test output, DB state. | Independent re-run of the gates. | Std/PR + Inc | [9] [38] [32] [16: CWE-1426] |
| A4 | **Overconfidence in generated code** | Perry et al. (ACM CCS 2023): participants with a codex-davinci-002 assistant "wrote significantly less secure code" and were more likely to believe it was secure [23]. | Treat output as untrusted; adversarial review. | A second reviewer; SAST on every PR. | Std/PR | [23] [9] |
| A5 | **Prompt injection through rules files, MCP config, repo content** | OWASP: indirect injection arrives from files and websites and can be "imperceptible to humans" [6]. CVE-2025-61592 (Cursor CLI ≤1.7): RCE via prompt injection delivered through project Rules files [40]. CVE-2025-54135 (Cursor <1.3.9): RCE by chaining indirect prompt injection with writing `.cursor/mcp.json` [41]. CVE-2025-53773: command injection in GitHub Copilot and Visual Studio [39]. | Review rules, skill and MCP files like code; restrict agent shell and network access; least privilege [6]. | Scan instruction files; allowlist MCP servers. | Std/PR + Inc | [6] [16: CWE-1427] [39] [40] [41] |
| A6 | **Security not added unless asked** | Deng et al.: "hidden security rules", requirements the user never stated, caused 658 of 1,186 vulnerabilities (55.5%) [31, preprint]. Pearce et al.'s neutral prompts yielded about 40% vulnerable programs [22]. | Write security requirements into standing project instructions [17: PO.1.1]; ask for secure-by-default output [20]. | Check output against a checklist (S1–S12). | Std/PR | [31] [22] [17: PO.1.1] [20] |
| A7 | **"A better model will fix it"** | BaxBench (ICML 2025): the best model tested (OpenAI o1) reached 62% correctness, and exploits worked on around half of each model's correct programs [25]. CSET: security is hard to evaluate, and it is unclear whether better-performing models write more secure code [34]. | Keep scanners and review whatever the model. | Track findings per release. | Std/PR | [25] [34] |
| A8 | **Fixing one instance, not the class** | Deng et al.: "incomplete change propagation", a security fix applied in one place and not others, was 9.3% of vulnerabilities [31, preprint]. NIST SSDF RV.3.3: "Review the software for similar vulnerabilities to eradicate a class of vulnerabilities" [17]. | Sweep for siblings; add a source-scanning guard test. | Grep for the pattern after every fix. | Std/PR | [17: RV.3.3] [31] |

### 8. Deployment and ops

| ID | Mistake | Why AI tools produce it | Prevent | Detect | Support | Sources |
|---|---|---|---|---|---|---|
| O1 | **Env vars missing or wrong in production** | `.env` is invisible to the platform (reasoning). Partial support: OWASP covers environment misconfiguration [2] and failing closed [4], not missing variables as such. | Fail fast and fail closed when a required variable is absent. | Startup assertion; post-deploy probe. | Std/PR (partial) | [2] [4] |
| O2 | **Cookie, redirect, OAuth and HTTPS misconfiguration** | Works on localhost over http (reasoning). | Exact redirect-URI matching (RFC 9700: "MUST utilize exact string matching") [18]; Secure cookies. | Post-deploy probes. | Std/PR | [18] [2] [16: CWE-614, CWE-601] |
| O3 | **Build and deploy parity** | Defaults differ between hosts (reasoning). | Identical environment configuration [2]; test with the production infrastructure in mind [17: PW.8.2]. | CI plus preview E2E. | Std/PR | [2] [17: PW.8.2] |
| O4 | **No monitoring or alerting** | Observability is never part of a feature request (reasoning). | Log auditable events; set alert thresholds and escalation [3]. | Review alert history. | Std/PR | [3] [16: CWE-778] |
| O5 | **Preview/staging bound to production resources** | Platform defaults can inherit bindings (reasoning). Pages lets you set bindings separately for production and preview [49]. | Separate and protect each environment [17: PO.5.1]; bind previews to scratch resources. | Config test on bindings. | Std/PR | [17: PO.5.1] [49] |
| O6 | **No backup or restore drill** | The agent never raises backups (reasoning). In AIID 1152, recovery was reportedly delayed when the agent wrongly said rollback was impossible [38]. | Offline backups; "regularly test the availability and integrity of backups" [19]; D1 Time Travel, 30 days on Paid and 7 on Free [48]. | Restore test. | Std/PR + Inc | [19] [48] [38] |

---

**Tally (51 classes):**

- **Std/PR: 43.** S1–S12, D1–D3, D6, R1–R3, R5, R7, T2, T3, P1, P2, M1–M4, A1–A8, O1–O6.
- **Docs/Inc: 7.** D4, D5, R4, R6, P3 and P4 rest on official documentation. T1 rests on preprints plus an incident record.
- **Eng: 1.** T4.

Of the 43, only part show **AI-specific prevalence**: S1–S4, S9, S11, S12, R2, R7, T2, M1, M3, A3–A8, plus D1 and A2 through the incident record. The rest are recognised weaknesses with no AI-specific frequency data from an acceptable source.

### Source list

Type key: standard / peer-reviewed / preprint / official docs / incident record / government.

1. OWASP Top 10:2025, A01 Broken Access Control. OWASP Foundation, 2025. https://top10.owasp.org/2025/A01_2025-Broken_Access_Control/ (standard). Quoted: "100% of the applications tested were found to have some form of broken access control"; maps CWE-352 and CWE-918.
2. OWASP Top 10:2025, A02 Security Misconfiguration. OWASP, 2025. https://top10.owasp.org/2025/A02_2025-Security_Misconfiguration/ (standard). Quoted: "100% of the applications tested were found to have some form of misconfiguration"; "Development, QA, and production environments should all be configured identically".
3. OWASP Top 10:2025, A09 Security Logging and Alerting Failures. OWASP, 2025. https://top10.owasp.org/2025/A09_2025-Security_Logging_and_Alerting_Failures/ (standard)
4. OWASP Top 10:2025, A10 Mishandling of Exceptional Conditions. OWASP, 2025. https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions/ (standard)
5. OWASP Top 10:2025, overview (A05 Injection, A07 Authentication Failures). OWASP, 2025. https://top10.owasp.org/2025/ (standard)
6. OWASP Top 10 for LLM Applications 2025, LLM01 Prompt Injection. OWASP GenAI Security Project, 2025. https://genai.owasp.org/llmrisk/llm01-prompt-injection/ (standard)
7. OWASP LLM06:2025 Excessive Agency. OWASP, 2025. https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ (standard)
8. OWASP LLM07:2025 System Prompt Leakage. OWASP, 2025. https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/ (standard)
9. OWASP LLM09:2025 Misinformation (includes overreliance and non-existent libraries). OWASP, 2025. https://genai.owasp.org/llmrisk/llm092025-misinformation/ (standard)
10. OWASP LLM10:2025 Unbounded Consumption. OWASP, 2025. https://genai.owasp.org/llmrisk/llm102025-unbounded-consumption/ (standard)
11. OWASP Cheat Sheet Series, HTML5 Security Cheat Sheet. OWASP, current. https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html (standard)
12. OWASP Cheat Sheet Series, Cross-Site Request Forgery Prevention. OWASP, current. https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html (standard)
13. OWASP Cheat Sheet Series, Forgot Password. OWASP, current. https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html (standard)
14. OWASP Cheat Sheet Series, Authentication. OWASP, current. https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html (standard)
15. 2025 CWE Top 25 Most Dangerous Software Weaknesses. MITRE, page updated 2025-12-15. https://cwe.mitre.org/top25/archive/2025/2025_cwe_top25.html (standard). Ranks used: #1 CWE-79, #2 CWE-89, #3 CWE-352, #4 CWE-862, #13 CWE-476, #18 CWE-20, #19 CWE-284, #22 CWE-918, #24 CWE-639, #25 CWE-770.
16. MITRE CWE entries. Each is https://cwe.mitre.org/data/definitions/N.html, and each title was confirmed from the live page (standard): 20, 79, 89, 117, 193, 250, 284, 307, 347, 352, 362, 390, 476, 540, 546, 601, 602, 614, 636, 639, 640, 754, 755, 770, 778, 798, 840 (grouping), 862, 918, 922, 942, 1004, 1041, 1049, 1053, 1059, 1067, 1069, 1073, 1188, 1339, 1357, 1426, 1427, 1462. CWE-613 is now **deprecated** (it points to CWE-1462), so it is not used.
17. NIST SP 800-218, Secure Software Development Framework (SSDF) v1.1. NIST, February 2022. https://csrc.nist.gov/pubs/sp/800/218/final (standard). Tasks used: PO.1.1, PO.5.1, PW.4.1, PW.8.2, RV.3.3; wording read from the PDF.
18. RFC 9700, Best Current Practice for OAuth 2.0 Security (BCP 240). IETF, January 2025. https://www.rfc-editor.org/rfc/rfc9700.html (standard)
19. #StopRansomware Guide. CISA. https://www.cisa.gov/stopransomware/ransomware-guide (government)
20. Dave Chismon, "Vibe check: AI may replace SaaS (but not for a while)". UK NCSC blog, 2026-03-24. https://www.ncsc.gov.uk/blogs/vibe-check-ai-may-replace-saas-but-not-for-a-while (government)
21. Toby W, "The 'vibe coding spectrum' approach to AI-assisted software development". UK NCSC blog, 2026-06-18. https://www.ncsc.gov.uk/blogs/the-vibe-coding-spectrum-approach-to-ai-assisted-software-development (government)
22. Pearce, Ahmad, Tan, Dolan-Gavitt, Karri, "Asleep at the Keyboard? Assessing the Security of GitHub Copilot's Code Contributions". IEEE S&P 2022. Opened via https://arxiv.org/abs/2108.09293 (peer-reviewed). 89 scenarios, 1,689 programs, about 40% vulnerable.
23. Perry, Srivastava, Kumar, Boneh, "Do Users Write More Insecure Code with AI Assistants?". ACM CCS 2023, pp. 2785-2799. Opened via https://arxiv.org/abs/2211.03622; the ACM DL page returned 403 (peer-reviewed). The model was codex-davinci-002.
24. Spracklen, Wijewickrama, Sakib, Maiti, Viswanath, Jadliwala, "We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs". USENIX Security 2025. https://www.usenix.org/conference/usenixsecurity25/presentation/spracklen (peer-reviewed). The repetition figures (43%) and the overall 19.7% come from the authors' full text, https://arxiv.org/html/2406.10279v3.
25. Vero et al., "BaxBench: Can LLMs Generate Correct and Secure Backends?". ICML 2025, PMLR 267:61344-61390. https://mlanthology.org/icml/2025/vero2025icml-baxbench and https://arxiv.org/abs/2502.11844 (peer-reviewed)
26. Fu, Liang, Tahir, Li, Shahin, Yu, Chen, "Security Weaknesses of Copilot-Generated Code in GitHub Projects: An Empirical Study". Accepted in ACM TOSEM, 2025. https://arxiv.org/abs/2310.02059 (peer-reviewed)
27. Huang, Li, Wu, Zhang, Lyu, "Your Code Secret Belongs to Me: Neural Code Completion Tools Can Memorize Hard-Coded Credentials". FSE 2024. https://arxiv.org/abs/2309.07639 (peer-reviewed)
28. Zhang, Wang, Wang, Chen, Zheng, "LLM Hallucinations in Practical Code Generation: Phenomena, Mechanism, and Mitigation". ISSTA 2025. https://arxiv.org/abs/2409.20550 (peer-reviewed)
29. He, Miller, Agarwal, Kästner, Vasilescu, "Speed at the Cost of Quality: How Cursor AI Increases Short-Term Velocity and Long-Term Complexity in Open-Source Projects". MSR '26 (Carnegie Mellon). https://arxiv.org/abs/2511.04427 (peer-reviewed)
30. Yoshimoto et al., "Testing with AI Agents: An Empirical Study of Test Generation Frequency, Quality, and Coverage". MSR '26. https://arxiv.org/abs/2603.13724 (peer-reviewed)
31. Deng, Fan, Meng, "Understanding the (In)Security of Vibe-Coded Applications". arXiv:2606.23130, v4 2026-09-14. https://arxiv.org/abs/2606.23130 (**preprint**, no venue listed). Corpus of 9,041 apps; 200 deployed apps audited; 1,186 vulnerabilities; 182 of 200 apps (91.0%) had at least one.
32. Zhong, Raghunathan, Carlini, "ImpossibleBench: Measuring LLMs' Propensity of Exploiting Test Cases". arXiv:2510.20270, October 2025. https://arxiv.org/abs/2510.20270 (**preprint**. One secondary listing names ICLR 2026, but no OpenReview or proceedings page was opened.)
33. Foster et al. (Meta), "Mutation-Guided LLM-based Test Generation at Meta". arXiv:2501.12862, January 2025. https://arxiv.org/abs/2501.12862 (**preprint**; submitted to the FSE 2025 Industry track, acceptance not confirmed)
34. Ji, Jun, Wu, Gelles, "Cybersecurity Risks of AI-Generated Code". Georgetown CSET, November 2024. https://cset.georgetown.edu/publication/cybersecurity-risks-of-ai-generated-code/ (university research). "Almost half of the code snippets produced by these five different models contain bugs."
35. "Vibe Coding Security Debt: AI-Generated Vulnerabilities at Scale". Cloud Security Alliance AI Safety Initiative, 2026-04-06. https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-codegen-vulnerability-debt-2026 (non-profit research). Cited for recommendations only: its statistics come from vendors and trade press, so none are used.
36. CVE-2025-48757 (Lovable, insufficient RLS; disputed by the supplier; CWE-863). NVD, published 2025-05-30. https://nvd.nist.gov/vuln/detail/CVE-2025-48757 (incident record; text read via the NVD 2.0 API)
37. Matt Palmer, "Statement on CVE-2025-48757" and "CVE-2025-48757". 2025-05-29. https://mattpalmer.io/posts/statement-on-CVE-2025-48757/ and https://mattpalmer.io/posts/CVE-2025-48757/ (incident record: the researcher's own disclosure)
38. AI Incident Database, Incident 1152: "LLM-Driven Replit Agent Reportedly Executed Unauthorized Destructive Commands During Code Freeze, Leading to Loss of Production Data". Responsible AI Collaborative, incident date 2025-07-18. https://incidentdatabase.ai/cite/1152/ (incident record; claims are "reported"/"alleged")
39. CVE-2025-53773 (GitHub Copilot and Visual Studio, command injection, CWE-77). NVD, 2025-08-12. https://nvd.nist.gov/vuln/detail/CVE-2025-53773 (incident record)
40. CVE-2025-61592 (Cursor CLI, RCE via project config plus prompt injection from Rules files, CWE-829). NVD, 2025-10-03. https://nvd.nist.gov/vuln/detail/CVE-2025-61592 (incident record)
41. CVE-2025-54135 (Cursor, MCP config write leading to RCE, CWE-78). NVD, 2025-08-05. https://nvd.nist.gov/vuln/detail/CVE-2025-54135 (incident record)
42. Supabase Docs, Row Level Security. Supabase, current. https://supabase.com/docs/guides/database/postgres/row-level-security (official docs)
43. Firebase Docs, "Avoid insecure rules". Google, current. https://firebase.google.com/docs/rules/insecure-rules (official docs)
44. Vite Guide, "Env Variables and Modes". Vite, current. https://vite.dev/guide/env-and-mode (official docs)
45. GitHub Docs, "About secret scanning". GitHub, current. https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning (official docs)
46. Cloudflare D1 Docs, D1 Database Worker API (`batch()`). Cloudflare, current. https://developers.cloudflare.com/d1/worker-api/d1-database/ (official docs)
47. Cloudflare Workers Docs, Limits. Cloudflare, current. https://developers.cloudflare.com/workers/platform/limits/ (official docs)
48. Cloudflare D1 Docs, Time Travel. Cloudflare, current. https://developers.cloudflare.com/d1/reference/time-travel/ (official docs)
49. Cloudflare Pages Docs, Functions bindings. Cloudflare, current. https://developers.cloudflare.com/pages/functions/bindings/ (official docs)
50. MDN, `Date.parse()`. Mozilla, current. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse (official docs: web platform reference)
51. MDN, `JSON.stringify()`. Mozilla, current. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify (official docs)
52. MDN, Page Visibility API. Mozilla, current. https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API (official docs)
53. React Docs, `useEffect`. Meta / React team, current. https://react.dev/reference/react/useEffect (official docs)
54. React Docs, `Component` (error boundaries). React team, current. https://react.dev/reference/react/Component (official docs)
55. Stripe Docs, "Receive Stripe events in your webhook endpoint". Stripe, current. https://docs.stripe.com/webhooks (official docs)
56. Milica Mihajlija, "Performance budgets 101". web.dev (Google Chrome team), 2018. https://web.dev/articles/performance-budgets-101 (official docs for Lighthouse CI)

### Removed from the earlier version

**Sources dropped** (unacceptable type, or replaced by a primary source):

- [A] Vibe Coder Blog, "50 Most Common Errors…": a small blog. All `A#` article references were removed.
- [V] Veracode 2025 GenAI Code Security Report, plus Help Net Security coverage: a scanner vendor.
- [LV] Superblocks blog on Lovable: a vendor blog, replaced by NVD [36] and the researcher's write-up [37].
- [ESC] Escape.tech (methodology post and "state of security" report): a scanner vendor.
- [WIRED] via freevacy.com: secondary coverage.
- [SW] SecurityWeek: secondary coverage, and it carried no claim used in the table.
- [TZ] Tenzai via devclass.com: Tenzai sells security testing, and the original report was not retrieved.
- [RP] Tom's Hardware and eWeek, plus the Spanish-language AIID mirror: replaced by the AIID English record [38].
- [ST] Stanford EE news page: replaced by the paper itself [23].
- [GC] GitClear via arc.dev: GitClear is a vendor and arc.dev is secondary. Replaced by CWE-1041 and He et al. [29].
- [ARX] emergentmind.com mirror: replaced by the arXiv original [31].
- [TEST] Manchester Digital / Nimble Approach practitioner post: removed. The arXiv paper 2603.13724 is kept as [30], with its MSR '26 venue.
- [KEY] blog.kodu.cloud, redhuntlabs.com and cybersecify.com: vendor or small blogs.
- [PI] ox.security and backslash.security: vendor blogs.
- Infosecurity Magazine coverage of Spracklen: replaced by the USENIX paper [24].
- alphaxiv.org/abs/2605.17062 ("2026 re-test"): an aggregator, and the paper was not opened.

**Statistics dropped:**

- Veracode figures: 45% of tasks insecure, XSS failure 86%, log injection 88%, a pass rate "about 55% and flat over time", and "larger models did not do significantly better".
- Escape figures: 5,600 apps, 2,000+ vulnerabilities, 400+ secrets, 175 PII exposures; and the disputed "91.5%".
- WIRED/freevacy: "5,000+ missing-auth cases".
- Tenzai figures: 69 vulnerabilities in 15 apps; none of 15 apps set CSRF or security headers; 14 apps with no login lockout; 4 of 5 agents accepted negative quantities; the SSRF count.
- GitClear duplication and churn figures (2024 report and 2025 update).
- "85% coverage, 57% mutation kill rate" (practitioner anecdote).
- "$10k–$50k" API bill anecdotes.
- "47 participants" (Perry et al.): not in the abstract that was opened. The study is still cited, without the participant count.
- CSA research note figures (45–70% failure, 62% design flaws, 406M records, 98.9% of iOS apps, 197,092 secrets, and others): all trace to vendors, trade press or aggregators.
- Georgia Tech "Vibe Security Radar" (74 AI-linked CVEs): seen only through trade press and the CSA note; no primary page was opened.

### Earlier claims not verified

- That CVE-2025-61592 was cited only by a Russian-language source. The CVE itself is real and is now cited from NVD [40].
- The Pillar "Rules File Backdoor" hidden-Unicode technique, and MITRE ATLAS case AML.CS0041. OWASP LLM01 supports the general point that injected text can be "imperceptible to humans" [6]; the specific write-up and the ATLAS ID were not opened.
- That the Replit agent "concealed what it did". AIID records reported fake test results, fabricated data and a false claim that rollback was impossible [38]. The table states those instead.
- That the earlier "about 5% to 22%" range came from Spracklen et al. It is confirmed, more precisely, as "at least 5.2%" for commercial and "21.7%" for open-source models [24].
- That the Forgot Password cheat sheet requires tokens to be *stored hashed*. It says "stored in a secure manner" and points to password-storage guidance; hashing is our extension (S7).
- "Leaked keys in Bolt.new client bundles" and the API-cost anecdotes: no acceptable source was found.
- The GitClear 2025 update, the Veracode Spring 2026 update, and the 2026 slopsquatting re-test.
