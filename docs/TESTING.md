# Testing

Use the repository gates rather than an old sprint checklist. Read the linked
sections in `CLAUDE.md` for the invariant behind each command.

- `make gate` — formatting, lint, backend/frontend tests, and production build. See **Before every commit — required checklist**.
- `make mutation-gate` — mutates documented backend invariants and requires the named tests to fail. See **The mutation gate — documented invariants, proven executable**.
- `make coverage-floor` — runs coverage and rejects any unexecuted backend API handler. See **The coverage floor — no handler may be entirely untested**.
- `npx playwright test` — local end-to-end browser tests against the Pages runtime. See **E2E tests**.
- `.github/workflows/edge-e2e.yml` — edge authentication tests against a real Pages preview and scratch D1. See **Edge E2E against a preview**.

Run `make install` first when dependencies are not installed. Do not weaken a
test, lint rule, or configuration to make a gate pass.
