# AGENTS.md — settimes.ca

Instructions for AI coding agents (Claude Code, OpenCode, Codex, Cursor, …) working in this repo.
Format: [agents.md](https://agents.md). Humans: start with `README.md`; deep Claude-specific
workflow and the full invariant catalogue live in `CLAUDE.md` — read it before non-trivial work.

## What this is

settimes.ca — a **lean, highly performant** multi-venue live-music event platform for Waterloo
Region, ON. Fan-facing (schedule builder, band profiles, archives) and admin tooling are equal
priority. Next edition: **Long Weekend Band Crawl Vol. 18 — October 11, 2026**, **published
since 2026-08-28 with an empty lineup** (the supported "Lineup TBA" state) and live to the public
now. Vol. 17 and Buddies Fest 2 both shipped in August 2026 and are archived. Event-driven
surfaces are populated again; the iCal feed is still empty because it joins performances, and
that zero is not the between-seasons zero. See `season_state` in the canon below before calling
any such zero a bug.

Machine-readable canon (venues, events, constants, doctrines): **`ground-truth.json`**.
Read it before asserting facts about events, venues, or dates — do not re-derive or guess.

## Stack

React 19 + Vite + Tailwind 4 (`frontend/`) · Cloudflare Pages Functions (`functions/`) ·
Cloudflare D1 / SQLite (`migrations/`) · R2 for images · Vitest + Playwright · GitHub Actions.

## Setup & commands

Use the Makefile — it exists so every agent runs the same gates with real exit codes:

- `make install` — install root + frontend deps
- `make gate` — **the full pre-commit gate** (format → lint → tests → build, both stacks). Run before every commit; do not commit if it fails.
- `make test` / `make test-backend` / `make test-frontend`
- `make build` — frontend production build
- `make e2e` — full local E2E: builds, seeds an isolated D1, serves wrangler on :8788, runs Playwright, cleans up
- `make review` — **AI code review before opening a PR** (CodeRabbit CLI; `make review-wip` for uncommitted changes). Run it *before* the PR — the same review runs on the PR anyway, so findings after opening cost a fix plus a force-push. Not part of `make gate`: `gate` stays fast and offline, `review` needs the network.
- **Codebase report card** — `docs/REPORT_CARD_REVIEW.md`. Whole-repo grade + safe fixes, run at the start of a release cycle or ~quarterly. Not a per-PR gate; it reads the whole tree. See CLAUDE.md for cadence and caveats.
- `make schema-check` — after touching `migrations/`: regenerates `setup-complete.sql` and checks drift (its schema section is generated — never hand-edit)
- `make validate-openapi` — if `docs/api-spec.yaml` changed

Never pipe a gate command through `tail`/`grep` inside a `&&` chain — the pipe's exit code
masks failures (this shipped a red lint to CI once). `make` propagates failures natively.

## Top invariants (full catalogue in CLAUDE.md — these are the prod-breakers)

- **After-midnight sets** (start before 06:00) belong to the previous evening. Threshold is
  `AFTER_MIDNIGHT_THRESHOLD_HOUR = 6` in `frontend/src/utils/festivalDays.js`. Never remove,
  lower, or re-encode it; any time-based sort/filter must apply the offset or use `prepareBands()`.
- **Server-side "today" is Toronto-local**, never UTC: `eventLocalToday()` /
  `eventLocalClock()` from `functions/utils/eventDay.js`. `toISOString().slice(0,10)` flips
  to tomorrow at 8 PM Eastern — a recurring bug class.
- **SQLite datetimes use a space separator** (`YYYY-MM-DD HH:MM:SS`). A `T` breaks string
  comparison against `datetime('now')` silently. Exception: `lucia_sessions.expires_at` is
  INTEGER Unix seconds — compare with `unixepoch()`.
- **D1 has no BEGIN/COMMIT** — use `DB.batch([...])` (atomic) or compensating deletes.
- **PBKDF2, never bcrypt** (no native binaries on Workers). MFA TOTP is hand-rolled on
  Web Crypto — do not reintroduce otplib or pure-JS crypto.
- **Theme tokens on public pages** — `text-text-*`, `bg-surface*`, `border-border`; never
  hardcoded `text-white`/`bg-white` (invisible on light themes). Admin (`frontend/src/admin/`)
  is dark-pinned; hardcoded white there is intentional.
- **Two CSPs**: `frontend/public/_headers` governs the document (Turnstile, inline scripts —
  the theme-flash script is hash-allowlisted; editing it requires regenerating the hash);
  `functions/_middleware.js` governs API responses only.
- **Any list query with a LIMIT must bound the entity it lists** — GROUP BY the entity id or
  paginate with a hasMore signal. A LIMIT on join-multiplied rows silently drops whole
  entities (this once hid 47 of 218 bands from the admin roster).

## Data doctrines (owner-set, non-negotiable)

- **Lean and highly performant** is a design principle, not a preference. No media-heavy
  features, no referral-junk URLs, weigh every feature against page weight first.
- **Clean links**: strip tracking params (`si`, `dlsi`, `nd`, `utm_*`, `from=`, `igsi`, `igshid`, `mibextid`, `fbclid`, `gclid`, `msclkid`, `ttclid`, `twclid`) before
  storing any URL.
- **No AI-written artist prose.** Bios are entered verbatim from artist/organizer-supplied
  text only. Structured facts (genre, origin, links) may be researched, but only to the
  highest confidence — the source must unambiguously identify the specific band; a missing
  field beats a wrong attribution.
- **Band follows are double opt-in** (`verified = 1` gates announcement email). Never revert
  to auto-verify — it reopens an email-bombing vector.

## PR rules

- Branch from `main`; **rebase on `origin/main` before every push**, not just at PR open.
- Use the PR template (`.github/pull_request_template.md`); fill every section; `Closes #N`
  on its own line in the body. One type label + one priority label at open time.
- **Nothing merges unless ALL CI checks are green** — required and non-required alike.
  Never arm `gh pr merge --auto` while any check is still running.
- Track remaining/deferred work as GitHub issues, referenced from PRs — not chat threads.
- After addressing review comments: reply on the thread AND resolve it (rulesets block
  merge on unresolved threads).
- When a change resolves a documented invariant/workaround, update `CLAUDE.md` (and this
  file if the invariant is listed here) in the same PR.

## Code style

- Prettier + ESLint are law; `make gate` enforces both. Frontend: single quotes, no semis
  (see `frontend/.prettierrc`); backend: double quotes, semis (root `.prettierrc`).
- Comments state constraints the code can't show — never narrate the next line or justify
  a change to a reviewer. Reference issues (`#NNN`) when documenting a bug-class fix.
- Reference code locations as `file_path:line` in discussion.

## Testing notes

- Backend unit tests run from repo root (better-sqlite3-backed; may DLOPEN-fail on some
  Apple Silicon setups — CI covers it, note it and move on).
- E2E requires a live wrangler server and env credentials (`E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD`
  are required for ANY Playwright invocation, including `--list`). `make e2e` handles this.
- E2E spec files are under the same prettier/eslint scope as `functions/`/`scripts/` (#622) —
  double quotes/semis, `eslint.config.js`'s `e2e/**` block covers Playwright + browser globals.

## Writing a delegation brief

A delegated run has no memory of the conversation that produced it. It gets
three things: the brief, the instructions `opencode.json` loads globally, and
the working tree. Anything you worked out in chat and did not write down is
invisible to it. Two failures have already happened here, both the brief's
fault rather than the delegate's.

**1. Name the domain instruction file — the loaded set is deliberately small.**
`opencode.json`'s `instructions` array carries only what governs *every* diff.
Per-domain guidance is not loaded because `a11y.instructions.md` alone is
~5.7k tokens on every delegation. So the brief must name what the task needs:

| task touches | brief must name |
|---|---|
| `frontend/src/**` (UI) | `docs/design-system/DESIGN_SYSTEM.md`, `docs/design-system/COMPONENT_USAGE.md`, `.github/instructions/a11y.instructions.md` |
| `e2e/**` | `.github/instructions/playwright-typescript.instructions.md` |
| styling / Tailwind | `.github/instructions/tailwind-v4-vite.instructions.md` |
| `migrations/**` | `make schema-check`, and the migration invariants in `CLAUDE.md` |

A UI brief that names none of these gets a competent fix that never reaches for
an existing `components/ui/` primitive. That has happened.

**2. State the goal and the constraints, not the implementation.** The brief
for #726 instructed "prefer a native `<button>`". That was wrong: `BandCard`
contains both a `<button>` and an `<a>`, so a button container nests
interactive content. The delegate reasoned past the instruction and used
`role="group"` with an accessible name, which is correct. Had it complied
literally, the brief would have produced invalid markup.

The implementer can see the code; the brief writer is working from memory.
Say *"the container must be reachable and announced"*, not *"make it a button"*.

**Always include:** branch name, one PR per issue, `make gate` must exit 0,
"STOP and report rather than weaken a test, lint rule or config to make a gate
pass", and "confirm the new test FAILS against current code before calling it
done". That last line is the one that keeps catching real defects.

### Running more than one agent at once

Concurrency is normal here — a delegate and the orchestrator often work in the
same repository at the same time. Two rules prevent the collisions that have
actually happened, and they matter more than isolation does:

1. **Create your own branch before your first commit, and only ever commit to a
   branch you created.** On 2026-08-14 a delegate committed onto whatever branch
   happened to be checked out — which belonged to another agent — and that
   agent's next `git add -u` swept the delegate's half-finished files into an
   unrelated docs PR. Six CI checks failed on a one-file Markdown change.
   `git branch --show-current` reports a name, not ownership, so check it
   against the branch your brief assigned before staging anything —
   `test "$(git branch --show-current)" = "<branch-from-brief>"` — and stop if
   that fails instead of committing wherever you happen to be.

2. **Never bare `git stash` or `git stash pop`.** The stash stack is shared
   across every worktree of a repository — a fresh worktree here immediately
   listed seven entries belonging to other sessions. Popping takes whichever is
   on top, which may be someone else's uncommitted work. Use
   `git stash push -u -m "<unique-tag>"`, capture the SHA from
   `git stash list --format='%H %gs'`, and restore with
   `git stash apply <sha>`. To clean up, re-resolve the index from your tag —
   `git stash list --format='%gd %gs' | grep <unique-tag>` — and drop that
   `stash@{n}`. Verified 2026-08-14: `apply` accepts a raw SHA but `drop` does
   **not** (`error: '<sha>' is not a stash reference`), and indices shift when
   another agent pushes a stash, so `stash@{0}` is never safe to assume.

**Worktrees help but do not solve this.** They isolate the filesystem, so a
mid-edit file cannot be swept into someone else's commit — worth using. They do
*not* isolate refs (branches, force-pushes, deletions) or the stash, which is how
the incident above actually happened. A worktree also starts empty of
`node_modules`, so `make gate` cannot run until you `npm install` at the root
and in `frontend/` — about two minutes. It also starts without `.dev.vars`;
that file is *not* a `make gate` prerequisite (this section was written and
gated from a worktree that never had one), but copy it across before anything
that needs a live wrangler server, such as `make e2e`.

**The strongest protection is the brief itself:** give each concurrent task a
disjoint set of files, and tell it to STOP if it finds itself editing a file
assigned to another task. Four PRs ran in parallel that way with zero conflicts;
the one collision came from a task with no file boundary.

## LSP — prefer it over grep for symbol navigation

Both harnesses navigate by LSP. Two **dependencies** must be installed, and separately each
harness must be **configured** (both listed below) — all of it is required, and a missing
piece fails silently rather than loudly.

```bash
npm install -g typescript-language-server   # 1. the server binary — per machine, not in this repo
make install                                # 2. typescript@^5 — a devDependency, already declared
```

**`typescript` is a local devDependency on purpose, not an oversight in a repo with no `.ts`
files.** OpenCode's built-in typescript server resolves `typescript/lib/tsserver.js` *from the
project directory*, and node resolution never consults global `node_modules` — so with only a
global install it hits `if (!Z) return` and the LSP is **silently off**, no error anywhere. The
local copy also serves Claude Code, so the global `typescript` is unnecessary; only the server
binary has to be global. Node resolution walks up, so the single root install covers
`frontend/` too.

**Never move that dependency to `typescript@7`.** TS 7 is the native Go port: its `lib/` ships
only `getExePath.js` and `tsc.js` — no `tsserver.js`, which is exactly the file the language
server spawns. It fails every LSP call with `Could not find a valid TypeScript installation`
while `tsc --version` reports a perfectly healthy 7.x. Verified 2026-08-13: 7.0.2 breaks it,
5.9.3 works. The `^5` caret is what keeps a routine bump from silently disabling navigation.

- The server handles `.js .jsx .mjs .cjs .ts .tsx .mts .cts`. `jsconfig.json`'s `include`
  globs cover every tracked `.js`/`.jsx`/`.mjs` under `functions/`, `frontend/`, `scripts/`
  and `e2e/`, plus the root config files — the only exclusion is `.github/` skill assets.
- Claude Code: the `typescript-lsp` plugin plus `ENABLE_LSP_TOOL=1`, both in
  `~/.claude/settings.json` (machine-local, not in this repo).
- OpenCode: `"lsp": true` in `opencode.json` activates the built-in definitions. Its typescript
  entry is **not** on OpenCode's auto-download list, which is why both pieces above are on you.
- **Verify by making an LSP call, never by reading config.** Every failure mode here is silent
  or misleading at rest: a missing binary throws `ENOENT` only at call time, a missing local
  `typescript` makes OpenCode skip the server without a word, and a wrong TS major still
  reports a healthy `tsc --version`.

**Use LSP for symbol questions, grep for textual ones.** `goToDefinition`, `findReferences`
and `workspaceSymbol` resolve the symbol graph and answer "who calls this?" without the
false positives a name-based grep returns. But this repo's source-scanning guards are
deliberately textual — the Tailwind class literals in `bandFields.test.js`, the `is_published`
scans, the after-midnight threshold check — and LSP cannot see a class name inside a string or
a literal in a comment. Do not convert those to LSP; they are text scans on purpose.

The split is measurable. `git grep AFTER_MIDNIGHT_THRESHOLD_HOUR` returns ~30 hits, mostly
comments and strings inside the guard test; `findReferences` returns the 8 real bindings and
correctly drops `functions/api/events/timeline.js`, which mentions the constant only in prose
and actually imports the sibling `AFTER_MIDNIGHT_THRESHOLD_TIME`. Each tool is right about a
different question.

**`jsconfig.json` at the repo root is load-bearing — do not delete it.** It exists solely to
give tsserver a project: nothing imports it and it emits nothing (`noEmit: true`). Without it,
tsserver falls back to inferred-project mode, which indexes only files already opened — and
then `findReferences` on `AFTER_MIDNIGHT_THRESHOLD_HOUR` reports "3 references across 1 files",
silently omitting `functions/event/[slug].js` and the test that imports it. That is the sibling
sweep's worst failure shape: not an error, but a confident and incomplete answer. With the
project file the same query returns 8 across 3. Adding it was verified 2026-08-13 to leave
`npm run build --prefix frontend` (exit 0) and the 1127-test backend suite green.

<!-- Global instructions for all agents go above this line -->

## Gemini-Specific Instructions
- When running as Gemini, your role is a "Draftsman".
- Focus on drafting initial patches, fixing small bugs, and writing unit tests.
- Always push your work to a new feature branch named `gemini/issue-[number]`.
- Do not attempt to merge code directly into the `main` or `master` branches.
