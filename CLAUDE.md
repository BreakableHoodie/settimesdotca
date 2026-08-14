# CLAUDE.md — settimesdotca

AI assistant context for this codebase. Captures non-obvious invariants, known gotchas, and conventions that aren't derivable from reading the code.

---

## Proactive Quality Gates

Invoke these without being asked — don't wait for the user to request them:

| Trigger | Action |
|---------|--------|
| **Before opening any PR** | `make review` (CodeRabbit) — the standing review gate |
| Multi-file feature touching a documented invariant, a migration, or an architectural decision | Invoke `pr-review-toolkit:code-reviewer` agent **in addition** to CodeRabbit |
| **Any bug you diagnose** | Sweep for other instances of the same class before calling it fixed — see "Sweep for siblings" below |
| After editing `functions/utils/auth.js`, session endpoints (`sessions/`), or follow/unfollow/confirm-follow flows | Invoke `cloudflare-security-reviewer` agent |
| After writing or modifying error handling (`catch` blocks, `.catch()`, `try/finally`) in `functions/` | Invoke `pr-review-toolkit:silent-failure-hunter` agent |
| After editing `frontend/src/` public pages (outside `admin/`) | Scan for `text-white`/`bg-white` theme violations before finishing |
| After adding/editing anything in `migrations/` | Run `node scripts/regenerate-setup-complete.mjs` then `node scripts/check-schema-drift.mjs` — `setup-complete.sql`'s schema section is generated, never hand-edit it (CI enforces via quality.yml) |
| When SEO-relevant pages change (band pages, event pages, venue pages) | Check structured data and `document.title` assignments |

The `hooks` in `.claude/settings.local.json` automate the mechanical parts (prettier, ESLint, pre-PR gate). The triggers above require judgment — apply them proactively.

**CodeRabbit is the standing gate; the code-reviewer agent is trigger-only.** CodeRabbit is diff-scoped and reliably catches convention breaks, unscoped test selectors, dead code, and latent time-bombs — and it runs on the PR regardless, so `make review` beforehand only saves a force-push cycle. The code-reviewer agent reads across files and earns its cost when the question is "does this violate an invariant or drift from the architecture." Don't block on Copilot; in practice it duplicates CodeRabbit.

### Sweep for siblings

**When you diagnose a bug, find every other instance of that class before declaring it fixed** — and report the sweep, whether or not it found anything. No line-level reviewer does this; it sees only the diff in front of it.

