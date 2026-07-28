---
title: "ADR-0008: Encode repository invariants as CodeRabbit path instructions"
status: "Accepted"
date: "2026-07-28"
authors: "Platform Engineering"
tags: ["tooling", "code-review", "ci", "developer-experience"]
supersedes: ""
superseded_by: ""
---

## Status

Accepted

## Context

CodeRabbit's GitHub App has been reviewing pull requests on this repository since PR #650 and has been productive: on PR #661 it independently identified four real defects in the poster-image work (unreserved image geometry causing layout shift, a fallback state that was never reset when `src` changed, a discarded caller-supplied `onError` handler, and a width guard that admitted `0.1` — which rounds to `0` and emitted a meaningless `width=0` transform, fixed by requiring `Math.round(width) >= 1`). All four were fixed in commit `84dcf82`.

Until this ADR, however, the repository carried no `.coderabbit.yaml`. CodeRabbit reviewed every pull request from stock defaults, reasoning about the diff as generic JavaScript and React. That produces two distinct failure modes.

**It cannot see invariants that are not visible in the diff.** This codebase carries a set of non-obvious rules whose violation is invisible to a reviewer reading only the changed lines:

- `lucia_sessions.expires_at` is `INTEGER` (Unix seconds) while every other `expires_at` column in the schema is `TEXT`. A comparison against `datetime('now')` is syntactically fine and semantically wrong.
- D1 stores datetimes as `YYYY-MM-DD HH:MM:SS` (space separator). A value written via `toISOString()` carries a `T`, and string comparisons against `datetime('now')` then fail silently — this caused a production invite-code expiry bypass (SEC-F1).
- Performances starting before 06:00 belong to the previous evening and must carry a +24h offset (ADR-0007). Any new sort or filter that re-parses `band.startTime` rather than consuming `prepareBands()` output reintroduces the bug.
- Server-side "today" must come from `eventLocalToday()`; `new Date().toISOString().slice(0, 10)` flips to tomorrow at 8 PM Eastern and marked events "Happening Now" the evening before (fixed in PR #568).
- Band follows are double opt-in. An insert with `verified = 1` is a one-line change that reopens an email-bombing vector.

A reviewer without this context cannot flag any of them, because each looks like ordinary correct code.

**It flags correct code as incorrect.** The public surface follows four user-selectable themes and must use semantic tokens (`text-text-primary`, `bg-surface`, `border-border`); hardcoded `text-white` there is a genuine bug class. But `frontend/src/admin/` is deliberately dark-pinned — `AdminApp.jsx` wraps the admin surface in `<div data-theme="midnight-ember">` — so hardcoded `text-white` across those files is correct and intentional. A generic reviewer flags all 134 files identically, and the resulting false positives train the team to skim CodeRabbit's output rather than read it.

CodeRabbit exposes two distinct mechanisms for supplying this context, and they do different jobs. `knowledge_base.code_guidelines.filePatterns` supplies documents as background reading for the whole review. `reviews.path_instructions` are directives bound to a glob and applied when a diff touches a matching file. The vendor documentation is explicit that path instructions are "a targeted supplement, not a replacement" for built-in review logic.

The repository already maintains the necessary source material: `CLAUDE.md` documents every invariant above under a "Critical Invariants" heading, and `.github/instructions/` holds fourteen topic-specific instruction files (accessibility, OWASP, Vitest, Tailwind v4, PR standards) that to date only GitHub Copilot consumed.

## Decision

Add `.coderabbit.yaml` at the repository root, configured along four axes.

**Background context.** `knowledge_base.code_guidelines.filePatterns` points at `CLAUDE.md` and `.github/instructions/**/*.md`, making the existing invariant documentation available to CodeRabbit without duplicating it. `knowledge_base.learnings.scope` is set to `local` so accumulated learnings stay scoped to this repository rather than propagating across the `BreakableHoodie` organisation.

**Targeted directives.** Eleven `path_instructions` blocks bind invariants to the globs where they apply:

| Glob | Invariant protected |
| ---- | ------------------- |
| `functions/**/*.js` | SQLite datetime format; `DB.batch()` atomicity; `validateId()` on URL params; `eventLocalToday()` for day classification |
| `functions/{utils/auth.js,utils/crypto.js,utils/totp.js,api/auth/**,api/admin/auth/**,api/admin/sessions.js,api/admin/sessions/**}` | `lucia_sessions.expires_at` as INTEGER epoch; PBKDF2 only; session invalidation ordering; CSRF regeneration |
| `functions/api/admin/**` | `checkPermission()` before any DB access, with carve-outs for pre-auth and self-service routes; central session/CSRF enforcement stated so per-endpoint checks are not flagged |
| `functions/api/bands/**` | Double opt-in follows; per-follower notification tracking; Turnstile on public email inputs |
| `frontend/src/**/*.{js,jsx}` | Semantic theme tokens; `document.title` assignment under React 19 |
| `frontend/src/admin/**` | **Exemption** — dark-pinned surface, `text-white` is correct here |
| `frontend/src/utils/**` | After-midnight threshold; `prepareBands()` delegation; schedule-storage date semantics |
| `migrations/**/*.sql` | `PRAGMA foreign_keys` around table recreation; `database/setup-complete.sql` is generated |
| `database/setup-complete.sql` | The generated artifact itself — hand-edits to its schema section, and schema changes with no originating migration |
| `frontend/public/_headers` | Document CSP source; COEP must stay unset; theme-flash script hash |
| `.github/{workflows,actions}/**` | Third-party actions pinned to full commit SHAs; local `./` composite references exempt |

**Cost and noise controls.** `auto_review.ignore_usernames` excludes `dependabot[bot]`, whose pull requests auto-merge without human review and therefore derive no value from a review pass. `path_filters` excludes lockfiles, Playwright visual-regression snapshots, and build output.

**Advisory pre-merge checks.** Two `custom_checks`, both at `mode: warning` so neither can block a merge:

- _Schema drift_ — a change under `migrations/` without a corresponding `database/setup-complete.sql` update. CI already enforces this via `quality.yml`; the check surfaces it at review time instead of after a red build.
- _CSP hash drift_ — a change to the inline theme-flash script in `frontend/index.html` without a matching `sha256-` update in `frontend/public/_headers`. **No automated test covers this today.** A stale hash silently disables the script under the strict CSP and reintroduces the theme flash on load.

`reviews.profile` remains at the default `chill`, and `request_changes_workflow` remains `false`.

## Consequences

### Positive

- **POS-001**: Invariants documented in `CLAUDE.md` are now enforced by an automated reviewer on every pull request, not only by contributors who have read the file.
- **POS-002**: The `frontend/src/admin/**` exemption converts a recurring false positive into a precise detector: a `text-white` flag outside `admin/` now carries signal rather than being one of 134 indistinguishable hits.
- **POS-003**: The CSP hash-drift check closes a gap that has no test coverage and no CI enforcement, where the failure mode is silent.
- **POS-004**: Skipping Dependabot pull requests removes review spend on changes that merge without a human decision.
- **POS-005**: `.github/instructions/**` is now consumed by two reviewers (Copilot and CodeRabbit) rather than one, increasing the return on files the repository already maintains.
- **POS-006**: The configuration is declarative and version-controlled, so changes to review policy travel through the same pull-request process as code.

### Negative

- **NEG-001**: `.coderabbit.yaml` restates invariants that also live in `CLAUDE.md`. The two can drift. Mitigation: `CLAUDE.md` remains the single source of truth and is listed in `code_guidelines.filePatterns`; the path instructions are phrased as review checks rather than as authoritative statements of the rule.
- **NEG-002**: Path instructions are advisory input to a language model, not deterministic linting. A violation may still pass review. They supplement — and do not replace — the ESLint, schema-drift, and coverage gates in `quality.yml`.
- **NEG-003**: The `frontend/src/admin/**` exemption is correct only while the admin surface stays dark-pinned. Should `AdminApp.jsx` ever adopt the user-selectable themes, this block becomes actively harmful and must be removed in the same change.
- **NEG-004**: Eleven path-instruction blocks is a maintenance surface. A directory rename that invalidates a glob fails silently — CodeRabbit simply stops applying that block, with no error.
- **NEG-005**: Advisory `warning` pre-merge checks can be ignored indefinitely. They inform; they do not enforce.

## Alternatives Considered

##### Rely on `CLAUDE.md` alone via `code_guidelines`

- **ALT-001**: **Description**: Point `knowledge_base.code_guidelines.filePatterns` at `CLAUDE.md` and omit `path_instructions` entirely, treating the existing documentation as sufficient.
- **ALT-002**: **Rejection Reason**: Background context is diluted across a review that may span dozens of files, and it cannot express a per-path exemption. The `frontend/src/admin/**` carve-out is inherently glob-scoped — there is no way to state "these 44 files are exempt from the rule the other 90 follow" as general background prose and expect it applied reliably per file.

##### Set `profile: assertive`

- **ALT-003**: **Description**: Raise review assertiveness to surface more findings per pull request.
- **ALT-004**: **Rejection Reason**: The default `chill` profile is already returning actionable defects at a high rate (four of four on PR #661). `assertive` increases nitpick volume, and Vol 17 is five days out at the time of this decision. Revisit after 2026-08-02, when additional review volume carries less schedule risk.

##### Enable `request_changes_workflow`

- **ALT-005**: **Description**: Have CodeRabbit post a formal "changes requested" review that must be cleared before merge.
- **ALT-006**: **Rejection Reason**: The `protect-main` ruleset already blocks merges on unresolved review threads. Adding a second clearance step compounds with the existing auto-merge workflow, which arms `--auto` only after Copilot's review has posted and its comments are addressed. The marginal safety is small; the added round-trips are not.

##### Enforce the docstring pre-merge check

- **ALT-007**: **Description**: Enable `pre_merge_checks.docstrings` at its default `warning` mode with an 80% threshold.
- **ALT-008**: **Rejection Reason**: This is a plain-JavaScript codebase with no JSDoc convention. An 80% docstring threshold would warn on essentially every pull request, producing noise that devalues the other pre-merge checks.

##### Adopt the CodeRabbit CLI as a local pre-push gate

- **ALT-009**: **Description**: Install the CodeRabbit CLI and run `cr review` locally before opening a pull request, front-loading findings.
- **ALT-010**: **Rejection Reason**: Deferred, not rejected on merit — it aligns with the project's front-load-review preference. A pre-PR gate already exists as an agent hook in `.claude/settings.local.json` covering five critical invariants, and local CLI runs consume usage credits per invocation. Reconsider once the configuration in this ADR has been observed across several pull requests.

## Implementation Notes

- **IMP-001**: `CLAUDE.md` is the source of truth for every invariant referenced here. When an invariant changes, update `CLAUDE.md` first, then bring the corresponding `path_instructions` block into line in the same change.
- **IMP-002**: Every `path:` glob must match at least one real file. A glob matching zero files disables its block silently. Verify glob match counts when adding a block or renaming a directory.
- **IMP-003**: The file is validated against `https://storage.googleapis.com/coderabbit_public_assets/schema.v2.json`, referenced by a `# yaml-language-server: $schema=` comment on line 1 for editor validation. CodeRabbit ignores unknown keys rather than erroring, so a typo degrades silently — validate against the schema rather than relying on review output to reveal a mistake.
- **IMP-004**: The `frontend/src/admin/**` exemption block must be deleted if the admin surface ever stops being dark-pinned. Grep for `data-theme="midnight-ember"` in `frontend/src/admin/AdminApp.jsx` before assuming it still holds.
- **IMP-005**: `.coderabbit.yaml` carries no credentials. CodeRabbit authenticates through the installed GitHub App; API keys are used only by the CLI and the Metrics API and must never appear in this file.
- **IMP-006**: The Metrics Data API (`GET https://api.coderabbit.ai/v1/metrics/reviews`) requires an Enterprise plan and a _user_ API key — an agentic key returns `KEY_TYPE_FORBIDDEN`. This organisation is not on Enterprise, so no metrics tooling is configured.
- **IMP-007**: Admin session validation and CSRF enforcement are central, in `functions/api/admin/_middleware.js`'s `onRequest` — not per-endpoint. Individual `functions/api/admin/**` handlers deliberately have no session or CSRF check of their own; they rely on the middleware having already run and populated `context.data.user`. A `path_instructions` block that implied per-endpoint CSRF checks would produce false positives on roughly 33 files. The `functions/api/admin/**` block above states this explicitly so the reviewer does not flag the intended architecture.
- **IMP-008**: `sqlfluff` and `markdownlint` are disabled in `reviews.tools` pending configuration: `sqlfluff` has no `.sqlfluff` in the repo, so it has no declared SQL dialect and would parse SQLite-only migration syntax (`PRAGMA`, `AUTOINCREMENT`, `INSERT OR IGNORE`) as errors under its ANSI default; `markdownlint` has no config and its default `MD013` 80-column rule would flag most docs in this repo. Re-enable both once `.sqlfluff` (dialect = `sqlite`) and a markdownlint config land.

## References

- **REF-001**: `.coderabbit.yaml` — the configuration this record describes.
- **REF-002**: `CLAUDE.md` — "Critical Invariants", "Theming", "Schedule Storage", "Band Announcements", "Content-Security-Policy" sections; source of truth for every encoded rule.
- **REF-003**: [ADR-0004](./0004-sqlite-datetime-format.md) — SQLite datetime format, encoded in the `functions/**` block.
- **REF-004**: [ADR-0005](./0005-pbkdf2-password-hashing.md) — PBKDF2 password hashing, encoded in the auth block.
- **REF-005**: [ADR-0006](./0006-d1-batch-atomicity.md) — `DB.batch()` atomicity, encoded in the `functions/**` block.
- **REF-006**: [ADR-0007](./0007-after-midnight-sort-threshold.md) — after-midnight threshold, encoded in the `frontend/src/utils/**` block.
- **REF-007**: `.github/workflows/quality.yml` — the deterministic gates these advisory checks supplement.
- **REF-008**: `.claude/settings.local.json` — the existing pre-PR agent hook covering five critical invariants locally.
- **REF-009**: CodeRabbit configuration reference — https://docs.coderabbit.ai/reference/configuration
- **REF-010**: CodeRabbit path-instruction guidance — https://docs.coderabbit.ai/guides/review-instructions
