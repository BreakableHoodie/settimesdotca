# CLAUDE.md — settimesdotca

AI assistant context for this codebase. Captures non-obvious invariants, known gotchas, and conventions that aren't derivable from reading the code.

---

## Proactive Quality Gates

Invoke these without being asked — don't wait for the user to request them:

| Trigger                                                                                                           | Action                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Before opening any PR**                                                                                         | `make review` (CodeRabbit) — the standing review gate                                                                                                                                              |
| Multi-file feature touching a documented invariant, a migration, or an architectural decision                     | Invoke `pr-review-toolkit:code-reviewer` agent **in addition** to CodeRabbit                                                                                                                       |
| **Any bug you diagnose**                                                                                          | Sweep for other instances of the same class before calling it fixed — see "Sweep for siblings" below                                                                                               |
| **Adding/changing a test for a documented invariant in `functions/`**                                             | Add/refresh its entry in `scripts/mutation-gate.mjs` — see "The mutation gate" below. A test only ever seen passing proves nothing. Backend only: the gate does not cover `frontend/` yet          |
| **Adding a new handler under `functions/api/`**                                                                   | It must be executed by at least one test. `make coverage-floor` fails on any file at 0% — the global coverage average cannot see a file-shaped hole                                                |
| After editing `functions/utils/auth.js`, session endpoints (`sessions/`), or follow/unfollow/confirm-follow flows | Invoke `cloudflare-security-reviewer` agent                                                                                                                                                        |
| After writing or modifying error handling (`catch` blocks, `.catch()`, `try/finally`) in `functions/`             | Invoke `pr-review-toolkit:silent-failure-hunter` agent                                                                                                                                             |
| After editing `frontend/src/` public pages (outside `admin/`)                                                     | Scan for `text-white`/`bg-white` theme violations before finishing                                                                                                                                 |
| After adding/editing anything in `migrations/`                                                                    | Run `node scripts/regenerate-setup-complete.mjs` then `node scripts/check-schema-drift.mjs` — `setup-complete.sql`'s schema section is generated, never hand-edit it (CI enforces via quality.yml) |
| When SEO-relevant pages change (band pages, event pages, venue pages)                                             | Check structured data and `document.title` assignments                                                                                                                                             |
| **Start of a release cycle, or ~quarterly**                                                                       | Run the codebase report card — `docs/REPORT_CARD_REVIEW.md` (see below)                                                                                                                            |

The `hooks` in `.claude/settings.local.json` automate the mechanical parts (prettier, ESLint, pre-PR gate). The triggers above require judgment — apply them proactively.

**CodeRabbit is the standing gate; the code-reviewer agent is trigger-only.** CodeRabbit is diff-scoped and reliably catches convention breaks, unscoped test selectors, dead code, and latent time-bombs — and it runs on the PR regardless, so `make review` beforehand only saves a force-push cycle. The code-reviewer agent reads across files and earns its cost when the question is "does this violate an invariant or drift from the architecture." Don't block on Copilot; in practice it duplicates CodeRabbit.

### The codebase report card — run it on a cadence

`docs/REPORT_CARD_REVIEW.md` grades the whole repo across nine
categories, fixes what is safe, and re-grades. It is **tracked in this repo on
purpose**: the original lived outside the working tree, where a fresh clone,
CI, or a delegated run would never find it — the same failure as the untracked
`instructions/` tree in #818.

**Tracked in git, and listed in `mkdocs.yml`'s `exclude_docs` block** (owner
decision, 2026-08-20). Why that block matters has changed; that it matters has
not. While the docs were published it was load-bearing: `docs/*.md` shipped to
docs.settimes.ca regardless of the mkdocs `nav`, so `exclude_docs` — not the
absent nav entry — was the only thing keeping this file off the public site.

**The site is published again** (restored 2026-09-25, when the repo went
public). It was retired from 2026-09-16 while the repo was private, because
GitHub Pages is unavailable to private repos on the Free plan; see
`.github/workflows/docs-site.yml` for the history and the retirement steps. So
the exclusion is load-bearing again: `docs/*.md` ships to docs.settimes.ca
whatever the `nav` says.

Keep it even if the site is ever retired again. It has to be in place _before_
publishing returns, not after, because this doc names past security gaps. Do not "fix"
the missing nav entry by adding one either; the file is meant to be absent from
the site, not merely unlinked in it.

**Cadence: at the start of a release cycle, or roughly quarterly — whichever
comes first.** It is deliberately not a per-PR gate. It reads the whole tree and
runs every gate, so it costs real time; CodeRabbit and the trigger-based agents
above cover the per-change surface. Run it when the question is _"what has
drifted while we were shipping?"_, not _"is this diff correct?"_.

**Run it after a season ends, before the next edition's build-out starts.** That
is when accumulated drift is cheapest to fix and least likely to collide with
event-critical work.

**What it is for, and what it is not.** It catches the class of problem no
diff-scoped reviewer can see: a coverage ratchet that drifted ten points below
actual and would have passed a double-digit regression; a two-tier cache module
whose second tier was exported and imported by nothing while five endpoints
copy-pasted its value; a dependency override pinned _inside_ its own vulnerable
range; a security control with zero test coverage because every fixture in ten
files seeded the passing case. None of those appear in any single diff. All four
were found by the first run (2026-08-20, #900–#917).

**Its findings are claims until verified.** That first run also produced three
wrong assertions that reached filed issues — "nothing validates zero-length
sets" (three of five write paths did), "these components have no tests" (a bad
`find`), "the roster query is unbounded" (capped at 500) — and three vacuous
tests of its own. Treat the output as a lead list to check, not a verdict, and
correct the record on the issue when a lead does not survive contact.

### Sweep for siblings

**When you diagnose a bug, find every other instance of that class before declaring it fixed** — and report the sweep, whether or not it found anything. No line-level reviewer does this; it sees only the diff in front of it.