The worked example is `performance_date` (#739 → #741 → #743). One endpoint dropped the field from its projection, so a multi-day event's sets all rendered with the event's start date. Fixing that one endpoint felt complete. It wasn't: the same defect was live on the venue page, on GenreDiscovery, and in the event recap's sort. Three more surfaces, found only because the class was swept afterwards — and one of them had already been stumbled on by hand.

The mechanical form is usually one grep. "Which files select `p.start_time` but never mention `performance_date`?" turns a vague worry into a table.

Prefer a durable guard over a repeat audit: a source-scanning test (as `bandFields.test.js` does for Tailwind class literals) collapses a whole bug class into one failing test.

### The efficiency ladder — before you write

Adapted from the [ponytail](https://github.com/DietrichGebert/ponytail) ruleset. Before writing code, stop at the first rung that applies:

1. **YAGNI** — does this need to exist at all?
2. **Reuse** — does it already exist here? (`functions/utils/`, `frontend/src/utils/`, the `bandFields.js` registry, `prepareBands`)
3. **Standard library / platform** — does JS, Web Crypto, or D1 already do it? (see the PBKDF2 and TOTP invariants — this repo has repeatedly chosen the platform primitive over a dependency)
4. **Existing dependency** — does something already in `package.json` solve it?
5. **One line** — can it be one line?
6. **Minimum working code** — only then.

Deletion over addition. Boring over clever. Fewest files that work.

**The ladder runs after you understand the problem, not instead of it.** Trace the real flow end-to-end first. A short diff that patches a symptom is worse than a longer one that fixes the cause — the ladder ranks *solutions to the actual problem*; it does not rank problems by how cheap they are to make disappear. It defers to the debugging discipline, always.

**The ladder governs the fix. It does not govern the sweep.** The sibling sweep and its durable guard test are *requested work* — part of the definition of done for any bug fix — never speculative additions for rung 1 to eliminate. And on the merits: one source-scanning test that retires a bug class permanently is less total work than re-running that sweep by hand on every future PR. **The guard is the lazy option**, not the expensive one.

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

Exit codes: `0` succeeded *and* changed files · `1` the command failed · `2` **reported success but changed nothing** · `3` the delegate committed on a protected branch · `4` usage.

Code `2` is the one that pays for the script. Measured 2026-08-13: an agy delegation returned exit `0` and `AGY_USAGE {"status":"SUCCESS"}` having touched **zero files** — headless agy had no `write_file` grant, so it described the work instead of doing it and still "succeeded". 96,825 tokens, nothing on disk, and nothing in its own output said so. The tool behaved exactly as its README documents ("ungranted writes leave the workspace untouched but report success"); the mistake was trusting the status field.

Code `3` enforces the other half of the contract below: **a delegate never moves `main`.** It may branch, commit and open a PR — that is the normal workflow now, and it routes the change through the ruleset (protected main, strict checks, threads resolved) rather than through someone remembering to look. What it must never do is commit on the default branch, which bypasses review entirely. A commit on a feature branch is reported, not failed.

The check is deliberately tool-agnostic — it wraps agy, OpenCode's relay, or anything else, because the failure is about *permissions and silent refusals*, not about any one vendor. It uses `git status --porcelain`, so a brand-new untracked file counts as real work (a `git diff`-only check would call that a no-op).

**Before the first real delegation on a new machine or after a tool upgrade, prove the write grant with a throwaway task** rather than discovering it on a task you cared about. One canary costs seconds; the failure above cost 96k tokens.

### Delegating to OpenCode

A third implementer, on a separate subscription: the `opencode-delegate` skill.

**It is not in this repo and a fresh clone will not have it.** It is an external prerequisite, installed per-machine into the gitignored `.agents/skills/` (see `.gitignore`), which is why `relay.mjs` will not appear in `git ls-files`:

```bash
npx skills add amElnagdy/delegate-skills --skill opencode-delegate
# lands in .agents/skills/opencode-delegate/, symlinked to .claude/skills/
```

It also needs the `opencode` CLI on PATH and an authenticated provider (`opencode auth list`).

Use it for well-specified work that would otherwise consume this session's context. **OpenCode works issues end to end: it branches, commits, and opens a PR.** The orchestrator reviews that PR, re-runs `make gate`, and merges. Review moved from "read the diff before committing" to "read the PR before merging" — a stronger gate, because the ruleset enforces it rather than habit. The invariant that survived unchanged: **nothing lands on `main` unreviewed.**

Four rules, each learned by something breaking:

1. **Always go through `relay.mjs`; never a raw `opencode run`.** Not for permissions — `opencode run` auto-approves by default, and a raw run *did* edit files headlessly in testing, so `--auto` is belt-and-braces rather than load-bearing. The relay earns its place for three other reasons: it feeds the brief over **stdin** (rule 3), it writes a structured `result.json` carrying `cost`, `touchedFiles` and the session id, and it never commits. A raw run gives up all three.
2. **Always pass `--model` explicitly, and pick from the flat-rate provider.** Not because a bare run fails — with a valid `model` in `opencode.json` it resolves and runs fine. Pass it for **reproducibility**: the config default can change under you, and a delegation you cannot attribute to a model is a cost figure you cannot learn from. **Which prefix is flat-rate vs metered is a lookup, not a memory** (see the staleness note below); routing paid work through a metered gateway by assumption is the mistake this rule prevents. A `claude-*` entry from any provider is redundant with the orchestrator regardless.
3. **The brief goes in a file (`--brief`), never on the command line.** Large content in argv hangs the CLI; the relay feeds it via stdin for exactly this reason.
4. **`opencode.json` is the tooling surface** — its `instructions` array feeds OpenCode this `CLAUDE.md` and the repo's instruction files, and it also declares the MCP servers, agents and commands a delegated run can reach. That is why a delegated diff can respect invariants nobody restated in the brief. **Read the file for the current inventory rather than trusting a count written here**, and keep `model`/`small_model` pointing at *authenticated* providers — a stale entry there fails every run that relies on the config default (see the dated anecdotes for the instance of this that actually happened).

   **The `instructions` array is a floor on every run's cost — keep it to invariants, not reference docs.** Every listed file is loaded before the brief is even read, on *every* delegation. It once held 18 entries totalling ~310 KB (~77k tokens), which is why a trivial one-file read still cost $0.246 (measured 2026-08-13). It is now five entries (~18k tokens), a ~77% cut.

   **Every path in the array must be tracked in git** (`functions/__tests__/opencodeInstructions.test.js` enforces it). Until #818 the array pointed at `instructions/`, which `.gitignore` excludes — so the committed config named three files that existed on one machine and nowhere else. A fresh clone, CI, or a clean Otto checkout resolved none of them, and **OpenCode says nothing when an instruction file is missing**; the run just proceeds with less context than the brief assumed. The tracked tree is `.github/instructions/`.

   The rule that decides membership: **OpenCode can already read any file in the repo on demand.** So the array is for things a delegated run must not violate *but would never know to look up* — `CLAUDE.md`'s invariants, the security defaults, and the conventions that shape *every* diff regardless of what the task touches. That last category is why `.github/instructions/nodejs-javascript-vitest.instructions.md` and `…/self-explanatory-code-commenting.instructions.md` are in the array: this repo is JavaScript and Vitest end to end, so those govern every delegation rather than a subset of them.

   Everything else stays out, including the rest of `.github/instructions/`. Reference material (`docs/DATABASE.md`, `docs/API_DOCUMENTATION.md`, `docs/BACKEND_FRAMEWORK.md`) and the per-domain instruction files (`a11y`, `playwright-typescript`, `tailwind-v4-vite`, `shell`, …) are **not** loaded, because a run that needs the schema can open the schema.

   The tradeoff is real and is handled in the brief: **a task that needs a domain instruction file must name it.** An a11y fix says, "read `.github/instructions/a11y.instructions.md` first"; a Playwright change names the Playwright one. That is one line in a brief, paid only by the runs that need it, instead of ~5.7k tokens charged to every backend fix that does not. Before adding an entry back, ask whether *every* delegation needs it — if not, name it in the brief instead.

**Cost is the throughput constraint, not the bill.** The subscription is flat-rate but capped in usage-dollar terms, so an expensive model buys fewer delegations per window rather than a larger invoice. Read `result.json`'s `cost` after **every delegated run** — a raw `opencode run` writes no `result.json`, so it gives you no figure to track at all.

**Model names, prices and caps go stale — look them up rather than trusting this file.** Providers rename, deprecate and reprice constantly; a doctrine that caches those values becomes confidently wrong, which is the failure mode the guards in this file exist to prevent elsewhere. Re-derive:

```bash
opencode auth list    # which providers are actually authenticated here
opencode models       # the live catalog, grouped by provider prefix
```

Then confirm from the vendor's current docs which prefix is the flat-rate subscription and which is metered. **Never infer it from the model name**, and ask rather than guess.

The durable part is the method:

- Cost is **tokens consumed × current price**. Tier labels predict neither: a "pro"/"max" model can consume fewer tokens by exploring less, and prices change independently of names. So never rank by tier label alone — and never ignore a price change either. Compare **token usage and reported cost together**.
- The only trustworthy comparison is **the same brief, on the same repository state, run per model**. Different tasks produce different exploration, so their costs are not comparable at all.
- Treat any model you have not run that way as unmeasured, and say so rather than implying a ranking.

> **Dated anecdotes — 2026-08-12** (OpenCode CLI 1.18.16, `opencode-delegate` 0.4.2, this repo). Three delegations, each a *different* task: a 2-file task on `deepseek-v4-pro` reported $0.125; a 3-file task on `glm-5.2` reported $0.65; a 10-file task on `glm-5.2` reported $2.14.
>
> **These do not compare the models.** Different briefs, different repository states, no token counts captured — the numbers reflect task size at least as much as model choice. They are recorded only as order-of-magnitude evidence that delegation cost varies enough to matter, and as a reminder that a "pro" tier is not automatically the expensive one. A real comparison needs the same brief run per model; none has been done.
>
> Also environment-specific and dated to this same day, both measured on **raw `opencode run`**, not through the relay: a ~1.5 KB brief passed in argv hung past 180s, while the identical text attached with `opencode run -f <file>` returned in 11s; and `opencode.json` named `anthropic/*` models while only OpenCode's own providers were authenticated, so every run falling back to the config default failed (rule 4).
>
> Note the flags belong to different tools and are not interchangeable: `-f` is a raw `opencode run` flag, whereas the relay takes `--brief <file>` and feeds it over **stdin**. So the 11s figure shows that *getting the brief out of argv* fixes the hang — it is not a measurement of the relay's own path, which was never argv-based. Rule 3 holds either way; only the mechanism differs. Re-verify rather than assume.

---

## Mission & Scope

settimes.ca is the multi-venue/multi-artist event platform for **Waterloo Region** (Kitchener-Waterloo, ON). The next edition is **Long Weekend Band Crawl Vol. 18** on **October 11, 2026** (event 37, `lwbc18`, single-day).

- **Focus:** Waterloo Region. This governs **product language** — marketing copy, meta descriptions, SEO targeting, "where this is for" statements. It is not a censor on fact: the platform has hosted an event outside the region (Buddies Fest 2, Tillsonburg) and those records stay accurate wherever they appear. The specific drift this rule exists to prevent is describing the site as serving Ottawa, which it does not.
- **Brand:** settimes.ca — no rebranding
- **Target event:** Vol. 18, October 11, 2026
- **Both fan-facing and admin tooling are equal priority**
- **SEO is a priority** (band pages, event pages, local discovery, structured data)
- **Colour themes:** 4 user-selectable (dark + light presets) via Tailwind v4 CSS custom properties + `data-theme` on `<html>`, persisted in localStorage
- **Single photo per band** — extends existing `photo_url` / R2 upload flow; no video embeds

**Shipped editions** (both `status = 'archived'`): Vol. 17 (event 21, 2026-08-02, 22 bands across 6 King St N venues — Blue Room, Princess Cafe, Prohibition Warehouse, Revive Karaoke, Room 47, Roost) and Buddies Fest 2 (event 36, 2026-08-07→09, Tillsonburg — the first multi-day production event). Their lineups and venue rosters are live data now, not spec; read them from D1 rather than from this file.

**Between seasons is a supported state, not a bug.** With Vol. 17 and BF2 archived and Vol. 18 still a draft, every "upcoming" surface is legitimately empty — `/api/events/public` (which defaults to `upcoming=true`) and the iCal feed both correctly return zero, while `/api/stats/public` and the sitemap stay fully populated from the archived editions. `EventTimeline` has a dedicated between-seasons empty state and auto-expands Past for exactly this window. Before treating such a zero as a bug, check whether any event is actually `published`.

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
- **CI/CD**: GitHub Actions (12 workflows), CodeQL, Dependabot

---

## Critical Invariants

### After-midnight band sorting — recurring bug class

Bands starting before 6 AM are "after-midnight" sets that belong to the *previous evening*. They must be offset by +1 day so they sort after the evening lineup, not at the top of the schedule.

- Threshold: `AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`. There are **two** canonical homes, one per side of the build boundary — Pages Functions cannot import from `frontend/`, so a single definition is impossible:
  - **Frontend:** `frontend/src/utils/festivalDays.js` (#550). `frontend/src/utils/bandUtils.js` and `frontend/src/admin/utils/timeUtils.js` (`AFTER_MIDNIGHT_THRESHOLD_MINUTES = AFTER_MIDNIGHT_THRESHOLD_HOUR * 60`) both import it rather than re-encoding `6`.
  - **Server:** `functions/utils/eventDay.js`, which also exports `eventLocalFestivalToday()` — the festival-day equivalent of `eventLocalToday()`, stepping back one calendar day when the Toronto-local hour is below the threshold. Use it for any "which festival day is it?" question server-side; a plain calendar-day comparison flips at midnight while the festival day is still running (bug class fixed in #751). `eventDay.js` also exports `AFTER_MIDNIGHT_THRESHOLD_TIME` (`"06:00"`, zero-padded), **derived** from the hour rather than typed as a second literal — it exists because `functions/api/events/timeline.js` needs the `HH:MM` string shape for a lexicographic comparison against `performances.start_time`, while `eventLocalFestivalToday()` needs the numeric hour for arithmetic.
- **Two homes, not more.** `functions/api/events/timeline.js` and `functions/event/[slug].js` both used to re-encode the threshold privately (as `"06:00"` and `6` respectively) instead of importing it (#746, fixed) — both now import from `eventDay.js`. A source-scanning guard (`functions/utils/__tests__/afterMidnightThreshold.test.js`) enforces this **within `functions/` only**: no file there outside `eventDay.js` (and outside `__tests__/**`) may declare the threshold from a literal, and no bare `"06:00"` may appear there outside a comment. The frontend side is deliberately out of its scope — `festivalDays.js` is that side's canonical home and correctly declares `6` itself. **The numeric half is name-based and not airtight:** it matches declarations whose identifier contains `AFTER_MIDNIGHT`, so `const MIDNIGHT_HOUR = 6` would slip past. Widening it to every literal `6` in `functions/` would be pure noise, so the name is the only tractable signal for that shape — the `"06:00"` half is name-independent and has no such gap. Treat the guard as a backstop against the copy-paste that actually happened, not proof no third copy can exist. Do not add a third private copy; import from the appropriate canonical home.
- Logic: `prepareBands()` adds `MS_PER_DAY` to `startMs`/`endMs` for times below this threshold
- **Never remove or lower this threshold.** Any sort, filter, or conflict-detection that touches performance times must apply the same offset or delegate to `prepareBands`.

### Public event visibility is `status`, never `is_published` (#800) — history, guards still live

`events.is_published INTEGER` was deprecated by migration 0005 and, for years, never dropped (0036 even added a fresh index on it). Until #799, **`functions/api/admin/events/[id]/archive.js` wrote `status = 'archived', is_published = 0`** — archiving unpublished under the old column. On 2026-08-10 archiving the last un-archived event dropped 13 public read paths to zero rows simultaneously and took the public site dark.

**The column itself is gone as of migration 0059** (#799 part 2) — dropped from production, from `database/setup-complete.sql`, and from every test schema, along with its two indexes (`idx_events_published`, `idx_events_published_date`; replaced by `idx_events_status_date` on `(status, date)`, since every public query that used to filter+order on the old pair now does the same on `status`). This section stays in CLAUDE.md as **history, not a live warning**: the two source-scanning guards described below remain in the test suite even though there is no column left to accidentally read, because the postmortem they encode — one dead column silently zeroing 13 public read paths at the same instant — is worth more than the guards cost to keep. A future PR that reintroduces `is_published` (a copy-pasted old query, a reverted migration without reverted callers) fails CI on these guards instead of shipping.

`functions/utils/eventVisibility.js` is the single canonical home, mirroring `eventDay.js`'s role for the after-midnight threshold:

- `publicEventStatusSql(alias?)` → `status IN ('published','archived')`. The default for browse/history surfaces — **archived means concluded, not hidden.**
- `archivedEventStatusSql(alias?)` → recap-only surfaces.
- `publishedEventStatusSql(alias?)` → the narrower gate, for where serving a concluded event is *wrong* rather than merely unusual. Live case: `/api/schedule?event=current`, whose `-6 hours` buffer means an event archived on its own final day still passes the date filter.

**Bucket membership is a lifecycle question before a date question.** `/api/events/timeline` splits: `now`/`upcoming` = published-only; `past` = `archived OR (published AND concluded by date)`. Both halves are load-bearing — narrowing the live buckets without `archived OR` in past makes an archived event with a live or future date match no bucket and vanish entirely.

**Two** source-scanning guards enforce this, and they catch different things:

1. **No `is_published` read or write anywhere**, outside `__tests__/**` (the guard tests necessarily name the retired column) and `functions/utils/eventVisibility.js` (its own header narrates this incident by name) — scanned on both sides of the build boundary (`functions/utils/__tests__/eventVisibility.test.js`, `frontend/src/__tests__/isPublishedGuard.test.js`). The `functions/api/admin/**`, `frontend/src/admin/**` and `utils/adminApi.js` exemptions were **removed** by #799 part 1; the `functions/api/test-utils.js` exemption (the shared test schema, kept only while it mirrored production's still-live column) came out with #799 part 2 once migration 0059 dropped the column from the test schema too. Nothing in `functions/` may name it any more, outside those two allowlisted paths.
2. **No non-admin file queries `events` without importing the shared visibility helper.** The scan matches the helper *names* (`…EventStatusSql`, `concludedEventSql`), not SQL semantics — so an inline `status = 'published'` written by hand does **not** satisfy it, deliberately: the point is one canonical home, not merely "some gate exists". The first guard only catches the *old column*; this one catches a route with no gate at all. That gap was real: `functions/s/[slug].js` (the OG card crawlers fetch for a shared schedule link) joined `events` ungated while both siblings for the same slug gated correctly, so an event unpublished *after* a link was shared still produced a crawler-facing card naming it. Exempt by design, named in the guard: `api/metrics.js` (write-path existence check, projects only `id`) and `utils/timeConflicts.js` (admin-only, must see drafts).

Guard 2 is a file-level scan: it catches "never imported the helper" (the class that has occurred), not "imported it and missed one query". Don't mistake it for proof of the latter.

**Archiving is one-way, and every route that can write `status` enforces it — there are exactly four.** There is no unarchive endpoint. `POST .../publish`, the PUT publish-toggle, `POST .../archive` and `PATCH` all reject a status change on an archived event, and **each of those four `UPDATE`s carries `AND status IN ('draft','published')`** so a concurrent archive committing between the read and the write cannot be overwritten. A no-match returns 409, never a silent resurrection — and the null check is mandatory, not defensive: all four dereference `result` immediately, so the predicate without it converts a lost race into a 500.

Two traps, both of which bit during #803's review:

- **The four sites do not look alike.** Three are dedicated status endpoints with literal SQL; the fourth is PATCH's *dynamic* `UPDATE events SET ${updates.join(", ")}`, which writes status only when the body carries it. Grepping for the literal `SET status` finds three of four. Grep `UPDATE events` instead — `edit.js`, `posters.js`, `reveal-mode.js` and `users/[id].js` also match but provably never write `status`.
- **PATCH's predicate must stay conditional.** Editing an archived event's description, poster or venue info is legitimate and deliberately still allowed; only a *status* change is one-way. Applying the predicate unconditionally would silently break archived-event editing.

**Only one of those four routes checks the lineup, and that asymmetry is deliberate.** `POST .../publish` rejects publishing an event with zero performances (`400`, `code: "EMPTY_LINEUP"`) — but the rejection is *overridable* with an explicit `allowEmptyLineup: true`, because "Lineup TBA" is a supported published state (announcing before booking completes, e.g. for SEO runway). PATCH and the PUT toggle carry **no** lineup check at all, and both now say so in a comment. Do not "fix" that by tightening them: it would make them stricter than the guarded route and block the very workflow the override exists to allow.

The gap this leaves is a *UX* one, and #821 closed it on the **client**, not the API: `EventFormModal` strips `status` from the PATCH payload for a draft → published transition and calls `POST .../publish` instead, so the confirmation appears whichever control the admin used. The shared confirm lives in `frontend/src/admin/utils/publishWithLineupConfirm.js` and is used by both that form and the Events-list toggle — previously the toggle asked and the form did not. Two traps: only the *transition* is rerouted (re-saving an already-published event still PATCHes `status`, a no-op write that must stay allowed), and the empty-lineup rejection is detected by its `code`, never by matching `err.message`.

**Creating an event as `published` is refused outright** (`400`, `code: "CREATE_AS_PUBLISHED"`, #804) — a row is born with zero performances, so create-as-published is *always* a silent empty-lineup publish. `draft` and `archived` stay allowed on create; archived is historical back-fill (`HistoricalImportModal`) and carries no lineup requirement. Note the create path is an `INSERT`, so it does **not** appear in the `UPDATE events` grep above — that grep finds four writers, but there are five.

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

Password hashing uses PBKDF2-SHA256 via the Web Crypto API (`functions/utils/crypto.js`). Current format is `pbkdf2$iterations$salt$hash` and is self-describing — `verifyPassword` reads the iteration count from the string itself, so hashes created before the default was bumped from 100,000 to 600,000 (`DEFAULT_ITERATIONS`) still verify unchanged. A second, older `salt:hash` format (no `pbkdf2$` prefix, predating the versioned format entirely) carries no iteration count at all; it's verified against the hardcoded `LEGACY_ITERATIONS` (100,000) fallback instead.

bcrypt requires a native binary (`better-sqlite3` style) that cannot run on Cloudflare Workers. Do not introduce bcrypt anywhere in `functions/`.

MFA TOTP follows the same rule: `functions/utils/totp.js` computes HMAC-SHA1 directly via `crypto.subtle` (hand-rolled RFC 4226/6238, pinned by the RFC 6238 Appendix B test vectors). Do **not** reintroduce `otplib` or any pure-JS crypto (`@noble`) for MFA — keep the security primitive on the platform's native Web Crypto.

### D1 transactions: no BEGIN/COMMIT, but `DB.batch()` is atomic

The Cloudflare Workers D1 binding does not support explicit `BEGIN`/`COMMIT` transaction syntax. However, `env.DB.batch([stmt1, stmt2, ...])` executes all statements atomically — if any fails, all are rolled back. Prefer `DB.batch()` for multi-statement mutations.

For mutations that cannot be expressed as a single batch (e.g., the event-duplication pattern in `functions/api/admin/events/[id].js`), use compensating deletes: if step N fails, manually undo steps 1…N-1.

The bulk band import (`functions/api/admin/bands/import.js`) follows this pattern and is **all-or-nothing**: it validates every row first (an invalid row aborts the whole import with per-row errors, writing nothing), then find-or-creates profiles and inserts performances, rolling back everything it created if any write fails. A lineup is never left half-imported.

`functions/api/admin/bands/bulk.js` is the larger sibling (599 lines vs. `import.js`'s 174): it handles bulk `DELETE`/`POST`/`PATCH` across bands, following the same `DB.batch()`/compensating-delete discipline.

### PRAGMA `foreign_keys = ON` is enforced in production

`functions/_middleware.js` runs `PRAGMA foreign_keys = ON` before the request handler fires for every **mutating** request. Read-only methods (`GET`/`HEAD`) skip it — read-only by HTTP semantics, and skipping saves a D1 round-trip on hot read paths. **That is a statement about intent, not a guarantee:** since #705 exactly one GET writes an FK-bearing row — `api/schedule/share/[slug].js` inserts into `share_link_views`. Its FK is therefore *unenforced* on that path, so it does not rely on one: the insert is `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM share_links WHERE slug = ?)` inside the same `DB.batch()`, re-checking the parent atomically rather than trusting the SELECT earlier in the request. An orphan there would be unreclaimable — the expiry cron finds ledger rows by joining to slugs that still exist, so it could never see one. Any future FK-writing GET must carry its own guard the same way; do not assume the pragma protects it. The guard is a strict read-only allowlist, so any other method (including unknown ones) still gets FK enforcement; never widen it to skip writes. Unit test helpers (`functions/api/test-utils.js`) set the PRAGMA unconditionally via `better-sqlite3`, so FK constraints are always active under test.

When recreating a table in a migration (SQLite has no ALTER COLUMN), surround the table-recreation block with `PRAGMA foreign_keys = OFF` / `PRAGMA foreign_keys = ON` as migration 0032 does — D1 will reject the DROP otherwise.

### Artist link presence: `bandFields.js` is the single source of truth (#712)

`frontend/src/admin/utils/bandFields.js` defines every filterable artist field — the eight link fields (`LINK_FIELDS`, in Links-column render order) and the profile fields (`PROFILE_FIELDS`) — pairing each with its label, icon, Tailwind colours, and **its own URL-safety resolver**.

**A link is "present" only if it resolves to a real href** — `resolveHref(value) !== '#'` — never `value !== ''`. `safeSocialProfileHref` rejects any handle containing whitespace or a colon (the necessary condition for `javascript:`, `data:`, and every other scheme), so a value can be non-empty in D1 and still render nothing. Anything asking "does this artist have Instagram?" must go through `hasField()` / `hasAnyLink()` / `countLinks()` — never inspect `social_links` directly.

Both the Links column (`admin/components/SocialLinksIcons.jsx`) and the gap filter (`admin/components/DataGapFilter.jsx` + `RosterTab`) map over this one registry. **Do not reintroduce a second list of link fields.** The bug class it prevents: a filter reporting that an artist "has Instagram" while the row shows nothing, so they get skipped in exactly the data-entry pass meant to catch them. Adding a ninth platform is one registry entry that updates the column and the filter together.

`formatOrigin()` lives here too, shared by the Origin column, the origin sort, the search predicate, and the origin gap check.

**Tailwind colours in the registry must stay complete literal strings** (e.g. `'hover:text-pink-400 focus-visible:outline-pink-400'`). Tailwind v4 scans source *text* for whole class names and never evaluates template expressions, so `` `hover:text-${colour}` `` generates no CSS and silently drops every hover and focus style. A runtime assertion cannot catch this — the guard in `bandFields.test.js` is a `readFileSync` scan of the source.

### `ALLOW_ADMIN_SIGNUP` is test-only

This env var bypasses the invite-code requirement for signup. It must never be set in production. It appears only in test helpers and E2E seed scripts.

---

## React 19 Known Issues

### `react-helmet-async` `<Helmet>` does not reliably set `document.title` in React 19

Use `document.title = pageTitle` directly in a `useEffect` within the page component. Do NOT remove the direct assignment in favour of `<Helmet>` until react-helmet-async ships a React 19 compatible release.

Example: `frontend/src/pages/EventRecapPage.jsx` — uses both `<Helmet>` (for other meta) and `document.title = ...` for the title.

`BandProfilePage.jsx` was this example until #797 removed its `<meta name="keywords">` — the tag was its `<Helmet>`'s only child, so the wrapper and the `react-helmet-async` import went with it. That page now assigns `document.title` directly and declares no Helmet at all, which is why it no longer illustrates the pairing.

### SSR owns identity meta and JSON-LD where it emits either; the client `<Helmet>` owns only what SSR does not emit — never canonical/`og:*`/`twitter:*`/description, and never JSON-LD on a route whose SSR handler already emits it

`<Helmet>` only manages tags it created itself, marked internally with `data-rh`. Neither `index.html`'s baked-in defaults nor a Pages Function's server-injected `<meta>`/`<link>` carry that marker, so Helmet can't tell it already owns the slot — it **appends** a second copy on mount instead of replacing the first. `/artists` first showed this as `index.html`'s homepage `og:url="https://settimes.ca/"` sitting ahead of the page's own client-declared canonical: Google reads `og:url` as a canonicalization hint, prefers the first tag, and overrode our canonical — surfacing in Search Console as **"Duplicate, Google chose different canonical than user."**

The fix has two parts:

1. **`serveWithInjectedMeta()`** (`functions/utils/ssrMeta.js`) strips `index.html`'s baked-in defaults via `DEFAULT_META_RE` *before* injecting page-specific tags, so a crawler that never executes JS sees exactly one of each. **Every `og:*`/`twitter:*`/`description` property `index.html` declares must be listed in `DEFAULT_META_RE`** — the moment a Pages Function starts emitting a property `index.html` already has (`og:site_name` was the case that caught this, #784), an unstripped default turns into a second, live copy instead of a silent gap.
2. **The client `<Helmet>` on every SSR-injected route must not declare `canonical`, `og:*`, `twitter:*`, or `description`** — SSR is the single owner of identity meta, full stop, not merely "must agree with the client." `<Helmet>` may still set `<title>` (backed by the direct `document.title = ...` assignment above — same React 19 unreliability). **The same rule applies to JSON-LD on any route whose SSR handler passes a `jsonLd` block** — `/band/*` and `/venue/*` duplicated their `MusicGroup`/`MusicVenue` schema client-side the same way until #790; the client copy is deleted, not merely trimmed, once SSR emits an equivalent (`functions/band/[id].js`'s JSON-LD `description` was truncated to the 200-char SERP length shared with `<meta name="description">` — fixed to a separate, untruncated value before the client copy was removed, since 44 of 62 artist bios in production exceed 200 chars). A route whose SSR handler passes no `jsonLd` (the `STATIC_PAGES` registry pages, the recap page) keeps its JSON-LD, if any, client-owned.

   **The rule is "SSR owns what SSR emits," not "the client may only own `<title>`."** A tag no SSR handler emits stays client-owned and must not be deleted in an ownership sweep — deleting it drops the tag rather than de-duplicating it. `BandProfilePage.jsx`'s `<meta name="keywords">` was the worked example: it had no SSR equivalent, so it correctly survived #790's ownership sweep — and was then removed by **#797** on the unrelated grounds that search engines have ignored `keywords` since 2009. Deleting it *for the ownership reason* would have been the error; deleting it because the tag is dead everywhere is not. That page's `<Helmet>` (and its `react-helmet-async` import) went with it, since the tag was its only child. This is the same trap as `og:site_name` in #784.

The rejected alternative was marking SSR-injected tags `data-rh="true"` so Helmet would adopt and replace them instead of appending. Rejected because it makes canonical correctness depend on Helmet *reliably adopting and replacing* tags it didn't create — the exact behavior already documented above as unreliable for `document.title` in React 19. Inverting ownership removes the duplicate class entirely without depending on Helmet's replace behavior working.

**Tradeoff, accepted:** since SSR only injects meta into the initial HTML response, identity meta now freezes at whatever that response's values were across client-side (in-app) navigation between SSR-injected routes — refreshed only by a full-page load. This doesn't affect crawlers or link-unfurl bots, which always fetch the specific URL fresh; it only affects a live DOM read after in-app navigation, which nothing in this codebase does.

- **Every indexable route needs a Pages Function that injects its own meta.** `/event/*`, `/band/*`, `/venue/*` have always had one; the eight static pages go through the `STATIC_PAGES` registry in `functions/utils/staticPageMeta.js`, one 2-line route file each; `/events/*/recap` (the archive recap page, distinct from singular `/event/*`) is D1-backed like `/event/*`/`/band/*`/`/venue/*` rather than registry-driven — `functions/events/[slug]/recap.js` — because its title/description embed per-event stats (`total_sets`, `venue_count`) a static registry entry can't express.
- **Before deleting a tag from a page's `<Helmet>`, confirm SSR emits an equivalent** — the ownership sweep isn't just "delete the client copy." `og:site_name` existed only in two pages' old client Helmet (`SubscribePage.jsx`, `App.jsx`'s `/event/:slug`) and had no SSR equivalent anywhere; deleting it outright would have silently dropped the tag rather than de-duplicating it. Two other disagreements surfaced the same way on `/event/:slug`: the old client `og:type="event"` (invalid without Facebook's required `event:start_time`/`event:end_time` properties, which this route never emitted) and `twitter:card="summary"` (no image) lost to SSR's already-established, spec-valid `og:type="website"` / `twitter:card="summary_large_image"` — the more complete value wins once there's only one.
- **`/` is deliberately excluded.** `index.html`'s baked-in defaults *are* the homepage's correct meta, and `EventsPage` keeps full client-side ownership of its identity meta there — the only route in the app that does.
- **Build every URL from `CANONICAL_HOST`, never `request.url`** — preview deploys must not self-canonicalise.
- **`_routes.json` `exclude` beats `include`.** A path listed in both never reaches its Function, and the page silently regresses to the shared shell. The guard test in `functions/__tests__/staticPageMeta.test.js` scans `_routes.json` and fails if an included path lacks either a route file or a registry entry. **The file is `frontend/public/_routes.json`, and it is the only one** — `wrangler.toml` sets `pages_build_output_dir = "frontend/dist"`, so Cloudflare reads the copy Vite emits from `frontend/public/`. A second, stale `/_routes.json` sat at the repo root until #786; it listed only `/api/*` and `/s/*`, so anyone reading it would have concluded the SSR routes were never wired up. Do not recreate one — a root copy is dead on arrival and actively misleading.

Mocked unit tests prove the handler *builds* correct HTML; they cannot prove Cloudflare *dispatches* to it, and a pure string assertion on the SSR response can't prove Helmet doesn't duplicate it after mount. Verify routing changes against a real `npx wrangler pages dev --port 8788` and diff the tag counts per path; `frontend/src/pages/__tests__/ssrIdentityMeta.test.jsx` covers the mount side — it seeds `document.head` with the tags SSR would have injected, mounts the real page component the same way `main.jsx` does (`createRoot`, not `hydrateRoot` — this app is client-rendered, not server-rendered; see that file's header comment), and asserts exactly one `canonical`/`og:url` survives (plus, on `/band/*` and `/venue/*`, exactly one JSON-LD `script` per `@type`).

---

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

## Metrics & Analytics

Metrics write to D1 daily-aggregate tables (`page_views_daily`, `artist_daily_stats`) via `POST /api/metrics`, plus an optional Cloudflare Analytics Engine sink (`env.ANALYTICS`, configured in `wrangler.toml`). Ingestion is best-effort and fire-and-forget; failures must not surface to users.

**Share metrics come from `share_links`, not telemetry.** A share *create* is a `share_links` row. The admin event metrics endpoint reads these directly. Do **not** wire the allowlisted-but-unused `share_event` / `filter_use` events into `/api/metrics` for share counts — they would be redundant with `share_links`.

**`view_count` is unique visitors per link, all-time — not fetches (#705).** It is a *derived* value: `GET /api/schedule/share/[slug]` writes one `share_link_views(slug, visitor_hash)` row per visitor and recomputes `view_count` as `COUNT(*)` over that ledger, both in a single `DB.batch()`. Do not "optimise" it back to `view_count = view_count + 1`: the ledger row claims the slot permanently, so if a separate increment were lost the visitor could never be counted again, whereas a recomputed count self-heals on the next visit.

Two traps around this:

- **`import_count` is still per-fetch and undeduped.** It sits beside `view_count` in the same metrics payload and dashboard, so the two are different units. One person importing twice can produce imports > views.
- **The expiry cron must delete ledger rows explicitly** (`functions/scheduled/expire-share-links.js`). `share_link_views` declares `ON DELETE CASCADE`, but cron handlers reach D1 via `_scheduled.js` and never pass through `_middleware.js`, where `PRAGMA foreign_keys = ON` is set — D1 defaults it OFF, so the cascade does not fire there. It *does* fire on the event-deletion path, which is an HTTP request.

`view_count_legacy` preserves each link's pre-#705 count. Nothing reads it. It keeps the cutover reversible and the old figure queryable.

---

## RBAC Roles

Three roles in ascending order: `viewer` → `editor` → `admin`.

- `viewer`: read-only access to all admin data
- `editor`: can create/edit bands, events, lineup; cannot manage users
- `admin`: full access including user management and platform settings

Enforced via `checkPermission(context, "viewer"|"editor"|"admin")` in `functions/api/admin/_middleware.js`. Every mutating endpoint must call this before touching the database.

---

## Pulling a band from a live lineup

**Use the cancel toggle (`is_cancelled = 1`). Do not un-announce, and do not delete the row.**

`is_announced = 0` is **not** a way to hide a set. Every public read path **that returns per-performance rows** guards with `AND (e.reveal_mode = 0 OR p.is_announced = 1)` — **8 files**, and three of them bind `reveal_mode` as a parameter (`AND (? = 0 OR p.is_announced = 1)`): `api/events/[id]/details.js`, `api/schedule.js`, and `event/[slug].js`, which uses both forms. Grep for `is_announced = 1` rather than the literal `e.reveal_mode` form or you will undercount:

`api/bands/[name].js`, `api/bands/stats/[name].js`, `api/events/[id]/details.js`, `api/events/timeline.js`, `api/feeds/ical.js`, `api/schedule.js`, `api/venues/[id].js`, `event/[slug].js`

On a `reveal_mode = 0` event the left side short-circuits **true**, so `is_announced` is never consulted for visibility. The set stays on the schedule, the artist page, the venue page and the iCal feed. Nothing errors; the failure is invisible until fans arrive at a dark venue.

`is_announced` is not meaningless on such an event, though — the **`0 → 1` transition still drives the follower announcement email** (see "Band Announcements" below). Un-announcing and re-announcing a set on a `reveal_mode = 0` event changes nothing publicly while still being capable of sending mail.

`reveal_mode = 0` is the normal state for a published lineup — Buddies Fest 2 (event 36) is `reveal_mode = 0`. So this trap applies to exactly the events you are most likely to be editing during a show.

Deleting the performance row does hide it, but it is lossy: a fan who already saw the lineup gets no signal the set was cancelled, and since #733 the set is **dropped entirely** from already-shared routes — `schedule/share/[slug].js` resolves live performances and filters out ids that no longer exist, so a fan reopening their shared link finds the stop silently gone rather than marked off. (Before #733 it left an orphaned name with no time or venue, which read as a rendering bug; dropping it is better, but neither tells the fan the set was cancelled.)

Since #732 the correct action is the reversible cancel toggle in LineupTab (`PATCH /api/admin/bands/:id` with `is_cancelled: true`, `editor` role or above). It keeps the set visible and struck through with a "Cancelled" label on every fan surface, suppresses it from "up next" routing and live/starting-soon time math, makes it unselectable, emits `STATUS:CANCELLED` to calendar subscribers, and **blocks the announcement email** — a cancelled performance can neither queue nor send a follower notification.

**Un-cancelling does not resend anything.** The announce path fires only on an `is_announced` `0 → 1` transition (`hasAnnounced && newValue === 1 && isCancelled === 0 && performance.is_announced === 0 && !performance.band_follow_notified`). Restoring a set leaves `is_announced` untouched, so a performance that was already announced before being cancelled produces no new transition, no `band_announce_queue` rows, and no follower email. Un-cancel restores visibility and selectability only.

Operational detail: cancelling is scoped to *one performance*. A band playing two sets (ALL and Kepi Ghoulie each play twice at BF2) needs each set cancelled separately.

The human-facing version of this, plus what to do when a set time changes or something looks wrong mid-event, is `docs/SHOW_DAY_RUNBOOK.md`. Keep the two in step — if a procedure changes, change both in the same commit.

## Band Announcements

Band follows are **double opt-in**: `POST /api/bands/:name/follow` creates the row `verified = 0` with a `verification_token` and sends only a confirmation email. Clicking the link hits `GET /api/bands/:name/confirm-follow?token=…`, which sets `verified = 1` and clears the token (idempotent). Announcement emails target `verified = 1` followers **only** (the `WHERE … verified = 1` filter in `admin/bands/[id].js` and `resend-announcement.js`), so an address the submitter doesn't control can never be enrolled in the announcement stream — it receives at most one confirmation email. **Do not revert follow to auto-verify (`verified = 1` on insert)** — it reopens the email-bombing vector.

When a performance is announced (`is_announced` 0→1), verified followers of that band are emailed once. Delivery is tracked **per-follower** in `band_follow_notifications (performance_id, band_follow_id)`: the announce records each *successful* send. Failed sends leave no row, so `POST /api/admin/bands/:id/resend-announcement` recovers them by emailing only followers without a notification row (never double-sending). Shared send+record logic lives in `functions/utils/bandFollowNotify.js`. **Do not reintroduce a fire-once latch without per-follower tracking** — it silently drops fans whose first send failed (the bug this replaced).

Bot protection on the public email-input endpoints (follow, subscribe) goes through `verifyTurnstile()` in `functions/utils/turnstile.js`, which **fails closed in production**: if `TURNSTILE_SECRET_KEY` is unset it allows only local-dev requests and rejects everything else (mirrors `CSRF_SECRET`). The secret **must** be configured in the production Pages project.

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

### Lighthouse CI performance assertion (#728)

`frontend/lighthouserc.json` gates performance at **0.80** — deliberately below the
observed CI noise floor (0.83–0.84). Lighthouse on shared GitHub runners fluctuates
±2–3 points, so a floor at the observed ceiling flakes with no code cause. The
assertion pins **`aggregationMethod: "optimistic"` (best of 3 runs)** — the most
lenient option available. **Do not switch it to `median`:** median ≤ max, so that
change only ever makes the gate *stricter* and would re-introduce the flake (#728's
original proposed "fix" was exactly this, caught in the issue's own follow-up). A
genuine regression must now push the best-of-3 below 0.80 — a sustained drop, not a
contended runner. The other categories (accessibility, best-practices, seo) stay at
0.90 and use the default aggregation: they have not been observed to flake here,
being far less sensitive to runner contention than performance. That is an
observation, not a guarantee — if one starts flaking, measure it before moving it.

**This is the budget's second reduction, and both were deliberate.** It was 0.90
until 4235c1b (#534, 2026-07-05) — a squash whose second commit is an explicit
`perf(ci): right-size the Lighthouse performance budget to 0.85 (#532)`, citing
measured CI variance of 0.72 / 0.89 / 0.88 in a single 3-run pass. Reading only the
first commit of that squash makes the change look incidental; it was not.

**0.90 was never achievable, not merely flaky.** Measured locally on 2026-08-14
(#851, static serve + simulated throttling, 3 runs): **0.85 / 0.85 / 0.86**,
deterministically — so a 0.90 budget would fail on a dev machine, not just on a
contended runner. Retiring it was correct.

There is real drift since July, and it is small: index chunk 338 → **354 kB**
(+16 kB) and LCP 2.2 → **2.4 s**, both reproducible from a build. The larger score
drag is **CLS at 0.20–0.23** (component score 0.61, one mount-time shift) — that
fails Core Web Vitals outright and is tracked in #854, separate from the budget.

So the budget is not chasing an unmeasured regression. Still: **do not lower it a
third time without re-measuring locally first** — that measurement is cheap and is
what turns a budget change from erosion into a decision.

### Before every commit — required checklist

**Canonical entry point: `make gate`** — runs the Make targets `format` → `format-check` → `lint` → `test` → `build` (`format-check` wraps the `npm run format:check` script below) for both stacks with real exit codes (see `Makefile`, `AGENTS.md`). Run it before every commit; do not commit if it fails. The npm commands below are the explicit breakdown of what `make gate` runs, for when you need to run a subset or debug a failing step.

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

### Before opening a PR — AI review gate

```bash
make review        # CodeRabbit review of this branch vs origin/main
make review-wip    # same, but for uncommitted working-tree changes
```

Requires the CodeRabbit CLI (`brew install --cask coderabbit`, then `coderabbit auth login`); both targets fail with an install/auth hint if it is missing.

**Run this before opening the PR, not after.** The same review runs automatically on the PR, so anything it finds post-open costs a fix plus a force-push round trip. Findings it has caught that the local gates did not: assertions that pass on the wrong branch's output, a spy recording statement *preparation* rather than *execution*, and a SQL guard that stayed inert for legacy rows after a write-side fix.

`make gate` deliberately does **not** include it — `gate` must stay fast and offline-capable; `review` needs the network and takes minutes.

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

### Content-Security-Policy (strict, no `unsafe-inline`) — TWO sources

There are **two** CSPs, and the one the browser enforces on a page is **not** the middleware:

- **`frontend/public/_headers`** sets the CSP (and COOP/COEP/CORP) on **static/document responses** — i.e. the HTML the browser loads. **This is the browser-enforced CSP for pages and the one that governs Turnstile, the service worker, and inline scripts.** Edit this for anything affecting what the page can load.
- **`functions/_middleware.js`** sets a CSP on **Pages Functions / API responses** (JSON), enforced when `ENVIRONMENT=production` unless `CSP_ENFORCE` overrides. It does not govern the document.

For the `_headers` document CSP:
- **Turnstile** needs `https://challenges.cloudflare.com` in `script-src`/`frame-src` ([CSP docs](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)); no `'unsafe-inline'`.
- **`Cross-Origin-Embedder-Policy: require-corp` must NOT be set** — it blocks the Turnstile iframe (which doesn't send COEP; `credentialless` isn't supported in Safari). The app needs no cross-origin isolation.
- **The inline theme-flash `<script>` in `frontend/index.html`** is allowed by a `'sha256-…'` hash in `script-src`. **If you edit that script, regenerate the hash** (sha256 of the exact built script body, base64) or it silently stops running and a theme flash returns. No test covers this — verify by building and hashing `dist/index.html`.
- **Cloudflare Rocket Loader must stay DISABLED** for the zone. It rewrites/inline-executes `<script>` tags, which strict CSP blocks ("Refused to execute inline script"). A modern code-split Vite SPA gains nothing from it.
