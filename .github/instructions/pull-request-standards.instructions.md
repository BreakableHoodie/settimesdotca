---
applyTo: '**'
description: >
  Standards for opening, reviewing, and merging GitHub Pull Requests in the
  settimesdotca multi-agent dev studio. Covers title conventions, body structure,
  test plan discipline, labels, agent attribution, and what to check before merge.
---

# Pull Request Standards

These rules apply to every PR opened by any agent (Sonny, Theo, Cass, or others)
or by a human contributor.

---

## Title

Use the same conventional-commit prefix as the branch/commit:

```
fix(admin): gate bulk apply on ignore_conflicts — closes #474
feat(bands): render bios as Markdown (safe: marked → DOMPurify)
ci: add ESLint gating for functions/ + scripts/
chore(content): remove Ottawa references from seed/test fixtures
```

- Be specific about *what* changed, not just *that* it changed.
- If the PR closes an issue, put `— closes #N` in the title **and** `Closes #N`
  on its own line in the body (GitHub only auto-closes from the body, not the title).

---

## Body — required sections

Use `.github/pull_request_template.md` as the starting point. Fill every section;
write "None" rather than deleting a section.

### Summary
One concise paragraph. Answer: what changed, why, and what issue it closes.
`Closes #N` must appear on its own line here (or in a `## Linked issues` section).

### What changed
For PRs touching more than ~3 files in meaningfully different ways, add a table:

```markdown
| File | Change |
|------|--------|
| `frontend/src/utils/markdown.js` | New util: `renderMarkdownToSafeHtml`, `stripMarkdownToText` |
| `frontend/src/pages/BandProfilePage.jsx` | Calls new util for bio render + meta |
| `functions/utils/ssrMeta.js` | `toPlainText` gains markdown-strip regex pass |
```

Skip the table for single-concern PRs where the diff speaks for itself.

### Security / correctness notes
Always present. Document XSS vectors, auth checks, CSRF implications, or
data-integrity invariants touched. If none apply, write "None — no auth, data, or
rendering surface changed."

This section is what Cass (security reviewer) reads first.

### Verification
All checkboxes **must be ticked before merge** — an unchecked test plan is not a
test plan. Applicable checks for this repo:

```markdown
- [ ] Tests: N pass, 0 failures
- [ ] ESLint: 0 errors
- [ ] Format check: clean
- [ ] Build: green
- [ ] validate:openapi: no drift  ← only if api-spec.yaml touched
- [ ] Manual smoke: <what was clicked/tested>
```

For backend-only PRs omit the build line. For frontend-only PRs omit
validate:openapi. Always include the test count — it tells reviewers the suite
didn't silently shrink.

---

## Labels

Apply labels when opening the PR — not after. Required: one type label + one
priority label.

| Category | Labels |
|----------|--------|
| Type | `bug` `enhancement` `ci` `documentation` `chore` `security` |
| Priority | `priority:p1` `priority:p2` `priority:p3` |
| Scope (optional) | `frontend` `backend` `content` `admin` |

Example: a bug fix visible to event attendees → `bug` + `priority:p1`.

```bash
gh pr create --label "bug,priority:p1"
```

---

## Agent attribution

One line at the bottom of the body, after a `---` divider. Drop the session URL —
it adds noise and leaks a private identifier.

```
Built by Sonny · Reviewed by Theo · 🤖 [Claude Code](https://claude.ai/claude-code)
```

Use the agent's name that actually did the work. If only one agent was involved:

```
Built and reviewed by Theo · 🤖 [Claude Code](https://claude.ai/claude-code)
```

---

## Before opening the PR

Run the applicable checklist from CLAUDE.md's "Before every commit" section.
The full gate before merge:

1. `npm run format:check` (backend) and `cd frontend && npm run format:check`
2. `npm run lint`
3. `npm test` (backend, may require Linux/CI) and `cd frontend && npm test -- --run`
4. `npm run build --prefix frontend`
5. `npm run validate:openapi` if `docs/api-spec.yaml` changed
6. `git fetch origin && git rebase origin/main` — do this **every push**, not just on open

---

## After opening the PR

- If the PR touches `functions/utils/auth.js`, session endpoints, or follow/confirm-follow
  flows → invoke `cloudflare-security-reviewer` agent before merging.
- If the PR modifies `migrations/` → verify `database/setup-complete.sql` stays in sync.
- If the PR touches public SEO pages → check structured data and `document.title` assignments.
- Tick all verification checkboxes in the PR body before merging — never merge with open `- [ ]` items.

---

## Anti-patterns to avoid

| Anti-pattern | Why it matters |
|--------------|----------------|
| `Closes #N` only in the title, not the body | GitHub does not auto-close from the title |
| Unchecked `- [ ]` items at merge time | Indistinguishable from a test plan that was skipped |
| No labels | PRs are unsortable; priority is invisible in the queue |
| Session URL in attribution footer | Leaks a private identifier; noise for reviewers |
| Large PR with no "What changed" table | Hard to bisect regressions across unrelated concerns |
| Merging without rebasing `origin/main` | Causes "Update branch" round-trips; blocks fast-forward merge |
