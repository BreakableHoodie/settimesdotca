# Code Review: Full Repository Security Review
**Ready for Production**: No
**Critical Issues**: 4

## Summary
This review inspects the Cloudflare Workers functions, frontend, and repo-wide configuration for security issues (OWASP Top 10, LLM prompt risks, secrets handling, and operational concerns). Overall the codebase shows many security best practices (CSRF protection, HTTPOnly cookies, prepared SQL statements, rate limiting), but there are a few high-priority gaps that must be addressed before a production rollout.

## Priority 1 (Must Fix) ⛔
- **Missing or incomplete authorization checks in admin endpoints:** several admin handlers include comments indicating auth/organization checks are not implemented. Example: admin events metrics endpoint lacks session/org verification. Fix: validate session token and perform RBAC checks at the start of every admin route.
- **Demo credentials committed to docs / examples:** `SECURITY.md` contains a demo password string (`SecurePassword123!`). Remove any plaintext credentials from the repository and ensure examples use placeholders or env vars.
- **CORS and origin allowlists need tightening for production:** some endpoints use permissive origins (`Access-Control-Allow-Origin: *` in `functions/api/events/public.js`) or include hardcoded local origins in middleware and webauthn. Ensure `CORS_ALLOWED_ORIGINS` is enforced from env and production origins are locked down.
- **CSRF token cookie is not HttpOnly by design — ensure client-side handling is safe and documented:** the repo uses the double-submit pattern but stores `csrf_token` in a non-HttpOnly cookie. Validate the implementation against XSS vectors and consider alternative approaches (short-lived same-site cookies for server-side validation, or rotating tokens).

## Priority 2 (Should Fix)
- **Secrets & env usage:** ensure no secrets are committed. Add a pre-commit hook or GitHub Action to fail on common secret patterns. Use `wrangler` and cloud provider secrets rather than checked-in files.
- **Origin / localhost markers in code:** change `ORIGIN = "http://localhost:5173"` in `functions/utils/webauthn.js` and similar dev-only constants to derive from env or fail-safe production values.
- **Audit admin header auth toggle (`ALLOW_HEADER_AUTH`):** relying on header auth should be restricted and monitored; document and restrict to internal network or remove in production.

## Observations (what's good)
- Prepared statements / parameter binding are used in DB calls (reduces SQL injection risk).
- Rate limiting utilities and middleware are present and applied to sensitive endpoints.
- CSRF double-submit pattern and HTTPOnly session cookies are implemented.
- File uploads validate MIME types and size limits in band photo handlers.

## Recommendations & Example Fixes
- Validate sessions and RBAC at middleware layer for admin routes. Example pseudocode:

  ```js
  // at top of admin handler
  const session = await requireAuth(request); // verifies session cookie
  if (!session || !session.user || !userHasRole(session.user, 'admin')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  ```

- Replace any `Access-Control-Allow-Origin: *` with an allowlist sourced from `CORS_ALLOWED_ORIGINS` and fail closed when missing.

- Remove demo passwords and replace with placeholders in docs. Example: `ADMIN_PASSWORD=<use-password-manager>` (already present elsewhere in docs) — remove the literal `SecurePassword123!` entry.

- Add automated checks in CI (GitHub Actions) to scan for leaked secrets, e.g., `detect-secrets` or `gitleaks` in `.github/workflows/ci.yml`.

## LLM & Prompt Injection Notes
- Avoid passing sensitive data into LLM prompts. Sanitize any user-provided strings used as system/completion context. See `SECURITY.md` guidance on prompt sanitization.

## Operational / DevOps Recommendations
- Enforce secret rotation and use provider secret stores (Cloudflare secrets, GitHub Actions secrets). Document rotation cadence.
- Add an incident runbook and monitoring alerting for auth failures, suspicious session activity, and upload abuse.

## Files and locations to prioritize for fixes
- Admin auth & middleware: [functions/api/admin/_middleware.js](functions/api/admin/_middleware.js#L1)
- Global middleware / CORS: [functions/_middleware.js](functions/_middleware.js#L1)
- Public events CORS header: [functions/api/events/public.js](functions/api/events/public.js#L1)
- WebAuthn origin: [functions/utils/webauthn.js](functions/utils/webauthn.js#L1)
- Docs with demo credentials: [SECURITY.md](SECURITY.md#L1)

## Conclusion
The app demonstrates strong security practices in many areas; however, fix the authorization gaps, tighten CORS, remove demo credentials, and add CI secret scanning before production. I can open PRs with targeted fixes (middleware auth enforcement, CORS tightening, CI secret-scan workflow) — tell me which to implement first.

---
Generated: 2026-02-27
