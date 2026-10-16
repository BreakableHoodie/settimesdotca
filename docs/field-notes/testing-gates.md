# Testing gates

Moved verbatim from `CLAUDE.md` on 2026-10-16, when it passed the 150k-character
limit. `CLAUDE.md` keeps the rules; this file keeps the incidents, measurements
and reasoning behind them. Read it before changing the code a section guards.

## Verify guards against the failure they guard, not the success
**Code whose only job runs when something breaks must be tested broken.** A
guard, a diagnostic, a timeout, a retry, an error handler — none of it is
exercised by the happy path, so a green run says nothing about whether it works.

Five instances in one day (2026-08-19), all shipped after reading the code and
all caught only by _running_ the failure:

| Guard                                             | What it did on the failure path                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `curl` probe in the Lighthouse diagnostics (#879) | Unbounded — would hang to the 15-minute job timeout in the _wedged_ case it existed to detect, costing the artifact upload                                                                                                |
| `ss` listener check (#879)                        | Printed nothing when nothing was listening — "no listener" is the crashed-vs-wedged signal, and silence reads as command failure                                                                                          |
| Exit-status capture in the apt bound (#882)       | `code=$?` after `if cmd; then return 0; fi` read the **if-statement's** status, not the command's — an `if` whose condition fails with no `else` returns 0, so **every failure was captured as 0 and treated as success** |
| `timeout` without `-k` (#882)                     | Sends SIGTERM, which apt-get can ignore — process survives, step still hangs                                                                                                                                              |
| Retry around the apt bound (#883)                 | Attempt 1's SIGKILLed apt-get orphan kept `/var/lib/apt/lists/lock`, so attempt 2 could never succeed                                                                                                                     |

The pattern is identical every time: the happy path was written and verified;
the failure path was written and _assumed_.

**What actually catches these** is cheap — substitute the failing thing and run
it:

```bash
# Prove the listener check reports "none" when ss returns an empty header
ss() { return 0; }; run_listener_check          # -> "  none", not silence

# Prove the bound kills a process that IGNORES SIGTERM
run_bounded "stubborn" bash -c 'trap "" TERM; sleep 60'   # -> 137 in ~3s, not 60s

# Prove the exit status you capture is the COMMAND's, not a compound's
f() { if false; then return 0; fi; code=$?; echo "$code"; }   # -> 0  WRONG
g() { code=0; false || code=$?; echo "$code"; }               # -> 1  right

# Prove the bounded probe cannot outlive its own budget
time run_bounded "hang" sleep 600                # -> ~300s, not 600s

# Prove a retry survives a KILLED predecessor, not just a cleanly-failed one
```

That last line is the one that cost the most: the retry was tested against a
command that failed _cleanly_, never against one that had been _killed_ — the
only case the step actually produces. It has no one-liner because proving it
needs the predecessor's orphaned children still holding a lock, which is the
whole reason a naive retry fails (#883).

**The status-capture probe earns its place twice over.** The original diagnosis
of that bug was itself wrong — it blamed `local` for resetting `$?`, which
`false; local code=$?` disproves in one line (it yields 1). The real culprit is
that an `if` whose condition fails and has no `else` returns 0. A wrong
explanation shipped into a code comment and this file before a probe caught it;
running the two-line comparison above would have caught it immediately.

**Ask before shipping any guard: what does this print, and what does it return,
when the thing it guards is actually broken?** If you cannot answer from a run
rather than from reading, it is not verified. This is the same discipline as
mutation-testing an assertion (see the vacuous-test class), applied to
operational code instead of tests.

## Before every commit — required checklist
**Canonical entry point: `make gate`** — runs the Make targets `format` → `format-check` → `lint-all` → `check-citations` → `test` → `build` (`format-check` wraps the `npm run format:check` script below) for both stacks with real exit codes (see `Makefile`, `AGENTS.md`). Run it before every commit; do not commit if it fails. The npm commands below are per-stack subsets for running part of the gate or debugging a failing step; `validate:openapi` is conditional and not a `make gate` prerequisite.

**`make gate` covers every file type we maintain, not just JavaScript.** Until
2026-08-29 it ran ESLint and Prettier and nothing else, so 69 SQL files, 17 YAML
files and 71 Markdown files were checked _only_ by CodeRabbit — after the PR was
open, which is the force-push round-trip `make review` exists to avoid. `lint-all`
now fans out to `lint` (ESLint), `lint-md`, `lint-sh`, `lint-yaml`, `lint-sql`
and `lint-json`.

Five things about those targets are deliberate:

- **They fail with an install hint; they never skip.** `shellcheck`, `yamllint`
  and `sqlfluff` are external. A target that passes when its tool is missing is
  worse than no target — that is precisely the bug `lint-md` shipped with, where
  it was absent from `.PHONY`, so a stray file named `lint-md` made `make` report
  "up to date" and lint nothing. **Both that trap and the pipeline one below are
  now guarded** by `scripts/__tests__/makefileGuards.test.js` (#1070): it fails
  if any target is missing from `.PHONY`, or if a recipe ends in a filter whose
  status would mask the real one. Both halves assert they can still find what
  they scan for, because a parser that matches nothing reports "all clear"
  forever.
- **File lists use `git ls-files --cached --others --exclude-standard`**, not a
  bare `git ls-files`. The latter sees only _tracked_ files, so a brand-new file
  you have not `git add`ed — the one most likely to be wrong — sails through.
  `--exclude-standard` still honours `.gitignore`. Each recipe then tests
  `[ -f "$f" ]`, because that list _also_ names tracked files you have deleted
  but not yet staged — a legitimate state that would otherwise hand a missing
  path to the linter and fail the gate for no reason.
- **`lint-json` passes the path as `process.argv[1]`, never interpolated into
  the `node -e` source.** A filename containing a single quote would otherwise
  close the JS string literal and execute whatever followed, on every
  `make gate`. Each recipe also accumulates `rc=1` in a `while` loop
  **redirected from a file** rather than `exit`ing inside a pipeline — a `while`
  fed by a pipe runs in a subshell, where the exit never reaches the recipe. That is the same shape as the
  status-capture bug in #882.
- **`.yamllint` and `.markdownlint.json` are tuned to this corpus, not stock.**
  `extends: default` alone produced 435 YAML findings, 353 of them `line-length`
  at the default 80 chars, which no GitHub Actions workflow or OpenAPI spec
  respects. Tuning took it to 1 real defect. Treat a huge finding count as
  evidence the config is wrong for the corpus before treating it as debt.
- **`lint-json` checks validity, not formatting.** Running Prettier over these
  files only explodes compact arrays past `printWidth`, churning load-bearing
  files like `_routes.json` while catching no defect. An unparseable file is the
  real failure, and `ground-truth.json` has no code reading it that would fail
  loudly.

`sqlfluff` skips `archive/`: those migrations use `ALTER TABLE … ADD COLUMN IF
NOT EXISTS`, which SQLite does not support and sqlfluff cannot parse. They are
archived and never applied.

Run all steps that apply. Do not commit if any step fails.

**Frontend changes (`frontend/src/`):**

```bash
cd frontend
npx prettier --write "src/**/*.{js,jsx,json,css}"  # fix formatting first
npm run lint && npm run format:check                 # ESLint + verify format
npm test -- --run                                    # unit tests
npm run build                                        # catch import/compile errors E2E would catch
```

**Backend changes (`functions/`):**

```bash
npm run format              # prettier --write on functions/ + scripts/ (fix first)
npm run format:check        # verify formatting is clean
npm run lint                # ESLint on functions/ + scripts/ (must be 0 errors)
npm run validate:openapi    # if docs/api-spec.yaml changed
npm test                    # from repo root — runs fine locally, including Apple Silicon
```

**Why `--write` before `--check`:** `format:check` (what CI runs) only reports errors — it never fixes them. Always run `--write` first so the commit is already clean.

**Why `npm run build`:** E2E tests run against the built app. A build failure will fail E2E in CI without a clear error. Running `build` locally catches broken imports, missing exports, and Vite errors before they reach CI.

**E2E tests** require a live wrangler dev server and are slow — run them only when changing routes, auth flows, or anything the E2E suite targets. The build check above catches most issues.

## The mutation gate — documented invariants, proven executable
```bash
make mutation-gate      # ~8s; NOT part of `make gate`
```

**The problem it solves:** this repo has a recurring _vacuous test_ class —
tests that pass against both the correct and the broken implementation. The
worst instance is recorded under "Band Announcements": deleting
`AND verified = 1` from either recipient query left **all 1,169 backend tests
green**, because ten test files all seeded `verified = 1`, so no fixture could
distinguish a gated query from an ungated one. The suite looked thorough and
proved nothing about the property it most needed to prove.

CLAUDE.md documents invariants in prose and asks contributors to "verify by
mutation" by hand. Nothing enforced it, so it decayed. `scripts/mutation-gate.mjs`
automates it: for each documented invariant it applies the exact one-line source
mutation that would break it, runs the named test file(s), and **requires them to
go red**. Then it restores the file and verifies the restore.

**What it does and does not tie together — read this before relying on it.**
The gate makes the listed _invariants_ executable: it proves each guarded
behaviour still has a test that fails when the behaviour breaks, and a code
change that alters or renames a guarded line fails the build as pattern drift.

It does **not** read this file. Each entry carries the CLAUDE.md section name as
a plain string, for whoever reads a failure. An earlier draft of this section
claimed the gate cross-checked that name ("the prose cannot silently drift
without a red build"), which was exactly the confidently-wrong documentation
this whole file exists to prevent; it was caught in review, not by a test.

**The pointer half is now checked**, by
`scripts/__tests__/mutationGateCitations.test.js`: every `CLAUDE.md '<Section>'`
an entry cites must still match a heading here, so renaming or deleting a cited
section fails the build instead of leaving a dangling reference. The two gates
are complementary and neither implies the other — verified by renaming
`## Band Announcements` and watching `make mutation-gate` stay **green** while
the citation test went red.

Comparison strips backticks and collapses whitespace, which is load-bearing
rather than cosmetic: the live heading is ``Public event visibility is `status`,
never `is_published` (#800) — …`` while the citation is plain text, and a naive
substring match reports that as dangling. It did, on the first run — a false
positive caught by reading the heading instead of trusting the matcher.

**What is still unchecked is the prose itself.** The guard proves a heading by
that name exists, never that the words underneath still describe the invariant.
Editing the body of a correctly-named section leaves both gates green, so a
green build is still not evidence that this file's _content_ is current — only
that its cross-references resolve.

Three properties are load-bearing, each learned from a failure recorded in this
file:

- **A `find` string that is absent — or matches more than once — is a GATE
  FAILURE, not a skip.** Patterns drift as code changes, and a gate whose
  patterns silently no-op reports all-green while testing nothing. Same shape as
  `lint-md` missing from `.PHONY`. If you rename or reword a guarded line, the
  gate fails and you update the `find` field; that failure is the tool working.
- **A surviving mutant is a real finding, reported loudly** with the invariant,
  file and expected tests named. It means that invariant's tests are vacuous.
  Do not delete the entry to get green — fix the test, or record it in
  `KNOWN_SURVIVING` with an issue reference.
- **It refuses to run on a dirty working tree** (scoped to the files its table
  touches). It cannot tell its own mutation from an edit in progress, and a
  crash mid-run could destroy real work.

**Deliberately NOT part of `make gate`.** `gate` must stay fast and
offline-capable; this shells out to git and spawns vitest once per mutation. It
runs as its own job in `quality.yml`.

**Scope is backend (`functions/`) only.** The frontend runs a separate vitest
project with its own config and jsdom environment; wiring it in here would mean
a second invocation with different flags and cwd. A `frontend/` companion is a
reasonable v2 — the frontend after-midnight threshold in
`frontend/src/utils/festivalDays.js` is the obvious first entry.

**What it does NOT do:** it proves a _named_ test would catch a _specific_
break. It says nothing about invariants absent from its table, nor about test
quality generally. Ten entries is a floor, not a certificate — add one whenever
you add or change a test for something this file documents.

## Hand-rolled mutation runs — check the harness ran, not just its exit code
`make mutation-gate` is the maintained path and has none of this problem. But
ad-hoc mutation checks — strip a line, run a suite, expect red — are a constant
habit here, and an exit code alone cannot tell "the test caught the mutation"
apart from "the test never ran". Both are `1`.

Measured 2026-09-09 while gating #1133. Six mutations reported exit 1 and were
recorded as caught. They were not: the log said

```text
No test files found, exiting with code 1
```

**The cause is zsh, and it will bite again.** The runner was wrapped in a
function taking the suite list from a variable:

```sh
SUITES="dir/ a.test.js b.test.js"
run() { npx vitest run $SUITES; }     # WRONG in zsh
```

**zsh does not word-split unquoted parameter expansions; bash does.** So vitest
received one filter string containing spaces, matched nothing, and exited 1. The
same function pasted into bash would have worked, which is exactly why it looks
correct.

Use an array and expand it **quoted** — `SUITES=(dir/ a.test.js)` then
`"${SUITES[@]}"`, which is right in both shells — or pass the paths literally.
Bare `$SUITES` on an array is the same bug mirrored: correct in zsh, but in bash
it expands to the FIRST ELEMENT ONLY, so the runner quietly executes one suite,
passes, and reports exit 0. That is the false-green direction, which this file
holds to be the never-noticed kind.

Two habits that catch it, both cheap:

- **Run the baseline first and require it GREEN.** A baseline that is not
  `exit=0` with a real passing count means the harness is broken before any
  mutation is applied. This alone would have caught it six times over.
- **Assert on the failing test NAME, not the exit code.** A caught mutation
  names the test that caught it, and that name should be the one you predicted.
  It also catches the _other_ false positive: a mutation that fails everything
  for an unrelated reason. Dropping `AND p.event_id = ?` while leaving its
  `.bind()` argument in place did exactly that — 12 tests failed on a bind-count
  error, which looks like a strongly-caught mutation and proves nothing about
  the predicate. Removing the bind too narrowed it to the single test that
  actually distinguishes the gate.

Same family as the rest of this file's tooling traps: a gate that reports a
verdict without having looked. Here it failed red rather than green, which is
lucky — a false red is noticed eventually, a false green never is.

## The coverage floor — no handler may be entirely untested
```bash
make coverage-floor      # runs the coverage suite, then the check
```

**The problem it solves:** coverage thresholds in `vitest.config.js` are
**global averages**, and an average cannot see a file-shaped hole. A brand-new
200-line handler with no tests moves the global number by a rounding error and
passes. Measured on 2026-08-31: the backend sat at **81.67%** statements against
a 75% floor while **three files were at 0%** — every line unexecuted, no test
importing them at all.

`scripts/check-coverage-floor.mjs` reads `coverage/coverage-final.json` and
fails if any file under `functions/api/` has 0% statement coverage. It runs in
`quality.yml`'s existing **coverage** job, immediately after `npm run
test:coverage` — it must stay in that job, because the file it reads exists only
as a side effect of that step.

**It landed with an EMPTY allowlist** (`MAX_ALLOWED = 0`), deliberately: the
three dark files were covered first. An empty allowlist is strictly stronger
than a seeded debt register and removes the "seed then forget" failure entirely.
Adding an entry means shipping an untested handler — the thing being prevented.

Three properties are load-bearing:

- **It measures EXECUTION, not filenames.** The frontend ratchet
  (`missingTestGate.test.js`) keys on a matching test file over 400 lines. That
  does not transfer here: backend suites are feature-named — `api-key-auth.test.js`
  covers `_middleware.js` — so basename matching flags 23 files, 18 of them at
  59–92% coverage. Measuring execution has no false positives by construction.
- **A missing coverage file is a FAILURE, not a skip**, with the command to
  produce it. A gate that passes because its input is absent is worse than none.
- **It detects its own blindness.** vitest reports untested files only because
  `coverage.include` is set; if that changes, dark files vanish from the map and
  a naive check would report "all clear" while seeing nothing. It compares the
  on-disk inventory against the coverage map and fails when they diverge.

**Why not vitest's own thresholds** — both were measured and neither works: a
glob threshold group aggregates, so five 0% files hid inside the group average
and it exited 0; `perFile: true` applies the global 75/68/84/76 to _every_ file
and produced 113 errors.

**What it does NOT do:** it proves a file was executed, not that it was tested
well. One test that imports a handler and asserts nothing takes it off this
list. That is why the mutation gate exists alongside it — this one catches
"nobody started", that one catches "the test cannot fail". Neither replaces the
other.
