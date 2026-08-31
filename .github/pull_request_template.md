## Summary

<!-- One paragraph: what changed and why. Link the issue this closes. -->

Closes #

## What changed
<!-- For multi-file PRs, a table helps reviewers navigate the diff. Remove if the summary is sufficient. -->

| File | Change |
|------|--------|
| | |

## Security / correctness notes
<!-- XSS, auth, CSRF, data-integrity implications. Write "None" if not applicable — don't omit. -->

## How I know this works
<!--
Two questions a green CI run cannot answer. Both take one line. Write None with a
reason rather than deleting either.
-->

- **Tests aren't vacuous:** <!-- Which mutation did you apply to the source to prove a test actually fails? e.g. "dropped `AND verified = 1` → announce-double-opt-in.test.js red". A test only ever seen passing proves nothing: deleting that clause once left all 1,169 backend tests green. Write None with a reason if no tests changed. -->
- **Sweep:** <!-- If this fixes a bug, where else does the same class occur? "grep'd X across N files, this was the only one" is a good answer. The second instance is the one a fan stumbles onto. Write None with a reason if this is not a bug fix. -->

## Verification
<!--
Tick every box. An unchecked item is indistinguishable from a skipped one.

If an item genuinely does not apply, still tick it and append the reason
("- [x] `validate:openapi` — None, no API spec change"). Ticked-with-a-reason
says "considered and does not apply"; an empty box says nothing at all, and the
two must not be confusable. Same convention as the prose sections above: write
None with a reason, never delete the line.
-->

- [ ] `make gate` — exit 0 <!-- the canonical gate: format, all six linters, both test suites, both builds -->
- [ ] `make review` — CodeRabbit run BEFORE opening <!-- it runs on the PR regardless; running it after costs a fix plus a force-push, and only 5 reviews are free per rolling hour -->
- [ ] Docs updated in this same change <!-- CLAUDE.md / AGENTS.md / runbook, if this resolves or changes a documented invariant. A fix that leaves the doc stale creates a trap for whoever reads it next. -->
- [ ] `validate:openapi`: no drift (if `docs/api-spec.yaml` changed)
- [ ] Manual smoke: <!-- what you actually exercised, and where -->

<!--
`make gate` = format -> format-check -> lint-all -> test -> build.
To debug ONE failing stage, run just that stage rather than the whole gate:
  make format-check                      formatting
  make lint                              ESLint (functions/ + scripts/)
  make lint-md / lint-sh / lint-yaml / lint-sql / lint-json
                                         the non-JS linters, one file type each
  make test-backend / make test-frontend unit tests, one stack each
  make build                             both builds
`make lint-all` runs all six linters together. Running only the npm scripts
skips the five non-JS linters entirely -- that gap is what this PR exists to
close, so do not reintroduce it here.
-->

---
<!-- Agent attribution — keep on one line, drop the session URL -->
Built by [Agent] · Reviewed by [Agent] · 🤖 [Claude Code](https://claude.ai/claude-code)
