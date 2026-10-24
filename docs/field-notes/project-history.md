# Project history

Moved verbatim from `CLAUDE.md` on 2026-10-24, when it passed the 150k-character
limit. `CLAUDE.md` keeps the rules; this file keeps the incidents, measurements
and reasoning behind them. Read it before changing the code a section guards.

## Mission & Scope — `CLAUDE.md` text as of 2026-10-24

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

## Stack — `CLAUDE.md` text as of 2026-10-24

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

## The codebase report card — run it on a cadence — `CLAUDE.md` text as of 2026-10-24

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
