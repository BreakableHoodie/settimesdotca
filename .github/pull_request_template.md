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

## Verification

- [ ] Tests: N pass, 0 failures (`npm test` / `cd frontend && npm test -- --run`)
- [ ] ESLint: 0 errors (`npm run lint`)
- [ ] Format check: clean (`npm run format:check` / `cd frontend && npm run format:check`)
- [ ] Build: green (`npm run build --prefix frontend`)
- [ ] `validate:openapi`: no drift (if `docs/api-spec.yaml` changed)
- [ ] Manual smoke: <!-- describe what you clicked / verified in the browser -->

---
<!-- Agent attribution — keep on one line, drop the session URL -->
Built by [Agent] · Reviewed by [Agent] · 🤖 [Claude Code](https://claude.ai/claude-code)
