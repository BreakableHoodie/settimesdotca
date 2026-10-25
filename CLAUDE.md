# CLAUDE.md — settimesdotca

AI assistant context for this codebase. Captures non-obvious invariants, known gotchas, and conventions that aren't derivable from reading the code.

**This file has a 125,000-character budget** (`scripts/__tests__/claudeMdBudget.test.js`), because Claude Code warns past 150k across all loaded instruction files. Rules live here; incidents, measurements and history go verbatim into `docs/field-notes/`.

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

`docs/REPORT_CARD_REVIEW.md` grades the whole repo across nine categories, fixes what is safe, and re-grades. It is **tracked in git** so a fresh clone, CI or a delegate can find it (#818's failure was an untracked tree), **and listed in `mkdocs.yml`'s `exclude_docs`**, because `docs/*.md` ships to docs.settimes.ca whatever the `nav` says and this file names past security gaps. Keep the exclusion even if the site is retired again, and never "fix" the missing nav entry: the file is meant to be absent from the site, not merely unlinked.

**Cadence: the start of a release cycle or roughly quarterly**, ideally after a season ends and before the next edition's build-out. It is deliberately not a per-PR gate. It catches drift no diff-scoped reviewer can see: a coverage ratchet ten points below actual, an exported constant imported by nothing while five endpoints copied its value, an override pinned inside its own vulnerable range, a security control with zero coverage (all found by the first run, 2026-08-20, #900–#917).

**Its findings are claims until verified.** That first run also filed three wrong assertions and wrote three vacuous tests. Treat the output as a lead list, and correct the record on the issue when a lead does not survive contact.

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

settimes.ca is the multi-venue/multi-artist event platform for **Waterloo Region** (Kitchener-Waterloo, ON). The most recent edition, **Long Weekend Band Crawl Vol. 18** (event 37, `lwbc18`, single-day, October 11, 2026), was **archived 2026-10-13**. No edition is published now; the next is expected in February 2027.

- **Focus:** Waterloo Region governs **product language** (marketing copy, meta descriptions, SEO targeting), not fact: an out-of-region event (Buddies Fest 2, Tillsonburg) stays accurate wherever it appears. Never describe the site as serving Ottawa.
- **Brand:** settimes.ca, no rebranding. Fan-facing and admin tooling are equal priority. SEO is a priority (band, event and venue pages, structured data).
- **Colour themes:** 4 user-selectable (see Theming). **Single photo per band** (`photo_url` / R2); no video embeds.

**Shipped editions** (all `status = 'archived'`): Vol. 18 (event 37), Vol. 17 (event 21) and Buddies Fest 2 (event 36, the first multi-day production event). Read their lineups and venues from D1, not from this file.

**Between seasons is a supported state, not a bug.** Right now `/api/events/public` and the timeline's `now`/`upcoming` return 0 and the iCal feed has 0 `VEVENT`s, while `/api/stats/public` and `sitemap.xml` stay populated from archived editions. `EventTimeline` has a dedicated empty state for it and auto-expands Past.

**The iCal zero is the trap once the next edition is published:** a published event whose lineup is not announced yet also yields 0. Ask which layer a surface reads, **event**-driven or **performance**-driven, rather than trusting the number. Before treating any zero as a bug, check both: is an event `published`, **and** does it have performances?

Canonical roadmap: `docs/ROADMAP.md`. **Track remaining/deferred work as GitHub issues** (`gh issue create`) and reference them from PRs (`Closes #N`).

Edition details and the measured between-seasons table: `docs/field-notes/project-history.md`.

---

## Stack

- **Frontend**: React 19, Vite 8, Tailwind 4, React Router 7 (`frontend/`)
- **Backend**: Cloudflare Pages Functions (edge serverless, `functions/`)
- **Database**: Cloudflare D1 (SQLite-compatible), numbered migrations in `migrations/`
- **Auth**: Direct D1 session manager (`functions/utils/auth.js`), CSRF double-submit, TOTP MFA, trusted devices, RBAC
- **Storage**: Cloudflare R2 (band photos, posters) · **Email**: Postmark/Resend/MailChannels
- **Tests**: Vitest (unit, frontend), Playwright (E2E + a11y + visual regression)
- **CI/CD**: GitHub Actions, Dependabot, Snyk, GitGuardian, CodeRabbit
  - **Runners are GitHub-hosted.** Jobs read `runs-on: ${{ vars.RUNS_ON || 'ubuntu-latest' }}`, except two that pin `ubuntu-latest` on purpose: `zap-baseline.yml` (needs Docker) and `quality.yml`'s **Lighthouse CI** (its floor was calibrated on hosted hardware). **Never set the `RUNS_ON` repo variable while this repo is public:** any fork PR would execute on Dre's homelab runner (setup in the private `BreakableHoodie/gh-runner` repo), and the runner sync stops runners for public repos, so every job would queue forever.
  - **Dependabot merges do not deploy on their own** (#1209): GitHub starts no push workflows for a push made with `GITHUB_TOKEN`. `deploy-reconcile.yml` runs every 30 minutes and dispatches the production deploy for any `main` HEAD without one. It waits 10 minutes so it cannot race (and cancel) a human merge's deploy, and **never re-dispatches after a real failure**, so a broken deploy cannot loop. Push-only scans still do not run for bot merges; the PR runs covered the same content.

The private-repo period (2026-09-16 to 09-25) and what it removed and restored: `docs/field-notes/project-history.md`.

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

### Venue running late — one shift, one batch, never across 06:00 (#1249)

`POST /api/admin/events/:id/venues/:venueId/delay` `{ minutes }` moves every **remaining** set at a venue and adds to the venue's cumulative delay, which the fan page shows as a banner (`event.venue_delays` on `/api/schedule`). `DELETE` is "back on time": it clears the banner and leaves the times as they are. The planning is pure (`functions/utils/venueDelay.js`). Four rules are load-bearing:

- **"Remaining" is the Toronto festival clock.** A set has started once its festival day is past or its start is at or before now in festival minutes (`eventLocalFestivalToday` + `eventLocalClock`). Cancelled sets and sets with no start time are never moved.
- **Times are compared in festival minutes**, after-midnight counted past 24:00, so 23:50 +15 is 00:05 on the same festival night and `performance_date` is untouched. **A shift that would MOVE a start or end across 06:00, in either direction, is refused** (409 `SHIFT_CROSSES_FESTIVAL_DAY`): it would silently change which festival day the set belongs to. A set already ending after 06:00 (05:00-07:00) is on the far side before and after, so it does not block the venue.
- **One batch, claimed by a nonce.** The first statement claims `event_venue_delays` by compare-and-swap on `revision` and stamps this request's `last_shift_id`; every set UPDATE and the audit row apply only `EXISTS(last_shift_id = nonce)`. D1 rolls a batch back on an error, not on an UPDATE that matches nothing, so this, not per-row predicates, is what makes two simultaneous "+15" taps unable to stack: the loser writes nothing (409 `DELAY_CHANGED`). A concurrent archive fails the claim the same way. **The claim also requires every set at the venue to be exactly as read** (times, cancel flag, none added or moved away), via one JSON bind joined with `json_each`, so a per-row edit landing mid-shift fails the claim instead of being overwritten past a stale conflict check. With no change count from D1, the handler reads back whether its nonce is stored rather than assuming.
- **Conflicts are checked on the final arrangement** with `detectDraftConflicts`, as #1161 requires; cancelled sets never conflict.

The delay total stays in 0-600 (also a `CHECK`). On the public side a failed banner read degrades to `venue_delays: []`, logged at `error`, and never fails `/api/schedule`. The rules above are in the mutation gate.

### Poster-led event palettes and venue stamp inks (#1248)

An event page takes its colours from the edition's poster. `events.theme_colors` holds `{"v":1,"source":"poster"|"manual","poster":"<https url>","light":{ground,ink,accent,nowFill},"dark":{...}}`, every colour `#rrggbb`. Two validators, one per side of the build boundary, kept in step by tests: `functions/utils/themeColors.js` (create and PATCH refuse anything else, including the unused 0008 `{primary,...}` shape) and `isValidThemeColours` in `frontend/src/utils/posterPalette.js`. Both accept either hex case. `null` is the house theme, and must render cleanly.

- **A palette describes ONE poster.** `poster` is the URL it was read from. The event form re-reads whenever the event's poster is not that one, because an upload saves the poster at once while the colours save with the form, so closing the form would otherwise leave a new poster with old colours for good. The public page must ignore a `"poster"` palette whose `poster` is not the event's current `poster_url`; a hand-picked `"manual"` palette applies regardless and is never replaced silently. "Remove colours" on an event with a poster stores `{"v":1,"source":"none","poster":<url>}`, the house theme as a choice for that poster: a bare `null` would be read straight back into colours by the next render (CodeRabbit, #1361). `"none"` is never auto-replaced either, and the public page treats it as no palette. Duplicating an event copies neither the poster nor its palette.
- **Stored re-serialised, never as submitted.** `validateThemeColorsJson` returns `value`, the palette re-stringified from what it checked; create and PATCH store that. `JSON.parse` keeps the last copy of a repeated key, so the raw text could carry an unchecked first copy to any reader that parses differently.
- **Extraction is in the admin's browser** (median-cut, then role mapping), never on Workers. The poster host sends no CORS headers, so a canvas cannot read its pixels: `GET /api/admin/events/posters?url=` (editor) returns the same R2 object same origin. It serves only `event-posters/<key>` on the configured poster host, with no slash in the key and no query, and only a stored image type (another stored type is 415 `POSTER_NOT_IMAGE`, logged). It is an R2 read, not a fetch, so the SSRF rule is untouched. A canvas that comes back blank (a browser blocking image reads) is an error, not a grey palette.
- **Roles:** a colour that already reads as text on the ground (4.5:1) is the accent; one that does not is demoted to the "on now" fill, under ink, rather than darkened into a colour the poster never used. When none reads as text, the one needing the least change is the accent. The dark variant is built from the poster's own ink. Tuned on all 19 production posters. **Not fully deterministic across browsers:** on 5 of 19 posters, two or three colours are near-equally strong and the resampler decides between them (measured with three resamplers at 160 px). Every choice is a real poster colour and passes contrast; the admin sees the preview.
- **Contrast is enforced twice:** at extraction, and at render (`readableThemeColours`), so a hand-edited palette can be ugly but never unreadable. Only lightness moves; hue is kept.
- **The form:** it reads the poster whenever the event has one and no colours from it (a changed poster, an upload whose form was closed, an edition from before palettes), so every edition picks up its poster's colours the next time it is edited. The palette is sent only when it changed in the form, so an unrelated edit never rewrites it and a stored value this version cannot read is kept. Save waits while colours are being read.

**The event page wears it** (`frontend/src/utils/posterTheme.js`, applied on `App.jsx`'s `.event-page` wrapper). The palette becomes CSS custom properties overriding the theme tokens (`--color-bg-*`, `--color-text-*`, `--color-surface*`, `--color-border`, `--color-accent-*`, and the per-theme gradient tokens, which are literals and would otherwise keep the theme's orange); Tailwind utilities resolve `var()` where they are used, so no component knows a palette exists. Light themes (`LIGHT_THEMES` in `ThemeProvider.jsx`) get the light variant. `accent-400` must pass on its own 20% tint, and `accent-500/600` under ground-coloured text, because those are the pairings the page uses. Derived text tones are re-checked against the ground. A mobile row on stage (`board-now`: strictly start <= now < end, not `isHappeningNow`'s 30-minute window) takes the poster's "on now" fill, sets every text token in the row to the ink (the only colour guaranteed to read on it), and says "On now, until 9:00 PM" in words. Venue stamps are FILLED, white on ink, so they read on any ground (an outlined red stamp falls to ~4.1:1 on the palest allowed grounds); `venueInk.test.js` pins white on every ink at 4.5:1. The page's type is Archivo (self-hosted, OFL, `font-display: optional` so it cannot shift layout), scoped to `.event-page`: `font-display` becomes condensed and `font-mono` wide and tabular.

**Uploads saved before the form (found in #1248 review, posters and band photos alike).** An upload that names its entity (edit mode) is in the database before the form is saved. Three things keep a cancelled form from writing the old value back, and all three were broken: `PhotoUpload` reports it through `onPersisted` and the parent refreshes its list, **in the background** (`loadEvents({ background: true })`: the full reload swaps the panel for a spinner and unmounts any open modal, which also hid the partial-save message); the event form sends `poster_url` only when it changed in the form; and `EventRow`/`EventCard` re-render on event **identity**, never on a field whitelist, because a row that skips a render hands Edit a stale copy. `PhotoUpload` follows `currentPhoto` after mount, so a form that fills a render late still shows the saved image. `frontend/src/__tests__/photoUploadPersistence.test.js` fails any `<PhotoUpload>` with an entity id but no `onPersisted`, and any `<BandForm>` without `onPhotoPersisted`.

**Venue inks:** `venues.ink_color` (migration 0076, nullable, `CHECK` lowercase `#rrggbb`) is fixed per venue across editions. `STAMP_INKS` in `functions/utils/venueInk.js` is the palette, and its order is load-bearing: the migration and `database/seed-test-data.sql` backfill by id **rank** through the same list (a test asserts all three match). Every venue writer assigns one: `POST /api/admin/venues` and the event wizard both take the least-used ink, and a failed lookup creates the venue without one (logged), never blocking it. Eight inks dark enough for AA on a light poster ground cannot also be well separated in lightness, so **the stamp always prints the venue's name**; the ink is a secondary cue. `/api/schedule` returns `venue_ink` and `venue_short`, the name without a trailing parenthetical, derived server-side so there is no second name to maintain.

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

### SSR owns identity meta and JSON-LD where it emits either; the client `<Helmet>` owns only what SSR does not emit

`<Helmet>` manages only tags it created (`data-rh`), so it **appends** a second copy of any tag `index.html` or a Pages Function emitted. A duplicate `og:url` once overrode our canonical.

- **`serveWithInjectedMeta()`** (`functions/utils/ssrMeta.js`) strips `index.html`'s defaults via `DEFAULT_META_RE`; every `og:*`/`twitter:*`/`description` that `index.html` declares must be listed there (`og:site_name`, #784).
- **On SSR-injected routes the client `<Helmet>` declares no `canonical`, `og:*`, `twitter:*` or `description`**, and no JSON-LD where the handler passes `jsonLd` (`/band/*`, `/venue/*`, #790). It may set `<title>` only with the SSR formula verbatim, once data has loaded (#785); `functions/api/venues/[id].js` exposes `city` for exactly that. `ssrIdentityMeta.test.jsx` asserts this; keep its fetch-in-flight case.
- Before deleting a tag from a `<Helmet>`, confirm SSR emits an equivalent. `functions/band/[id].js`'s JSON-LD `description` stays separate from the 200-char meta description. Never mark SSR tags `data-rh` for Helmet to adopt.
- **Every indexable route except `/` has a meta-injecting Pages Function** (`/event/*`, `/band/*`, `/venue/*`, `/events/*/recap`, and static pages through `STATIC_PAGES` in `functions/utils/staticPageMeta.js`). `functions/index.js` leaves `/`'s `<head>` byte-for-byte. Shell rewriters use `headersForRewrittenShell()`.
- **Server-render the URL people link to:** `functions/band/[id].js` **301**s a slug to `/band/<id>` (relative `Location`, query kept, public-data gate before the lookup, unresolvable slug renders the shell, #983). A `/venue/<slug>` link builder would need the same redirect.
- `/event/:slug` (live) and `/events/:slug/recap` (archive) are different resources; do not unify them (#910). Build every URL from `CANONICAL_HOST`, never `request.url`.
- **`frontend/public/_routes.json` is the only routes file** (`exclude` beats `include`); `functions/__tests__/staticPageMeta.test.js` checks it. Never recreate a root `/_routes.json`.

Mocked tests cannot prove dispatch: verify routing against `npx wrangler pages dev --port 8788` and diff per-path tag counts. History: `docs/field-notes/ssr-identity-meta.md`.

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
- `editor`: create/edit bands, events and lineup, **archive** events, use the event wizard, and **create** venues (owner decision 2026-10-10: the person who builds editions is an editor); cannot edit or delete an existing venue (that rewrites every past edition held there), delete events, or manage users. `VenuesTab` hides Edit/Delete from non-admins through `canManage`
- `admin`: full access, including editing or deleting venues, deleting events, users, API keys, invite codes, audit log, maintenance, and platform settings

Enforced via `checkPermission(context, "viewer"|"editor"|"admin")` in `functions/api/admin/_middleware.js`; every mutating endpoint calls it before touching the database. **Both roles are looked up as own keys** (`Object.hasOwn`): a bare `roleHierarchy["constructor"]` returns an inherited function, the comparison is false, and the request is ALLOWED. Migration 0069 adds `BEFORE INSERT`/`BEFORE UPDATE OF role` triggers on `users` and `invite_codes` that abort on any role outside the three (#1287) — triggers, not a CHECK, because rebuilding `users` on D1 would cascade-delete every session.

**The route policy is one explicit table:** `POLICY` in `functions/api/admin/__tests__/rbacBoundaries.test.js`. Every admin handler must appear in it, the role in the code must equal the table, and every lower role must get 403 with no row written. The table is the source of truth on purpose (a guard reading the role from the code cannot catch the code being weakened); change the code AND the table in the same PR. `checkPermissionLiterals.test.js` and `checkPermission`'s fail-closed branch catch a misspelled role literal.

**Admins and editors must have 2FA; viewers may choose** (#1253). Until an admin or editor enrols, every session-authenticated admin route answers 403 `MFA_SETUP_REQUIRED` except the enrolment set in `functions/utils/mfaPolicy.js`; the check runs on **both** session paths (the middleware and `checkPermission`'s `enforceSession` fallback). `mfa/disable` refuses those roles (`MFA_REQUIRED_FOR_ROLE`).

- **Enrolling revokes every existing session** and issues a fresh one, so a session opened with a phished password before enrolment never gains access.
- **Every factor writer binds to what it read:** enrolment to the secret the code was verified against, backup-code regeneration and the login MFA step to the secret and backup-code list they read. A concurrent setup or reset wins (409 `MFA_SETUP_CHANGED`), and two logins cannot restore each other's spent codes.
- A lost authenticator is recovered by another admin: `POST /api/admin/users/:id/reset-mfa` (clears the factor, sessions, trusted devices and API keys; refuses the caller's own account).
- The user flag is `mfaEnrolmentRequired`, never `mfaRequired` (the login response's pending challenge). `createTestEnv` enrols admin and editor with a real secret; pass `mfaEnrolled: false` to test enrolment or the gate.

**Moving to a new authenticator needs no admin (#1318).** `mfa/setup` while 2FA is on needs a current TOTP code (step claimed) or an unused backup code (spent), else 409 `MFA_CODE_REQUIRED_TO_REENROL`, and stores the new secret in `users.totp_pending_secret`; the old authenticator keeps working. **A pending secret never authenticates anything.** `mfa/enable` refuses it after 15 minutes (400 `MFA_REENROL_EXPIRED`, `users.totp_pending_set_at`), meters guesses through `beginMfaGuess(mfa_reenrol)`, swaps it in with one write bound to both secrets as read, issues new backup codes, and revokes every session, exactly like first enrolment. Disable, `reset-mfa` and first-time setup clear it. **Every enable emails the account owner** (`utils/mfaNotice.js`): queued via `waitUntil` the moment the factor commits, **before any later step can throw**; it never fails or alters the response, logs at `error` when it cannot send, and carries no secret, code or link. Recording the success attempt must never fail a committed enable either.

Full text and reasoning: `docs/field-notes/mfa-and-step-up.md`.

### Step-up re-authentication for identity changes (#1324)

Changing who can sign in, or as what, needs a fresh second factor on top of the session. `POST /api/admin/mfa/step-up` takes `{ code }` (a current TOTP code or an unused backup code, which is spent) and stamps `lucia_sessions.step_up_at` (INTEGER Unix seconds, migration 0070) on **that session only**, valid for `STEP_UP_WINDOW_SECONDS` (300).

- **The route list is `STEP_UP_POLICY` in `functions/api/admin/__tests__/stepUpBoundaries.test.js`.** Each listed handler calls `requireRecentStepUp(context)` (`functions/utils/stepUp.js`) after `checkPermission` and **before its first write, token or email**. A new mutating `onRequest*` under `users`, `invite-codes` or `api-keys` fails the build until it is in the table or in `NOT_STEP_UP` with a reason; an identity route elsewhere needs a human to add it.
- **Conditional:** `PATCH users/:id` needs it for a changed role, a falsy `isActive`, or a truthy `isActive` on an inactive user; `toggle-status` in both directions. A same-state PATCH skips it, so its UPDATE is pinned to the role and `is_active` it read (409 `USER_STATE_CHANGED`).
- **A wrong code is 400 `INVALID_MFA_CODE`, never 401** (step-up, enable, disable, backup-codes): `handleResponse` in `adminApi.js` treats every 401 as "session gone" and signs the user out. The login MFA step is exempt.
- **Guessing is limited per user, no IP in the key:** 10 failures per hour across `mfa_step_up`, `mfa_backup_codes`, `mfa_disable` and `mfa_reenrol` (all but step-up go through `beginMfaGuess` in `functions/utils/mfaGuessGate.js`). The per-user+IP limit (429) still applies. Hitting it **deletes the session** (401 `STEP_UP_LOCKED`), a deliberate sign-out. Each attempt is written as failed **before** verifying and settled after, so parallel guesses count each other and the limits count their own row (`+ 1`).
- **API keys never step up** (`STEP_UP_KEY_FORBIDDEN`); the helper fails closed (403 `STEP_UP_REQUIRED`, 503 on a read error).
- **Stamp and backup-code spend commit in one `DB.batch()`** with the same predicate (409 `MFA_CHANGED`). Recording the success must never fail a step-up that landed.
- **One accepted TOTP code per time step per user (#1333).** `verifyTotpStep()` returns the matched step (the highest on a multi-match, full window walked, no early exit), which must exceed `users.totp_last_step` (`totpStepIsFresh`); it is claimed by a conditional UPDATE, with the caller's factor-binding predicate, **before** the effect. A spent step is 400 `TOTP_CODE_ALREADY_USED` (login keeps 401), counted toward the limits, and never falls through to the backup-code check. Exceptions: enable's lost enrolment UPDATE is 409 `MFA_SETUP_CHANGED`; a step-up whose stamp lost while the step is unspent is a deleted session (401, `session_gone`, not a guess). **A path writing a NEW `totp_secret` without verifying a code sets `totp_last_step = NULL`** (setup, disable, `reset-mfa`); `mfa/enable` instead records the step it just verified against the secret it installs. Re-encrypting the same secret (login, backup-codes) must not reset it. Never use a bare `verifyTotp` in a handler.
- Tests grant a step-up explicitly with `grantStepUp()`; `createTestEnv` never does, or the guard would be vacuous. The client prompts through `registerStepUpPrompter` (`StepUpModal`), retries once, and throws `STEP_UP_CANCELLED` on cancel. The `step-up-*`, `mfa-*` and `rbac-role-check-*` mutation-gate entries pin the above.

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

1. A request is key-authenticated **iff** it has `Authorization: Bearer <v>` and `v` starts with `API_KEY_PREFIX` (import it; never retype `"st_"`). Session ids (`crypto.randomUUID()`) can never start with `st_`.
2. A key plus any session cookie gets 400 `AMBIGUOUS_AUTH`, before either is validated (defence in depth).
3. The key branch returns early and skips CSRF. **Safe because `Authorization` is not ambient**: a browser sends it cross-origin only after a preflight, which `functions/_middleware.js` grants only to allowlisted origins.

`context.data.user.role` is **the key's role**; `context.data.user.userId` is **the creator's**. An endpoint reading `userId` as "the human in this browser" acts on the creator's account (a review found five live). So:

- `KEY_FORBIDDEN_PREFIXES` 403s self-service and human-admin families (`KEY_NOT_PERMITTED`) **before** key verification, at every key role. Entries match whole path segments, carry no trailing slash, and are checked against every normalised spelling of the path (`keyPathForms`, #1327); a path that will not settle is refused. `/api/admin/me` is deliberately not listed. Add a bypass you find to `NON_CANONICAL` in `api-key-auth.test.js`.
- Keys are read-only on `/api/admin/users` and `/api/admin/api-keys`, and barred from `/api/admin/invite-codes`, `/api/admin/maintenance/` and `/api/admin/audit-log` at every role (#1331).
- `apiKeySelfService.test.js` fails on an ungated admin handler not denylisted or in `REVIEWED_UNGATED_ROUTES`, and on a key-reachable route whose source (plus one hop of relative imports) writes a credential table or interpolates a table name. It does **not** see a gated route that merely reads the caller's own data; that still needs a human.
- `revoke-all.js` calls `checkPermission(context, "viewer")` itself, so self-service logout works at every role.

Related: `ALLOW_HEADER_AUTH`'s production guard uses `isDevRequest` in both copies (`_middleware.js`, `auth/logout.js`); `csrf.js`'s `getSessionIdentifier` ignores bearer values starting with `API_KEY_PREFIX`; failure logs record only `bearerValue.slice(0, DISPLAY_PREFIX_LENGTH)`; `parseCookies` (`cookies.js`) trims cookie names and keeps values containing `=`.

The review's findings table, the full scan rules and the reasoning: `docs/field-notes/api-keys.md`.

### Invite codes are stored hashed (#1334)

An invite code is a bearer credential that mints an account, possibly an admin one, so it is handled like an API key: **the plaintext exists only in the creation response and the invite link.** `functions/utils/inviteCodes.js` owns the scheme.

- `invite_codes.code` holds `'sha256:' || hex(SHA-256(plaintext))`; `code_prefix` holds the first 8 plaintext characters for display. The digest is fast and unsalted for the same reason as API keys (122 random bits, looked up by equality).
- **Signup hashes the submitted code** before the SELECT, the `EXISTS` re-check and the claim `UPDATE`, so a submitted `sha256:...` or `retired:<id>` matches nothing. Never bind the raw code.
- Dead rows (used, revoked, expired) were retired by migration 0071 to `code = 'retired:<id>'`; live rows were converted by a one-off script after deploy, because SQLite cannot SHA-256.
- `GET /api/admin/invite-codes` projects explicit columns with no `code`. `POST /api/admin/users` returns an explicit `invite` projection and the URL only when email delivery failed. No audit row or log carries the code.
- **"Unused" is `used_by_user_id IS NULL AND used_at IS NULL`.** `used_by_user_id` is `ON DELETE SET NULL`, so deleting the user alone would reopen the invite and let the same link mint another account; `used_at` survives. Every signup open-check (SELECT, EXISTS, claim) carries both.
- **Revoke is by id**: `DELETE /api/admin/invite-codes/[id]`, because a digest cannot be a URL key. Any new invite writer must call `generateInviteCode()` and return the plaintext once; `invite-codes.test.js` scans both creation routes through GET.

### Password reset tokens are stored hashed (#1354)

The same scheme as invite codes, for the same reason: a reset token sets the account's password, so **the plaintext exists only in the emailed link.** `password_reset_tokens.token` holds `'sha256:' || hex(SHA-256(token))` (`hashResetToken` in `functions/utils/tokens.js`), and both readers, `reset-password-complete.js` and `reset-password/validate.js`, hash what is submitted before the lookup, so the stored value itself is never redeemable. Migration 0074 retired every pre-existing row (`'retired:<id>'`, marked used) instead of converting it: SQLite cannot compute SHA-256, and the tokens live two hours.

The admin issuer (`users/[id]/reset-password.js`) checks `isEmailConfigured` **before any side effect** (#1353): with no way to send the link, it answers 500 having minted nothing and signed nobody out. If the send then fails, it withdraws the token. It does **not** restore the user's sessions: an admin forcing a reset may be answering a compromise, and signing the user out must not depend on the email provider. All five behaviours are in the mutation gate.

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

Mail scanners fetch links with GET, so confirmation and unsubscribe GETs render a no-store, noindex page with a button and write nothing; the POST acts. Those POSTs accept the token from the form or the query string (RFC 8058 one-click). Confirmation URLs are echoed in API responses only for allowed development requests with email unconfigured. Links expire after 7 days; an expired pending request is deleted on re-request and gets a fresh token and consent timestamp.

**The page's `<meta name="referrer" content="same-origin">` is load-bearing.** Under the global `Referrer-Policy: no-referrer` a browser posts the form with `Origin: null`, which the origin allowlist rejects. `curl` and every unit test passed while every Chromium button failed, so verify a change by clicking in a real browser against `wrangler pages dev`. Never allowlist `"null"` (sandboxed iframes send it).

**The double opt-in gate is guarded by `functions/api/admin/bands/__tests__/announce-double-opt-in.test.js`**, which seeds an **unverified** follower and asserts it is never queued or emailed, one case per sender. **A third sender means a third case.** Before it, every fixture seeded `verified = 1`, and deleting the gate left all tests green.

When a performance is announced (`is_announced` 0→1), verified followers are emailed once, tracked per follower in `band_follow_notifications (performance_id, band_follow_id)`; `POST /api/admin/bands/:id/resend-announcement` emails only followers with no live claim (`claimIsLiveSql`), never a delivered row (see "A claim is not a delivery record"). Shared logic: `functions/utils/bandFollowNotify.js`. **Do not reintroduce a fire-once latch without per-follower tracking.**

Follow, subscriber and single-band digest mail carries RFC 8058 one-click unsubscribe headers (`functions/utils/email.js`); multi-band digests deliberately do not, because one click must not silently remove only one of several follows.

Bot protection on follow and subscribe goes through `verifyTurnstile()` (`functions/utils/turnstile.js`), which **fails closed in production**: `TURNSTILE_SECRET_KEY` must be set in the production Pages project.

### Public senders cap emails per recipient (#1337)

Follow, follow-batch, subscribe and resend-activation share ONE allowance per address: 5 emails per 24 h (`functions/utils/recipientEmailCap.js`), whatever IPs the requests come from. A batch is one email. The `rate_limits` key is `email-recipient:` plus a SHA-256 of the trimmed, lowercased address; the raw address is never stored or logged (logs carry 8 hex chars). The cap is checked **before the write** (follow, batch, subscribe) or before the token rotates (resend-activation), so a capped request inserts nothing. A pre-read keeps a no-op request from spending the allowance. Over the cap the response is identical to success. It fails closed, and `allowEmailToRecipient` returns `reason: "capped"` (warn) or `"counter_unavailable"` (error), because a D1 outage must not be logged as abuse protection working.
**A failed provider send drops that request's own pending row** (by its token or batch token), or re-requests no-op for 7 days.
**Retention:** `retention.js` prunes `rate_limits` at 30 min but keeps `email-recipient:` keys 25 h; otherwise the cap resets itself. The prune runs daily, so the published bounds are worst cases: about 25 h for per-IP counters and about 2 days (25 h + one daily interval) for recipient keys. Change the cadence or the window, and update `PrivacyPage.jsx` in the same PR. A new public sender that emails a caller-supplied address must call `allowEmailToRecipient`.
**Exempt, deliberately:** invite signup (`admin/auth/signup.js`) sends an activation email uncapped. It needs a valid single-use invite code, so it is not an open door like the four above.

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

**The E2E admin is enrolled in 2FA (#1253).** Admins and editors without it get `403 MFA_SETUP_REQUIRED` on every admin route, so a password-only test admin exercises nothing. `scripts/e2e-totp.mjs` derives its TOTP secret from `E2E_ADMIN_PASSWORD`: the seeder stores it, and `submitAdminLogin()` in `e2e/utils/session.js` types a fresh code. There is no second secret to provision, and none is committed. Every form login goes through that helper; `scripts/__tests__/seed-e2e-admin.test.js` fails if the seeder and the tests ever derive different secrets.

**Every Playwright process shares one record of spent TOTP steps** (`TOTP_LEDGER` in `e2e/utils/paths.js`, under a lock; #1366). The server accepts a step once and counts a reuse as a failed attempt, so per-process memory let parallel workers and each retry's fresh process lock the admin out (429) for the rest of the run. Form logins are serialised too (a second login voids the first's pending challenge), and `loginAsAdmin` saves the session it creates, so later tests start signed in instead of each spending a code: the CI-mode suite went from 18.3 to 3.4 minutes. A refused code fails at once with the server's message.

### Post-deploy probes are read-only (#1292)

Post-deploy probes check iCal, sitemap, and SSR identity metadata without writing; `/s/` is excluded because share links expire via cron and no fixed slug is safe to probe. They run after **production** deploys only: a `dev` deploy goes to a Pages preview, which binds no D1 (#1295), so they would fail on missing data rather than on a broken release.

### Edge E2E against a preview (#1292)

Node and local `wrangler` do not enforce the Workers runtime's limits (the PBKDF2 incident). `.github/workflows/edge-e2e.yml` runs the login and user-management specs against a real Pages **preview** deployment.

- **Data:** previews bind only the scratch D1 `settimes-e2e-db`. `scripts/reset-e2e-db.mjs` rebuilds it each run from `database/setup-complete.sql` plus `database/seed-test-data.sql`, refuses any other name or id, and drops children before parents (D1 ignores `foreign_keys = OFF`).
- **Plain-text vars live in `wrangler.toml` (`[env.preview.vars]`), never the dashboard**: a deploy replaces dashboard plain-text vars and keeps only secrets.
- Previews set `ENVIRONMENT=preview` (production code paths under `isDevRequest`), use Turnstile's always-pass test keys and no email provider. Tests hit the stable alias `edge-e2e.longweekend-bandcrawl.pages.dev`, which the preview's `CORS_ALLOWED_ORIGINS` names.
- **Production rate limits apply**, so the run is two phases with no retries.
- Emailed tokens are read from D1 (`e2e/utils/d1.js`); remote mode (`E2E_D1_REMOTE=1`) can name only the scratch D1. Every confirmation is clicked in a real browser. **`invite-signup.spec` is the PBKDF2 canary**; its invitee context passes an empty `storageState` explicitly, or it inherits the signed-in admin.
- **Ready means the alias serves THIS RUN'S deployment** (`scripts/wait-for-preview.mjs`, #1340). Only the `edge-e2e-deployment.txt` marker proves it (Vite hashes repeat across runs). A missing chunk is `200 text/html` on Pages, so check content-type.
- Runs queue (`cancel-in-progress: false`); every run deletes its deployment and a failed delete fails the job. Fork and Dependabot PRs get no secrets and are skipped loudly.

Full text: `docs/field-notes/testing-gates.md`.

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

Requires the CodeRabbit CLI (`brew install --cask coderabbit`, then `coderabbit auth login`); both targets fail with a hint if it is missing. **Run it before opening the PR**: the same review runs on the PR, so a post-open finding costs a fix plus a push. `make gate` deliberately excludes it (network, minutes).

- **It is a strict subset of the PR review.** The CLI does not load `.github/instructions/**`; the PR bot does. So a post-open `Minor` citing "coding guidelines" is expected, and an "as per coding guidelines" finding from `make review` is unsubstantiated by construction: grep the instruction files for the cited wording before agreeing (#1048). Passing `-c` was tried and not adopted.
- **Green can mean "did not look"**: CodeRabbit passes a PR whose every file is path-excluded. For a lockfile-only bump read Snyk and Dependabot; `scripts/__tests__/lockfileIntegrity.test.js` guards `resolved` hosts and `integrity` hashes. A lockfile change _not_ produced by npm on your machine deserves a human diff read.
- **Read threads and review bodies**: "Outside diff range" comments and collapsed nitpicks live in the body, which a `reviewThreads` query misses.

Worked examples: `docs/field-notes/coderabbit.md`.

### CodeRabbit has a hard review budget — batch your pushes

**Every push changing a review-eligible file triggers a review.** The allowance is dynamic: read it from a _current_ review footer or `@coderabbitai rate limit`, never from memory. Usage billing is OFF (2026-09-24), so going over means a **rate-limited, unreviewed head commit** while every other check is green, and nothing re-runs it.

- **Before merging any PR, run `make await-review PR=<n>` and merge only on exit 0.** It waits out a cooldown, posts one `@coderabbitai review`, and resets on a new push. Only the `CodeRabbit` status description `Review completed` on the head SHA means a review ran (`scripts/coderabbit-await-review.mjs`); a green check or a review object does not. Slowing down is the intended cost. **Exit 5 means reviewed but not clean** (#1365): the head's review body carries findings that never appear as threads (#1362 merged with three): outside-diff, nitpick, duplicate, or a section the script does not recognise. They block the command until addressed, or declined and re-run with `ARGS=--allow-findings`. A head with no review object counts as clean only when CodeRabbit's summary comment confirms it for that SHA.
- **Concentration is the failure, not volume.** Read your diff and run the suite locally, then push once. Iterate as a **draft** (`auto_review.drafts: false`) and `gh pr ready` at the final state.
- `make hooks` installs `.githooks/pre-push`, which warns at the first review in the window and blocks at `LIMIT`. Its counter is per developer (`~/.cache/coderabbit/push-log`, shared with `wrhn-mcp`'s hook), and any failure to ask `gh` about drafts counts the push (`scripts/__tests__/prePushDraftLookup.test.js`).
- **Override only for urgency** (show day, an incident, someone blocked): `CODERABBIT_OVERAGE=1 git push`, then `make await-review`.

History: `docs/field-notes/coderabbit.md`.

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

- **If the repo goes private again**, CodeQL, gitleaks and dependency-review cannot run on the Free plan. Remove "Detect Secrets (gitleaks)" from the `protect-main` ruleset in the same change that deletes its workflow: a permanently red check is worse than none.
- **gitleaks scans every commit in a PR's range**, so a later commit cannot clear a fixture: rewrite the commit, or add its fingerprint to `.gitleaksignore` with a reason. Name test credentials so `generic-api-key` does not match.
- **Semgrep's gate is the `Semgrep / Scan` job**; the App's `semgrep-cloud-platform/scan` check passes regardless. Findings come from the JSON, never the exit code, so never remove the `test -s semgrep.json` guard; exit >1 fails the job. Diff-aware on PRs, report-only on push and weekly (SARIF category `semgrep`). It runs under `env -u GITHUB_ACTIONS` with `fetch-depth: 0` on the PR head, diffing against `SEMGREP_BASELINE_REF`. Any non-Dependabot, non-fork run without `SEMGREP_APP_TOKEN` fails. Keep the gate in the workflow, not the Rule Board.
- **The weekly security digest** (`security-digest.yml`, `scripts/security-digest.mjs`, #1247) keeps one `security-digest` issue: alerts older than 7 days, a `REQUIRED_SCANNERS` tool silent for 14 days, or an `npm audit` advisory not in `ACCEPTED_NPM_AUDIT` (keyed `lockfile|package|advisory`). A failed read fails the job; only a per-tool `404 "no analysis found"` means none.
- **Snyk Code is deliberately not enabled** (2026-09-22): Semgrep's gate lives in git.

Plan-tier history, job logs and the Semgrep investigation: `docs/field-notes/security-tooling.md`.

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

- **Preview deployments bind only the scratch D1** via `[env.preview]` in `wrangler.toml`; without it previews inherit production D1 and R2. Never bind a production resource there (`scripts/__tests__/previewBindings.test.js`).
- **Rocket Loader stays disabled**; strict CSP blocks the scripts it rewrites.
- **`www` → apex is a zone _dynamic_ 301** preserving path and query (#984); a static redirect would send every deep path to `/`. Keep `www` as a Pages custom domain, or old links become TLS errors. `/` emits no raw-HTML canonical, so if `www` stops redirecting the duplicate-host problem returns.
- **SSL/TLS is Full (strict), minimum TLS 1.2.**
- **HSTS is served from `frontend/public/_headers`**; do not also enable the zone toggle.
- **DMARC** is `p=quarantine` with relaxed alignment, because iCloud (human mail) and Resend via SES (application mail) are both legitimate senders; strict alignment would quarantine confirmations silently. `p=reject` waits until reports show both paths pass.
- Removed 2026-08-29; do not recreate: `dev.settimes.ca`, the `ADMIN_PASSWORD`/`MASTER_PASSWORD` Pages vars, and the empty `bandcrawl-db` D1. To check whether a D1 is empty, query `sqlite_master`; the API's `num_tables` is wrong.

Full record, redirect rule and DMARC reasoning: `docs/field-notes/cloudflare-settings.md`.
