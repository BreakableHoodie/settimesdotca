# Lighthouse CI performance assertion — field notes

> Moved out of `CLAUDE.md` on 2026-09-22 to keep it under the harness's
> 150k-char load limit. `CLAUDE.md` keeps the rules; this file keeps the
> evidence and history behind them. Edit both together.

**The harness measures a served app, not a static build (#869).** Until then,
`lighthouserc.json` ran `npx serve dist` — static assets only, no Pages Functions,
no D1 — so every homepage API call failed in CI. `EventTimeline` rendered its tall
`EventsPageSkeleton`, the fetch failed fast, the skeleton collapsed into a short
error state, and `<Footer />` (its sibling in `EventsPage`'s `<main>`) moved.
Lighthouse scored that as a **total CLS of 0.2011**, of which **0.2007** was
the footer element's own shift score — an artefact of that static-build harness,
not of the wrangler-served app. Production measured 0.0004 on 2026-08-18 (3 runs,
same Lighthouse version and flags), so the shift did not reproduce there; that is
one dated measurement of one page, not a claim about every user's experience.

It now points at `http://localhost:8788`, served by `.github/actions/e2e-env`
(wrangler + a seeded D1 — the same environment E2E uses). Measured 2026-08-18,
Lighthouse 12.8.2, mobile, `--throttling-method=simulate`, 3 runs each:

| harness | perf (raw runs) | CLS (raw runs) |
|---|---|---|
| static `dist` (old) | 0.86 / 0.86 / 0.96 | 0.2011 / 0.2011 / 0.0000 |
| `https://settimes.ca` | 0.90 / 0.90 | 0.0004 / 0.0004 |
| wrangler + D1 (current) | CI **median** 0.94 | CI **median** 0.0008 |

Three runs each. The `settimes.ca` row lists only two: its first run was a
contended outlier (LCP 8.3 s, TBT 21 s) and is excluded rather than averaged in.
The current row reports CI's **uploaded median LHR** — which is what gets
published for humans to read, and is *not* what the assertions compare against:
performance aggregates `optimistic` (best run) and CLS `pessimistic` (worst),
so neither gated value is the median. Read the median for a sense of the page;
read the assert step's output for what actually passed or failed.

The old column is the whole story: the one run recording **zero** shift scored
**0.96**; the two recording 0.2011 scored 0.86. The shift and the ~0.10 deficit
were one phenomenon. **So #851's question is answered — ~0.84 was never a
regression**, and CLS was never a real defect (#854).

**The budget is back to 0.90**, restored on 2026-08-18 from five CI runs on the
fixed harness: **0.94 / 0.95 / 0.95 / 0.95 / 0.96** (median LHRs; the gate
asserts `optimistic`, so the gated value is at or above these). Both past
reductions — 0.90 → 0.85 in #532/#534, → 0.80 in #728 — were absorbing the
static-build artifact, not a real regression, so this is a restoration rather
than a raise.

**0.90, not 0.95, is deliberate.** A floor at the observed ceiling flakes with
no code cause; ~5 points of headroom matches the ±2–3 point runner noise
documented below.

**Never move this floor from a local number.** `lhci` collects all four
categories, while an ad-hoc `lighthouse --only-categories=performance` does
not, so the two are not comparable. On 2026-08-18 the same commit measured
**0.94–0.96** raw, **0.94–0.96** in CI, and **0.74 / 0.84** through local
`lhci` on a busy machine. Only CI samples count.

**`cumulative-layout-shift` is asserted at ≤ 0.1 with
`aggregationMethod: "pessimistic"`** so the artifact cannot return silently — it
sat at 2× the failing threshold for months with nothing going red, because only
the four category scores were gated. Current value is 0.0008, a ~125× margin.

**The `pessimistic` there is load-bearing, and differs deliberately from the
performance assertion's `optimistic`.** `optimistic` picks the most favourable
run *before* comparing, so against the old `0.2011 / 0.2011 / 0.0000` it would
aggregate to `0.0000` and pass — the guard would not have caught the very
artifact it exists to prevent. `pessimistic` takes the worst run, so any single
run above 0.1 fails the gate. That is safe here precisely because CLS is stable
under load (see below); do **not** copy it onto the performance assertion.

The assertion pins **`aggregationMethod: "optimistic"` (best of 3)** — the most
lenient option. **Do not switch it to `median`:** median ≤ max, so that only ever
makes the gate stricter and would re-introduce the flake (#728's original proposed
"fix" was exactly this, caught in the issue's own follow-up). Accessibility,
best-practices and seo stay at 0.90 on default aggregation; they have not been
observed to flake here. That is an observation, not a guarantee — if one starts
flaking, measure it before moving it.

**Performance numbers look contention-sensitive; CLS did not.** Across one
session's measurements (2026-08-18) CLS stayed within 0.0000–0.0008 while the
perf score ranged 0.63 → 0.96 on identical code, **correlating with** host load
— the runs were not controlled for other variables, so treat this as an observed
correlation rather than a demonstrated cause. It is still enough to act on:
measure perf on an idle host or take CI's number, and never re-baseline it from
a laptop doing other work.
