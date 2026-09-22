# CodeRabbit — field notes

> Moved out of `CLAUDE.md` on 2026-09-22 to keep it under the harness's
> 150k-char load limit. `CLAUDE.md` keeps the rules; this file keeps the
> evidence and history behind them. Edit both together.

## Reading `make review` and the PR bot

**When the CLI cites a "coding guideline", look it up yourself — it is the one
claim it structurally cannot substantiate.** The CLI raises guideline findings it
inherited from the shared model but cannot point at the file, because it never
loaded `.github/instructions/**`. The PR bot raises the same finding *with* the
citation. Treating the uncited version as unfounded is how you end up reversing
yourself post-open.

Worked example, #1048 (2026-09-01). The CLI said "return `undefined`, not
`null`, per coding guideline". I grepped `.github/instructions/` for
`prefer.*undefined` and `return undefined`, found nothing, and declined it **in
the PR body**. The rule is real — `nodejs-javascript-vitest.instructions.md:16`,
"Never use `null`, always use `undefined` for optional values" — and my patterns
simply did not match its wording. The PR bot then raised it with the file and
line, and the decline had to be publicly retracted.

Two lessons, and the second is the general one: grep the *cited wording*, not a
paraphrase of it; and **a clean grep is a hypothesis, not a finding** (the same
trap as #996). The cheap habit that avoids the whole round trip: when a CLI
finding says "as per coding guidelines", open the five files in that directory
that apply to the changed file type before agreeing or disagreeing.

**Passing `-c .github/instructions/*.md` was tried and is NOT adopted.** In the one run measured, it failed to reproduce the PR's actual finding and instead emitted a false **critical** — claiming Vitest could not parse a file that parsed and passed 3/3 — on a run whose log was full of `fetchWithRetry` errors. A gate that emits false criticals trains you to skim the actionable bucket, which is the same "signal drowns" failure the streaming-link audit hit in #871. One degraded trial is not proof the flag is broken; it is enough not to wire it into a standing gate unmeasured. Re-test properly (several runs, good network) before revisiting.

`make gate` deliberately does **not** include it — `gate` must stay fast and offline-capable; `review` needs the network and takes minutes.

**A green CodeRabbit check does not NECESSARILY mean the diff was reviewed.** When every
changed file is excluded by a path filter, CodeRabbit posts *"Review skipped"*
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
push that made this repo private was answered with *"GitHub found 3
vulnerabilities on BreakableHoodie/settimesdotca's default branch"*, which is
Dependabot alerting on a private repo — verified, not assumed.

**But be precise about what an advisory check covers, because two different
threats hide behind one green badge.** It compares the PR's dependency changes
against advisory databases and fails on a package with a *known* vulnerability at
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
read. A lockfile change *not* produced by npm on your own machine deserves one,
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
conservative — you sometimes have more budget than it thinks. Do not "fix" that
by having the hook query the API; it is deliberately POSIX `sh` with no `gh`,
`jq` or network call, because a hook that fails open when a tool is missing is
worse than no hook.

## CodeRabbit costs money past the included allowance — batch your pushes

**Every push to a PR branch triggers a review.** Past the included allowance
reviews are **not paused, they are billed** (this account has the usage-based
add-on). There is no natural brake; the discipline has to come from the workflow.

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

Three readings, three different numbers — 1, then 4, then 3. It **recovers** as
7-day usage falls and **falls** as usage rises, so it moves in both directions.
That is the durable fact, and it is why no number written here stays true —
including these three. `.githooks/pre-push` tracks the most recent observed
footer (`LIMIT=3` as of 2026-09-10) and records both observations in its own comments, so a stale
value is visible as a stale date rather than as a bare constant. Move it only
against a CURRENT footer.

**Erring low is not free, which the 2026-09-09 session demonstrated.** With the
hook at `LIMIT=1` while the real allowance was 4, a ready PR sat unpushed for
~30 minutes waiting on a budget that had already refilled. A guard that blocks
when three reviews are genuinely available teaches you to reach for
`CODERABBIT_OVERAGE=1` by reflex — and an override you always use is not a
guard. The hook still cannot ask (deliberately POSIX `sh`, no `gh`, no `jq`, no
network), so the only correction available is reading a footer and updating it.

**The expensive failure is concentration, not volume.** The same number of pushes spread across a day costs nothing, because the window keeps refilling. PR #998 burned **4 reviews in ~25 minutes on a two-line change** — which, with #997's review already inside the same rolling hour, is what reached the limit of 5. Fixes went out one at a time instead of batched — a stale comment, then an E2E failure, then an incomplete sweep of that same failure, then a nit on prose added two pushes earlier. Three of the four were avoidable by reading the diff and running the right suite locally first.

`make hooks` installs a tracked `pre-push` guard (`.githooks/pre-push`, wired via `core.hooksPath`). It warns at the first review in the window and **blocks at the allowance**, reporting how many minutes until the budget refills. Run it once per clone — hooks are not cloned with the repo.

**The rule for overriding is urgency to land, NOT issue priority.** Priority is the wrong axis: a p1 fixed correctly costs one review, while a p3 botched four times costs four — overage comes from *rework*, not importance, and a "p1 only" rule would license sloppiness exactly where correctness matters most.

**Waiting is free.** The window is rolling, so the budget refills on its own. Ask only whether this must land *before it refills*:

- show day, a production incident, or someone blocked on you → override
- everything else → batch the remaining fixes and push once

```bash
CODERABBIT_OVERAGE=1 git push   # emergencies only; it bills
```

The hook is deliberately POSIX `sh` with no `gh`, `jq`, or network call — one that fails open when a tool is missing is worse than none, and it runs on every push. `lint-sh` globs `*.sh`, which would have skipped it silently, so that target now lists `.githooks/*` explicitly.