The worked example is `performance_date` (#739 → #741 → #743). One endpoint dropped the field from its projection, so a multi-day event's sets all rendered with the event's start date. Fixing that one endpoint felt complete. It wasn't: the same defect was live on the venue page, on GenreDiscovery, and in the event recap's sort. Three more surfaces, found only because the class was swept afterwards — and one of them had already been stumbled on by hand.

The mechanical form is usually one grep. "Which files select `p.start_time` but never mention `performance_date`?" turns a vague worry into a table.

Prefer a durable guard over a repeat audit: a source-scanning test (as `bandFields.test.js` does for Tailwind class literals) collapses a whole bug class into one failing test.

### Verify guards against the failure they guard, not the success

**Code whose only job runs when something breaks must be tested broken.** A guard, diagnostic, timeout, retry or error handler is never exercised by the happy path. Five shipped in one day (2026-08-19, #879–#883) after the code was read, and each was caught only by running the failure. Substitute the failing thing and run it:

```bash
ss() { return 0; }; run_listener_check                     # -> "  none", not silence
run_bounded "stubborn" bash -c 'trap "" TERM; sleep 60'    # -> 137 in ~3s, not 60s
f() { if false; then return 0; fi; code=$?; echo "$code"; }   # -> 0  WRONG
g() { code=0; false || code=$?; echo "$code"; }               # -> 1  right
time run_bounded "hang" sleep 600                          # -> ~300s, not 600s
```

An `if` whose condition fails with no `else` returns 0, so `$?` after it is the compound's status, not the command's. `timeout` needs `-k`, because SIGTERM can be ignored. A retry must be proven against a **killed** predecessor whose orphans still hold locks, not a cleanly-failed one (#883).

Ask before shipping any guard: **what does this print, and what does it return, when the thing it guards is actually broken?** Answer from a run, not from reading. The incident table: `docs/field-notes/testing-gates.md`.

### The efficiency ladder — before you write

Adapted from the [ponytail](https://github.com/DietrichGebert/ponytail) ruleset. Before writing code, stop at the first rung that applies:

1. **YAGNI** — does this need to exist at all?
2. **Reuse** — does it already exist here? (`functions/utils/`, `frontend/src/utils/`, the `bandFields.js` registry, `prepareBands`)
3. **Standard library / platform** — does JS, Web Crypto, or D1 already do it? (see the PBKDF2 and TOTP invariants — this repo has repeatedly chosen the platform primitive over a dependency)
4. **Existing dependency** — does something already in `package.json` solve it?
5. **One line** — can it be one line?
6. **Minimum working code** — only then.

Deletion over addition. Boring over clever. Fewest files that work.

**The ladder runs after you understand the problem, not instead of it.** Trace the real flow end-to-end first. A short diff that patches a symptom is worse than a longer one that fixes the cause — the ladder ranks _solutions to the actual problem_; it does not rank problems by how cheap they are to make disappear. It defers to the debugging discipline, always.

**The ladder governs the fix. It does not govern the sweep.** The sibling sweep and its durable guard test are _requested work_ — part of the definition of done for any bug fix — never speculative additions for rung 1 to eliminate. And on the merits: one source-scanning test that retires a bug class permanently is less total work than re-running that sweep by hand on every future PR. **The guard is the lazy option**, not the expensive one.

Never be lazy about understanding, input validation, error handling that prevents data loss, security, accessibility, theme-token correctness, or anything explicitly asked for.

> Adopted as doctrine only — the ponytail plugin itself was evaluated and **not installed** (2026-08-06). Its hard rules ("no boilerplate that wasn't asked for", "shortest working diff wins") cut against the sweep discipline above, and its benchmark is n=4 on Haiku 4.5. Take the ladder, skip the installation; don't re-litigate.

---

## Agent Delegation Workflow (standing default)

**Delegate by default — do not do everything inline.** This is a permanent preference and overrides any base "don't spawn agents unless asked" default.

- **Opus / Fable ("big brain")** → engineering design, architecture, planning, and code/security review.
- **Sonnet** → implementation / mechanical coding (well-specified edits, test writing).
- **Orchestrator (Opus) still verifies:** read the diffs, run tests/lint/build, and run the security/code-review gates above before declaring anything done. Delegation never removes the verification step.

When a task has a clear implementation spec, dispatch a Sonnet agent to build it; reserve Opus/Fable for the design up front and the review after. Always follow a Sonnet implementation with a big-brain review pass — that second perspective catches whole bug classes a to-spec implementer stops short of.

### Verifying any delegation — `scripts/delegate-verify.mjs`

**A delegate's exit code and self-reported status are claims, not evidence. `git status` is the evidence.** Wrap every delegated run:

```bash
node scripts/delegate-verify.mjs -- <the delegation command>
node scripts/delegate-verify.mjs --allow-empty -- <read-only command>   # research/digest tasks
```

Exit codes: `0` succeeded _and_ changed files · `1` the command failed · `2` **reported success but changed nothing** · `3` the delegate committed on a protected branch · `4` usage.

Code `2` is the one that pays for the script. Measured 2026-08-13: an agy delegation returned exit `0` and `AGY_USAGE {"status":"SUCCESS"}` having touched **zero files** — headless agy had no `write_file` grant, so it described the work instead of doing it and still "succeeded". 96,825 tokens, nothing on disk, and nothing in its own output said so. The tool behaved exactly as its README documents ("ungranted writes leave the workspace untouched but report success"); the mistake was trusting the status field.

Code `3` enforces the other half of the contract below: **a delegate never moves `main`.** It may branch, commit and open a PR — that is the normal workflow now, and it routes the change through the ruleset (protected main, strict checks, threads resolved) rather than through someone remembering to look. What it must never do is commit on the default branch, which bypasses review entirely. A commit on a feature branch is reported, not failed.

The check is deliberately tool-agnostic — it wraps agy, OpenCode's relay, or anything else, because the failure is about _permissions and silent refusals_, not about any one vendor. It uses `git status --porcelain`, so a brand-new untracked file counts as real work (a `git diff`-only check would call that a no-op).

**Before the first real delegation on a new machine or after a tool upgrade, prove the write grant with a throwaway task** rather than discovering it on a task you cared about. One canary costs seconds; the failure above cost 96k tokens.

### Delegating to OpenCode

A third implementer on a separate subscription, via the `opencode-delegate` skill. **Full notes, measurements and history: `docs/field-notes/opencode-delegation.md`** — read it before your first delegation in a session.

- **Not in this repo.** Installed per-machine into gitignored `.agents/skills/` (`npx skills add amElnagdy/delegate-skills --skill opencode-delegate`); needs `opencode` on PATH and an authenticated provider (`opencode auth list`).
- **The relay does NOT commit.** It edits the tree and stops; the dispatcher reads the diff, re-runs `make gate`, and commits. So **dispatch only from a CLEAN tree on its own branch** (or a separate `git worktree`) — verify with `git status --porcelain` first.
- **Rules:** (1) always go through `relay.mjs`, never raw `opencode run`; (2) always pass `--model` explicitly, from the flat-rate provider — which prefix is flat-rate is a _lookup_ (`opencode models`, vendor docs), never inferred from a name; (3) the brief goes in a file (`--brief`), never argv; (4) `opencode.json`'s `instructions` array is a cost floor on every run — invariants only, every path tracked in git (`functions/__tests__/opencodeInstructions.test.js` enforces it). A task needing a domain instruction file names it in the brief.
- **Read cost with `make delegate-stats`, not `result.json`** — a free model reports `$0.0000` while consuming millions of tokens. A $0 model is free _for now_, not by contract.
- **Model names, prices and caps go stale** — re-derive them; compare models only by the same brief on the same repo state.

---

## Mission & Scope

settimes.ca is the multi-venue/multi-artist event platform for **Waterloo Region** (Kitchener-Waterloo, ON). The most recent edition, **Long Weekend Band Crawl Vol. 18** (event 37, `lwbc18`, single-day, October 11, 2026), ran and was **archived 2026-10-13**. No edition is published now; the next is expected in February 2027.

- **Focus:** Waterloo Region. This governs **product language** — marketing copy, meta descriptions, SEO targeting, "where this is for" statements. It is not a censor on fact: the platform has hosted an event outside the region (Buddies Fest 2, Tillsonburg) and those records stay accurate wherever they appear. The specific drift this rule exists to prevent is describing the site as serving Ottawa, which it does not.
- **Brand:** settimes.ca — no rebranding
- **Target event:** the next edition (expected February 2027); none is published yet
- **Both fan-facing and admin tooling are equal priority**
- **SEO is a priority** (band pages, event pages, local discovery, structured data)
- **Colour themes:** 4 user-selectable (dark + light presets) via Tailwind v4 CSS custom properties + `data-theme` on `<html>`, persisted in localStorage
- **Single photo per band** — extends existing `photo_url` / R2 upload flow; no video embeds

**Shipped editions** (all `status = 'archived'`): Vol. 18 (event 37, 2026-10-11), Vol. 17 (event 21, 2026-08-02, 22 bands across 6 King St N venues — Blue Room, Princess Cafe, Prohibition Warehouse, Revive Karaoke, Room 47, Roost) and Buddies Fest 2 (event 36, 2026-08-07→09, Tillsonburg — the first multi-day production event). Their lineups and venue rosters are live data now, not spec; read them from D1 rather than from this file.

**Between seasons is a supported state, not a bug**, and since Vol. 18 was archived on 2026-10-13 we are in it again. Measured against production on 2026-10-13:

| Surface                                         | Now                                    | Why                                            |
| ----------------------------------------------- | -------------------------------------- | ---------------------------------------------- |
| `/api/events/public` (defaults `upcoming=true`) | **0**                                  | event-driven; no published future event        |
| `/api/events/timeline`                          | `now` 0, `upcoming` 0, `past` 10       | same                                           |
| **iCal feed**                                   | **0** `VEVENT`s                        | performance-driven; no upcoming published sets |
| `/api/stats/public`, `sitemap.xml`              | populated (298 performances, 286 URLs) | archived editions                              |

**The iCal zero is the trap once the next edition is published.** From 2026-08-28 until its lineup was announced, Vol. 18 was `published` with zero performances, and the feed's zero read identically to today's while meaning _published event, lineup not yet announced_, not _no published event_. Diagnose the two apart by asking which layer the surface reads — an **event**-driven surface or a **performance**-driven one — rather than by the number.

`EventTimeline` still has its dedicated between-seasons empty state and auto-expands Past; that path is live again now that Vol. 18 is archived. Before treating any such zero as a bug, check both halves: is an event actually `published`, **and** does it have performances?

Canonical active roadmap: `docs/ROADMAP.md`. Use it for handoffs between Claude, OpenCode, and humans.

**Track remaining/deferred work as GitHub issues** (`gh issue create`) — not just chat threads or ad-hoc lists — so nothing is lost across sessions and contributors. Reference issues from PRs (`Closes #N`).

---

## Stack

- **Frontend**: React 19, Vite 8, Tailwind 4, React Router 7 (`frontend/`)
- **Backend**: Cloudflare Pages Functions (edge serverless, `functions/`)
- **Database**: Cloudflare D1 (SQLite-compatible), numbered migrations in `migrations/`
- **Auth**: Direct D1 session manager (`functions/utils/auth.js`), CSRF double-submit, TOTP MFA, trusted devices, RBAC
- **Storage**: Cloudflare R2 (band photos)
- **Email**: Postmark/Resend/MailChannels
- **Tests**: Vitest (unit, frontend), Playwright (E2E + a11y + visual regression)
- **CI/CD**: GitHub Actions (16 workflows), Dependabot, Snyk, GitGuardian, CodeRabbit
  - **Runners are GitHub-hosted again** (2026-09-25, when the repo went public).
    Every job reads `runs-on: ${{ vars.RUNS_ON || 'ubuntu-latest' }}` except
    two that pin `ubuntu-latest` on purpose: `zap-baseline.yml` (needs Docker,
    which self-hosted job containers lack) and `quality.yml`'s **Lighthouse CI**
    (its 0.90 floor was calibrated on hosted hardware). The repo variable
    `RUNS_ON` is **deleted**. From 2026-09-23 to
    2026-09-25, while the repo was private, `RUNS_ON=self-hosted` routed jobs to
    ephemeral containers on Dre's homelab; setup and failback live in the private
    `BreakableHoodie/gh-runner` repo.
    **Never set `RUNS_ON` while this repo is public.** Anyone can open a fork PR
    here, and a self-hosted runner would execute that code inside the homelab.
    The runner sync also stops runners for public repos, so a stray `RUNS_ON`
    would queue every job forever rather than run it.
    (`codeql.yml`, `secret-scan.yml` and `dependency-review.yml` were removed
    2026-09-16 when the repo went private and **restored 2026-09-25** when it went
    public again; `semgrep.yml` was **rebuilt** in #1173 and gates in the job
    itself — see "The security tooling this repo actually has" under Security
    Notes)
  - **Dependabot merges do not deploy on their own** (#1209). Auto-merge uses
    `GITHUB_TOKEN`, and GitHub starts no push workflows for a push made with it.
    `deploy-reconcile.yml` runs every 30 minutes and dispatches the production
    deploy for any `main` HEAD without one (`workflow_dispatch` _is_ allowed
    from that token). It waits 10 minutes so it cannot race, and cancel, a
    human merge's own deploy, and it **never re-dispatches after a real
    failure**, so a broken deploy cannot loop. It also recovers a deploy killed
    by `cancel-in-progress`. Push-only scans (Semgrep full-tree, CodeQL on push)
    still do not run for bot merges; the PR runs covered the same content.

---

## Critical Invariants

### After-midnight band sorting — recurring bug class

Bands starting before 6 AM are "after-midnight" sets that belong to the _previous evening_. They must be offset by +1 day so they sort after the evening lineup, not at the top of the schedule.

- Threshold: `AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`. There are **two** canonical homes, one per side of the build boundary — Pages Functions cannot import from `frontend/`, so a single definition is impossible:
  - **Frontend:** `frontend/src/utils/festivalDays.js` (#550). `frontend/src/utils/bandUtils.js` and `frontend/src/admin/utils/timeUtils.js` (`AFTER_MIDNIGHT_THRESHOLD_MINUTES = AFTER_MIDNIGHT_THRESHOLD_HOUR * 60`) both import it rather than re-encoding `6`.
  - **Server:** `functions/utils/eventDay.js`, which also exports `eventLocalFestivalToday()` — the festival-day equivalent of `eventLocalToday()`, stepping back one calendar day when the Toronto-local hour is below the threshold. Use it for any "which festival day is it?" question server-side; a plain calendar-day comparison flips at midnight while the festival day is still running (bug class fixed in #751). `eventDay.js` also exports `AFTER_MIDNIGHT_THRESHOLD_TIME` (`"06:00"`, zero-padded), **derived** from the hour rather than typed as a second literal — it exists because `functions/api/events/timeline.js` needs the `HH:MM` string shape for a lexicographic comparison against `performances.start_time`, while `eventLocalFestivalToday()` needs the numeric hour for arithmetic.
- **Two homes, not more.** `functions/api/events/timeline.js` and `functions/event/[slug].js` both used to re-encode the threshold privately (as `"06:00"` and `6` respectively) instead of importing it (#746, fixed) — both now import from `eventDay.js`. A source-scanning guard (`functions/utils/__tests__/afterMidnightThreshold.test.js`) enforces this **within `functions/` only**: no file there outside `eventDay.js` (and outside `__tests__/**`) may declare the threshold from a literal, and no bare `"06:00"` may appear there outside a comment. The frontend side is deliberately out of its scope — `festivalDays.js` is that side's canonical home and correctly declares `6` itself. **The numeric half is name-based and not airtight:** it matches declarations whose identifier contains `AFTER_MIDNIGHT`, so `const MIDNIGHT_HOUR = 6` would slip past. Widening it to every literal `6` in `functions/` would be pure noise, so the name is the only tractable signal for that shape — the `"06:00"` half is name-independent and has no such gap. Treat the guard as a backstop against the copy-paste that actually happened, not proof no third copy can exist. Do not add a third private copy; import from the appropriate canonical home.
- Logic: `prepareBands()` adds `MS_PER_DAY` to `startMs`/`endMs` for times below this threshold
- **Never remove or lower this threshold.** Any sort, filter, or conflict-detection that touches performance times must apply the same offset or delegate to `prepareBands`.

### Multi-row schedule saves check the FINAL state (#1161)

The schedule grid saves every changed row in ONE request, `PUT
/api/admin/events/:id/schedule` (`functions/api/admin/events/[id]/schedule.js`).
It merges the changes into the event's stored performances, runs
`detectDraftConflicts()` (`functions/utils/timeConflicts.js`) over that merged
arrangement, and commits every UPDATE plus one audit row in a single
`DB.batch()`. A conflict is a 409 listing the clashing pairs, and nothing is
written.

**Why it exists:** saving rows one at a time through `PUT
/api/admin/bands/:id` checks each new time against the others' STORED times,
so swapping two sets 409s both halves — no order makes each step valid. Do not
route multi-row edits back through the per-row PUT, and do not "simplify"
`detectDraftConflicts` to compare a changed row against stored rows: that is
exactly the regression, and the mutation gate reproduces it.

Three things are load-bearing:

- **Only pairs touching a changed row are reported**, matching the per-row PUT.
  A pre-existing clash between two untouched rows must not block an unrelated
  save.
- **Cancelled sets never conflict on any check**, server or admin client.
  `checkConflicts`, `detectDraftConflicts`, and `detectBulkConflicts` skip
  cancelled rows on both sides, and the single-row update caller skips the
  check when the edited row is cancelled. `detectConflicts` and
  `ScheduleGrid.jsx` enforce the same rule in the admin UI, so a replacement
  act can take a pulled act's exact slot. Owner decision: 2026-09-22.
- **The batch re-checks the event is still `draft`/`published`** (an `EXISTS`
  on every UPDATE and a status-conditioned audit insert). A concurrent archive
  makes every statement match nothing, and the handler answers 409. Only an
  **explicit** `meta.changes === 0` counts as "not applied" — an absent `meta`
  must not turn a committed save into a false "not saved".

### Public event visibility is `status`, never `is_published` (#800) — history, guards still live

`events.is_published` was dropped by migration 0059 (#799). Before #799, archiving wrote `is_published = 0`, and on 2026-08-10 archiving the last live event took 13 public read paths dark at once. `functions/utils/eventVisibility.js` is the single home:

- `publicEventStatusSql(alias?)` → `status IN ('published','archived')`, the default for browse and history surfaces: **archived means concluded, not hidden.** `archivedEventStatusSql` serves recap-only surfaces. `publishedEventStatusSql` is for where serving a concluded event is wrong, such as `/api/schedule?event=current`.
- **Timeline buckets are a lifecycle question before a date question.** `now`/`upcoming` are published-only; `past` is `archived OR (published AND concluded)`. Drop either half and an archived event matches no bucket.
- **Two source-scanning guards.** One forbids any `is_published` outside `__tests__/**` and `eventVisibility.js`, on both sides of the build boundary. The other fails any non-admin file that queries `events` without importing a visibility helper by name; an inline `status = 'published'` deliberately does not satisfy it. Exempt by name: `api/metrics.js`, `utils/timeConflicts.js`. The guards are `functions/utils/__tests__/eventVisibility.test.js` and `frontend/src/__tests__/isPublishedGuard.test.js`; public queries filter and order on the `idx_events_status_date` index. The second guard is file-level, so it cannot see one missed query in a file that imports the helper.

**Archiving is one-way.** Exactly four routes write `status`: `POST .../publish`, the PUT publish toggle, `POST .../archive`, and PATCH's dynamic `UPDATE events SET ${updates.join(", ")}`. Each rejects a status change on an archived event, and each `UPDATE` carries `AND status IN ('draft','published')` with a mandatory null check, so a concurrent archive yields 409, never a 500 or a silent resurrection. Grep `UPDATE events`, not `SET status`, to find all four; `edit.js`, `posters.js`, `reveal-mode.js` and `users/[id].js` also match and provably never write `status`. PATCH's predicate stays conditional: editing an archived event's description, poster or venue info is allowed.

**Only `POST .../publish` checks the lineup.** Zero performances gets 400 `EMPTY_LINEUP`, overridable with `allowEmptyLineup: true`, because "Lineup TBA" is a supported state. PATCH and the toggle stay unchecked on purpose. The client closes the UX gap (#821): `EventFormModal` sends a draft → published transition through `POST .../publish`, sharing `frontend/src/admin/utils/publishWithLineupConfirm.js` with the list toggle. Only the transition is rerouted, and the rejection is detected by `code`, never by message. **Creating an event as `published` is refused** (400 `CREATE_AS_PUBLISHED`, #804); `draft` and `archived` (historical back-fill) stay allowed. That create `INSERT` is a fifth status writer, which the `UPDATE events` grep misses.

Incident history and the #803 review traps: `docs/field-notes/event-visibility.md`.

### Server-side "today"/"now" is Toronto-local — never UTC-sliced

Server-side event-day classification (timeline now/upcoming/past, any "is it today?" check) must use `eventLocalToday()` / `eventLocalClock()` from `functions/utils/eventDay.js` — never `new Date().toISOString().slice(0, 10)`, which flips to tomorrow at 8 PM Eastern and marked events "Happening Now" the evening before (bug class fixed in PR #568).

### `events.doors_json` + the "started" start edge (#569)

`events.doors_json` (TEXT, nullable) is a JSON map of festival date → 24h time, e.g. `{"2026-07-10":"16:00","2026-07-11":"10:00"}`. Absent/malformed = no doors info. On an event's **first day only**, the "started" edge (timeline "Happening Now", fan "Live Tonight") is, in precedence order: **doors time → first set start → local midnight**; the earliest available signal wins, so an already-playing set is never "upcoming". Day 2+ of a multi-day event is never re-gated, and sets before 6 AM never define the day-1 edge (after-midnight convention above). Validation is `validateDoorsJson()` in `functions/utils/validation.js` (keys within `[date, end_date]`, values `HH:MM`); event duplication deliberately drops `doors_json` (stale date keys).

### SQLite datetime format — do NOT use ISO 8601 T-separator

D1's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` (space separator).  
JavaScript's `toISOString()` returns `YYYY-MM-DDTHH:MM:SS.mmmZ` (T separator).

When a stored `expires_at` has a `T`, comparisons like `expires_at > datetime('now')` silently fail — the string comparison returns a wrong result. This caused a production invite-code expiry bypass (SEC-F1).

**Always normalize before storing:**

```js
new Date(Date.now() + ...).toISOString().replace("T", " ").slice(0, 19)
```

Helper: `toSqliteDateTime()` in `functions/utils/authAttempts.js`.

### `lucia_sessions.expires_at` is INTEGER (Unix epoch), not TEXT

Every other `expires_at` column in the schema is `TEXT` (ISO-8601 / space-separated). `lucia_sessions` uses `INTEGER` (Unix seconds). Do not compare it with `datetime('now')`.

- **JS (check if expired):** `row.expires_at * 1000 < Date.now()`
- **SQL (select active sessions):** `WHERE expires_at > unixepoch()`

### PBKDF2, not bcrypt

Password hashing uses PBKDF2-SHA256 via the Web Crypto API (`functions/utils/crypto.js`). Current format is `pbkdf2$iterations$salt$hash` and is self-describing — `verifyPassword` reads the iteration count from the string itself. A second, older `salt:hash` format (no `pbkdf2$` prefix, predating the versioned format entirely) carries no iteration count at all; it's verified against the hardcoded `LEGACY_ITERATIONS` (100,000) fallback instead.

**`DEFAULT_ITERATIONS` is capped at 100,000, because production refuses more.** The live Workers runtime throws `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported` (measured on the edge 2026-10-10). **Node and local `wrangler dev` do not enforce it**, so no local run can catch a higher value. #426 raised the default to 600,000 anyway, and from 2026-06-28 to 2026-10-10 every `hashPassword` call in production threw: **signup and password reset were broken**, and login's "best-effort" rehash failed on every login inside a `catch` that only logged a warning, which is why nobody noticed. ADR 0005 and `scripts/reset-admin-password.js` already recorded the cap; this file claimed 600,000 as fact. OWASP's 600k is not reachable on this platform.

The cap is `WORKERS_PBKDF2_MAX_ITERATIONS`, and callers import `DEFAULT_ITERATIONS`; never re-type a count (login's literal `600000` was half the bug). `functions/utils/__tests__/crypto.test.js` emulates the production refusal and scans `functions/` for any over-cap iteration literal; both are in the mutation gate.

bcrypt requires a native binary (`better-sqlite3` style) that cannot run on Cloudflare Workers. Do not introduce bcrypt anywhere in `functions/`.

MFA TOTP follows the same rule: `functions/utils/totp.js` computes HMAC-SHA1 directly via `crypto.subtle` (hand-rolled RFC 4226/6238, pinned by the RFC 6238 Appendix B test vectors). Do **not** reintroduce `otplib` or any pure-JS crypto (`@noble`) for MFA — keep the security primitive on the platform's native Web Crypto.

### D1 transactions: no BEGIN/COMMIT, but `DB.batch()` is atomic

The Cloudflare Workers D1 binding does not support explicit `BEGIN`/`COMMIT` transaction syntax. However, `env.DB.batch([stmt1, stmt2, ...])` executes all statements atomically — if any fails, all are rolled back. Prefer `DB.batch()` for multi-statement mutations.

**Until #1146 that atomicity was UNVERIFIABLE here**, which is worth knowing
because it means every batch-dependent test written before then proved less
than it appeared to. `createDBEnv`'s `batch()` in `functions/api/test-utils.js`
ran a plain sequential loop with no transaction, so a mid-batch failure left
earlier statements committed — the opposite of production. A test asserting "on
failure, nothing was written" would have failed against the harness while
passing against real D1, so nobody wrote one, and code depending on rollback
could have been broken in production and green in CI.

It is now wrapped in `db.transaction()` (better-sqlite3 is synchronous, so the
whole loop fits inside one; nested calls become SAVEPOINTs).
`functions/api/__tests__/testHarnessBatchAtomicity.test.js` is what makes every
other batch-related test worth trusting — it asserts rollback on failure,
commit on success, and that the per-statement result shape is unchanged, and it
goes red against the old loop.

**A failure must occur at EXECUTION time to test this.** A bad table name throws
while the statement array is being built, before `batch()` is ever called, so it
proves nothing about rollback. Use a constraint violation — a duplicate primary
key — which prepares cleanly and fails inside the transaction.

For mutations that cannot be expressed as a single batch (e.g., the event-duplication pattern in `functions/api/admin/events/[id]/duplicate.js`), use compensating deletes: if step N fails, manually undo steps 1…N-1. **The rollback is NOT in `events/[id].js`** — that route was split into its own sub-path file because Cloudflare Pages needs a dedicated file per route segment, and this pointer named the old location long after the move.

The bulk band import (`functions/api/admin/bands/import.js`) follows this pattern and is **all-or-nothing**: it validates every row first (an invalid row aborts the whole import with per-row errors, writing nothing), then find-or-creates profiles and inserts performances, rolling back everything it created if any write fails. A lineup is never left half-imported.

`functions/api/admin/bands/bulk.js` is the larger sibling (599 lines vs. `import.js`'s 174): it handles bulk `DELETE`/`POST`/`PATCH` across bands, following the same `DB.batch()`/compensating-delete discipline.

### PRAGMA `foreign_keys = ON` is enforced in production

`functions/_middleware.js` runs `PRAGMA foreign_keys = ON` before the request handler fires for every **mutating** request. Read-only methods (`GET`/`HEAD`) skip it — read-only by HTTP semantics, and skipping saves a D1 round-trip on hot read paths. **That is a statement about intent, not a guarantee:** since #705 exactly one GET writes an FK-bearing row — `api/schedule/share/[slug].js` inserts into `share_link_views`. Its FK is therefore _unenforced_ on that path, so it does not rely on one: the insert is `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM share_links WHERE slug = ?)` inside the same `DB.batch()`, re-checking the parent atomically rather than trusting the SELECT earlier in the request. An orphan there would be unreclaimable — the expiry cron finds ledger rows by joining to slugs that still exist, so it could never see one. Any future FK-writing GET must carry its own guard the same way; do not assume the pragma protects it. The guard is a strict read-only allowlist, so any other method (including unknown ones) still gets FK enforcement; never widen it to skip writes. Unit test helpers (`functions/api/test-utils.js`) set the PRAGMA unconditionally via `better-sqlite3`, so FK constraints are always active under test.

When recreating a table in a migration (SQLite has no ALTER COLUMN), surround the table-recreation block with `PRAGMA foreign_keys = OFF` / `PRAGMA foreign_keys = ON` as migration 0032 does — D1 will reject the DROP otherwise.

### Artist link presence: `bandFields.js` is the single source of truth (#712)

`frontend/src/admin/utils/bandFields.js` defines every filterable artist field — the eight link fields (`LINK_FIELDS`, in Links-column render order) and the profile fields (`PROFILE_FIELDS`) — pairing each with its label, icon, Tailwind colours, and **its own URL-safety resolver**.

**A link is "present" only if it resolves to a real href** — `resolveHref(value) !== '#'` — never `value !== ''`. `safeSocialProfileHref` rejects any handle containing whitespace or a colon (the necessary condition for `javascript:`, `data:`, and every other scheme), so a value can be non-empty in D1 and still render nothing. Anything asking "does this artist have Instagram?" must go through `hasField()` / `hasAnyLink()` / `countLinks()` — never inspect `social_links` directly.

Both the Links column (`admin/components/SocialLinksIcons.jsx`) and the gap filter (`admin/components/LinksColumnFilter.jsx` + `admin/components/MobileFilterSheet.jsx` + `RosterTab`) map over this one registry. The filter was `DataGapFilter.jsx` until `LinksColumnFilter` superseded it (that file's own header says so, and `RosterTab.test.jsx` records that the popover is gone); this line named the dead component long after the move. **Do not reintroduce a second list of link fields.** The bug class it prevents: a filter reporting that an artist "has Instagram" while the row shows nothing, so they get skipped in exactly the data-entry pass meant to catch them. Adding a ninth platform requires the frontend registry entry plus the server-side `BAND_LINK_FIELD_KEYS` and `sanitizeBandSocialLinks` entries; the runtime guard catches a missed server-side update. The new config entry in `functions/utils/validation/urls.js` also needs an `allowedHosts` list: since #1213 a full URL is rejected unless its host belongs to the field's platform. Without one, the field silently accepts any URL, which is how a Bandcamp link came to be stored as Apple Music.

`formatOrigin()` lives here too, shared by the Origin column, the origin sort, the search predicate, and the origin gap check.

**Tailwind colours in the registry must stay complete literal strings** (e.g. `'hover:text-pink-400 focus-visible:outline-pink-400'`). Tailwind v4 scans source _text_ for whole class names and never evaluates template expressions, so `` `hover:text-${colour}` `` generates no CSS and silently drops every hover and focus style. A runtime assertion cannot catch this — the guard in `bandFields.test.js` is a `readFileSync` scan of the source.

### `ALLOW_ADMIN_SIGNUP` is test-only

This env var bypasses the invite-code requirement for signup. It must never be set in production. It appears only in test helpers and E2E seed scripts.

---

## React 19 Known Issues

### `react-helmet-async` `<Helmet>` does not reliably set `document.title` in React 19

Use `document.title = pageTitle` directly in a `useEffect` within the page component. Do NOT remove the direct assignment in favour of `<Helmet>` until react-helmet-async ships a React 19 compatible release.

Example: `frontend/src/pages/EventRecapPage.jsx` — uses both `<Helmet>` (for other meta) and `document.title = ...` for the title.

`BandProfilePage.jsx` was this example until #797 removed its `<meta name="keywords">` — the tag was its `<Helmet>`'s only child, so the wrapper and the `react-helmet-async` import went with it. That page now assigns `document.title` directly and declares no Helmet at all, which is why it no longer illustrates the pairing.

### SSR owns identity meta and JSON-LD where it emits either; the client `<Helmet>` owns only what SSR does not emit — never canonical/`og:*`/`twitter:*`/description, and never JSON-LD on a route whose SSR handler already emits it

`<Helmet>` manages only tags it created (`data-rh`), so it **appends** a second copy of any tag that `index.html` or a Pages Function put there. A duplicate `og:url` once overrode our canonical ("Duplicate, Google chose different canonical than user"). Ownership is therefore split by who emits:

- **`serveWithInjectedMeta()`** (`functions/utils/ssrMeta.js`) strips `index.html`'s defaults via `DEFAULT_META_RE` before injecting. Every `og:*`/`twitter:*`/`description` property `index.html` declares must be listed there, or its default becomes a live second copy (`og:site_name`, #784).
- **On SSR-injected routes the client `<Helmet>` declares no `canonical`, `og:*`, `twitter:*` or `description`**, and no JSON-LD where the SSR handler passes `jsonLd` (`/band/*`, `/venue/*`, #790). It may set `<title>`, but only with the SSR formula verbatim and only once data has loaded (#785); `functions/api/venues/[id].js` exposes `city` so the venue title can reproduce its formula. `ssrIdentityMeta.test.jsx` asserts this, including the fetch-in-flight case; keep that case. It mounts with `createRoot`, not `hydrateRoot`, because the app is client-rendered.
- **SSR owns what SSR emits; everything else stays client-owned.** Before deleting a tag from a `<Helmet>`, confirm SSR emits an equivalent, or the sweep drops the tag instead of de-duplicating it. `functions/band/[id].js`'s JSON-LD `description` is a separate, untruncated value: do not merge it with the 200-char meta description (most bios exceed it). Where the two disagreed, the complete, spec-valid value won (`og:type="website"`, `twitter:card="summary_large_image"`).
- Do not mark SSR tags `data-rh` so Helmet adopts them: that relies on the replace behaviour React 19 makes unreliable. Accepted tradeoff: identity meta freezes across in-app navigation; crawlers always fetch fresh.
- **Every indexable route has a Pages Function injecting its own meta:** `/event/*`, `/band/*`, `/venue/*`, `/events/*/recap` (D1-backed, `functions/events/[slug]/recap.js`) and the static pages through `STATIC_PAGES` (`functions/utils/staticPageMeta.js`, one 2-line route file each). `/` has `functions/index.js`, which injects event links into the `<noscript>` nav and leaves `<head>` byte-for-byte: `index.html`'s defaults are the homepage's correct meta, and `EventsPage` owns it client-side. Every shell-rewriting handler uses `headersForRewrittenShell()`: policy headers kept, `Content-Type` set, `ETag`/`Last-Modified`/`Content-Length`/`Content-Encoding` dropped.
- **The handler must server-render the URL people actually link to.** Artist links are slug-built, so `functions/band/[id].js` resolves a slug via `normalizeBandName` and **301**s to `/band/<id>`, query preserved (#983). The `Location` is relative on purpose (canonicals pin the host; redirects preserve it), the public-data gate runs before the lookup (else an existence oracle), and an unresolvable slug renders the shell, not a 404. `functions/venue/[id].js` is safe only because venue links are id-built; a `/venue/<slug>` link builder needs the same redirect.
- **`/event/:slug` (live) and `/events/:slug/recap` (archive) are different resources.** Anything building an event URL picks the right prefix (#562). Do not unify them (declined, #910).
- Build every URL from `CANONICAL_HOST`, never `request.url`.
- **`frontend/public/_routes.json` is the only routes file**, and `exclude` beats `include`. `functions/__tests__/staticPageMeta.test.js` fails if an included path lacks a route file or registry entry. Never recreate a root `/_routes.json`.

Mocked unit tests cannot prove Cloudflare dispatches to a handler. Verify routing changes against `npx wrangler pages dev --port 8788` and diff per-path tag counts.

Search Console evidence, the `/band/<slug>` incident and the rejected alternatives: `docs/field-notes/ssr-identity-meta.md`.

---

### The sitemap is the event-discovery signal — spend it (#1158)

Until #1159 no page emitted a crawlable `<a>` in raw HTML (`serveWithInjectedMeta()` touches `<head>` only and `<body>` is an empty `#root`), and Search Console listed the sitemap as an indexed page's only referrer.

- `frontend/index.html` ships a `<noscript>` nav of parameterless routes: `<noscript>`, so JS visitors do not get a second nav. Every href must be a real `<Route path>` in `main.jsx`. `/events` is **not** one (the list is `/`). `frontend/src/__tests__/crawlableLinks.test.js` enforces this.
- `functions/index.js` adds current public event links to that nav at request time (#1163).
- `functions/sitemap.xml.js` is the primary event-discovery signal, in two states:

| event state          | priority | changefreq |
| -------------------- | -------- | ---------- |
| published, upcoming  | `1.0`    | `daily`    |
| concluded / archived | `0.5`    | `monthly`  |

`changefreq` matters as much as priority. A concluded event's `0.5` sits just under its recap's `0.6` on purpose. `is_concluded` comes from `concludedEventSql()`, never a local date compare (#787). Under the old flat `weekly`/`0.8`, `/event/lwbc18` sat unindexed 31 days before the event. The tests assert the two states **differ**, because a presence-only test let that flat rate survive. Both halves are in the mutation gate.

## Theming

Four user-selectable colour themes, set as `data-theme` on `<html>` by `frontend/src/components/ThemeProvider.jsx` and persisted in localStorage: `midnight-ember` (warm dark, default), `arctic-night` (cool dark), `daybreak` (warm light), `silver-lining` (cool light). All theme colours are CSS custom properties defined per `[data-theme]` block in `frontend/src/index.css`, exposed as Tailwind v4 utilities via `@theme`.

**On public / theme-following surfaces, use semantic tokens — never hardcoded white.** This is the recurring bug class (white text/surfaces invisible on the light themes):

- **Text:** `text-text-primary` / `-secondary` / `-tertiary` / `-disabled`. When converting opacity'd whites, map by weight: `text-white/90–70` → `secondary`, `/60–40` → `tertiary`, `/30–20` → `disabled`.
- **Surfaces / borders:** `bg-surface` (faint card/input fill), `bg-surface-hover` (hover state), `border-border` / `ring-border` (subtle edges/dividers). Never `bg-white/N` or `border-white/N`.
- **Status colours:** `success` / `warning` / `error` / `info` (e.g. `bg-warning-500/20 border-warning-500/50`) with `text-text-primary` for the label so it reads on both light and dark.

**Light-theme token values are WCAG-AA tuned** (accent ramp, `text-tertiary`, etc. clear 4.5:1 on the darker `bg-purple` surface). If you change a light-theme colour, verify contrast — don't just pick a lighter shade.

**Keep `text-white` only where it is theme-independent:** on a fixed colour (coloured/gradient buttons, brand/social buttons) or over a dark photo scrim.

**Admin is dark-pinned:** `frontend/src/admin/AdminApp.jsx` wraps the admin surface in `<div data-theme="midnight-ember">`, so hardcoded `text-white` inside `frontend/src/admin/` is correct and intentional — do not migrate it.

---

## Schedule Storage (localStorage)

Band selections are stored under the `selectedBandsByEvent` key as `{ [eventSlug]: [bandId, ...], __dates__: { [eventSlug]: "YYYY-MM-DD" } }`.

The `__dates__` namespace is used for stale detection. **Always use YYYY-MM-DD lexicographic string comparison** — do NOT use `new Date('YYYY-MM-DD')` which parses as UTC midnight and causes events to appear stale on their own day in UTC-negative timezones.

**`saveSelectedBands`'s date argument must be the event's `end_date || date`, never the start date alone.** Stale detection compares the stored date against today, so passing a multi-day event's START date marks the fan's saved schedule stale on day 2 — silently wiping their selections mid-festival (#542 PR-1). Single-day events have a NULL `end_date`, so the `||` fallback keeps them identical.

All interactions go through `frontend/src/utils/scheduleStorage.js`. Do not write to `selectedBandsByEvent` directly.

---

## Public cache TTLs — two tiers, one home

`functions/utils/cacheHeaders.js` owns both public-GET cache values, split by one
question: **can this change while a show is running?** `CACHE_SHOW_CRITICAL`
(60s) is for anything rendering live show state — set times, cancellations,
venue assignments; `CACHE_BROWSE` (300s) is for aggregate-only browse surfaces.
Deliberately no `stale-while-revalidate`: inside the SWR window a cache serves
the _stale_ body, so a fan opening the page once still reads a cancelled set as
playing — see the module header for the full rationale.

**Judge the projection, not the route name.** `api/bands/stats/[name].js` is
named for its aggregates but returns per-performance rows, so it is
show-critical. Its sibling `api/bands/[name].js` was the same shape and sat at a
hardcoded 300s until the tiers were wired up — a cancelled set read as playing
for up to five minutes.

That drift was possible because `CACHE_BROWSE` was **exported and imported by
nothing** while five endpoints hardcoded its exact string. The constant existed;
the callers copy-pasted the value. `functions/utils/__tests__/cacheHeaders.test.js`
now scans source for both halves: no API route may hardcode a `max-age` a tier
already names, and any route projecting `p.start_time`/`p.is_cancelled` must
import `CACHE_SHOW_CRITICAL`. Three routes are exempt **by name, with reasons**
in the test — `schedule.js` (env-tunable, already defaults to 60s), `ical.js`
(a subscribed feed; clients poll on their own schedule and cancellations travel
as RFC 5545 `STATUS:CANCELLED`), and `events/[id]/recap.js` (gated by
`concludedEventSql()`, so it can only serve an event that already ended).

## Metrics & Analytics

Metrics write to D1 daily-aggregate tables (`page_views_daily`, `artist_daily_stats`) via `POST /api/metrics`, plus an optional Cloudflare Analytics Engine sink (`env.ANALYTICS`, configured in `wrangler.toml`). Ingestion is best-effort and fire-and-forget; failures must not surface to users.

**Share metrics come from `share_links`, not telemetry.** A share _create_ is a `share_links` row. The admin event metrics endpoint reads these directly. Do **not** wire the allowlisted-but-unused `share_event` / `filter_use` events into `/api/metrics` for share counts — they would be redundant with `share_links`.

**`view_count` is unique visitors per link, all-time — not fetches (#705).** It is a _derived_ value: `GET /api/schedule/share/[slug]` writes one `share_link_views(slug, visitor_hash)` row per visitor and recomputes `view_count` as `COUNT(*)` over that ledger, both in a single `DB.batch()`. Do not "optimise" it back to `view_count = view_count + 1`: the ledger row claims the slot permanently, so if a separate increment were lost the visitor could never be counted again, whereas a recomputed count self-heals on the next visit.

Two traps around this:

- **`import_count` is still per-fetch and undeduped.** It sits beside `view_count` in the same metrics payload and dashboard, so the two are different units. One person importing twice can produce imports > views.
- **The expiry cron must delete ledger rows explicitly** (`functions/scheduled/expire-share-links.js`). `share_link_views` declares `ON DELETE CASCADE`, but cron handlers reach D1 via `_scheduled.js` and never pass through `_middleware.js`, where `PRAGMA foreign_keys = ON` is set — D1 defaults it OFF, so the cascade does not fire there. It _does_ fire on the event-deletion path, which is an HTTP request.

`view_count_legacy` preserves each link's pre-#705 count. Nothing reads it. It keeps the cutover reversible and the old figure queryable.

### Schedule builds are per-event pseudonyms, anonymised 30 days after the event (#1245)

`schedule_builds.visitor_hash` stores a SHA-256 code of `scheduleSessionId|event_id`, never the raw schedule session id. The event component is deliberate: the same browser produces different values for different events and cannot be linked across them. For events concluded more than 30 days ago, the scheduled anonymiser replaces each remaining per-event value with an `anon:<rank>` label, preserving exact pick and distinct-builder counts while carrying no client-derived value. Existing `anon:` labels are retained and new labels start after the event's current maximum numeric label. **Never store the raw `scheduleSessionId`.**

Three things in `functions/scheduled/anonymize-schedule-builds.js` are load-bearing, each found in security review:

- **Each event has its own try/catch.** With one try around the loop, a single failing event skipped every later event, every day, while the policy kept promising anonymisation.
- **Each rewrite carries `NOT EXISTS` for its label.** Labels are computed from a read. A concurrent run could otherwise give the same `anon:N` to two builders and merge them, with no error unless they shared a set.
- **Eligibility is keyed on the event's last date, not its status.** An event moved back to draft after it ran must still be anonymised.

The privacy policy's 30 days covers the live table. D1 Time Travel can hold earlier values for its own window, and the policy says so.

---

## RBAC Roles

Three roles in ascending order: `viewer` → `editor` → `admin`.

- `viewer`: read-only access to all admin data
- `editor`: can create/edit bands, events, lineup, **archive** events, use the event wizard, and **create** venues (owner decision 2026-10-10: the person who builds editions is an editor); cannot edit or delete an existing venue (a rename or delete rewrites every past edition held there), delete events, or manage users. `VenuesTab` hides Edit/Delete from non-admins through `canManage`, so the screen never offers a button the server will refuse
- `admin`: full access including editing or deleting venues, deleting events, user management, API keys, invite codes, audit log, maintenance, and platform settings

Enforced via `checkPermission(context, "viewer"|"editor"|"admin")` in `functions/api/admin/_middleware.js`. Every mutating endpoint must call this before touching the database. **Both roles are looked up as own keys** (`Object.hasOwn`): a bare `roleHierarchy[role]` returns an inherited function for `"constructor"` or `"__proto__"`, the comparison is then false, and the request is ALLOWED. That would be a full bypass after one bad write, so the database refuses one too: migration 0069 adds `BEFORE INSERT`/`BEFORE UPDATE OF role` triggers on `users` and `invite_codes` (signup copies the invite's role) that abort on any role outside the three (#1287). **Triggers, not a CHECK:** adding a CHECK means rebuilding `users`, and D1 ignores `PRAGMA foreign_keys = OFF`, so the DROP would cascade-delete every session and fail on `api_keys`' RESTRICT.

**The route policy is one explicit table:** `POLICY` in `functions/api/admin/__tests__/rbacBoundaries.test.js`. Every admin handler must appear in it (a new route fails the build until someone declares who may call it), the role in the code must equal the table, and every role below each entry is called and must get 403 with no row written. The table is the source of truth on purpose: a guard that read the expected role FROM the code could never catch the code being weakened (the first draft did exactly that and survived the mutation). Changing who may call a route means changing the code AND this table in the same PR. `checkPermissionLiterals.test.js` and `checkPermission`'s fail-closed branch keep a misspelled role literal from silently granting access to everyone.

---

## API keys (#744) — a credential's life is tied to its creator's

`api_keys` rows are bearer credentials minted by an admin (`POST /api/admin/api-keys`, plaintext returned **exactly once**; there is no reveal endpoint and never will be). `functions/utils/apiKeys.js` owns generation and verification; the digest is deliberately **SHA-256, fast and unsalted** — read that file's header before "fixing" it to PBKDF2. The secret is 256 bits of `getRandomValues`, so there is no dictionary to slow down, and `WHERE key_hash = ?` cannot work against a per-row salt.

**Anything that changes a user's standing must revoke their keys, and there is more than one such endpoint.** `api_keys.role` is frozen at creation and never reconciled against its creator's current role, so an unrevoked key keeps whatever privilege it was minted with:

| Path                                                              | Must revoke                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `PATCH /api/admin/users/:id` with a falsy `isActive`              | yes                                                                                     |
| `PATCH /api/admin/users/:id` with a **changed `role`**            | yes — otherwise a demoted admin keeps an admin-scoped key and can re-promote themselves |
| `POST /api/admin/users/:id/toggle-status` (deactivating)          | yes                                                                                     |
| Reactivation, or a PATCH re-sending the role the user already has | **no** — revocation is one-way                                                          |

Three traps here, each of which was live:

- **`toggle-status.js` is a second, separate deactivation endpoint.** It is not a thin wrapper over the PATCH path — it has its own handler, and it deactivated accounts and deleted their sessions for months while leaving keys untouched. Grep `is_active =` rather than assuming one path — four hits, three of which write `users`: the two above plus `api/auth/activate.js`, which only ever writes `1`. The fourth, `utils/bandProfileFields.js`, writes `band_profiles.is_active` and is unrelated.
- **`isActive` is read by truthiness at every other site in `users/[id].js`** — the last-admin guard, the `is_active` write, and the `deactivated_at` stamp all use `!isActive`. A revocation gated on `isActive === false` therefore misses `{"isActive": 0}`, which deactivates the user everywhere else. Match the surrounding convention.
- **`verifyApiKey` INNER JOINs `users` and requires `is_active = 1`.** That is a backstop for a fourth path nobody has written yet, not the primary control — the explicit revocations above are. Do not delete it as redundant; it exists precisely because "every path remembers" was already false once.

**Deleting a user who owns keys is refused with 409 `USER_OWNS_API_KEYS`, and revoking does not unblock it.** `created_by` is `ON DELETE RESTRICT`, which fires on the **existence** of a referencing row, not its state — so a revoked key blocks deletion exactly as an active one does. There is deliberately no endpoint that deletes an `api_keys` row: that would destroy the attribution RESTRICT exists to protect. Deactivation is the supported answer, and the 409's message says so. Detect it by `code`, never by matching the message.

### The request path — a key borrows a person's identity, and that is the whole risk

`functions/api/admin/_middleware.js`'s `onRequest` orders this deliberately:

1. A request is key-authenticated **iff** it has `Authorization: Bearer <v>` and `v` starts with `API_KEY_PREFIX` (import it; never retype `"st_"`). Under `ALLOW_HEADER_AUTH` (non-production) the same header carries a session id; the prefix separates the two, and session ids (`crypto.randomUUID()`) can never start with `st_`.
2. A key plus any session cookie gets 400 `AMBIGUOUS_AUTH`, before either is validated. This is defence in depth against privilege confusion.
3. The key branch returns early and skips CSRF. **That is safe because `Authorization` is not an ambient header**: a browser never attaches it cross-origin without a preflight, which `functions/_middleware.js` grants only to allowlisted origins.

`context.data.user.role` is **the key's role, never its creator's**, and `context.data.apiKey` carries `{ id, keyPrefix, role }`; endpoints need no changes because `checkPermission` reads `context.data.user`. `context.data.user.userId` is **the creator's**, and that is the sharp edge: an endpoint that reads `userId` as "the human in this browser" acts on the creator's own account. A security review found five such endpoints live (MFA setup and enable, the sessions list, revoke-all, trusted devices). So:

- `KEY_FORBIDDEN_PREFIXES` 403s self-service families (`KEY_NOT_PERMITTED`) **before** the key is verified, for every key role including `admin`. `/api/admin/me` is deliberately not listed.
- Keys are read-only on `/api/admin/users` and `/api/admin/api-keys` (mutations refused before key verification), and barred from `/api/admin/invite-codes` entirely, because its GET exposes plaintext codes. Identity management is a human act.
- `revoke-all.js` calls `checkPermission(context, "viewer")` itself. Viewer, so self-service logout works at every role.
- `apiKeySelfService.test.js` fails on any admin handler with no `checkPermission` that is neither denylisted nor in `REVIEWED_UNGATED_ROUTES`. It catches only the ungated shape: the MFA shape (viewer-gated, acting on self) is covered by name, and a new self-service family outside these prefixes needs a human to notice.

Related rules:

- `ALLOW_HEADER_AUTH`'s production guard uses `isDevRequest`, never `!== "production"`, in both copies (`_middleware.js`, `auth/logout.js`).
- `csrf.js`'s `getSessionIdentifier` ignores any bearer value starting with `API_KEY_PREFIX`.
- Failure logs record only `bearerValue.slice(0, DISPLAY_PREFIX_LENGTH)`.
- `parseCookies` (`cookies.js`) trims cookie names and keeps values that contain `=`.

The review's findings table and the corrected reasoning: `docs/field-notes/api-keys.md`.

### Time validation is shape AND range — `isValidTime()` is the only home (#1089)

`isValidTime()` in `functions/utils/validation/datetime.js` checks the `HH:MM`
shape and _then_ bounds hours to 0-23 and minutes to 0-59. Four write paths
called it (`bands/bulk.js`, `bulk-preview.js`, `import.js`, `events/wizard.js`);
three others re-implemented only the shape half inline as `/^\d{2}:\d{2}$/` and
skipped the bounds -- `api/admin/bands.js` (POST), `api/admin/bands/[id].js`
(PUT) and `utils/bandProfileResource.js` (profile PUT).

So `"25:99"`, `"24:00"` and `"12:60"` passed validation and were **written to
the database** as set times that do not exist. `frontend/src/utils/timeFormat.js`
then rendered `"25:99"` as **`"1:99 PM"`** (25 % 12 = 1, minutes printed
verbatim) -- worse than the fallback because a dash says "we do not know" while
`1:99 PM` states a time that is not real.

Nothing in production had such a value; this was a latent gap, found while
reviewing #1088 and fixed in #1089.

The frontend keeps its **own** bounds by necessity -- Pages Functions cannot be
imported from `frontend/`, the same two-homes constraint as the after-midnight
threshold. Keep the two in step.

`functions/utils/__tests__/timeRangeValidation.test.js` scans `functions/` for
an inline `HH:MM` shape regex outside the canonical validator, because nothing
about writing one looks wrong at the call site. It also asserts the scan's own
pattern still matches the shape it hunts -- a source scan whose regex has
drifted passes while checking nothing.

### Never use numbered `?N` SQL placeholders anywhere in `functions/`

D1 accepts `?1`/`?2`; **better-sqlite3, which backs the unit-test harness, refuses positional binding for them** (`RangeError: Too many parameter values were provided`). While `rateLimit.js` used them, `checkRateLimitByKey` failed closed in every test, so its success path never ran under test. Repeat the value positionally instead. `functions/utils/__tests__/rateLimitPlaceholders.test.js` scans `functions/` for `?N` and asserts the limiter actually counts (`remaining` decrements).

### Audit attribution for API keys — `audit_log.api_key_id` and `api_key.request`

`audit_log.api_key_id` (migration 0061) records which credential acted; NULL means cookie-authenticated. Both builders in `auditLogStatement.js` take it as a trailing optional argument. Threading `api_key_id` through the ~15 per-action call sites was considered and deliberately not done. Instead the middleware writes one `api_key.request` row per key-authenticated **mutating** request, before `next()`, so it captures requests that then 403 or 404; correlate it with the per-action rows that share its `user_id`. It is the one audit row written outside a batch, because there is nothing to batch it with; it is not precedent for standalone audit rows. `retention.js` prunes it at **90 days** (`action = 'api_key.request'`) while the rest of `audit_log` keeps 1 year (`!=`); the predicates are disjoint on purpose.

The API-key routes batch their audit row with the change. **That is not a repo-wide rule:** measured 2026-08-31, 5 of 26 admin handlers batch (`bands/[id].js`, `bands/bulk.js`, `events/[id].js`, `events/wizard.js`, `venues/[id].js`), and whether to tighten the rest is open. For creation, `auditLogStatementForInsertedRow()` resolves `resource_id` with `INSERT … SELECT … FROM <table> WHERE <col> = ?`, and validates the identifiers with an explicit `typeof value === "string"` (a bare `RegExp.test(undefined)` passes). `INSERT … SELECT` over zero rows inserts nothing without an error, so pass either a value the preceding INSERT wrote or **exactly** the conditional UPDATE's predicate (an array value renders `IN (…)`). A narrower predicate commits the change with no audit row (#1161 review).

---

## Pulling a band from a live lineup

**Use the cancel toggle (`is_cancelled = 1`). Do not un-announce, and do not delete the row.**

- **`is_announced = 0` hides nothing on a `reveal_mode = 0` event**, which is the normal published state. Per-performance public read paths gate with `(e.reveal_mode = 0 OR p.is_announced = 1)` (some bind it as `? = 0`), which short-circuits true. There are ten: `api/bands/[name].js`, `api/bands/[name]/stage-mates.js`, `api/bands/stats/[name].js`, `api/events/[id]/details.js`, `api/events/timeline.js`, `api/feeds/ical.js`, `api/schedule.js`, `api/schedule/share/[slug].js`, `api/venues/[id].js`, `event/[slug].js`. To sweep, grep `is_announced = 1` and then check the projection, because `follow-batch.js`, `schedule/build.js` and `s/[slug].js` match but return no per-performance rows. The `0 → 1` transition still sends follower email, so un- and re-announcing can mail people while changing nothing publicly.
- **Deleting the row** hides the set, but fans get no cancellation signal, and it vanishes silently from shared routes (#733).
- **Cancelling** (the LineupTab toggle: `PATCH /api/admin/bands/:id` with `is_cancelled: true`, editor or above, #732) keeps the set visible and struck through on every fan surface, drops it from "up next" and live time math, makes it unselectable, emits `STATUS:CANCELLED`, and blocks the announcement email. It applies to one performance: a band with two sets needs two cancels.
- **Un-cancelling resends nothing**, since the announce path needs an `is_announced` `0 → 1` transition. **It is also the one transition that can double-book**, because a cancelled set frees its slot: the PATCH runs `checkConflicts` on `1 → 0` and 409s naming the holder, never auto-resolving.

**Calendar surfaces never invent times.** Three surfaces share these rules: `functions/api/feeds/ical.js`, `prepareBands` (`DEFAULT_SET_DURATION_MS` in `frontend/src/utils/bandUtils.js`) and the My Route export (`frontend/src/utils/routeIcs.js`, #1251). Change one, change all.

- A set with no `start_time` is omitted (#1079: a `"20:00"` fallback once stacked a whole lineup at 8 PM).
- A missing end is one hour after the start, written in `.ics` as `DURATION:PT1H`. A constant `DTEND` can precede the start, and a computed one doubles across the DST repeat hour.
- After-midnight sets are dated on the next calendar day, cancelled sets are `STATUS:CANCELLED`, and UIDs share one scheme.
- Every time is `DTSTART;TZID=America/Toronto` with an identical `VTIMEZONE` in both `.ics` builders. A floating time shows the right hour in the wrong zone (#1261), and `X-WR-TIMEZONE` does not prevent that.
- `DESCRIPTION` lines are joined with a real newline and escaped once.

The server feed's two fallbacks are in the mutation gate (`ical-no-fabricated-start-time`, `ical-end-time-derived-not-constant`). The My Route export is guarded only by `frontend/src/utils/__tests__/routeIcs.test.js`. Keep `docs/SHOW_DAY_RUNBOOK.md` in step with this section, in the same commit.

Incident detail: `docs/field-notes/lineup-cancellation.md`.

### A claim is not a delivery record (#1152)

`band_follow_notifications` once used one row for both "sending to this person" and "sent". A Worker that died between the two left a row that every reader, resends included, read as delivered, and the follower was dropped silently. Migration 0065 split it into `claimed_at` (NOT NULL, defaults to now) and `delivered_at` (set **only** on provider confirmation), and dropped `notified_at`.

**Two rules, always tested as a pair:** an undelivered claim past its lease is retried; a delivered row is never retried, however old. Rule 1 alone is satisfied by retrying everything, which re-mails the whole history.

- Failed-send release matches that attempt's `claimed_at` and `delivered_at IS NULL`, so it cannot remove a later takeover or delivery.
- `CLAIM_LEASE_MINUTES` (15) and `claimIsLiveSql(alias)` in `functions/utils/bandFollowNotify.js` are the single home for "does this row still speak for the follower?". Readers import it: `resend-announcement.js` and `events/[id]/metrics.js` (`would_notify_count`).
- **Marking `delivered_at` on success is mandatory.** Left unmarked, a success looks like a crash and is re-mailed 15 minutes later. `announceDigest.js` is the easy one to miss.
- **Guard tests live at the sender** (`notifyBandFollowers` called directly). The read filter and the takeover's `delivered_at IS NULL` are each independently sufficient, so handler-level tests survive breaking either one. Both sender tests are in the mutation gate.
- **A confirmation write must never fail a delivered send.** Every `SET delivered_at` write is caught locally, logged, and still counted as sent: `bandFollowNotify.js`, `announceDigest.js`, `subscriberNotify.js`. `deliveryConfirmationGuard.test.js` finds each write, asserts by brace depth that it sits inside a `try`, asserts it finds at least three, and asserts its own detector can return false.
- **Resend requests carry an `Idempotency-Key`:** `band-follow:<performanceId>:<followerId>`, `subscriber:<eventId>:<kind>:<subscriptionId>`, and `announce-digest:<sha256>` over the recipient and sorted performance ids. **Both 409s mean undelivered.** `concurrent_idempotent_requests` is still in flight; `invalid_idempotent_request` cannot prove a send, so it is logged at `error`. A retry may run at once, but it cannot succeed until the 24h key expires: a possible late duplicate, never a silent drop. Postmark and MailChannels get no key; they have no equivalent.

The incident and the mutation evidence: `docs/field-notes/email-delivery.md`.

## Band Announcements

Band follows are **double opt-in**: `POST /api/bands/:name/follow` creates the row `verified = 0` with a `verification_token` and sends only a confirmation email. Clicking the link first loads `GET /api/bands/:name/confirm-follow?token=…`, which renders a confirmation page; its form POST sets `verified = 1` and clears the token (idempotent). Announcement emails target `verified = 1` followers **only** (the `WHERE … verified = 1` filter in `admin/bands/[id].js` and `resend-announcement.js`), so an address the submitter doesn't control can never be enrolled in the announcement stream — it receives at most one confirmation email. **Do not revert follow to auto-verify (`verified = 1` on insert)** — it reopens the email-bombing vector.

### Emailed links never act on a GET (#1291)

Corporate mail scanners fetch email links with GET, so confirmation and unsubscribe links must not mutate state when scanned. GET renders a no-store, noindex page with a button and writes nothing; POST performs the action. Confirmation and unsubscribe POSTs accept the token from the form or the query string, so the unsubscribe routes are ready for RFC 8058 one-click; outgoing mail does not yet send the `List-Unsubscribe` / `List-Unsubscribe-Post` headers that would let a mail client use it. Confirmation URLs are echoed in API responses only for explicitly allowed development requests when email delivery is unconfigured. Confirmation links expire after 7 days; an expired pending request is deleted on re-request and receives a fresh token and consent timestamp.

**The page's `<meta name="referrer" content="same-origin">` is load-bearing.** `functions/_middleware.js` sends `Referrer-Policy: no-referrer` on every Function response, and under that policy a browser submits the form with `Origin: null`, which the origin allowlist rejects with 403. Every button failed in Chromium; `curl` (no `Origin` at all) passed, and so did every unit test. Verify a change to these pages by clicking the button in a real browser against `wrangler pages dev`, not with `curl`. Do not allowlist `"null"` instead: sandboxed iframes send it too.

**The gate is now guarded by `functions/api/admin/bands/__tests__/announce-double-opt-in.test.js`, and it was previously unguarded.** Until that file existed, deleting `AND verified = 1` from _either_ recipient query left all 1,169 backend tests green: ten announce-related test files seed followers, and every one of them wrote `verified = 1`, so no fixture could ever distinguish a gated query from an ungated one. The suite looked thorough and proved nothing about the property it most needed to prove. The new tests seed an **unverified** follower and assert they are never queued or emailed, one case per call site — verified by mutation, not by passing. **A third sender means a third case here**; a fixture-only suite is how this went unnoticed for so long.

When a performance is announced (`is_announced` 0→1), verified followers of that band are emailed once. Delivery is tracked **per-follower** in `band_follow_notifications (performance_id, band_follow_id)`: the announce records each _successful_ send. Failed sends leave no row, so `POST /api/admin/bands/:id/resend-announcement` recovers them by emailing only followers without a notification row (never double-sending). Shared send+record logic lives in `functions/utils/bandFollowNotify.js`. **Do not reintroduce a fire-once latch without per-follower tracking** — it silently drops fans whose first send failed (the bug this replaced).

Follow, subscriber, and single-band digest mail carries RFC 8058 one-click unsubscribe headers whose URL is the same link shown in the body. Multi-band digests deliberately carry no one-click headers because one click must not silently remove only one of several follows.

Bot protection on the public email-input endpoints (follow, subscribe) goes through `verifyTurnstile()` in `functions/utils/turnstile.js`, which **fails closed in production**: if `TURNSTILE_SECRET_KEY` is unset it allows only local-dev requests and rejects everything else (mirrors `CSRF_SECRET`). The secret **must** be configured in the production Pages project.

### Proof of consent is recorded at confirmation (#1289)

Band follows and email subscriptions store `confirmed_at` and the `consent_version` that identifies the wording shown when the request was made; legacy rows remain NULL because their wording and confirmation time were not recorded. Bump `CONSENT_VERSION` whenever the follow/subscribe form wording or confirmation email wording changes. Confirmation writes use SQLite's `datetime('now')` and must never overwrite an existing confirmed timestamp.

---

## Testing

### Backend unit tests

```bash
npm test         # from repo root
```

Runs fine locally, including on Apple Silicon (`better-sqlite3` loads natively on arm64) — the full suite completes in a few seconds. Prefer running it locally over waiting on CI.

### Frontend unit tests

```bash
cd frontend && npm test
```

### E2E tests

```bash
npx playwright test
```

Requires a running wrangler dev server or uses it automatically via `playwright.config.js`. Run `npm run build --prefix frontend` first.

### Post-deploy probes are read-only (#1292)

Post-deploy probes check iCal, sitemap, and SSR identity metadata without writing; `/s/` is excluded because share links expire via cron and no fixed slug is safe to probe. They run after **production** deploys only: a `dev` deploy goes to a Pages preview, which binds no D1 (#1295), so they would fail on missing data rather than on a broken release.

### Edge E2E against a preview (#1292)

Node and local `wrangler` do not enforce the Workers runtime's limits, which is how a PBKDF2 count the edge refuses broke signup for three months with every test green. `.github/workflows/edge-e2e.yml` runs the login and user-management specs against a real Pages **preview** deployment.

- **Data:** previews bind only the scratch D1 `settimes-e2e-db`. `scripts/reset-e2e-db.mjs` rebuilds it from `database/setup-complete.sql` each run. It refuses any target other than that exact name and id, deletes the schema file's local test accounts, and seeds the E2E admin plus a `viewer@settimes.ca` whose password is random and discarded.
- **Drop order:** children are dropped before their parents. D1 ignores `foreign_keys = OFF`, and a child's implicit DELETE fails once its parent is gone.
- **Plain-text vars live in `wrangler.toml` (`[env.preview.vars]`), never the dashboard.** A deploy with that file replaces the dashboard's plain-text vars and keeps only secrets; the first run lost all three that way. Secrets stay in the dashboard. Production is unaffected only because every production var is a secret.
- **Production code paths:** previews set `ENVIRONMENT=preview`, which `isDevRequest` treats as production (secure cookies, real CSRF). They use Cloudflare's always-pass Turnstile test keys and no email provider.
- **Origin:** tests hit the branch alias `edge-e2e.longweekend-bandcrawl.pages.dev`, because the middleware's Origin allowlist needs a stable origin. The preview env's `CORS_ALLOWED_ORIGINS` names exactly that alias.
- **Rate limits are production's** (5 logins per minute per IP), so the run is two phases with no retries: user management on one stored session, then `login.spec` after the window clears.
- **Ready means Functions answer.** The wait requires JSON from `/api/events/timeline` three times running. `/` is a static file: it once returned 200 while the alias still pointed at the previous run's deleted deployment, and login got an HTML error page.
- **Queueing and teardown:** one shared database, so runs queue (`cancel-in-progress: false`). Every run deletes its deployment, and a failed delete fails the job, so stale previews (#1295) cannot pile up.
- **Not run** for fork or Dependabot PRs, which get no secrets. The job says so; it never passes silently.

### Playwright artifacts carry typed secrets — upload only scrubbed ones

Playwright has no masking: a `fill()` writes the value into the failure page snapshot (Playwright's error-context file), the trace and the HTML report's step titles. This repo is public, so any signed-in GitHub user can download an artifact. On 2026-10-15, 12 artifacts were found holding the E2E admin password; they were deleted and the secret was rotated.

Every Playwright upload now runs `scripts/scrub-e2e-artifacts.mjs` first, which drops traces and the HTML report, redacts the secret, then reads every remaining file back and exits 1 if anything survives. The upload is gated on `failure() && steps.scrub.outcome == 'success'`. `failure()` alone is still true after a failed scrub step, so a broken scrub would upload the raw files. `scripts/__tests__/scrubE2eArtifacts.test.js` fails the build on any workflow that uploads `playwright-report/`, or uploads `test-results/` without that gate. Need a trace? Reproduce locally.

### Testing Safari/WebKit locally — `upgrade-insecure-requests` breaks it, silently

Playwright WebKit against `http://localhost:8788` renders a **blank page** with no error: the `/*` document CSP in `frontend/public/_headers` carries `upgrade-insecure-requests`, so WebKit rewrites every subresource to `https://`, where the dev server has no TLS. Chromium treats `localhost` as trustworthy and skips the upgrade, which is why this only shows up in Safari. **It is not HSTS** (RFC 6797 §7.2 ignores STS over http — verified by experiment). **Production is unaffected; do not weaken the directive or HSTS.**

For layout/rendering tests only, strip the CSP in-flight (no URL rewriting needed) and use `waitUntil: 'domcontentloaded'`, never `'networkidle'`, which never fired in WebKit here (likely the service worker's background requests; cause inferred, not measured):

```js
await ctx.route("**/*", async (route) => {
  const res = await route.fetch();
  const h = { ...res.headers() };
  delete h["content-security-policy"];
  await route.fulfill({ response: res, headers: h });
});
```

The page then runs without CSP, so this harness cannot test anything CSP governs. Experiments, measurements and the roster-edge contrast results: `docs/field-notes/webkit-local-testing.md`.

### Lighthouse CI performance assertion (#728, #854, #851)

`lighthouserc.json` measures the **served app** (`http://localhost:8788`, wrangler + seeded D1 via `.github/actions/e2e-env`), never a static `dist` — the static harness produced a fake 0.2 CLS and a ~0.10 perf deficit that drove two unjustified budget cuts (#869). Measurements and history: `docs/field-notes/lighthouse-ci.md`.

- **Performance floor 0.90, `aggregationMethod: "optimistic"`.** Do not switch to `median` (only ever stricter → flakes) and do not raise it to the observed ceiling (~5 points of headroom absorbs runner noise).
- **`cumulative-layout-shift` ≤ 0.1 with `"pessimistic"`** — load-bearing: `optimistic` would have passed the very artifact it guards against. Safe because CLS is stable under load; do **not** copy `pessimistic` onto performance.
- **Never move a floor from a local number.** Perf is contention-sensitive (0.63 → 0.96 on identical code); local `lhci` is not comparable to CI. Only CI samples count.

### The mutation gate — documented invariants, proven executable

```bash
make mutation-gate      # ~8s; NOT part of `make gate`; its own job in quality.yml
```

This repo's recurring defect is the **vacuous test**, one that passes against both the correct and the broken implementation: deleting `AND verified = 1` once left all 1,169 backend tests green. `scripts/mutation-gate.mjs` applies each documented invariant's one-line breaking mutation, runs the named tests, **requires them to go red**, then restores the file and verifies the restore.

- **A `find` string that is absent or matches more than once is a gate failure**, not a skip. When you reword a guarded line, update its `find`.
- **A surviving mutant is a finding.** Fix the test, or record it in `KNOWN_SURVIVING` with an issue; never delete the entry to get green.
- It refuses to run on a dirty tree (scoped to the files its table touches).
- Each entry cites a section here as `CLAUDE.md '<Section>'`. `scripts/__tests__/mutationGateCitations.test.js` fails when no heading matches by prefix (backticks stripped, whitespace collapsed), so **renaming a cited heading fails the build**. A section's prose is unchecked: green means the references resolve, not that the words are current.
- Scope is `functions/` only. A `frontend/` companion is a reasonable v2; `festivalDays.js` is the first candidate.

It proves named tests catch specific breaks, nothing more. Add an entry whenever you add or change a test for something documented here.

### Hand-rolled mutation runs — check the harness ran, not just its exit code

An exit code cannot tell "the test caught the mutation" from "the test never ran"; both are 1 (`No test files found`). Two cheap habits:

- **Run the baseline first and require it green**, with a real passing count.
- **Assert on the failing test's name**, not the exit code. That also exposes a mutation that fails everything for an unrelated reason, such as a leftover `.bind()` argument raising a bind-count error.

zsh does not word-split unquoted `$VAR`, so `npx vitest run $SUITES` passes one filter string and matches nothing. Bare `$ARR` in bash expands to the first element only, a false green. Use an array expanded quoted: `"${SUITES[@]}"`.

### The coverage floor — no handler may be entirely untested

```bash
make coverage-floor      # runs the coverage suite, then the check
```

Global thresholds are averages and cannot see a file-shaped hole: on 2026-08-31 the backend was at 81.67% with three handlers at 0%. `scripts/check-coverage-floor.mjs` reads `coverage/coverage-final.json` and fails if any file under `functions/api/` has 0% statements. It runs in `quality.yml`'s coverage job directly after `npm run test:coverage`, which produces its input.

- **The allowlist is empty (`MAX_ALLOWED = 0`).** Adding an entry means shipping an untested handler.
- It measures **execution**, not filenames: backend suites are feature-named, so basename matching gives false positives.
- A missing coverage file **fails**, and so does a mismatch between the on-disk inventory and the coverage map (a changed `coverage.include` would otherwise hide dark files).
- vitest's own thresholds were tried and do not work: glob groups aggregate, and `perFile: true` produced 113 errors.

It proves a file ran, not that it was tested well; the mutation gate covers that half.

### Before every commit — required checklist

**Run `make gate` before every commit; do not commit if it fails.** It runs `format` → `format-check` → `lint-all` → `check-citations` → `test` → `build` for both stacks with real exit codes (`Makefile`, `AGENTS.md`). `lint-all` covers ESLint, `lint-md`, `lint-sh`, `lint-yaml`, `lint-sql` and `lint-json`. After Dependabot merges, run `npm ci` in both stacks first, or the gate tests stale dependencies.

Deliberate properties of those targets:

- **They fail with an install hint and never skip** (`shellcheck`, `yamllint`, `sqlfluff`). `scripts/__tests__/makefileGuards.test.js` fails if a target is missing from `.PHONY` or a recipe ends in a filter that masks its status (#1070).
- File lists use `git ls-files --cached --others --exclude-standard`, so new untracked files are linted, and each recipe tests `[ -f "$f" ]`, so deleted-but-unstaged files are skipped.
- `lint-json` passes the path as `process.argv[1]`, never interpolated into `node -e`. Loops accumulate `rc=1` in a `while` redirected from a file, because a piped `while` runs in a subshell.
- `.yamllint` and `.markdownlint.json` are tuned to this corpus: a huge finding count means the config is wrong before it means debt. `lint-json` checks validity, not formatting.
- `sqlfluff` skips `archive/` (unparseable, never-applied migrations).

To run a subset or debug one step:

```bash
# frontend
cd frontend && npx prettier --write "src/**/*.{js,jsx,json,css}" && npm run lint && npm run format:check && npm test -- --run && npm run build
# backend, from the repo root
npm run format && npm run format:check && npm run lint && npm test
npm run validate:openapi    # if docs/api-spec.yaml changed
```

Run `--write` before `--check` (CI's check never fixes), and `npm run build` because E2E runs the built app. Run E2E only when changing routes, auth flows, or what the suite targets.

### Before opening a PR — AI review gate

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

### CodeRabbit has a hard review budget — batch your pushes

**Every push to a PR branch that changes at least one review-eligible file triggers a review** (a push touching only path-excluded files, such as a lockfile, is skipped and uses no allowance). The allowance is **dynamic** (it has read 1, 3, 4 and 5 reviews/hour on Essentials) — read it from a _current_ review footer or comment `@coderabbitai rate limit` on the PR, never from memory or this file. History: `docs/field-notes/coderabbit.md`.

**Usage-based billing was switched OFF on 2026-09-24.** Past the allowance a review is now **rate-limited, not billed** — so the failure changed shape from a bill to an **unreviewed commit**. CodeRabbit posts a rate-limit notice instead of a review, and nothing re-runs it when the window refills. A PR merged in that state ships a head commit no reviewer looked at, while every other check is green. That is the green-means-did-not-look class, and it is worse than the bill was, because nothing surfaces it.

- **Before merging any PR, run `make await-review PR=<n>` and merge only on exit 0.** It watches the `CodeRabbit` commit status on the PR's _current head_, waits out a rate-limit cooldown (parsed from CodeRabbit's comment, else 10 min), posts one `@coderabbitai review`, and keeps watching; a new push resets it. **Slowing down is the intended cost** (owner decision, 2026-09-24): a merge waits for the review, never the reverse. `--once` classifies without acting.
- **Do not judge "reviewed" by the check being green, or by a review object.** The rate-limited status _passes_ by design, and 13 of 32 merged PRs had a completed review with no review object on the head. Only the status description `Review completed` on the head SHA means a review ran — which is what the script reads (`scripts/coderabbit-await-review.mjs`, header has the evidence).
- **Concentration is the failure, not volume** — #998 burned 4 reviews in ~25 min on a two-line change. Read your own diff and run the right suite locally, then push once. Iterate as a **draft** PR (`auto_review.drafts: false`, so drafts cost nothing) and `gh pr ready` at the final state.
- `make hooks` installs `.githooks/pre-push`, which warns at the first review in the window and blocks at `LIMIT` (update it only against a current footer; erring low blocks pushes the budget would allow). POSIX `sh`; its one network call asks `gh` whether each pushed PR is a **draft** and skips counting only on an explicit `true` — every failure (no `gh`, offline, no PR, >5 s) counts the push, so it cannot fail open (`scripts/__tests__/prePushDraftLookup.test.js`). **Its counter is per developer, not per repo** (`~/.cache/coderabbit/push-log`, shared with `wrhn-mcp`'s hook — the two must agree on that path, not on counting rules), because the allowance is — a per-repo log let 3 + 3 pushes across the two repos reach 6 on 2026-09-24, while both hooks still had `LIMIT=5`, with neither noticing.
- **Override on urgency to land, not issue priority:** show day, a production incident, or someone blocked → `CODERABBIT_OVERAGE=1 git push`. It no longer bills; it accepts a rate-limited review, which `make await-review` then recovers. Everything else: waiting is free, the window refills.

### Before every push (including follow-up commits during PR review)

```bash
git fetch origin
git rebase origin/main      # keep branch current with main
```

Do this **every time you push**, not just when opening the PR. Dependabot merges deps bumps to `main` frequently — if you push without rebasing, GitHub will require an "Update branch" click before merging, which adds round-trips. Rebasing before each push eliminates this entirely.

### Opening a pull request

Full PR standards are in `.github/instructions/pull-request-standards.instructions.md`. Key points:

- **Use the PR template** — GitHub loads `.github/pull_request_template.md` automatically. Fill every section; write "None" rather than deleting a section.
- **Title:** conventional-commit prefix + specific description. Put `Closes #N` on its own line in the body (GitHub does not auto-close from the title).
- **Labels:** always apply one type label (`bug`, `enhancement`, `ci`, `documentation`, `chore`, `security`) + one priority label (`priority:p1/p2/p3`) when opening — not after.
- **Verification checkboxes:** tick every `- [ ]` item before merging. An unchecked test plan is indistinguishable from a skipped one.
- **Attribution:** one line, no session URL: `Built by Sonny · Reviewed by Theo · 🤖 [Claude Code](https://claude.ai/claude-code)`

```bash
gh pr create --label "bug,priority:p1"   # example
```

---

## Security Notes

- All admin state-changing endpoints require both a valid session cookie AND a CSRF token (`X-CSRF-Token` header, read from the `csrf_token` cookie).
- Session invalidation: `lucia.invalidateUserSessions(userId)` must be called before `lucia.createSession(user.id, {})` on re-authentication (login, MFA verify). This kills stale sessions from prior compromised contexts. Both methods live on the object returned by `initializeLucia()` in `functions/utils/auth.js`.
- CSRF cookie must be regenerated whenever a new session is created (see `functions/api/admin/sessions/revoke-all.js`).
- `params.id` from Cloudflare Pages Functions URL params is a string; always run it through `validateId()` from `functions/utils/validation.js` before using it in a DB query.
- **Every route that writes `events.slug` validates it against `VALIDATION_SCHEMAS.event.slug`** (create, wizard, `edit.js`, `duplicate.js`; PATCH refuses slug changes). Until #1276, `edit.js` and `duplicate.js` stored any string, and the slug reached `sitemap.xml`'s `<loc>` unescaped. Only the document CSP stopped a stored script from running there. Output is now escaped as well (sitemap, email `href`s), but the validation is the primary control. A new slug writer must reuse the schema field, not retype the regex. Both checks and the sitemap escaping are in the mutation gate.

### Routes match case-insensitively; path checks must too

Production evidence: `/api/admin/Users`, `/api/admin/MFA/setup` and `/api/Events/timeline` reach Functions regardless of case, while `/API/` does not. Use `routePath()` for every path-based security decision, never raw `url.pathname`; it also strips trailing slashes so `/path/` and `/path` take the same decision. `routePathGuard.test.js` scans for raw API path checks and is allowlisted only for `routePath.js`, the root `/api/` gate in `functions/_middleware.js` because `/API/` never reaches Functions, and the segment extraction in `functions/utils/request.js`, which fails closed on invalid casing.

### The security tooling this repo actually has

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

### Outbound requests go only to fixed addresses (SSRF)

The server never opens an address a caller can influence. Every `fetch` in
`functions/` targets a hard-coded `https://` URL (Turnstile, Postmark,
MailChannels, Resend) or `env.ASSETS`, which serves this site's own files and
cannot reach the network. Band photos and posters arrive as file uploads, never
as "import from URL", and stored artist links are rendered, never visited.

`functions/utils/__tests__/outboundFetchGuard.test.js` enforces it by parsing
every JavaScript and TypeScript file under `functions/` (test directories excluded): `fetch`, `WebSocket` and `EventSource` may take only a secure
(HTTPS or WSS) string literal, or a module-level `const` bound to one and not
shadowed. Any other argument (a variable, an interpolated template, a property read),
another binding's `.fetch`, or a `cloudflare:sockets` import fails the build.
A feature that genuinely needs a
caller-supplied URL (link previews, URL import) must change that test on
purpose, with an allowlist of hosts and a refusal of private and link-local
addresses, never by loosening the scan. In the mutation gate.

### Retention windows are a published promise

The privacy policy's retention table (`frontend/src/pages/PrivacyPage.jsx`) states
how long each kind of personal data is kept. Unconfirmed follow and subscription
requests, including their email and consent IP, expire after 7 days; confirmation
and re-request paths use the same window, while
`functions/api/admin/maintenance/retention.js` deletes any remaining pending rows.
Two handlers make the other published windows true:
`functions/api/admin/maintenance/retention.js` deletes expired rows, and
`functions/scheduled/anonymize-schedule-builds.js` anonymises schedule-build
visitor codes 30 days after an event. Both run daily
from `scheduled-jobs.yml` through `/api/internal/run-scheduled`. Change a window in
one and you must change the policy in the same PR.

Until the 2026-10 report card, the 30-day login-attempt window (emails and IPs) and
the 90-day `api_key.request` window could be removed with every test green:
the cross-table test seeded neither. `retentionWindows.test.js` now pins both on
each side of the boundary, and both are in the mutation gate.

A failed retention or anonymisation step must turn the daily run red. The workflow
is the operational check that these published deletion promises actually ran; a
log-only failure would leave personal data past its promised window while still
reporting a successful run.

### Content-Security-Policy (strict, no `unsafe-inline`) — TWO sources

There are **two** CSPs, and the one the browser enforces on a page is **not** the middleware:

- **`frontend/public/_headers`** sets the CSP (and COOP/COEP/CORP) on **static/document responses** — i.e. the HTML the browser loads. **This is the browser-enforced CSP for pages and the one that governs Turnstile, the service worker, and inline scripts.** Edit this for anything affecting what the page can load.
- **`functions/_middleware.js`** sets a CSP on **Pages Functions / API responses** (JSON), enforced unless `isDevRequest` says this is a known dev environment, and `CSP_ENFORCE` overrides either way. It does not govern the document.
- **Never compare `env.ENVIRONMENT` directly; call `isDevRequest`.** Production runs with `ENVIRONMENT` unset (a deploy with `wrangler.toml` wiped the plain-text var), and three `=== "production"` checks read that as non-production: the API CSP was report-only and password-reset completion echoed a `debugId` (#1273). `functions/__tests__/environmentFailsClosed.test.js` fails the build if any other file reads `ENVIRONMENT`.

For the `_headers` document CSP:

- **Turnstile** needs `https://challenges.cloudflare.com` in `script-src`/`frame-src` ([CSP docs](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)); no `'unsafe-inline'`.
- **`Cross-Origin-Embedder-Policy: require-corp` must NOT be set** — it blocks the Turnstile iframe (which doesn't send COEP; `credentialless` isn't supported in Safari). The app needs no cross-origin isolation.
- **The inline theme-flash `<script>` in `frontend/index.html`** is allowed by a `'sha256-…'` hash in `script-src`. **If you edit that script, regenerate the hash** (sha256 of the exact built script body, base64) or it silently stops running and a theme flash returns. No test covers this — verify by building and hashing `dist/index.html`.
- **Cloudflare Rocket Loader must stay DISABLED** for the zone. It rewrites/inline-executes `<script>` tags, which strict CSP blocks ("Refused to execute inline script"). A modern code-split Vite SPA gains nothing from it.

### Where Cloudflare-facing settings actually live

Most of this is Cloudflare-side state that can be silently undone, with nothing in the repo to show it mattered. Read the layer column before changing anything:

| layer                    | where you change it                                                                 | items                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Zone settings**        | Cloudflare dashboard / API, zone `settimes.ca` (`77e5bb9ef071b25b9cb65885ed4b38e1`) | Rocket Loader, the `www` → apex redirect rule, SSL mode, minimum TLS                         |
| **DNS records**          | same zone, DNS tab                                                                  | the DMARC record                                                                             |
| **Pages project** config | Cloudflare Pages project `settimesdotca`                                            | environment variables                                                                        |
| **Account** resources    | Cloudflare account                                                                  | D1 databases                                                                                 |
| **This repository**      | `frontend/public/_headers`                                                          | **HSTS** — listed only because the zone toggle reading "off" is correct and looks like a gap |

- **Preview deployments bind only the scratch D1**, via the `[env.preview]` block in `wrangler.toml` (2026-10-13). Without it, previews inherit production D1 and R2. Never bind a production resource there; `scripts/__tests__/previewBindings.test.js` enforces both halves.
- **Rocket Loader stays disabled**; strict CSP blocks the scripts it rewrites.
- **`www` → apex is a zone _dynamic_ 301** (`concat("https://settimes.ca", http.request.uri.path)`, query preserved, #984). A static redirect would send every deep path to `/`. Keep `www` as a Pages custom domain: without it, old links become TLS errors instead of redirects. `/` deliberately emits no raw-HTML canonical, so if `www` ever stops redirecting, the duplicate-host problem returns.
- **SSL/TLS is Full (strict), minimum TLS 1.2.** A proxied origin with a bad certificate fails closed, on purpose.
- **HSTS is served from `frontend/public/_headers`**, so the zone's HSTS toggle reading "off" is correct. Do not also enable the zone toggle; check the live header before concluding anything is missing.
- **DMARC:** `v=DMARC1; p=quarantine; adkim=r; aspf=r; pct=100; rua=mailto:dmarc@settimes.ca`. Alignment stays relaxed because iCloud (human mail) and Resend via SES (application mail, including band-follow confirmations) are both legitimate senders; strict alignment would quarantine confirmations silently. `p=reject` waits until reports show both paths pass. If no reports arrive within a few days, check that the catch-all routes `dmarc@`.
- Removed 2026-08-29; do not recreate: `dev.settimes.ca` (a dead tunnel), the unused `ADMIN_PASSWORD`/`MASTER_PASSWORD` Pages vars, and the empty `bandcrawl-db` D1. To check whether a D1 is empty, query `sqlite_master`; the API's `num_tables` is wrong.

Before-and-after evidence, the redirect rule and DMARC reasoning: `docs/field-notes/cloudflare-settings.md`.
