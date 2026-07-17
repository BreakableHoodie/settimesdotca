# AGENTS.md — settimes.ca

Instructions for AI coding agents (Claude Code, OpenCode, Codex, Cursor, …) working in this repo.
Format: [agents.md](https://agents.md). Humans: start with `README.md`; deep Claude-specific
workflow and the full invariant catalogue live in `CLAUDE.md` — read it before non-trivial work.

## What this is

settimes.ca — a **lean, highly performant** multi-venue live-music event platform for Waterloo
Region, ON. Fan-facing (schedule builder, band profiles, archives) and admin tooling are equal
priority. Flagship event: **Long Weekend Band Crawl Vol. 17 — August 2, 2026**.

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
- **Clean links**: strip tracking params (`si`, `dlsi`, `nd`, `utm_*`, `from=`) before
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
- E2E requires a live wrangler server and env credentials (`ADMIN_EMAIL`/`ADMIN_PASSWORD`
  are required for ANY Playwright invocation, including `--list`). `make e2e` handles this.
- E2E spec files are currently outside prettier/eslint scope (#622) — match their existing
  single-quote style; don't reformat them piecemeal.
