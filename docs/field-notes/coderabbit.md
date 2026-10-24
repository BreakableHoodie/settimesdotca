# CodeRabbit — field notes

> Moved out of `CLAUDE.md` on 2026-09-22 to keep it under the harness's
> 150k-char load limit. `CLAUDE.md` keeps the rules; this file keeps the
> evidence and history behind them. Edit both together.

## Reading `make review` and the PR bot

**When the CLI cites a "coding guideline", look it up yourself — it is the one
claim it structurally cannot substantiate.** The CLI raises guideline findings it
inherited from the shared model but cannot point at the file, because it never
loaded `.github/instructions/**`. The PR bot raises the same finding _with_ the
citation. Treating the uncited version as unfounded is how you end up reversing
yourself post-open.

Worked example, #1048 (2026-09-01). The CLI said "return `undefined`, not
`null`, per coding guideline". I grepped `.github/instructions/` for
`prefer.*undefined` and `return undefined`, found nothing, and declined it **in
the PR body**. The rule is real — `nodejs-javascript-vitest.instructions.md:16`,
"Never use `null`, always use `undefined` for optional values" — and my patterns
simply did not match its wording. The PR bot then raised it with the file and
line, and the decline had to be publicly retracted.

Two lessons, and the second is the general one: grep the _cited wording_, not a
paraphrase of it; and **a clean grep is a hypothesis, not a finding** (the same
trap as #996). The cheap habit that avoids the whole round trip: when a CLI
finding says "as per coding guidelines", open the five files in that directory
that apply to the changed file type before agreeing or disagreeing.

**Passing `-c .github/instructions/*.md` was tried and is NOT adopted.** In the one run measured, it failed to reproduce the PR's actual finding and instead emitted a false **critical** — claiming Vitest could not parse a file that parsed and passed 3/3 — on a run whose log was full of `fetchWithRetry` errors. A gate that emits false criticals trains you to skim the actionable bucket, which is the same "signal drowns" failure the streaming-link audit hit in #871. One degraded trial is not proof the flag is broken; it is enough not to wire it into a standing gate unmeasured. Re-test properly (several runs, good network) before revisiting.

`make gate` deliberately does **not** include it — `gate` must stay fast and offline-capable; `review` needs the network and takes minutes.

**A green CodeRabbit check does not NECESSARILY mean the diff was reviewed.** When every
changed file is excluded by a path filter, CodeRabbit posts _"Review skipped"_
and the status check still reports **pass**. Measured on #1083, a security bump
whose only change was `package-lock.json`: the badge was green and nothing had
been read.

The exclusion itself is correct and deliberate — `.coderabbit.yaml` sets
`!**/package-lock.json` and CodeRabbit ignores it by default too (the skip
message lists the pattern twice for that reason). A lockfile diff is generated
hashes; line-level review of it is noise.

**So for a LOCKFILE-ONLY dependency change, do not read CodeRabbit — read Snyk's
PR check and the Dependabot alerts.** The qualifier is load-bearing: CodeRabbit
skips a PR only when **every** changed file is excluded, so a dependency bump that
also touches `package.json`, a workflow or application code stays fully in its
review scope, and Snyk plus Dependabot do not substitute for reading that code.
Check what the PR actually changed before deciding CodeRabbit had nothing to say.
This used to say `dependency-review`, which was the
check designed for the class and which passed on #1083 alongside gitleaks and
GitGuardian. **That workflow no longer exists** (removed 2026-09-16 — see "The
security tooling this repo actually has"), so the advisory half of the job falls
to Snyk and Dependabot. Both still work on a private Free-plan repo: the very
push that made this repo private was answered with _"GitHub found 3
vulnerabilities on BreakableHoodie/settimesdotca's default branch"_, which is
Dependabot alerting on a private repo — verified, not assumed.

**But be precise about what an advisory check covers, because two different
threats hide behind one green badge.** It compares the PR's dependency changes
against advisory databases and fails on a package with a _known_ vulnerability at
or above its configured severity. That is the #1083 case exactly, and it is
genuinely covered.

It does **not** verify that a lockfile's `resolved` URLs still point at the
expected registry, nor re-check `integrity` against what it fetches. A lockfile
entry carries `version`, `resolved` and `integrity`; an edit repointing
`resolved` at an attacker-controlled host while leaving the version untouched
raises no advisory, and `npm ci` then fetches whatever `resolved` names.
**That gap is now GUARDED** by `scripts/__tests__/lockfileIntegrity.test.js`
(2026-09-04). It discovers every `package-lock.json` in the repo, asserts each
`resolved` URL points at an allowlisted registry host, and asserts every remote
entry carries an `integrity` hash. Baseline when added: 1,295 entries across two
lockfiles, all `registry.npmjs.org`, all hashed -- so the allowlist starts at one
host and a second is a deliberate diff.

Mutation-verified against the real attack shape: repointing one entry's
`resolved` at another host while leaving `version` untouched -- which raises no
advisory, so an advisory check stays green -- turns the guard red and names the
package. That guard is now MORE load-bearing than when it was written: it is a
plain test in the suite, so unlike the checks removed on 2026-09-16 it does not
depend on a GitHub plan tier. Lockfiles are discovered rather than listed, so a new workspace is
covered the day it appears.

The practical split: routine generated churn (a Dependabot group bump, a
transitive patch) is well served by the advisory check and needs no human diff
read. A lockfile change _not_ produced by npm on your own machine deserves one,
whatever the checks say.

This is the same shape as `lint-md` missing from `.PHONY` (make reported "up to
date" having linted nothing), the Lighthouse artifact that uploaded nothing while
only warning, and axe reporting `incomplete` rather than a violation on a
gradient: **green meaning "did not look", not "looked and found nothing."** When
a gate goes green on a change you expected it to have opinions about, check
whether it ran at all.

**A review's findings are not all in its threads.** CodeRabbit posts
"outside diff range" comments in the review BODY, because GitHub cannot anchor
an inline comment to a line the diff does not touch. A GraphQL query over
`reviewThreads` -- the obvious way to enumerate findings, and the one used here
for a long time -- returns every inline thread and **none** of those. They are
invisible unless the body is read.

Missed one on #1105 (2026-09-04): `--match --color-accent-500` set
`flags.match = true` and died with "--match <pattern> is required", an error
about a flag that WAS supplied. Not hypothetical -- `--color-accent-500` is a
theme token used throughout the CSS and every SQL comment in `migrations/`
begins with `--`. The owner spotted it in the PR; the tooling had not.

So enumerate BOTH: the threads, and each review's `body`. An audit of #1097
through #1104 afterwards found no others, so this was a first occurrence rather
than a backlog -- but nothing in the thread query would have said so either way.

Same family as the rest of this section: a green-looking read that quietly saw
less than it appeared to.
**Nitpicks hide in the same place, and are not always nits.** Alongside
outside-diff findings, CodeRabbit collapses a "Nitpick comments" section into a
`<details>` block in that same body. On #1105 the one nitpick was that a test
asserting "a `--with-file` operand starting with `--` is still read as a path"
passed an ABSOLUTE path -- `/var/.../--repl.txt`, which does not begin with
`--` as an operand at all. The test could not fail for the reason it claimed,
and did pass against the broken parser. Labelled Trivial; it was a vacuous test,
which is the defect class this file cares most about.

So read the body for BOTH sections. Judge a finding by what it says, not by the
bucket it arrived in.
Related, and why the push-budget hook is not "wrong": it counts **pushes**, and a
skipped review consumes none of the hourly allowance. The count is therefore
conservative — you sometimes have more budget than it thinks. Its one network
call (below) exists only to stop counting **draft** pushes, and it is built to
fail toward counting.

## CodeRabbit has a hard review budget — batch your pushes

**Every push to a PR branch that changes at least one review-eligible file
triggers a review.** A push touching only path-excluded files (a lockfile, say)
is skipped and uses none of the allowance.

**Past the allowance, reviews are rate-limited, not billed — since
2026-09-24.** Before that date the account had the usage-based add-on, so an
over-limit review was processed and billed. The add-on was switched off that
day. The cost of overshooting moved from money to coverage: CodeRabbit posts a
rate-limit notice in place of a review, and **does not re-run it when the window
refills**. Someone has to comment `@coderabbitai review`; until then the PR's
head commit is unreviewed while every other check reads green. Check remaining
capacity with `@coderabbitai rate limit`.

**The monitor: `make await-review PR=<n>`** (`scripts/coderabbit-await-review.mjs`).
Two tempting signals are both wrong, and the script exists because of that:

- **The CodeRabbit check being green.** CodeRabbit's docs say the rate-limited
  check _passes_ by design so it never blocks a merge. Green is green either way.
- **A review object on the head commit.** Of 32 merged PRs checked on
  2026-09-24, 13 had `CodeRabbit: success — Review completed` on the head but
  no review object for it. A clean review posts only the summary comment.

What works is the `CodeRabbit` **commit status description** on the head SHA:
`Review in progress` → `Review completed`. The rate-limited description
(`Review rate limited`) comes from the docs. It had not been seen on this repo
when the script was written, since billing had absorbed every overage, so the
match is deliberately loose (`/rate.?limit/i`). Any unrecognised description is
treated as _not_ reviewed. Record the real wording here the first time it
appears.

Two more status behaviours, both first seen on #1200 (2026-09-24), both of
which the first version of the monitor got wrong:

- **"Review skipped" is not final.** The head read `Review skipped` at
  15:37:42, `Review in progress` 25 s later, then `Review completed`. The
  monitor only accepts a skip that persists for 5 minutes.
- **A superseded review never finishes.** The PR's first commit still read
  `Review in progress` hours after the next push replaced its review. An
  in-progress status older than 20 minutes is treated as abandoned. Without
  that, "wait while an earlier review is running" waits forever.

**The allowance is DYNAMIC — read it from a current footer, never recall it.**
This section twice stated a static figure and was twice wrong. It first said
"CodeRabbit Pro allows 5 PR reviews per developer per rolling hour", with the
hook encoding `LIMIT=5`; the plan is **Essentials**, so the Pro figure never
applied here at all. It was then corrected to a flat "1 review/hour", which was
right on the day and wrong five days later. CodeRabbit states the real figure
in the footer of every review it posts, and this account has been observed at
two values:

> 2026-09-04, #1113 — **Included review availability:** 0 reviews are currently
> available. Your included PR review attempts over the past 7 days set your
> current allowance at **1 review per hour**. **Plan**: Essentials

<!-- two separate quotes, five days apart -->

> 2026-09-09, #1134 — **Included review availability:** 3 reviews are currently
> available. Your included PR review attempts over the past 7 days set your
> current allowance at **4 reviews per hour**. **Plan**: Essentials

<!-- a third quote, one day later -->

> 2026-09-10, #1154 — **Included review availability:** 0 reviews are currently
> available. Your included PR review attempts over the past 7 days set your
> current allowance at **3 reviews per hour**. **Plan**: Essentials

<!-- a fourth quote, twelve days later -->

> 2026-09-22, #1182 — **Included review availability:** 3 reviews are currently
> available. Your included PR review attempts over the past 7 days set your
> current allowance at **5 reviews per hour**. **Plan**: Essentials

Four readings, four different numbers — 1, then 4, then 3, then 5. It **recovers** as
7-day usage falls and **falls** as usage rises, so it moves in both directions.
That is the durable fact, and it is why no number written here stays true —
including these four. `.githooks/pre-push` tracks the most recent observed
footer (`LIMIT=5` as of 2026-10-12, #1266; `2` on 2026-09-24, the first reading after usage billing was switched off; `5` on 2026-09-22) and records each dated observation in its own comments, so a stale
value is visible as a stale date rather than as a bare constant. Move it only
against a CURRENT footer.

**Erring low is not free, which the 2026-09-09 session demonstrated.** With the
hook at `LIMIT=1` while the real allowance was 4, a ready PR sat unpushed for
~30 minutes waiting on a budget that had already refilled. A guard that blocks
when three reviews are genuinely available teaches you to reach for
`CODERABBIT_OVERAGE=1` by reflex — and an override you always use is not a
guard. The hook cannot read the allowance itself, so the only correction
available is reading a footer and updating it.

**The expensive failure is concentration, not volume.** The same number of pushes spread across a day costs nothing, because the window keeps refilling. PR #998 burned **4 reviews in ~25 minutes on a two-line change** — which, with #997's review already inside the same rolling hour, is what reached the limit of 5. Fixes went out one at a time instead of batched — a stale comment, then an E2E failure, then an incomplete sweep of that same failure, then a nit on prose added two pushes earlier. Three of the four were avoidable by reading the diff and running the right suite locally first.

`make hooks` installs a tracked `pre-push` guard (`.githooks/pre-push`, wired via `core.hooksPath`). It warns at the first review in the window and **blocks at the allowance**, reporting how many minutes until the budget refills. Run it once per clone — hooks are not cloned with the repo.

**The rule for overriding is urgency to land, NOT issue priority.** Priority is the wrong axis: a p1 fixed correctly costs one review, while a p3 botched four times costs four — overage comes from _rework_, not importance, and a "p1 only" rule would license sloppiness exactly where correctness matters most.

**Waiting is free.** The window is rolling, so the budget refills on its own. Ask only whether this must land _before it refills_:

- show day, a production incident, or someone blocked on you → override
- everything else → batch the remaining fixes and push once

```bash
CODERABBIT_OVERAGE=1 git push   # emergencies only; then `make await-review PR=<n>` before merging
```

The hook is POSIX `sh` and makes exactly one optional network call: `gh pr view --json isDraft` per pushed branch, so a push to a **draft** PR is not counted (CodeRabbit never reviews drafts, and CLAUDE.md says to iterate as one). With `LIMIT=2`, counting drafts blocked that workflow on the third push of the hour.

It used to make no network call at all, on the grounds that a hook which fails open when a tool is missing is worse than none. That rule still holds; the lookup respects it by only ever _removing_ a push on an explicit `true`. No `gh`, no network, no PR yet, an error, or a lookup slower than 5 s all count the push as before. The bound uses a SIGTERM-then-SIGKILL watchdog, not `timeout` (macOS does not ship it). `scripts/__tests__/prePushDraftLookup.test.js` runs the real hook against a fake `gh` in each of those failure modes; run it with `HOOK_SHELL=dash` to reproduce Ubuntu CI's `/bin/sh`. Two things changed the calculus (2026-09-25): `make await-review` is now the merge gate, so an undercount costs a wait rather than an unreviewed merge, and `LIMIT=2` made the false blocks frequent.

`lint-sh` globs `*.sh`, which would have skipped the hook silently, so that target now lists `.githooks/*` explicitly.

## Before opening a PR — AI review gate — `CLAUDE.md` text as of 2026-10-24

```bash
make review        # CodeRabbit review of this branch vs origin/main
make review-wip    # same, but for uncommitted working-tree changes
```

Requires the CodeRabbit CLI (`brew install --cask coderabbit`, then `coderabbit auth login`); both targets fail with an install/auth hint if it is missing.

**Run this before opening the PR, not after.** The same review runs automatically on the PR, so anything it finds post-open costs a fix plus a force-push round trip. Findings it has caught that the local gates did not: assertions that pass on the wrong branch's output, a spy recording statement _preparation_ rather than _execution_, and a SQL guard that stayed inert for legacy rows after a write-side fix.

**`make review` is a strict subset of the PR review, and the gap is structural — not flake.** The CLI does not load `.github/instructions/**`; the PR bot does. That is why `coderabbit review` has a `-c, --config <files...>` flag for "additional instructions" at all. Three findings on 2026-08-19 (#866, #873 ×2) appeared only post-open and every one cited _"As per coding guidelines"_, tracing to rules in that directory — e.g. `nodejs-javascript-vitest.instructions.md`'s "Write tests for all new features and bug fixes". **So a post-open `Minor` is expected, not a sign the pre-PR gate failed.** The CLI _does_ read `.coderabbit.yaml` and the `knowledge_base.learnings` (its output says "Based on learnings"); only the instruction files are missing.

`make gate` deliberately does **not** include it — `gate` must stay fast and offline-capable; `review` needs the network and takes minutes.

Reading CodeRabbit correctly — worked examples in `docs/field-notes/coderabbit.md`:

- **An "as per coding guidelines" finding from `make review` is unsubstantiated by construction** — that invocation passes no `-c`, so it never loads `.github/instructions/**` (a CLI run given `-c` would). Open the applicable instruction files and grep the _cited wording_ before agreeing or declining — a clean grep is a hypothesis (#1048). Passing `-c .github/instructions/*.md` was tried and is **not** adopted.
- **Green can mean "did not look".** CodeRabbit skips a PR whose every file is path-excluded and still reports pass. For a **lockfile-only** bump, read Snyk and Dependabot instead; `scripts/__tests__/lockfileIntegrity.test.js` guards `resolved` hosts and `integrity` hashes, which no advisory check covers. A lockfile change _not_ produced by npm on your machine deserves a human diff read.
- **Findings are not all in threads.** "Outside diff range" comments and the collapsed "Nitpick comments" live in each review's **body** — a `reviewThreads` query misses both, and a "Trivial" nitpick was once a vacuous test. Read threads _and_ bodies.

## CodeRabbit has a hard review budget — batch your pushes — `CLAUDE.md` text as of 2026-10-24

**Every push to a PR branch that changes at least one review-eligible file triggers a review** (a push touching only path-excluded files, such as a lockfile, is skipped and uses no allowance). The allowance is **dynamic** (it has read 1, 3, 4 and 5 reviews/hour on Essentials) — read it from a _current_ review footer or comment `@coderabbitai rate limit` on the PR, never from memory or this file. History: `docs/field-notes/coderabbit.md`.

**Usage-based billing was switched OFF on 2026-09-24.** Past the allowance a review is now **rate-limited, not billed** — so the failure changed shape from a bill to an **unreviewed commit**. CodeRabbit posts a rate-limit notice instead of a review, and nothing re-runs it when the window refills. A PR merged in that state ships a head commit no reviewer looked at, while every other check is green. That is the green-means-did-not-look class, and it is worse than the bill was, because nothing surfaces it.

- **Before merging any PR, run `make await-review PR=<n>` and merge only on exit 0.** It watches the `CodeRabbit` commit status on the PR's _current head_, waits out a rate-limit cooldown (parsed from CodeRabbit's comment, else 10 min), posts one `@coderabbitai review`, and keeps watching; a new push resets it. **Slowing down is the intended cost** (owner decision, 2026-09-24): a merge waits for the review, never the reverse. `--once` classifies without acting.
- **Do not judge "reviewed" by the check being green, or by a review object.** The rate-limited status _passes_ by design, and 13 of 32 merged PRs had a completed review with no review object on the head. Only the status description `Review completed` on the head SHA means a review ran — which is what the script reads (`scripts/coderabbit-await-review.mjs`, header has the evidence).
- **Concentration is the failure, not volume** — #998 burned 4 reviews in ~25 min on a two-line change. Read your own diff and run the right suite locally, then push once. Iterate as a **draft** PR (`auto_review.drafts: false`, so drafts cost nothing) and `gh pr ready` at the final state.
- `make hooks` installs `.githooks/pre-push`, which warns at the first review in the window and blocks at `LIMIT` (update it only against a current footer; erring low blocks pushes the budget would allow). POSIX `sh`; its one network call asks `gh` whether each pushed PR is a **draft** and skips counting only on an explicit `true` — every failure (no `gh`, offline, no PR, >5 s) counts the push, so it cannot fail open (`scripts/__tests__/prePushDraftLookup.test.js`). **Its counter is per developer, not per repo** (`~/.cache/coderabbit/push-log`, shared with `wrhn-mcp`'s hook — the two must agree on that path, not on counting rules), because the allowance is — a per-repo log let 3 + 3 pushes across the two repos reach 6 on 2026-09-24, while both hooks still had `LIMIT=5`, with neither noticing.
- **Override on urgency to land, not issue priority:** show day, a production incident, or someone blocked → `CODERABBIT_OVERAGE=1 git push`. It no longer bills; it accepts a rate-limited review, which `make await-review` then recovers. Everything else: waiting is free, the window refills.
