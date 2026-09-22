# Delegating to OpenCode — field notes

> Moved out of `CLAUDE.md` on 2026-09-22 to keep it under the harness's
> 150k-char load limit. `CLAUDE.md` keeps the rules; this file keeps the
> evidence and history behind them. Edit both together.

A third implementer, on a separate subscription: the `opencode-delegate` skill.

**It is not in this repo and a fresh clone will not have it.** It is an external prerequisite, installed per-machine into the gitignored `.agents/skills/` (see `.gitignore`), which is why `relay.mjs` will not appear in `git ls-files`:

```bash
npx skills add amElnagdy/delegate-skills --skill opencode-delegate
# lands in .agents/skills/opencode-delegate/, symlinked to .claude/skills/
```

It also needs the `opencode` CLI on PATH and an authenticated provider (`opencode auth list`).

Use it for well-specified work that would otherwise consume this session's context. **The relay does NOT commit.** It edits the working tree and stops; whoever dispatched it reads the diff, re-runs `make gate`, and commits. `relay.mjs --help` states it outright ("Committing is always the orchestrator's job"), the run prints "relay does not commit" on completion, and a delegation on 2026-09-01 left nine modified files uncommitted exactly as described. Both are checkable from this repo: run `--help`, or read `result.json`, which lists `touchedFiles` and no commit.

This paragraph previously claimed the opposite — that OpenCode "works issues end to end: it branches, commits, and opens a PR" — while the numbered rule four lines below it said the relay "never commits". Both were in this section at once, so whichever a reader reached first was the one they believed. Corrected against the installed relay's behaviour, which is the only authority here.

Because it does not commit, **dispatch it only from a CLEAN working tree on its own branch.** A new branch does not separate work that is already uncommitted — `git checkout -b` carries those changes along, so relay edits and your in-progress work end up in one tree and get committed together. Commit or stash first, or give it a separate `git worktree`. Verify with `git status --porcelain` before dispatching; `scripts/delegate-verify.mjs` reports what changed afterwards but cannot tell your edits from the relay's. The invariant is unchanged either way: **nothing lands on `main` unreviewed.**

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

**Cost is the throughput constraint, not the bill.** The subscription is flat-rate but capped in usage-dollar terms, so an expensive model buys fewer delegations per window rather than a larger invoice. Read the cost after **every delegated run** — but read it with `make delegate-stats`, NOT from `result.json`, whose `cost` field reports `$0.0000` on a free model and invites the conclusion that the run consumed nothing (see below). A raw `opencode run` writes no `result.json` at all, which is a separate reason to go through the relay.

**`make delegate-stats` is how you read the cost — not `result.json`.** The relay
writes a `cost` field, and on a free model it reads `$0.0000`, which invites the
conclusion that a delegation consumed nothing. It did not: measured 2026-09-02,
four dispatches on `opencode/big-pickle` came to **314 messages and 3.1M input
tokens** in this project alone. Counting *dispatches* understates the work by
roughly two orders of magnitude.

`opencode stats --days 7 --models --project ""` is the real view, wrapped as
`make delegate-stats` (7 days by default; override the window with `DAYS=30 make delegate-stats`).
The `--project ""` is load-bearing: the default is EVERY project on the machine.

Three limits on what it can tell you, all worth knowing before relying on it:

- It reads **local session history**, so it reports consumption, not entitlement,
  and cannot see runs from another machine.
- **There is no quota endpoint to ask.** `opencode.ai/v2/docs/api` is the local
  *server* API — sessions, filesystem, shell, MCP, 140 operations — and documents
  nothing for usage, billing or limits. An MCP server would not help; there is
  nothing account-shaped to expose.
- A **$0.00 model is free FOR NOW, not free by contract.** OpenCode's own Zen
  page describes Big Pickle as "a stealth model that's free on OpenCode for a
  limited time". A community GitHub comment claiming a ~200-request cap does not
  match the vendor's page and is four months old — the catalog has already
  rotated since (it named one Minimax; there are now three). If a delegation
  starts reporting a non-zero cost, that window closed.

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
