#!/usr/bin/env node
/**
 * mutation-gate — converts prose invariants into executable proof.
 *
 * Why this exists
 * ----------------
 * This repo has a documented, recurring "vacuous test" defect class: tests
 * that pass against BOTH the correct and the broken implementation. The
 * worst instance (see CLAUDE.md "Band Announcements"): deleting
 * `AND verified = 1` from either band-announcement recipient query left all
 * 1,169 backend tests green, because ten test files all seeded
 * `verified = 1` — no fixture could distinguish a gated query from an
 * ungated one.
 *
 * CLAUDE.md documents many invariants in prose and asks contributors to
 * "verify by mutation" by hand. Nothing enforced that, so it decayed. This
 * script automates it: for each documented invariant, it applies the exact
 * one-line source mutation that would break it, runs the named test file(s),
 * and requires them to go RED. A mutation that does not go red is a real
 * vacuous-test gap — reported loudly, not swallowed.
 *
 * Scope (v1): backend (`functions/`) only. The frontend after-midnight
 * threshold (`frontend/src/utils/festivalDays.js`) runs under a SEPARATE
 * vitest project (`cd frontend && npm test`) with its own config, module
 * resolution, and jsdom environment — wiring it in here would mean either a
 * second vitest invocation with different flags/cwd or duplicating the
 * frontend config's `include`/environment, either of which is more moving
 * parts than this file's job warrants. Worth a v2 with its own
 * `frontend/scripts/mutation-gate.mjs`, not a branch in this one.
 *
 * Algorithm, per mutation:
 *   1. Read the target file.
 *   2. Assert `find` occurs EXACTLY ONCE. Zero occurrences or more than one
 *      is a GATE FAILURE, not a skip — patterns drift as code changes, and a
 *      gate whose patterns silently no-op reports all-green while testing
 *      nothing (see: `lint-md` missing from `.PHONY`, Makefile history).
 *   3. Write the mutated content.
 *   4. Run ONLY the listed test file(s) via `npx vitest run <files>`.
 *   5. Expect a NON-ZERO exit code. Zero (tests still pass against the
 *      broken code) is a SURVIVING MUTANT — a real vacuous-test finding,
 *      reported loudly with the invariant, file, and tests named.
 *   6. Restore the original content in a `finally`, then verify the restore
 *      both in-process (byte comparison) and via `git diff --quiet`. A
 *      restore that fails to verify exits non-zero immediately with a loud,
 *      specific message — leaving a mutated source file on disk silently is
 *      worse than any test failure this script could report.
 *
 * Refuses to run at all on a dirty working tree (scoped to the files this
 * table touches): the gate cannot tell its own mutation apart from a real
 * edit already in progress, and a crash mid-run could then destroy it.
 *
 * Usage
 * -----
 *   node scripts/mutation-gate.mjs
 *   make mutation-gate
 *
 * Exit codes:
 *   0  every mutation was caught (or is a documented KNOWN_SURVIVING gap)
 *   1  a gate failure (pattern drift), a genuine surviving mutant, or a
 *      restore that failed to verify
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.join(__dirname, "..");

// ============================================================================
// The mutation table — one entry per documented invariant.
//
// `find` MUST be unique within `file` (verified at run time, not just when
// this table was written — code drifts). `replace` is the exact one-line (or
// small) mutation that breaks the invariant. `tests` is the minimal set of
// test files that should go red.
//
// Every `find` string below was verified unique in its file at the time this
// table was written (2026-08-31) via a byte-exact `indexOf` scan, not `grep`
// (grep's own regex metacharacters would misreport strings containing `(`,
// `.`, `?`, all of which appear below).
// ============================================================================

/** @typedef {{ id: string, invariant: string, file: string, find: string, replace: string, tests: string[] }} Mutation */

/** @type {Mutation[]} */
export const MUTATIONS = [
  {
    id: "case-insensitive-route-path-decisions",
    invariant:
      "CLAUDE.md 'Routes match case-insensitively; path checks must too' — path-based security decisions normalize Pages route paths before comparison",
    file: "functions/utils/routePath.js",
    find: "  const path = new URL(urlOrRequest?.url ?? urlOrRequest).pathname.toLowerCase();",
    replace: "  const path = new URL(urlOrRequest?.url ?? urlOrRequest).pathname;",
    tests: ["functions/api/admin/__tests__/api-key-auth.test.js", "functions/utils/__tests__/rateLimit.test.js"],
  },
  {
    id: "route-path-strips-trailing-slash",
    invariant:
      "CLAUDE.md 'Routes match case-insensitively; path checks must too' — /foo/ routes like /foo, so a trailing slash must not escape a path-based limit",
    file: "functions/utils/routePath.js",
    find: "  return trimTrailingSlashes(path);",
    replace: "  return path;",
    tests: ["functions/utils/__tests__/rateLimit.test.js", "functions/utils/__tests__/csrf.test.js"],
  },
  {
    id: "api-keys-identity-management-read-only",
    invariant:
      "CLAUDE.md 'API keys' — identity-management resources are readable by keys but key mutations cannot create or change identities",
    file: "functions/api/admin/_middleware.js",
    find: '    if (matchesPrefix([path, ...keyPaths], KEY_READ_ONLY_PREFIXES, true) && !["GET", "HEAD"].includes(request.method)) {',
    replace: "    if (false) {",
    tests: ["functions/api/admin/__tests__/api-key-auth.test.js"],
  },
  {
    id: "api-key-denylist-non-canonical-paths",
    invariant:
      "CLAUDE.md 'API keys' — the key denylist is checked against every normalised spelling of the path, so %69nvite-codes, //users and bands%2f..%2fapi-keys are refused, not left to the router (#1327)",
    file: "functions/api/admin/_middleware.js",
    find: "    if (!keyPaths || matchesPrefix([path, ...keyPaths], KEY_FORBIDDEN_PREFIXES, true)) {",
    replace: "    if (matchesPrefix([path], KEY_FORBIDDEN_PREFIXES, true)) {",
    tests: ["functions/api/admin/__tests__/api-key-auth.test.js"],
  },
  {
    id: "api-key-maintenance-denied",
    invariant:
      "CLAUDE.md 'API keys (#744)', request path — /api/admin/maintenance/ (retention and session cleanups) is session-only at every key role (#1331)",
    file: "functions/api/admin/_middleware.js",
    find: '  "/api/admin/maintenance",',
    replace: "",
    tests: [
      "functions/api/admin/__tests__/api-key-auth.test.js",
      "functions/api/admin/__tests__/apiKeySelfService.test.js",
    ],
  },
  {
    id: "api-key-audit-log-denied",
    invariant:
      "CLAUDE.md 'API keys (#744)', request path — /api/admin/audit-log (every user's IP, api_key.request rows) is session-only at every key role (#1331)",
    file: "functions/api/admin/_middleware.js",
    find: '  "/api/admin/audit-log",',
    replace: "",
    tests: ["functions/api/admin/__tests__/api-key-auth.test.js"],
  },
  {
    id: "api-key-reachability-scan-users-read-only",
    invariant:
      "CLAUDE.md 'API keys (#744)', request path — the behavioural scan fails when a route that writes an account or credential table is key-reachable (#1331); here /api-keys loses its mutation refusal",
    file: "functions/api/admin/_middleware.js",
    find: 'const KEY_READ_ONLY_PREFIXES = ["/api/admin/users", "/api/admin/api-keys"];',
    replace: 'const KEY_READ_ONLY_PREFIXES = ["/api/admin/users"];',
    tests: ["functions/api/admin/__tests__/apiKeySelfService.test.js"],
  },
  {
    id: "schedule-builds-hash-session",
    invariant:
      "CLAUDE.md 'Schedule builds are per-event pseudonyms, anonymised 30 days after the event (#1245)' — schedule builds never persist the raw schedule session id",
    file: "functions/api/schedule/build.js",
    find: ").bind(eventId, performanceId, visitorHash),",
    replace: ").bind(eventId, performanceId, userSession),",
    tests: ["functions/api/schedule/__tests__/build.test.js"],
  },
  {
    id: "schedule-builds-retention-window",
    invariant:
      "CLAUDE.md 'Schedule builds are per-event pseudonyms, anonymised 30 days after the event (#1245)' — recent events remain pseudonymous until 30 days after conclusion",
    file: "functions/scheduled/anonymize-schedule-builds.js",
    find: "export const SCHEDULE_BUILD_ANONYMIZATION_DAYS = 30;",
    replace: "export const SCHEDULE_BUILD_ANONYMIZATION_DAYS = 0;",
    tests: ["functions/scheduled/__tests__/anonymize-schedule-builds.test.js"],
  },
  {
    id: "schedule-builds-anonymiser-per-event-isolation",
    invariant:
      "CLAUDE.md 'Schedule builds are per-event pseudonyms, anonymised 30 days after the event (#1245)' — one failing event must not stop anonymisation of the rest",
    file: "functions/scheduled/anonymize-schedule-builds.js",
    find: 'console.error("[scheduled] Failed to anonymise schedule builds for event", event.id, error);',
    replace: "throw error;",
    tests: ["functions/scheduled/__tests__/anonymize-schedule-builds.test.js"],
  },
  {
    id: "schedule-builds-anonymiser-label-collision-guard",
    invariant:
      "CLAUDE.md 'Schedule builds are per-event pseudonyms, anonymised 30 days after the event (#1245)' — a label already in use is never reused for a different builder",
    file: "functions/scheduled/anonymize-schedule-builds.js",
    find: "AND NOT EXISTS (SELECT 1 FROM schedule_builds WHERE event_id = ? AND visitor_hash = ?)`,",
    replace: "AND NOT EXISTS (SELECT 1 WHERE 0 AND ? IS ?)`,",
    tests: ["functions/scheduled/__tests__/anonymize-schedule-builds.test.js"],
  },
  {
    id: "sitemap-upcoming-event-priority",
    invariant:
      "CLAUDE.md 'The sitemap is the event-discovery signal — spend it (#1158)' — an upcoming event outranks a concluded one",
    file: "functions/sitemap.xml.js",
    // Mutates ONLY the upcoming branch. Flattening both to a single value was
    // a weaker test: it was caught by the ordering assertion alone, so it never
    // exercised the case that actually erodes the signal -- quietly demoting
    // the live event a notch while leaving the concluded one alone.
    find: '<priority>${upcoming ? "1.0" : "0.5"}</priority>',
    replace: '<priority>${upcoming ? "0.9" : "0.5"}</priority>',
    tests: ["functions/__tests__/sitemap.test.js"],
  },
  {
    id: "sitemap-upcoming-event-changefreq",
    invariant:
      "CLAUDE.md 'The sitemap is the event-discovery signal — spend it (#1158)' — an upcoming event is crawled daily, not weekly",
    file: "functions/sitemap.xml.js",
    find: '<changefreq>${upcoming ? "daily" : "monthly"}</changefreq>',
    replace: '<changefreq>${upcoming ? "weekly" : "monthly"}</changefreq>',
    tests: ["functions/__tests__/sitemap.test.js"],
  },
  {
    id: "band-follow-claim-lease",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — an UNDELIVERED claim past its lease is abandoned and must be retried",
    file: "functions/utils/bandFollowNotify.js",
    find: "AND claimed_at <= datetime('now', '-${CLAIM_LEASE_MINUTES} minutes')",
    replace: "AND 1 = 0",
    tests: ["functions/utils/__tests__/bandFollowNotify.test.js"],
  },
  {
    id: "resend-reused-key-never-counts-as-delivered",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — a reused Resend idempotency key cannot prove a send, so it must never count as delivered",
    file: "functions/utils/email.js",
    find: 'return { delivered: false, reason: "idempotency_payload_mismatch" };',
    replace: "return { delivered: true };",
    tests: ["functions/utils/__tests__/email.test.js"],
  },
  {
    id: "band-follow-unsubscribe-header-matches-body-link",
    invariant:
      "CLAUDE.md 'Band Announcements' — the RFC 8058 one-click URL is the same unsubscribe URL shown in the band-follow email body",
    file: "functions/utils/bandFollowNotify.js",
    find: "headers: listUnsubscribeHeaders(unsubUrl),",
    replace: 'headers: listUnsubscribeHeaders("https://invalid.example/"),',
    tests: ["functions/utils/__tests__/bandFollowNotify.test.js"],
  },
  {
    id: "announce-digest-idempotency-key-sorts-performance-ids",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — a digest key is stable for the same task regardless of queue order",
    file: "functions/utils/announceDigest.js",
    find: "const sortedIds = performanceIds.map((id) => String(id)).sort();",
    replace: "const sortedIds = performanceIds.map((id) => String(id));",
    tests: ["functions/api/admin/bands/__tests__/announce-digest.test.js"],
  },
  {
    id: "band-follow-delivered-never-retried",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — a DELIVERED row is never retried, however old the claim",
    file: "functions/utils/bandFollowNotify.js",
    find: "WHERE performance_id = ? AND band_follow_id = ?\n              AND delivered_at IS NULL",
    replace: "WHERE performance_id = ? AND band_follow_id = ?",
    tests: ["functions/utils/__tests__/bandFollowNotify.test.js"],
  },
  {
    id: "band-follow-release-only-own-claim",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — a failed band-follow send releases only its own undelivered claim",
    file: "functions/utils/bandFollowNotify.js",
    find: ' AND claimed_at = ? AND delivered_at IS NULL",\n        )\n          .bind(performanceId, follower.id, claimedAt)',
    replace: '"\n        )\n          .bind(performanceId, follower.id)',
    tests: ["functions/utils/__tests__/bandFollowNotify.test.js"],
  },
  {
    id: "announce-digest-release-only-own-claim",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — a failed digest send releases only its own undelivered claims",
    file: "functions/utils/announceDigest.js",
    find: ' AND claimed_at = ? AND delivered_at IS NULL",\n            ).bind(item.performance_id, item.band_follow_id, task.claimedAt)',
    replace: '"\n            ).bind(item.performance_id, item.band_follow_id)',
    tests: ["functions/api/admin/bands/__tests__/announce-digest.test.js"],
  },
  {
    id: "subscriber-release-only-own-claim",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — a failed subscriber send releases only its own undelivered claim",
    file: "functions/utils/subscriberNotify.js",
    find: ' AND claimed_at = ? AND delivered_at IS NULL",\n      )\n        .bind(sub.id, eventId, kind, claimedAt)',
    replace: '"\n      )\n        .bind(sub.id, eventId, kind)',
    tests: ["functions/api/admin/events/__tests__/notify-subscribers.test.js"],
  },
  {
    id: "announce-double-opt-in-primary",
    invariant:
      "CLAUDE.md 'Band Announcements' — announcement emails target verified = 1 followers only (primary announce query)",
    file: "functions/api/admin/bands/[id].js",
    find: "AND verified = 1",
    replace: "",
    tests: ["functions/api/admin/bands/__tests__/announce-double-opt-in.test.js"],
  },
  {
    id: "announce-double-opt-in-resend",
    invariant:
      "CLAUDE.md 'Band Announcements' — resend-announcement recovers only followers without a notification row, and still only verified ones",
    file: "functions/api/admin/bands/[id]/resend-announcement.js",
    find: "AND bf.verified = 1",
    replace: "",
    tests: ["functions/api/admin/bands/__tests__/announce-double-opt-in.test.js"],
  },
  {
    id: "recipient-cap-follow",
    invariant:
      "CLAUDE.md 'Public senders cap emails per recipient' — POST /api/bands/:name/follow checks the per-address allowance before it writes",
    file: "functions/api/bands/[name]/follow.js",
    find: "const cap = await allowEmailToRecipient(DB, email);",
    replace: "const cap = { allowed: true };",
    tests: ["functions/utils/__tests__/recipientEmailCap.test.js"],
  },
  {
    id: "recipient-cap-follow-batch",
    invariant:
      "CLAUDE.md 'Public senders cap emails per recipient' — POST /api/bands/follow-batch checks the per-address allowance before it writes",
    file: "functions/api/bands/follow-batch.js",
    find: "const cap = await allowEmailToRecipient(DB, email);",
    replace: "const cap = { allowed: true };",
    tests: ["functions/utils/__tests__/recipientEmailCap.test.js"],
  },
  {
    id: "recipient-cap-subscribe",
    invariant:
      "CLAUDE.md 'Public senders cap emails per recipient' — POST /api/subscriptions/subscribe checks the per-address allowance before it emails",
    file: "functions/api/subscriptions/subscribe.js",
    find: "const cap = await allowEmailToRecipient(env.DB, email);",
    replace: "const cap = { allowed: true };",
    tests: ["functions/utils/__tests__/recipientEmailCap.test.js"],
  },
  {
    id: "recipient-cap-resend-activation",
    invariant:
      "CLAUDE.md 'Public senders cap emails per recipient' — POST /api/auth/resend-activation checks the per-address allowance before rotating the token",
    file: "functions/api/auth/resend-activation.js",
    find: "const cap = await allowEmailToRecipient(DB, email);",
    replace: "const cap = { allowed: true };",
    tests: ["functions/utils/__tests__/recipientEmailCap.test.js"],
  },
  {
    id: "recipient-cap-retention-like-swap",
    invariant:
      "CLAUDE.md 'Public senders cap emails per recipient' — the retention prune treats email-recipient keys and ordinary keys by different predicates (LIKE vs NOT LIKE)",
    file: "functions/api/admin/maintenance/retention.js",
    find: "key NOT LIKE '${RECIPIENT_KEY_PREFIX}%' AND",
    replace: "key LIKE '${RECIPIENT_KEY_PREFIX}%' AND",
    tests: ["functions/utils/__tests__/recipientEmailCap.test.js"],
  },
  {
    id: "recipient-cap-key-hashed",
    invariant:
      "CLAUDE.md 'Public senders cap emails per recipient' — the rate_limits key is a digest of the address, never the raw address",
    file: "functions/utils/recipientEmailCap.js",
    find: "`${RECIPIENT_KEY_PREFIX}${hash}`",
    replace: "`${RECIPIENT_KEY_PREFIX}${String(email).trim().toLowerCase()}`",
    tests: ["functions/utils/__tests__/recipientEmailCap.test.js"],
  },
  {
    id: "recipient-cap-counter-outlives-prune",
    invariant:
      "CLAUDE.md 'Public senders cap emails per recipient' — the retention job keeps a recipient counter for its whole 24 h window, or the cap resets itself",
    file: "functions/utils/recipientEmailCap.js",
    find: "RECIPIENT_EMAIL_WINDOW_SECONDS + 60 * 60;",
    replace: "1800;",
    tests: ["functions/utils/__tests__/recipientEmailCap.test.js"],
  },
  {
    id: "consent-confirmation-single-follow-timestamp",
    invariant:
      "CLAUDE.md 'Proof of consent is recorded at confirmation' — a single band follow confirmation records its SQLite timestamp",
    file: "functions/api/bands/[name]/confirm-follow.js",
    find: "confirmed_at = datetime('now'), ",
    replace: "",
    tests: ["functions/api/bands/__tests__/confirm-follow.test.js"],
  },
  {
    id: "confirmation-link-expires-follow",
    invariant:
      "CLAUDE.md 'Emailed links never act on a GET (#1291)' — pending band follow confirmation links expire after 7 days",
    file: "functions/api/bands/[name]/confirm-follow.js",
    find: "WHERE id = ? AND verified = 0 AND ${pendingConfirmationLiveSql()}`",
    replace: "WHERE id = ? AND verified = 0`",
    tests: ["functions/api/bands/__tests__/confirm-follow.test.js"],
  },
  {
    id: "consent-confirmation-subscription-timestamp",
    invariant:
      "CLAUDE.md 'Proof of consent is recorded at confirmation' — a subscription confirmation records its SQLite timestamp",
    file: "functions/api/subscriptions/verify.js",
    find: "SET verified = 1, confirmed_at = datetime('now')",
    replace: "SET verified = 1",
    tests: ["functions/api/subscriptions/__tests__/verify.test.js"],
  },
  {
    id: "confirmation-link-expires-subscription",
    invariant:
      "CLAUDE.md 'Emailed links never act on a GET (#1291)' — pending subscription confirmation links expire after 7 days",
    file: "functions/api/subscriptions/verify.js",
    find: "AND verified = 0\n        AND ${pendingConfirmationLiveSql()}",
    replace: "AND verified = 0\n        AND 1 = 0",
    tests: ["functions/api/subscriptions/__tests__/verify.test.js"],
  },
  {
    id: "email-link-get-does-not-confirm-follow",
    invariant:
      "CLAUDE.md 'Emailed links never act on a GET (#1291)' — GET renders a confirmation page and does not confirm a band follow",
    file: "functions/api/bands/[name]/confirm-follow.js",
    find: "  const { request } = context;\n  const token = await readEmailActionToken(request);",
    replace:
      "  const { request } = context;\n  const token = await readEmailActionToken(request);\n  return onRequestPost(context);",
    tests: ["functions/api/bands/__tests__/confirm-follow.test.js"],
  },
  {
    id: "email-link-get-does-not-verify-subscription",
    invariant:
      "CLAUDE.md 'Emailed links never act on a GET (#1291)' — GET renders a verification page and does not verify a subscription",
    file: "functions/api/subscriptions/verify.js",
    find: "  const { request } = context;\n  const token = await readEmailActionToken(request);",
    replace:
      "  const { request } = context;\n  const token = await readEmailActionToken(request);\n  return onRequestPost(context);",
    tests: ["functions/api/subscriptions/__tests__/verify.test.js"],
  },
  {
    id: "email-action-page-real-origin",
    invariant:
      "CLAUDE.md 'Emailed links never act on a GET (#1291)' — the action page overrides no-referrer so browsers send a real Origin, not null (403)",
    file: "functions/utils/emailActionPage.js",
    find: '<meta name="referrer" content="same-origin">',
    replace: "",
    tests: ["functions/utils/__tests__/emailActionPage.test.js"],
  },
  {
    id: "confirm-url-echo-dev-only",
    invariant:
      "CLAUDE.md 'Emailed links never act on a GET (#1291)' — confirmation URLs are echoed only for explicitly allowed development requests",
    file: "functions/api/bands/[name]/follow.js",
    find: "if (isNewFollow && !isEmailConfigured(env) && isDevRequest(request, env))",
    replace: "if (isNewFollow && !isEmailConfigured(env))",
    tests: ["functions/api/bands/__tests__/follow.test.js"],
  },
  {
    id: "after-midnight-threshold-server",
    invariant:
      "CLAUDE.md 'After-midnight band sorting' — AFTER_MIDNIGHT_THRESHOLD_HOUR is 6 (server canonical home); sets before this hour belong to the previous festival day",
    file: "functions/utils/eventDay.js",
    find: "AFTER_MIDNIGHT_THRESHOLD_HOUR = 6",
    replace: "AFTER_MIDNIGHT_THRESHOLD_HOUR = 0",
    tests: ["functions/utils/__tests__/eventDay.test.js"],
  },
  {
    id: "archive-race-predicate",
    invariant:
      "CLAUDE.md 'Public event visibility' — archiving carries `AND status IN ('draft','published')` so a concurrent archive between read and write cannot be silently overwritten (archive.js)",
    file: "functions/api/admin/events/[id]/archive.js",
    find: "AND status IN ('draft', 'published')",
    replace: "",
    tests: ["functions/api/admin/events/__tests__/events.test.js"],
  },
  {
    id: "patch-race-predicate-dynamic",
    invariant:
      "CLAUDE.md 'Public event visibility' — PATCH's status guard is built dynamically (statusGuardSql), so it is the site a `SET status` grep misses; it must still carry the concurrent-archive predicate",
    file: "functions/api/admin/events/[id].js",
    // A JS ternary, not SQL inside a template literal — the other three sites
    // are raw SQL, so this find string is a different shape by necessity. It is
    // also the site CLAUDE.md warns is invisible to the obvious grep, which is
    // exactly why leaving it unpinned was the wrong two-of-four to have.
    find: "const statusGuardSql = patchesStatus ? \" AND status IN ('draft', 'published')\" : \"\";",
    replace: 'const statusGuardSql = "";',
    tests: ["functions/api/admin/events/__tests__/events.test.js"],
  },
  {
    id: "put-toggle-race-predicate",
    invariant:
      "CLAUDE.md 'Public event visibility' — the PUT publish-toggle carries the same concurrent-archive predicate as archive.js and publish.js",
    file: "functions/api/admin/events/[id].js",
    find: "WHERE id = ? AND status IN ('draft', 'published')",
    replace: "WHERE id = ?",
    tests: ["functions/api/admin/events/__tests__/events.test.js"],
  },
  {
    id: "publish-race-predicate",
    invariant: "CLAUDE.md 'Public event visibility' — same race predicate on the publish route (POST .../publish)",
    file: "functions/api/admin/events/[id]/publish.js",
    find: "AND status IN ('draft', 'published')",
    replace: "",
    tests: ["functions/api/admin/events/__tests__/events.test.js"],
  },
  {
    id: "reset-password-session-invalidation",
    invariant:
      "CLAUDE.md 'Security Notes' — session invalidation on password reset: lucia.invalidateUserSessions equivalent must actually clear every session for that user",
    file: "functions/api/auth/reset-password-complete.js",
    find: "WHERE user_id = ?",
    replace: "WHERE user_id = ? AND 0",
    tests: ["functions/api/auth/__tests__/reset-password-complete.test.js"],
  },
  {
    id: "api-key-role-never-creator",
    invariant:
      "CLAUDE.md 'API keys' — context.data.user.role is the KEY's role, never its creator's; getting this backwards makes every key an admin key",
    file: "functions/api/admin/_middleware.js",
    find: "email: key.creator_email ?? null,\n        role: key.role,",
    replace: 'email: key.creator_email ?? null,\n        role: "admin",',
    tests: ["functions/api/admin/__tests__/api-key-auth.test.js"],
  },
  {
    id: "verify-api-key-active-user",
    invariant:
      "CLAUDE.md 'API keys' — verifyApiKey's INNER JOIN requires the creator's users.is_active = 1, a backstop for a deactivation path that forgets to revoke keys explicitly",
    file: "functions/utils/apiKeys.js",
    find: "WHERE k.key_hash = ? AND u.is_active = 1",
    replace: "WHERE k.key_hash = ?",
    tests: ["functions/api/admin/api-keys/__tests__/api-keys.test.js"],
  },
  {
    id: "reset-token-stored-hashed",
    invariant:
      "CLAUDE.md 'Password reset tokens are stored hashed' \u2014 the issuer stores the hash, never the token in the emailed link (#1354)",
    file: "functions/api/admin/users/[id]/reset-password.js",
    find: ".bind(userId, tokenHash, user.userId",
    replace: ".bind(userId, resetToken.token, user.userId",
    tests: ["functions/api/admin/users/__tests__/reset-password.test.js"],
  },
  {
    id: "reset-complete-lookup-binds-hash",
    invariant:
      "CLAUDE.md 'Password reset tokens are stored hashed' \u2014 completion hashes the submitted token, so the stored value is never redeemable (#1354)",
    file: "functions/api/auth/reset-password-complete.js",
    find: "      .bind(await hashResetToken(token))",
    replace: "      .bind(token)",
    tests: ["functions/api/auth/__tests__/reset-password-complete.test.js"],
  },
  {
    id: "reset-validate-lookup-binds-hash",
    invariant:
      "CLAUDE.md 'Password reset tokens are stored hashed' \u2014 validation hashes the submitted token before the lookup (#1354)",
    file: "functions/api/auth/reset-password/validate.js",
    find: "      .bind(await hashResetToken(token))",
    replace: "      .bind(token)",
    tests: ["functions/api/auth/__tests__/reset-password-validate.test.js"],
  },
  {
    id: "reset-issue-checks-email-before-side-effects",
    invariant:
      "CLAUDE.md 'Password reset tokens are stored hashed' \u2014 with email unconfigured the issuer mints nothing and signs nobody out (#1353)",
    file: "functions/api/admin/users/[id]/reset-password.js",
    find: '    if (!isEmailConfigured(env)) {\n      console.error("[ResetPassword] Email not configured");',
    replace: '    if (false) {\n      console.error("[ResetPassword] Email not configured");',
    tests: ["functions/api/admin/users/__tests__/reset-password.test.js"],
  },
  {
    id: "reset-issue-withdraws-undelivered-token",
    invariant:
      "CLAUDE.md 'Password reset tokens are stored hashed' \u2014 a token whose email failed is withdrawn, not left live (#1353)",
    file: "functions/api/admin/users/[id]/reset-password.js",
    find: '        await DB.prepare("DELETE FROM password_reset_tokens WHERE token = ? AND used = 0").bind(tokenHash).run();',
    replace: "        void tokenHash;",
    tests: ["functions/api/admin/users/__tests__/reset-password.test.js"],
  },
  {
    id: "venue-delay-skips-cancelled-sets",
    invariant: "CLAUDE.md 'Venue running late' \u2014 a running-late shift never moves a cancelled set (#1249)",
    file: "functions/utils/venueDelay.js",
    find: "    if (performance.is_cancelled) continue;",
    replace: "",
    tests: ["functions/api/admin/events/__tests__/venue-delay.test.js"],
  },
  {
    id: "venue-delay-skips-started-sets",
    invariant:
      "CLAUDE.md 'Venue running late' \u2014 a set that has started on the Toronto festival clock is never moved (#1249)",
    file: "functions/utils/venueDelay.js",
    find: "    if (hasStarted(performance, eventDate, now)) continue;",
    replace: "",
    tests: ["functions/api/admin/events/__tests__/venue-delay.test.js"],
  },
  {
    id: "venue-delay-refuses-crossing-6am",
    invariant:
      "CLAUDE.md 'Venue running late' \u2014 a shift across 06:00 into another festival day is refused, not applied (#1249)",
    file: "functions/utils/venueDelay.js",
    find: "    if (!startInDay || !endInDay) {",
    replace: "    if (false) {",
    tests: ["functions/api/admin/events/__tests__/venue-delay.test.js"],
  },
  {
    id: "venue-delay-claim-blocks-stacked-shifts",
    invariant:
      "CLAUDE.md 'Venue running late' \u2014 set UPDATEs apply only under this request's claim, so simultaneous shifts never stack (#1249)",
    file: "functions/api/admin/events/[id]/venues/[venueId]/delay.js",
    find: "           WHERE id = ? AND event_id = ? AND ${CLAIMED_SQL}`,",
    replace: "           WHERE id = ? AND event_id = ? AND (? OR ? OR ? OR 1)`,",
    tests: ["functions/api/admin/events/__tests__/venue-delay.test.js"],
  },
  {
    id: "invite-list-returns-no-code",
    invariant:
      "CLAUDE.md 'Invite codes are stored hashed' — GET /api/admin/invite-codes projects no `code` column; a stolen admin session must not read an unused invite (#1334)",
    file: "functions/api/admin/invite-codes.js",
    find: "        ic.code_prefix,\n        ic.email,",
    replace: "        ic.code,\n        ic.code_prefix,\n        ic.email,",
    tests: ["functions/api/admin/invite-codes/__tests__/invite-codes.test.js"],
  },
  {
    id: "invite-signup-lookup-binds-hash",
    invariant:
      "CLAUDE.md 'Invite codes are stored hashed' — signup hashes the submitted code before the SELECT, so the plaintext matches and a submitted sha256:/retired: value matches nothing (#1334)",
    file: "functions/api/admin/auth/signup.js",
    find: "      .bind(inviteCodeHash)\n      .first();",
    replace: "      .bind(inviteCode)\n      .first();",
    tests: ["functions/api/admin/invite-codes/__tests__/invite-codes.test.js"],
  },
  {
    id: "invite-open-check-requires-unused-used-at",
    invariant:
      "CLAUDE.md 'Invite codes are stored hashed' — signup treats an invite as open only while used_at IS NULL too, because deleting the user nulls used_by_user_id and would reopen it",
    file: "functions/api/admin/auth/signup.js",
    find: "      AND used_by_user_id IS NULL\n      AND used_at IS NULL\n",
    replace: "      AND used_by_user_id IS NULL\n",
    tests: ["functions/api/admin/invite-codes/__tests__/invite-codes.test.js"],
  },
  {
    id: "invite-signup-claim-binds-hash",
    invariant:
      "CLAUDE.md 'Invite codes are stored hashed' — the claim UPDATE matches the digest too, so a redeemed invite is actually marked used (#1334)",
    file: "functions/api/admin/auth/signup.js",
    find: ").bind(activationToken, inviteCodeHash, activationToken),",
    replace: ").bind(activationToken, inviteCode, activationToken),",
    tests: ["functions/api/admin/invite-codes/__tests__/invite-codes.test.js"],
  },
  {
    id: "invite-users-route-stores-hash",
    invariant:
      "CLAUDE.md 'Invite codes are stored hashed' — POST /api/admin/users stores the digest, never the plaintext it emails (#1334)",
    file: "functions/api/admin/users.js",
    find: ".bind(codeHash, codePrefix, email, role, currentUser.userId, expiresAt)",
    replace: ".bind(inviteCode, codePrefix, email, role, currentUser.userId, expiresAt)",
    tests: ["functions/api/admin/invite-codes/__tests__/invite-codes.test.js"],
  },
  {
    id: "public-event-visibility-gate",
    invariant:
      "CLAUDE.md 'Public event visibility is status, never is_published' — publicEventStatusSql() must gate to published/archived only, never draft",
    file: "functions/utils/eventVisibility.js",
    find: "return `${columnRef(alias)} IN ('published', 'archived')`;",
    replace: "return `${columnRef(alias)} IN ('draft', 'published', 'archived')`;",
    tests: ["functions/api/events/__tests__/public.test.js"],
  },
  {
    id: "schedule-current-cutoff-is-toronto-festival-day",
    invariant:
      "CLAUDE.md 'Server-side' (today/now is Toronto-local) — /api/schedule?event=current stays eligible through 06:00 Toronto festival day, not a UTC hour offset",
    file: "functions/api/schedule.js",
    find: "AND COALESCE(end_date, date) >= ?\n        ORDER BY date ASC\n        LIMIT 1\n      `,\n      )\n        .bind(festivalDay)",
    replace:
      "AND COALESCE(end_date, date) >= date('now', '-6 hours')\n        ORDER BY date ASC\n        LIMIT 1\n      `,\n      )",
    tests: ["functions/api/__tests__/schedule-reveal.test.js"],
  },
  {
    id: "public-event-cutoff-is-toronto-festival-day",
    invariant:
      "CLAUDE.md 'Server-side' (today/now is Toronto-local) — /api/events/public uses the Toronto festival day cutoff rather than a UTC hour offset",
    file: "functions/api/events/public.js",
    find: "if (upcoming) {\n      query += ` AND COALESCE(e.end_date, e.date) >= ?`;\n      params.push(festivalDay);\n    }",
    replace: "if (upcoming) {\n      query += ` AND COALESCE(e.end_date, e.date) >= date('now', '-6 hours')`;\n    }",
    tests: ["functions/api/events/__tests__/public.test.js"],
  },
  {
    id: "reveal-mode-is-announced-gate",
    invariant:
      "CLAUDE.md 'Pulling a band from a live lineup' — public reads must guard with (reveal_mode = 0 OR is_announced = 1); this is one of 8 files carrying the gate, picked as the representative for v1",
    file: "functions/api/schedule.js",
    find: "AND (? = 0 OR p.is_announced = 1)",
    replace: "AND (? = 0 OR 1 = 1)",
    tests: ["functions/api/__tests__/schedule-reveal.test.js"],
  },
  {
    id: "ical-no-fabricated-start-time",
    invariant:
      "CLAUDE.md 'Pulling a band from a live lineup' — the iCal feed never invents a time for an unscheduled set (#1079)",
    file: "functions/api/feeds/ical.js",
    find: "if (!band.start_time) continue;",
    replace: "",
    tests: ["functions/api/feeds/__tests__/ical.test.js"],
  },
  {
    id: "ical-end-time-derived-not-constant",
    invariant:
      "CLAUDE.md 'Pulling a band from a live lineup' — a missing end_time is a one-hour DURATION, never a constant that can precede the start (#1079, #1261)",
    file: "functions/api/feeds/ical.js",
    find: "const endTime = band.end_time;",
    replace: 'const endTime = band.end_time || "21:00";',
    tests: ["functions/api/feeds/__tests__/ical.test.js"],
  },
  {
    id: "outbound-fetch-fixed-address-only",
    invariant:
      "CLAUDE.md 'Outbound requests go only to fixed addresses (SSRF)' — every server fetch targets a hard-coded https URL or env.ASSETS",
    file: "functions/utils/turnstile.js",
    find: 'const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";',
    replace:
      'const SITEVERIFY_URL = globalThis.SITEVERIFY_OVERRIDE || "https://challenges.cloudflare.com/turnstile/v0/siteverify";',
    tests: ["functions/utils/__tests__/outboundFetchGuard.test.js"],
  },
  {
    id: "retention-auth-attempts-30-days",
    invariant:
      "CLAUDE.md 'Retention windows are a published promise' — login attempts (emails, IPs) are deleted after 30 days, as the privacy policy states",
    file: "functions/api/admin/maintenance/retention.js",
    find: "DELETE FROM auth_attempts WHERE created_at < datetime('now', '-30 days')",
    replace: "DELETE FROM auth_attempts WHERE created_at < datetime('now', '-3000 days')",
    tests: ["functions/api/admin/maintenance/__tests__/retentionWindows.test.js"],
  },
  {
    id: "retention-api-key-request-90-days",
    invariant:
      "CLAUDE.md 'Retention windows are a published promise' — api_key.request audit rows are pruned at 90 days, the rest of audit_log at 1 year",
    file: "functions/api/admin/maintenance/retention.js",
    find: "action = 'api_key.request' AND created_at < datetime('now', '-90 days')",
    replace: "action = 'api_key.request' AND created_at < datetime('now', '-9000 days')",
    tests: ["functions/api/admin/maintenance/__tests__/retentionWindows.test.js"],
  },
  {
    id: "retention-unconfirmed-signups",
    invariant:
      "CLAUDE.md 'Retention windows are a published promise' — never-confirmed follow and subscription requests are deleted after 7 days",
    file: "functions/api/admin/maintenance/retention.js",
    find: "() => DB.prepare(`DELETE FROM band_follows WHERE verified = 0 AND NOT (${pendingConfirmationLiveSql()})`).run(),",
    replace: "() => DB.prepare(`DELETE FROM band_follows WHERE verified = 0 AND 1 = 0`).run(),",
    tests: ["functions/api/admin/maintenance/__tests__/retentionWindows.test.js"],
  },
  {
    id: "scheduled-retention-failure-is-visible",
    invariant:
      "CLAUDE.md 'Retention windows are a published promise' — a failed retention step turns the daily scheduled run red",
    file: "functions/scheduled/aggregate-stats.js",
    find: 'failures.push("retention");',
    replace: "void 0;",
    tests: ["functions/api/internal/__tests__/run-scheduled.test.js"],
  },
  {
    id: "announce-digest-unconfirmed-is-visible",
    invariant:
      "CLAUDE.md 'A claim is not a delivery record (#1152)' — a delivered email whose confirmation write fails remains sent but makes the scheduled run red",
    file: "functions/utils/announceDigest.js",
    find: "unconfirmed++;",
    replace: "void 0;",
    tests: ["functions/api/admin/bands/__tests__/announce-digest.test.js"],
  },
  {
    id: "time-validation-range-not-just-shape",
    invariant:
      "CLAUDE.md 'Time validation is shape AND range' — admin write paths bound hours/minutes via isValidTime, never an inline shape regex (#1089)",
    file: "functions/api/admin/bands.js",
    find: "(startTime && !isValidTime(startTime).valid)",
    replace: "(startTime && !/^\\d{2}:\\d{2}$/.test(startTime))",
    tests: ["functions/api/admin/bands/__tests__/bands.test.js"],
  },
  {
    id: "time-validation-range-put-performance",
    invariant:
      "CLAUDE.md 'Time validation is shape AND range' — the PUT performance path bounds hours/minutes too (#1089)",
    file: "functions/api/admin/bands/[id].js",
    find: 'startTime !== undefined && startTime !== "" && !isValidTime(startTime).valid',
    replace: 'startTime !== undefined && startTime !== "" && !/^\\d{2}:\\d{2}$/.test(startTime)',
    tests: ["functions/api/admin/bands/__tests__/bands.test.js"],
  },
  {
    id: "time-validation-range-put-profile",
    invariant: "CLAUDE.md 'Time validation is shape AND range' — the profile PUT path bounds hours/minutes too (#1089)",
    file: "functions/utils/bandProfileResource.js",
    find: 'startTime !== undefined && startTime !== "" && !isValidTime(startTime).valid',
    replace: 'startTime !== undefined && startTime !== "" && !/^\\d{2}:\\d{2}$/.test(startTime)',
    tests: ["functions/api/admin/bands/__tests__/bands.test.js"],
  },
  {
    id: "schedule-save-final-state",
    invariant:
      "CLAUDE.md 'Multi-row schedule saves check the FINAL state (#1161)' — a swap is validated against the merged draft, not each row against stored times",
    file: "functions/api/admin/events/[id]/schedule.js",
    // Reproduces the ORIGINAL bug: each changed row checked against the
    // others' stored values. A plain "check the stored rows" mutation is NOT
    // caught by the swap test (stored-vs-stored is always clean for a swap);
    // this per-row form is what the swap test exists to catch.
    find: "const conflicts = detectDraftConflicts(finalRows, { eventDate: event.date, changedIds: ids });",
    replace:
      "const conflicts = changes.flatMap((c) => detectDraftConflicts(performances.map((p) => (p.id === c.id ? { ...p, start_time: c.startTime, end_time: c.endTime, venue_id: c.venueId } : p)), { eventDate: event.date, changedIds: new Set([c.id]) }));",
    tests: ["functions/api/admin/events/__tests__/schedule.test.js"],
  },
  {
    id: "uncancel-conflict-check",
    invariant:
      "CLAUDE.md 'Pulling a band from a live lineup' — un-cancelling into a slot a replacement now holds is refused, never double-booked",
    file: "functions/api/admin/bands/[id].js",
    find: "if (hasCancelled && isCancelled === 0 && performance.is_cancelled === 1) {",
    replace: "if (false) {",
    tests: ["functions/api/admin/bands/__tests__/cancel-toggle.test.js"],
  },
  {
    id: "cancelled-rows-never-conflict-draft-b-side",
    invariant:
      "CLAUDE.md 'Multi-row schedule saves check the FINAL state (#1161)' — a cancelled row is free when it is the SECOND row of a pair, not only the first",
    file: "functions/utils/timeConflicts.js",
    // Survived every test until the pair was also asserted in [active,
    // cancelled] order -- the a-side guard masked it (CodeRabbit).
    find: "if (b.is_cancelled || b.venue_id == null || !b.start_time || !b.end_time || a.venue_id !== b.venue_id) continue;",
    replace: "if (b.venue_id == null || !b.start_time || !b.end_time || a.venue_id !== b.venue_id) continue;",
    tests: ["functions/utils/__tests__/timeConflicts.test.js"],
  },
  {
    id: "cancelled-rows-never-conflict-draft",
    invariant:
      "CLAUDE.md 'Multi-row schedule saves check the FINAL state (#1161)' — cancelled rows never conflict on either side of a draft schedule check",
    file: "functions/utils/timeConflicts.js",
    find: "if (a.is_cancelled || a.venue_id == null || !a.start_time || !a.end_time) continue;",
    replace: "if (a.venue_id == null || !a.start_time || !a.end_time) continue;",
    tests: ["functions/utils/__tests__/timeConflicts.test.js"],
  },
  {
    id: "schedule-save-archive-race",
    invariant:
      "CLAUDE.md 'Multi-row schedule saves check the FINAL state (#1161)' — an event archived mid-request is not written to",
    file: "functions/api/admin/events/[id]/schedule.js",
    find: "result?.meta?.changes === 0",
    replace: "result?.meta?.changes === -1",
    tests: ["functions/api/admin/events/__tests__/schedule.test.js"],
  },
  {
    id: "schedule-save-audit-predicate",
    invariant:
      "CLAUDE.md 'Multi-row schedule saves check the FINAL state (#1161)' — the audit row shares the UPDATE's status predicate, so a concurrent publish toggle cannot leave a change unattributed",
    file: "functions/api/admin/events/[id]/schedule.js",
    find: 'where: { id: eventId, status: ["draft", "published"] }',
    replace: "where: { id: eventId, status: event.status }",
    tests: ["functions/api/admin/events/__tests__/schedule.test.js"],
  },
  {
    id: "schedule-save-absent-meta",
    invariant:
      "CLAUDE.md 'Multi-row schedule saves check the FINAL state (#1161)' — only an explicit meta.changes === 0 means not applied",
    file: "functions/api/admin/events/[id]/schedule.js",
    find: "updateResults.some((result) => result?.meta?.changes === 0)",
    replace: "updateResults.some((result) => !result?.meta?.changes)",
    tests: ["functions/api/admin/events/__tests__/schedule.test.js"],
  },
  {
    id: "homepage-links-only-current-events",
    invariant:
      "CLAUDE.md 'The sitemap is the event-discovery signal — spend it (#1158)' — the homepage links only published events that have not concluded",
    file: "functions/index.js",
    find: "WHERE ${publishedEventStatusSql()} AND NOT ${concludedEventSql()}",
    replace: "WHERE ${publishedEventStatusSql()} AND (? IS NOT NULL)",
    tests: ["functions/__tests__/homepage.test.js"],
  },
  {
    id: "event-jsonld-price-zero",
    invariant:
      "CLAUDE.md 'SSR owns identity meta and JSON-LD' — a stored free-event price is emitted as 0 rather than omitted by a truthiness check",
    file: "functions/event/[slug].js",
    find: "const hasTicketPrice = Number.isFinite(event.ticket_price);",
    replace: "const hasTicketPrice = Boolean(event.ticket_price);",
    tests: ["functions/event/__tests__/slug.test.js"],
  },
  {
    id: "event-jsonld-organizer-url-omission",
    invariant:
      "CLAUDE.md 'SSR owns identity meta and JSON-LD' — a presenter URL is included only when the presenter exists and the URL sanitizes",
    file: "functions/event/[slug].js",
    find: "...(safePresentedByUrl ? { url: safePresentedByUrl } : {}),",
    replace: "url: safePresentedByUrl,",
    tests: ["functions/event/__tests__/slug.presenter-age.test.js"],
  },
  {
    id: "ical-after-midnight-calendar-date",
    invariant:
      "CLAUDE.md 'After-midnight band sorting' — the iCal feed stamps a set starting before the threshold with the NEXT calendar day, since the stored date is the festival day",
    file: "functions/api/feeds/ical.js",
    find: "startTime < AFTER_MIDNIGHT_THRESHOLD_TIME ? nextCalendarDay(eventDate) : eventDate",
    replace: "eventDate",
    tests: ["functions/api/feeds/__tests__/ical.test.js"],
  },
  {
    id: "pbkdf2-workers-iteration-cap",
    invariant:
      "CLAUDE.md 'PBKDF2, not bcrypt' — production Workers refuse PBKDF2 above 100,000 iterations, so hashPassword must stay at or under the cap (600,000 broke signup and password reset from #426 until 2026-10-10)",
    file: "functions/utils/crypto.js",
    find: "export const DEFAULT_ITERATIONS = WORKERS_PBKDF2_MAX_ITERATIONS;",
    replace: "export const DEFAULT_ITERATIONS = 600000;",
    tests: ["functions/utils/__tests__/crypto.test.js"],
  },
  {
    id: "users-role-trigger-refuses-unknown-role",
    invariant:
      "CLAUDE.md 'RBAC Roles' — users.role outside viewer/editor/admin is refused at the database, so an inherited-key role like 'constructor' can never be stored (#1287)",
    file: "database/setup-complete.sql",
    find: "BEFORE INSERT ON users\nWHEN NEW.role NOT IN ('viewer', 'editor', 'admin')",
    replace: "BEFORE INSERT ON users\nWHEN 0",
    tests: ["functions/utils/__tests__/roleCheckTriggers.test.js"],
  },
  {
    id: "signup-invite-single-redeem",
    invariant:
      "CLAUDE.md 'RBAC Roles' — an invite code creates at most one account: the user INSERT fires only while the invite is still unclaimed, in the same batch as the claim (#1255)",
    file: "functions/api/admin/auth/signup.js",
    // Keeps ONE bind parameter so the mutant fails on the race, not on a
    // bind-count error (CLAUDE.md "Hand-rolled mutation runs").
    find: "WHERE ${INVITE_STILL_OPEN}`,",
    replace: "WHERE ? IS NOT NULL`,",
    tests: ["functions/api/admin/auth/__tests__/signup.test.js"],
  },
  {
    id: "signup-invite-claim-requires-inserted-user",
    invariant:
      "CLAUDE.md 'RBAC Roles' — the invite claim fires only for the user this batch inserted, so an invite that closes mid-request is never stamped used with no user behind it (#1252 review)",
    file: "functions/api/admin/auth/signup.js",
    // Keeps the bind count so the mutant fails on the assertion, not a bind error.
    find: "AND EXISTS (SELECT 1 FROM users WHERE activation_token = ?)`,",
    replace: "AND ? IS NOT NULL`,",
    tests: ["functions/api/admin/auth/__tests__/signup.test.js"],
  },
  {
    id: "signup-invite-claim-no-second-clock-check",
    invariant:
      "CLAUDE.md 'RBAC Roles' — the invite claim does not re-check expiry; datetime('now') is not stable across a batch, so an invite expiring between INSERT and claim would leave a 201 signup with its invite reusable (#1252 review)",
    file: "functions/api/admin/auth/signup.js",
    find: "WHERE code = ? AND used_by_user_id IS NULL AND used_at IS NULL\n",
    replace: "WHERE code = ? AND used_by_user_id IS NULL AND used_at IS NULL AND expires_at > datetime('now')\n",
    tests: ["functions/api/admin/auth/__tests__/signup.test.js"],
  },
  {
    id: "event-edit-slug-validated",
    invariant:
      "CLAUDE.md 'Security Notes' — PUT /events/:id/edit enforces the event schema's slug format (#1276); a slug lands unescaped in sitemap <loc> and email hrefs",
    file: "functions/api/admin/events/[id]/edit.js",
    find: "if (!identity.valid) {",
    replace: "if (false) {",
    tests: ["functions/api/admin/events/__tests__/edit.test.js"],
  },
  {
    id: "event-duplicate-slug-validated",
    invariant:
      "CLAUDE.md 'Security Notes' — POST /events/:id/duplicate enforces the event schema's slug format (#1276)",
    file: "functions/api/admin/events/[id]/duplicate.js",
    find: "if (!identity.valid) {",
    replace: "if (false) {",
    tests: ["functions/api/admin/events/__tests__/events.test.js"],
  },
  {
    id: "sitemap-escapes-event-slug",
    invariant:
      "CLAUDE.md 'Security Notes' — every value interpolated into sitemap XML is escaped; a legacy slug with XML metacharacters must not reach <loc> raw (#1276)",
    file: "functions/sitemap.xml.js",
    find: "<loc>https://settimes.ca/event/${escapeXml(event.slug)}</loc>",
    replace: "<loc>https://settimes.ca/event/${event.slug}</loc>",
    tests: ["functions/__tests__/sitemap.test.js"],
  },
  {
    id: "sitemap-escapes-recap-slug",
    invariant:
      "CLAUDE.md 'Security Notes' — the recap <loc> escapes the event slug as well as the event <loc> does (#1276)",
    file: "functions/sitemap.xml.js",
    find: "<loc>https://settimes.ca/events/${escapeXml(event.slug)}/recap</loc>",
    replace: "<loc>https://settimes.ca/events/${event.slug}/recap</loc>",
    tests: ["functions/__tests__/sitemap.test.js"],
  },
  {
    id: "ical-description-single-escape",
    invariant:
      "CLAUDE.md 'Pulling a band from a live lineup' — the iCal feed encodes a DESCRIPTION line break once; joining with a literal backslash-n before escaping makes calendars show the text \\n",
    file: "functions/api/feeds/ical.js",
    find: '.join("\\n");',
    replace: '.join("\\\\n");',
    tests: ["functions/api/feeds/__tests__/ical.test.js"],
  },
  {
    id: "ical-feed-cutoff-is-toronto-festival-day",
    invariant:
      "CLAUDE.md 'Server-side' (today/now is Toronto-local) — the iCal feed keeps an event until 06:00 Toronto after its last day; a UTC cutoff emptied it at 8 PM on Vol 18's show night",
    file: "functions/api/feeds/ical.js",
    find: "const params = [eventLocalFestivalToday()];",
    replace: "const params = [new Date().toISOString().slice(0, 10)];",
    tests: ["functions/api/feeds/__tests__/ical.test.js"],
  },
  {
    id: "no-utc-calendar-day-in-functions",
    invariant:
      "CLAUDE.md 'Server-side' (today/now is Toronto-local) — a UTC calendar day anywhere in functions/ fails the source-scanning guard",
    file: "functions/api/events/timeline.js",
    find: "const today = eventLocalToday(); // YYYY-MM-DD",
    replace: "const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD",
    tests: ["functions/utils/__tests__/utcCalendarDayGuard.test.js"],
  },
  {
    id: "rbac-publish-requires-editor",
    invariant: "CLAUDE.md 'RBAC Roles' — publishing an event requires editor permission or higher",
    file: "functions/api/admin/events/[id]/publish.js",
    find: 'checkPermission(context, "editor")',
    replace: 'checkPermission(context, "viewer")',
    tests: ["functions/api/admin/__tests__/rbacBoundaries.test.js"],
  },
  {
    id: "rbac-caller-role-own-key",
    invariant:
      "CLAUDE.md 'RBAC Roles' — checkPermission looks up the caller's role as an own key; a bare lookup lets a role named constructor or __proto__ pass every check",
    file: "functions/api/admin/_middleware.js",
    find: "Object.hasOwn(roleHierarchy, role) ? roleHierarchy[role] : 0",
    replace: "roleHierarchy[role] || 0",
    tests: ["functions/api/admin/__tests__/checkPermissionCallerRole.test.js"],
  },
  {
    id: "api-csp-enforced-unless-dev",
    invariant:
      "CLAUDE.md 'Content-Security-Policy (strict, no unsafe-inline) — TWO sources' — the API CSP is enforced unless isDevRequest says dev; production runs with ENVIRONMENT unset, so an `=== \"production\"` check left it report-only (#1273)",
    file: "functions/_middleware.js",
    find: "        !isDevRequest(request, env);",
    replace: '        env?.ENVIRONMENT === "production";',
    tests: ["functions/__tests__/environmentFailsClosed.test.js"],
  },
  {
    id: "mfa-required-middleware-gate",
    invariant:
      "CLAUDE.md 'RBAC Roles' — an admin or editor without 2FA reaches only the enrolment routes; every other admin route answers 403 MFA_SETUP_REQUIRED (#1253)",
    file: "functions/api/admin/_middleware.js",
    find: "    const mfaResponse = mfaSetupRequiredResponse(request, normalizedUser);",
    replace: "    const mfaResponse = null;",
    tests: ["functions/api/admin/__tests__/mfaRequired.test.js"],
  },
  {
    id: "mfa-required-checkpermission-fallback",
    invariant:
      "CLAUDE.md 'RBAC Roles' — checkPermission's own session fallback enforces the same 2FA enrolment rule as the middleware (#1253)",
    file: "functions/api/admin/_middleware.js",
    find: "  const fallbackMfaResponse = mfaSetupRequiredResponse(request, normalizedUser);",
    replace: "  const fallbackMfaResponse = null;",
    tests: ["functions/api/admin/__tests__/mfaRequired.test.js"],
  },
  {
    id: "mfa-disable-refused-for-required-roles",
    invariant: "CLAUDE.md 'RBAC Roles' — admins and editors cannot turn 2FA off (#1253)",
    file: "functions/api/admin/mfa/disable.js",
    find: "  if (mfaRequiredForRole(auth.user.role)) {",
    replace: "  if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-settings.test.js"],
  },
  {
    id: "mfa-enable-revokes-password-only-sessions",
    invariant:
      "CLAUDE.md 'RBAC Roles' — enrolling in 2FA revokes every session opened with the password alone, so a phished pre-enrolment session cannot inherit full access (#1253 review)",
    file: "functions/api/admin/mfa/enable.js",
    find: "  await lucia.invalidateUserSessions(userId);",
    replace: "  // sessions kept",
    tests: ["functions/api/admin/__tests__/mfaRequired.test.js"],
  },
  {
    id: "mfa-enable-bound-to-verified-secret",
    invariant:
      "CLAUDE.md 'RBAC Roles' — enabling 2FA writes only if the pending secret is still the one the code was verified against, so a second setup or an admin reset mid-request wins (#1253 review)",
    file: "functions/api/admin/mfa/enable.js",
    find: "     WHERE id = ? AND totp_enabled = 0 AND totp_secret = ?\n",
    replace: "     WHERE id = ? AND totp_enabled = 0 AND ? IS NOT NULL\n",
    tests: ["functions/api/admin/mfa/__tests__/mfa-settings.test.js"],
  },
  {
    id: "mfa-enable-session-dropped-after-concurrent-reset",
    invariant:
      "CLAUDE.md 'RBAC Roles' — a reset committing between enrolment and session issue must not leave the freshly issued session alive (#1253 review)",
    file: "functions/api/admin/mfa/enable.js",
    find: "  if (!stillEnrolled) {",
    replace: "  if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-settings.test.js"],
  },
  {
    id: "mfa-login-backup-code-spend-not-restored",
    invariant:
      "CLAUDE.md 'RBAC Roles' — a login writes backup codes only over the list it verified, so a concurrent login cannot restore a spent code (#1253 review)",
    file: "functions/api/admin/auth/mfa/verify.js",
    find: "AND backup_codes IS ?`,",
    replace: "AND (? IS NULL OR 1)`,",
    tests: ["functions/api/admin/auth/__tests__/mfa.test.js"],
  },
  {
    id: "mfa-backup-codes-regen-bound-to-enrolled-secret",
    invariant:
      "CLAUDE.md 'RBAC Roles' — regenerating backup codes never writes an old secret back over an admin reset (#1253 review)",
    file: "functions/api/admin/mfa/backup-codes.js",
    find: 'WHERE id = ? AND totp_enabled = 1 AND totp_secret = ?",',
    replace: 'WHERE id = ? AND ? IS NOT NULL",',
    tests: ["functions/api/admin/mfa/__tests__/mfa-settings.test.js"],
  },
  {
    id: "mfa-reenrol-login-ignores-pending-secret",
    invariant:
      "CLAUDE.md 'RBAC Roles' — a pending (re-enrolment) secret never authenticates anything: login keeps verifying against totp_secret, so the old app works until enable swaps them (#1318)",
    file: "functions/api/admin/auth/mfa/verify.js",
    find: "             u.totp_secret,\n",
    replace: "             COALESCE(u.totp_pending_secret, u.totp_secret) AS totp_secret,\n",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reenrol-enable-clears-pending",
    invariant:
      "CLAUDE.md 'RBAC Roles' — confirming the new authenticator app promotes the pending secret and clears it, so it cannot be promoted twice or linger (#1318)",
    file: "functions/api/admin/mfa/enable.js",
    find: "         SET totp_secret = ?, totp_pending_secret = NULL, backup_codes = ?, totp_last_step = ?\n",
    replace: "         SET totp_secret = ?, backup_codes = ?, totp_last_step = ?\n",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reenrol-enable-bound-to-pending-secret",
    invariant:
      "CLAUDE.md 'RBAC Roles' — the swap is bound to the pending secret the code was verified against, so a second setup mid-confirm wins instead of being overwritten (#1318)",
    file: "functions/api/admin/mfa/enable.js",
    find: "totp_secret IS ? AND totp_pending_secret = ?`,",
    replace: "totp_secret IS ? AND ? IS NOT NULL`,",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reenrol-setup-requires-code",
    invariant:
      "CLAUDE.md 'RBAC Roles' — setup while 2FA is on refuses without a code (409 MFA_CODE_REQUIRED_TO_REENROL) and stores nothing (#1318)",
    file: "functions/api/admin/mfa/setup.js",
    find: "    if (!code) {",
    replace: "    if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reenrol-setup-requires-valid-proof",
    invariant:
      "CLAUDE.md 'RBAC Roles' — setup while 2FA is on stores a pending secret only after a valid current TOTP or backup code (#1318)",
    file: "functions/api/admin/mfa/setup.js",
    find: "    if (matchedStep === null && remainingBackupCodes === null) {",
    replace: "    if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reenrol-guesses-share-the-user-limit",
    invariant:
      "CLAUDE.md 'RBAC Roles' — re-enrolment proof guesses count toward the per-user 2FA guess limit shared with step-up, backup-codes and disable (#1318)",
    file: "functions/utils/authAttempts.js",
    find: "    AUTH_ATTEMPT_TYPES.mfaReenrol,\n  ];",
    replace: "  ];",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reenrol-pending-secret-expires",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 an abandoned re-enrolment's pending secret is refused after 15 minutes, so a later session holder cannot confirm it (#1318)",
    file: "functions/api/admin/mfa/enable.js",
    find: "  if (reenrolling && !pendingSecretIsLive(user.totp_pending_set_at)) {",
    replace: "  if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reenrol-confirm-goes-through-guess-gate",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 confirming a re-enrolment in mfa/enable guesses through beginMfaGuess, sharing the per-user limit (#1318)",
    file: "functions/api/admin/mfa/enable.js",
    find: "  if (reenrolling) {\n    const gate = await beginMfaGuess(DB, {",
    replace: "  if (false) {\n    const gate = await beginMfaGuess(DB, {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-reset-clears-pending-secret",
    invariant:
      "CLAUDE.md 'RBAC Roles' — an admin 2FA reset clears the pending re-enrolment secret with the factor (#1318)",
    file: "functions/api/admin/users/[id]/reset-mfa.js",
    find: "totp_secret = NULL, totp_pending_secret = NULL, backup_codes = NULL",
    replace: "totp_secret = NULL, backup_codes = NULL",
    tests: ["functions/api/admin/users/__tests__/reset-mfa.test.js"],
  },
  {
    id: "mfa-disable-clears-pending-secret",
    invariant: "CLAUDE.md 'RBAC Roles' — disabling 2FA clears the pending re-enrolment secret with the factor (#1318)",
    file: "functions/api/admin/mfa/disable.js",
    find: "totp_secret = NULL, totp_pending_secret = NULL, backup_codes = NULL",
    replace: "totp_secret = NULL, backup_codes = NULL",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-first-setup-clears-pending-secret",
    invariant:
      "CLAUDE.md 'RBAC Roles' — a first-time setup overwriting the factor clears any leftover pending secret (#1318)",
    file: "functions/api/admin/mfa/setup.js",
    find: "SET totp_secret = ?, totp_pending_secret = NULL, totp_enabled = 0",
    replace: "SET totp_secret = ?, totp_enabled = 0",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-enrolment-notice-sent",
    invariant:
      "CLAUDE.md 'RBAC Roles' — every account owner is emailed when 2FA is turned on, first-time or by re-enrolment (#1318)",
    file: "functions/utils/mfaNotice.js",
    find: "  if (!to) {",
    replace: "  if (true) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "mfa-enrolment-notice-failure-never-fails-enable",
    invariant:
      "CLAUDE.md 'RBAC Roles' — a failed enrolment notice is logged and never fails or alters the committed enable (#1318)",
    file: "functions/utils/mfaNotice.js",
    find: "  })().catch((error) => {",
    replace: "  })().catch((error) => {\n    throw error;",
    tests: ["functions/api/admin/mfa/__tests__/mfa-reenrol.test.js"],
  },
  {
    id: "step-up-reset-mfa-requires-step-up",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' — resetting another user's 2FA needs a recent step-up on this session (#1324)",
    file: "functions/api/admin/users/[id]/reset-mfa.js",
    find: "  if (stepUpDenied) return stepUpDenied;",
    replace: "  if (false) return stepUpDenied;",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "step-up-window-enforced",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' — a step-up older than the 5-minute window no longer counts (#1324)",
    file: "functions/utils/stepUp.js",
    find: "AND step_up_at IS NOT NULL AND step_up_at > unixepoch() - ?`,",
    replace: "AND step_up_at IS NOT NULL AND ? IS NOT NULL`,",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "step-up-bound-to-this-session",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' — a step-up on another session of the same user does not count (#1324)",
    file: "functions/utils/stepUp.js",
    find: "WHERE id = ? AND user_id = ? AND step_up_at",
    replace: "WHERE ? IS NOT NULL AND user_id = ? AND step_up_at",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "step-up-refuses-api-keys",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' — an API key never satisfies step-up, even on a stamped session (#1324)",
    file: "functions/utils/stepUp.js",
    find: "  if (context.data?.apiKey) {",
    replace: "  if (false) {",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "step-up-backup-code-spend-bound-to-read-list",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' — a backup code is spent only over the list that was read, so a replay or concurrent spend cannot also stamp (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: '? "totp_enabled = ? AND totp_secret IS ? AND backup_codes IS ?"',
    replace: '? "totp_enabled = ? AND totp_secret IS ? AND (? IS NULL OR 1)"',
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "step-up-wrong-code-is-400-not-401",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 a wrong step-up code is 400 INVALID_MFA_CODE; a 401 would sign the user out in the admin client (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: '    return json(400, {\n      error: "Authentication failed",',
    replace: '    return json(401, {\n      error: "Authentication failed",',
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "mfa-enable-wrong-code-is-400-not-401",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 a wrong code on mfa/enable is 400, never a 401 that signs the user out (#1324)",
    file: "functions/api/admin/mfa/enable.js",
    find: '        message: "Invalid authentication code",\n      }),\n      {\n        status: 400,',
    replace: '        message: "Invalid authentication code",\n      }),\n      {\n        status: 401,',
    tests: ["functions/api/admin/mfa/__tests__/wrong-code-status.test.js"],
  },
  {
    id: "mfa-disable-wrong-code-is-400-not-401",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 a wrong code on mfa/disable is 400, never a 401 that signs the user out (#1324)",
    file: "functions/api/admin/mfa/disable.js",
    find: '        message: "Invalid authentication code",\n      }),\n      {\n        status: 400,',
    replace: '        message: "Invalid authentication code",\n      }),\n      {\n        status: 401,',
    tests: ["functions/api/admin/mfa/__tests__/wrong-code-status.test.js"],
  },
  {
    id: "mfa-backup-codes-wrong-code-is-400-not-401",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 a wrong code on mfa/backup-codes is 400, never a 401 that signs the user out (#1324)",
    file: "functions/api/admin/mfa/backup-codes.js",
    find: '        message: "Invalid authentication code",\n      }),\n      {\n        status: 400,',
    replace: '        message: "Invalid authentication code",\n      }),\n      {\n        status: 401,',
    tests: ["functions/api/admin/mfa/__tests__/wrong-code-status.test.js"],
  },
  {
    id: "step-up-user-limit-counts-every-guess-endpoint",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 the per-user lockout counts failures across step-up, backup-codes and disable together (#1324)",
    file: "functions/utils/authAttempts.js",
    find: "    AUTH_ATTEMPT_TYPES.mfaStepUp,\n    AUTH_ATTEMPT_TYPES.mfaBackupCodes,\n    AUTH_ATTEMPT_TYPES.mfaDisable,\n",
    replace: "    AUTH_ATTEMPT_TYPES.mfaStepUp,\n",
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "step-up-user-limit-threshold",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 ten failed guesses per hour per user, no IP in the key, locks step-up (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: "    maxFailures: MFA_GUESS_LIMIT.maxFailures + 1,",
    replace: "    maxFailures: 1000,",
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "step-up-lockout-ends-the-session",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 hitting the per-user limit deletes the session (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: '    await DB.prepare("DELETE FROM lucia_sessions WHERE id = ?").bind(sessionId).run();',
    replace: "    // session kept",
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "step-up-records-attempt-before-verifying",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 the attempt is recorded as a failed row BEFORE the code is checked, so concurrent guesses count each other (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: '    failureReason: "pending",\n    ipAddress,\n    success: false,',
    replace: '    failureReason: "pending",\n    ipAddress,\n    success: true,',
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "step-up-spend-and-stamp-commit-together",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 a backup-code spend carries the same session predicate as the stamp, so if either loses neither applies (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: "SET backup_codes = ?\n         WHERE id = ? AND ${factorPredicate} AND ${sessionStillExists}",
    replace: "SET backup_codes = ?\n         WHERE id = ? AND ${factorPredicate} AND (? IS NOT NULL AND ? IS NOT NULL)",
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "step-up-success-record-never-fails-the-request",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 a failing attempt-record write never turns a landed step-up into an error (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: '    console.error("[MFA Step-up] Failed to settle auth attempt:", error?.message || error);',
    replace: "    throw error;",
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "step-up-secret-error-is-recorded",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 an unreadable TOTP secret records a failed attempt before the 500 (#1324)",
    file: "functions/api/admin/mfa/step-up.js",
    find: 'failureReason: "totp_secret_error"',
    replace: 'failureReason: "x"',
    tests: ["functions/api/admin/mfa/__tests__/step-up.test.js"],
  },
  {
    id: "rbac-role-check-refuses-before-step-up",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 the role check on an identity route refuses a lower role (the boundary test steps the caller up so only the role check can) (#1324)",
    file: "functions/api/admin/users/[id]/reset-mfa.js",
    find: "  if (permCheck.error) {\n    return permCheck.response;\n  }",
    replace: "  if (false) {\n    return permCheck.response;\n  }",
    tests: ["functions/api/admin/__tests__/rbacBoundaries.test.js"],
  },
  {
    id: "step-up-middleware-passes-session-to-handlers",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 the real middleware hands the session to the handler, so a stamped session satisfies step-up (#1324)",
    file: "functions/api/admin/_middleware.js",
    find: "      session: sessionData,",
    replace: "      session: undefined,",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "step-up-toggle-status-both-directions",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 reactivating a user needs step-up as much as deactivating (#1324)",
    file: "functions/api/admin/users/[id]/toggle-status.js",
    find: "  if (stepUpDenied) return stepUpDenied;",
    replace: "  if (false) return stepUpDenied;",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "step-up-patch-reactivation",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 PATCH that flips an inactive user to active needs step-up (#1324)",
    file: "functions/api/admin/users/[id].js",
    find: "(isActive !== undefined && Boolean(isActive) && Number(user.is_active) === 0);",
    replace: "false;",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "step-up-patch-same-role-pinned-to-read-state",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 a same-role PATCH (no step-up) is pinned to the role it read, so a concurrent demotion is not undone (#1324)",
    file: "functions/api/admin/users/[id].js",
    find: "const guardsRole = role !== undefined && !roleChanged;",
    replace: "const guardsRole = false;",
    tests: ["functions/api/admin/__tests__/stepUpBoundaries.test.js"],
  },
  {
    id: "mfa-guess-gate-per-user-threshold",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 backup-codes and disable share the per-user guess limit (10 per hour, no IP) (#1324)",
    file: "functions/utils/mfaGuessGate.js",
    find: "    maxFailures: MFA_GUESS_LIMIT.maxFailures + 1,",
    replace: "    maxFailures: 1000,",
    tests: ["functions/api/admin/mfa/__tests__/mfa-guess-limit.test.js"],
  },
  {
    id: "mfa-guess-gate-lockout-ends-session",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 hitting the per-user limit on backup-codes or disable deletes the session (#1324)",
    file: "functions/utils/mfaGuessGate.js",
    find: '      await DB.prepare("DELETE FROM lucia_sessions WHERE id = ?").bind(sessionId).run();',
    replace: "      // session kept",
    tests: ["functions/api/admin/mfa/__tests__/mfa-guess-limit.test.js"],
  },
  {
    id: "mfa-backup-codes-enforces-guess-limit",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 backup-codes actually enforces the shared guess limit, since a correct TOTP there returns plaintext backup codes (#1324)",
    file: "functions/api/admin/mfa/backup-codes.js",
    find: "  if (limited) {",
    replace: "  if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-guess-limit.test.js"],
  },
  {
    id: "mfa-disable-enforces-guess-limit",
    invariant:
      "CLAUDE.md 'Step-up re-authentication for identity changes' \u2014 disable actually enforces the shared guess limit (#1324)",
    file: "functions/api/admin/mfa/disable.js",
    find: "  if (limited) {",
    replace: "  if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/mfa-guess-limit.test.js"],
  },
  {
    id: "totp-login-step-claim-is-conditional",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 one accepted TOTP code per time step per user: the login step write is conditional, so two parallel logins with one code cannot both win (#1333)",
    file: "functions/api/admin/auth/mfa/verify.js",
    find: "AND (totp_last_step IS NULL OR totp_last_step < ?)`,",
    replace: "AND ? IS NOT NULL`,",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-step-up-claim-is-in-the-stamp-predicate",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 the step-up stamp commits only if the TOTP step is still unspent, so a parallel request with the same code cannot also stamp (#1333)",
    file: "functions/api/admin/mfa/step-up.js",
    find: "? `${baseFactorPredicate} AND (totp_last_step IS NULL OR totp_last_step < ?)`",
    replace: "? `${baseFactorPredicate} AND ? IS NOT NULL`",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-step-must-be-strictly-greater",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 a code is accepted only when its step is strictly greater than users.totp_last_step; an equal step is a replay (#1333)",
    file: "functions/utils/totp.js",
    find: "lastStep === undefined || step > lastStep);",
    replace: "lastStep === undefined || step >= lastStep);",
    tests: ["functions/utils/__tests__/totp.test.js", "functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-verify-returns-the-matched-step",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 verifyTotpStep returns the matched time-step counter, which callers record; losing it makes replay protection a no-op (#1333)",
    file: "functions/utils/totp.js",
    find: "  return matchedStep;\n}",
    replace: "  return matchedStep === null ? null : 0;\n}",
    tests: ["functions/utils/__tests__/totp.test.js", "functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-disable-step-claim-is-conditional",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 mfa/disable claims the TOTP step with a conditional write before it acts (#1333)",
    file: "functions/api/admin/mfa/disable.js",
    find: "AND (totp_last_step IS NULL OR totp_last_step < ?)`,",
    replace: "AND ? IS NOT NULL`,",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-backup-codes-step-claim-is-conditional",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 mfa/backup-codes claims the TOTP step with a conditional write before it issues codes (#1333)",
    file: "functions/api/admin/mfa/backup-codes.js",
    find: "AND (totp_last_step IS NULL OR totp_last_step < ?)`,",
    replace: "AND ? IS NOT NULL`,",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-login-replay-answers-already-used",
    invariant:
      "CLAUDE.md 'Step-up re-authentication' \u2014 a code that matches but whose step is spent is answered TOTP_CODE_ALREADY_USED, not as a wrong code (#1333)",
    file: "functions/api/admin/auth/mfa/verify.js",
    find: "if (!verified && replayedCode) {",
    replace: "if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-step-up-replay-answers-already-used",
    invariant:
      "CLAUDE.md 'Step-up re-authentication' \u2014 step-up answers a spent step with TOTP_CODE_ALREADY_USED, not INVALID_MFA_CODE (#1333)",
    file: "functions/api/admin/mfa/step-up.js",
    find: "if (!verified && replayedCode) {",
    replace: "if (false) {",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-step-up-deleted-session-is-not-a-guess",
    invariant:
      "CLAUDE.md 'Step-up re-authentication' \u2014 a step-up whose stamp lost to a deleted session is 401 session_gone, never counted as a replayed code (#1333)",
    file: "functions/api/admin/mfa/step-up.js",
    find: "if (factorRow.last_step !== null && factorRow.last_step >= matchedStep) {",
    replace: "if (true) {",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "totp-admin-reset-clears-spent-step",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 an admin 2FA reset clears totp_last_step, so a stale step from the old secret cannot refuse the new authenticator (#1333)",
    file: "functions/api/admin/users/[id]/reset-mfa.js",
    find: "backup_codes = NULL, totp_last_step = NULL, updated_at",
    replace: "backup_codes = NULL, updated_at",
    tests: ["functions/api/admin/mfa/__tests__/totp-replay.test.js"],
  },
  {
    id: "mfa-login-counts-guess-when-secret-unreadable",
    invariant:
      "CLAUDE.md 'RBAC Roles' \u2014 a login guess made while the TOTP secret cannot be loaded still counts toward the rate limit (#1335)",
    file: "functions/api/admin/auth/mfa/verify.js",
    find: 'await writeAuthAttempt(DB, {\n        attemptType: AUTH_ATTEMPT_TYPES.mfa,\n        email: challenge.email,\n        failureReason: "totp_secret_error",\n        ipAddress,\n        success: false,\n        userAgent,\n        userId: challenge.user_id,\n      });',
    replace: "// attempt not recorded",
    tests: ["functions/api/admin/auth/__tests__/mfa.test.js"],
  },
];

// ============================================================================
// KNOWN_SURVIVING — mutations that are real invariants but for which no
// current test goes red. An entry here is a genuine vacuous-test finding,
// not a skip: it still gets applied and tested every run (so a future test
// addition that starts catching it is visible), but a "surviving" result
// here does not fail the gate — it is reported prominently instead, with a
// TODO(#issue) to close the gap.
//
// Currently empty: every mutation in MUTATIONS above was verified (by
// actually running this gate) to be caught by its listed test(s). If you add
// a mutation whose listed test does NOT go red, move it here rather than
// deleting it or leaving the gate red — and open an issue.
//
// Shape, for the next one:
//   {
//     id: "...",
//     invariant: "...",
//     file: "...",
//     find: "...",
//     replace: "...",
//     tests: ["..."],           // the best current attempt, even if it doesn't catch it
//     issue: "#NNNN",
//     note: "why nothing currently catches this",
//   }
// ============================================================================

/** @type {Mutation[]} */
export const KNOWN_SURVIVING = [];

// ============================================================================
// Core mechanics — exported so scripts/__tests__/mutationGate.test.js can
// drive them against temp fixtures instead of the real table.
// ============================================================================

/** Byte-exact occurrence count. Deliberately not a regex/grep count: `find`
 * strings here contain `(`, `)`, `.`, `?`, `$` — all regex metacharacters —
 * and a regex-based count would misreport.
 *
 * @param {string} haystack - Text to search.
 * @param {string} needle - Literal substring; never treated as a pattern.
 * @returns {number} Non-overlapping occurrences of `needle` in `haystack`. */
export function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) break;
    count++;
    idx = found + needle.length;
  }
  return count;
}

/** Splice `replace` in for the single occurrence of `find`. Deliberately NOT
 * `String.prototype.replace(find, replace)`: when the second argument is a
 * string, `replace` treats `$&`, `$1`, etc. as special patterns. A mutation
 * table is exactly the kind of file that acquires a `$`-bearing replacement
 * eventually; splicing by index sidesteps the whole class. Caller must have
 * already verified exactly one occurrence.
 *
 * @param {string} content - Original file contents.
 * @param {string} find - Literal substring to replace; must occur exactly once.
 * @param {string} replace - Literal replacement, inserted verbatim (a `$` in it
 *   is NOT interpreted, which is the reason for splicing over String.replace).
 * @returns {string} `content` with the single occurrence replaced. */
export function applyReplacement(content, find, replace) {
  const idx = content.indexOf(find);
  if (idx === -1) {
    throw new Error("applyReplacement called with a find string that is not present");
  }
  return content.slice(0, idx) + replace + content.slice(idx + find.length);
}

/** `git status --porcelain` scoped to specific paths. Empty array = clean.
 *
 * @param {string[]} files - Repo-relative paths to check.
 * @param {string} cwd - Directory to run git in.
 * @returns {string[]} The subset of `files` git reports as modified.
 * @throws {Error} If git itself fails to run — never silently treated as clean,
 *   since "clean" is the answer that lets the gate start mutating sources. */
export function dirtyFiles(files, cwd) {
  if (files.length === 0) return [];
  const result = spawnSync("git", ["status", "--porcelain", "--", ...files], {
    cwd,
    encoding: "utf8",
  });
  if (result.error) {
    throw new Error(`git status failed to run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`git status exited ${result.status}: ${result.stderr}`);
  }
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** True iff git sees no diff for this single file (working tree vs index).
 *
 * @param {string} filePath - Repo-relative path.
 * @param {string} cwd - Directory to run git in.
 * @returns {boolean} true when `git diff --quiet` reports no change.
 * @throws {Error} If git fails to run. Used to verify a restore, so a failure
 *   here must be loud rather than optimistic. */
export function isGitClean(filePath, cwd) {
  const result = spawnSync("git", ["diff", "--quiet", "--", filePath], { cwd });
  if (result.error) {
    throw new Error(`git diff failed to run: ${result.error.message}`);
  }
  return result.status === 0;
}

/** Strip ANSI SGR sequences. vitest colorizes whenever it believes a terminal
 * is watching -- which includes GitHub Actions -- so its summary line arrives
 * as an escape sequence followed by " Tests ", not as plain text. A regex
 * anchored on `^\s*Tests` silently fails to match that, because an escape
 * sequence is not whitespace.
 *
 * @param {string} text - Raw captured output, possibly containing SGR escapes.
 * @returns {string} The same text with every SGR sequence removed. */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

/** True iff vitest's own summary reports at least one FAILING test.
 *
 * The gate's central predicate, and deliberately positive: a non-zero exit
 * says something went wrong, never WHAT. A killed process, a missing test
 * file, a transform error, or a mutation that made the source unparseable all
 * exit non-zero with nothing asserted -- and because "caught" is this gate's
 * PASSING direction, reading any of them as caught prints PASS while proving
 * nothing.
 *
 * The ANSI strip is load-bearing, not cosmetic: without it this returned false
 * for EVERY mutation on the first CI run (colour on in Actions, off locally),
 * turning a healthy gate into ten inconclusive failures. Local-only
 * verification could not have caught it -- the output format differs by
 * environment, so the bug is invisible until CI runs.
 *
 * @param {string} rawOutput - vitest's combined stdout+stderr, coloured or not.
 * @returns {boolean} true only when vitest's summary reports >= 1 failing
 *   test. False for every "it never got that far" case -- no test files, a
 *   transform error, a killed process, or a summary reading "Tests  no tests".
 */
export function outputShowsFailingTest(rawOutput) {
  const match = stripAnsi(rawOutput).match(/^\s*Tests\s+.*?\b(\d+)\s+failed/m);
  // String.match yields null on no-match; read it through optional chaining so
  // the absent case and a literal "0 failed" collapse to the same answer.
  return Number(match?.[1] ?? 0) > 0;
}

/** Run `npx vitest run <testFiles> [...extraArgs]` from `cwd`, synchronously.
 *
 * Returns the raw exit code plus `signal` and `spawnError`, and does NOT
 * decide what they mean. A killed process is normalized to a non-zero exit so
 * no caller can mistake it for a clean pass -- but "non-zero" is deliberately
 * NOT sufficient for the caller to conclude a mutation was caught. See
 * classifyTestRun: for this gate, "caught" is the PASSING direction, so every
 * non-zero exit must be positively attributed to a failing test rather than
 * assumed.
 *
 * @param {string[]} testFiles - Test paths to pass to vitest.
 * @param {object} [options]
 * @param {string} [options.cwd=REPO_ROOT] - Working directory for the spawn.
 * @param {string[]} [options.extraArgs=[]] - Extra vitest CLI args.
 * @returns {{exitCode: number, stdout: string, stderr: string,
 *   signal: string|null, spawnError: Error|null}} A killed process is
 *   normalized to a non-zero `exitCode`, but callers must still consult
 *   `signal`/`spawnError` — see outputShowsFailingTest. */
export function runVitestFiles(testFiles, { cwd = REPO_ROOT, extraArgs = [] } = {}) {
  const result = spawnSync("npx", ["vitest", "run", ...testFiles, ...extraArgs], {
    cwd,
    encoding: "utf8",
  });
  const exitCode = result.status === null ? 1 : result.status;
  return {
    exitCode,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    signal: result.signal ?? null,
    spawnError: result.error ?? null,
  };
}

// Tracks the file currently mutated on disk (if any), so the process-exit
// safety net below can restore it even if something throws or the process is
// interrupted between the write and the per-mutation `finally`.
let currentMutation = null;

function scaryRestoreFailureMessage(filePath, reason) {
  return [
    "",
    "=".repeat(78),
    " FATAL: mutation-gate could not verify that it restored a source file.",
    ` File: ${filePath}`,
    ` Reason: ${reason}`,
    "",
    " The working tree may still contain a MUTATED version of this file.",
    " STOP. Do not commit. Before doing anything else, run:",
    `   git diff -- "${filePath}"`,
    `   git checkout -- "${filePath}"`,
    "=".repeat(78),
    "",
  ].join("\n");
}

/** Best-effort synchronous restore used by the exit-time safety net. Never
 * throws — this runs inside process 'exit'/signal handlers, where an
 * unhandled throw would itself abort restoration. */
function forceRestoreCurrentMutation() {
  if (!currentMutation) return;
  const { filePath, original } = currentMutation;
  try {
    writeFileSync(filePath, original);
  } catch {
    // Nothing more we can do from an exit handler; the per-mutation
    // synchronous path below is the primary guarantee and already ran.
  }
  currentMutation = null;
}

let signalHandlersInstalled = false;
/** Installs the process-exit / SIGINT safety net exactly once. Exported so
 * the self-test can assert it exists without relying on module load order.
 *
 * @returns {void} Idempotent; repeated calls register no additional handlers. */
export function installExitSafetyNet() {
  if (signalHandlersInstalled) return;
  signalHandlersInstalled = true;
  process.on("exit", forceRestoreCurrentMutation);
  process.on("SIGINT", () => {
    forceRestoreCurrentMutation();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    forceRestoreCurrentMutation();
    process.exit(143);
  });
}

/**
 * Runs a single mutation end to end: verify uniqueness, mutate, test,
 * restore, verify restore. Returns a result object; never leaves the file
 * mutated on a normal return (a restore-verification failure calls
 * `process.exit(1)` directly rather than returning, per the hard requirement
 * that this is worse than any test failure the gate could report).
 *
 * `cwd` is the project root: mutation.file/mutation.tests resolve relative to
 * it, and it's where git status/diff run. `vitestCwd` (defaults to `cwd`) is
 * only where the `npx vitest` subprocess is launched FROM — separated so a
 * fixture tree with no local `node_modules` (the self-test) can still
 * resolve the repo's real vitest binary by launching from `REPO_ROOT` while
 * pointing vitest AT the fixture tree via `vitestExtraArgs`
 * (`--root <fixtureDir> --config <fixtureDir>/vitest.config.mjs`).
 *
 * @param {Mutation} mutation
 * @param {{ cwd?: string, vitestCwd?: string, vitestExtraArgs?: string[] }} [options]
 */
export function runOneMutation(mutation, { cwd = REPO_ROOT, vitestCwd = cwd, vitestExtraArgs = [] } = {}) {
  const filePath = path.join(cwd, mutation.file);

  if (!existsSync(filePath)) {
    return {
      id: mutation.id,
      status: "gate-failure",
      failureKind: "drift",
      reason: `file does not exist: ${mutation.file}`,
    };
  }

  const original = readFileSync(filePath, "utf8");
  const occurrences = countOccurrences(original, mutation.find);

  if (occurrences === 0) {
    return {
      id: mutation.id,
      status: "gate-failure",
      failureKind: "drift",
      reason: `find string not found in ${mutation.file} — the pattern has drifted from the source; update the mutation table's "find" field`,
    };
  }
  if (occurrences > 1) {
    return {
      id: mutation.id,
      status: "gate-failure",
      failureKind: "drift",
      reason: `find string occurs ${occurrences} times in ${mutation.file} — must be exactly 1; narrow the pattern so the mutation is unambiguous`,
    };
  }

  const absoluteTests = mutation.tests.map((t) => (path.isAbsolute(t) ? t : path.join(cwd, t)));

  // A missing test path is the same class of failure as an absent `find`
  // string: a silent no-op that would otherwise report "caught" for the
  // wrong reason (vitest exits non-zero for "no test files found" too --
  // see the check on testResult below for the case where the path exists
  // but doesn't resolve under vitest's own root/include).
  const missingTests = absoluteTests.filter((t) => !existsSync(t));
  if (missingTests.length > 0) {
    return {
      id: mutation.id,
      status: "gate-failure",
      failureKind: "drift",
      reason: `listed test file(s) do not exist: ${missingTests.join(", ")} — update the mutation table's "tests" field`,
    };
  }

  const mutated = applyReplacement(original, mutation.find, mutation.replace);

  let testResult;
  try {
    writeFileSync(filePath, mutated);
    currentMutation = { filePath, original };
    testResult = runVitestFiles(absoluteTests, { cwd: vitestCwd, extraArgs: vitestExtraArgs });
  } finally {
    // Restore happens even if runVitestFiles somehow throws.
    writeFileSync(filePath, original);
    currentMutation = null;

    const restoredContent = readFileSync(filePath, "utf8");
    if (restoredContent !== original) {
      console.error(
        scaryRestoreFailureMessage(filePath, "in-memory content does not match the original after restore"),
      );
      process.exit(1);
    }
    if (!isGitClean(filePath, cwd)) {
      console.error(scaryRestoreFailureMessage(filePath, "`git diff --quiet` reports a difference after restore"));
      process.exit(1);
    }
  }

  // A non-zero exit that actually means "vitest never ran the test" (wrong
  // include glob, bad --root, etc.) must NOT be read as "caught" -- that
  // would be exactly the false-confidence bug class this tool exists to
  // prevent, just moved into the harness instead of the invariant. Both
  // vitest's stdout and stderr are checked: which stream carries this
  // message is a vitest-version detail, not something to depend on.
  const combinedOutput = stripAnsi(`${testResult.stdout}\n${testResult.stderr}`);

  // A killed or unspawnable vitest exits non-zero for reasons that have
  // nothing to do with the invariant: an OOM kill, the CI job timeout's
  // SIGKILL, or `npx` missing from PATH. Reading any of those as "caught"
  // would print PASS while nothing was ever asserted.
  if (testResult.spawnError || testResult.signal) {
    return {
      id: mutation.id,
      status: "gate-failure",
      failureKind: "inconclusive",
      reason: `vitest did not exit normally (signal: ${testResult.signal ?? "none"}, spawn error: ${
        testResult.spawnError?.message ?? "none"
      }) — the run proves nothing about ${mutation.tests.join(", ")}`,
      testExitCode: testResult.exitCode,
    };
  }

  if (/No test files found/i.test(combinedOutput)) {
    return {
      id: mutation.id,
      status: "gate-failure",
      failureKind: "inconclusive",
      reason: `vitest reported "No test files found" for ${mutation.tests.join(", ")} — the harness did not actually run the test, so this is not a verified result`,
      testExitCode: testResult.exitCode,
    };
  }

  // The general form of the two guards above. "caught" is this gate's PASSING
  // direction, so it is never inferred from a non-zero exit alone -- a
  // mutation that makes the source unparseable, a broken import, or a config
  // error all exit non-zero without a single assertion running, and each would
  // otherwise print PASS. Require vitest to report an actually-failing test.
  const sawFailingTest = outputShowsFailingTest(combinedOutput);

  if (testResult.exitCode !== 0 && !sawFailingTest) {
    // Show what vitest ACTUALLY printed. Without this the message states only
    // that the run proved nothing, which is true but unactionable -- and the
    // causes look identical from the outside (missing dep, config error,
    // unparseable mutation, an output format this predicate does not
    // recognise). Diagnosing those apart from a local machine is guesswork;
    // the tail is what turns the next failure into a fact.
    const tail = combinedOutput.trimEnd().split("\n").slice(-25).join("\n      ");
    return {
      id: mutation.id,
      status: "gate-failure",
      failureKind: "inconclusive",
      reason: `vitest exited ${testResult.exitCode} but reported no failing test for ${mutation.tests.join(
        ", ",
      )} — the run did not verify the invariant (a load/transform/config error exits non-zero without asserting anything).\n    vitest output (last 25 lines, ANSI stripped):\n      ${tail}`,
      testExitCode: testResult.exitCode,
    };
  }

  const caught = testResult.exitCode !== 0 && sawFailingTest;
  return {
    id: mutation.id,
    status: caught ? "caught" : "surviving",
    reason: caught ? null : "listed test(s) still passed against the mutated (broken) source",
    testExitCode: testResult.exitCode,
    testStdout: testResult.stdout,
    testStderr: testResult.stderr,
  };
}

// ============================================================================
// Reporting
// ============================================================================

function padId(id) {
  return id.padEnd(38);
}

/** Render the human-readable report.
 *
 * @param {Array<object>} results - Per-mutation results from runOneMutation.
 * @param {Mutation[]} mutations - The table that was run, for file lookup.
 * @param {Mutation[]} knownSurviving - Documented-surviving entries; these
 *   report as KNOWN SURVIVING and do not fail the gate.
 * @returns {{message: string, ok: boolean}} `ok` is false if ANY mutation
 *   survived undocumented or produced a gate failure. */
export function formatReport(results, mutations, knownSurviving) {
  const knownIds = new Set(knownSurviving.map((k) => k.id));
  const lines = [];
  lines.push("");
  lines.push("mutation-gate report");
  lines.push("=".repeat(78));
  lines.push(`${padId("id")}applied  caught  status`);
  lines.push("-".repeat(78));

  let hardFailures = 0;
  const surviving = [];
  const knownSurvivingHit = [];

  for (const r of results) {
    // A drift failure never reached the write; an inconclusive one did.
    const applied = r.status !== "gate-failure" || r.failureKind === "inconclusive";
    // A gate failure never determined caught-ness either way; "NO" would
    // read as "it survived", which is a different and answerable finding.
    const caughtCol = r.status === "gate-failure" ? "n/a" : r.status === "caught" ? "yes" : "NO";
    let statusCol;
    if (r.status === "gate-failure") {
      statusCol = "GATE FAILURE";
      hardFailures++;
    } else if (r.status === "caught") {
      statusCol = "caught";
    } else {
      // surviving
      if (knownIds.has(r.id)) {
        statusCol = "KNOWN SURVIVING";
        knownSurvivingHit.push(r);
      } else {
        statusCol = "SURVIVING (FAIL)";
        hardFailures++;
        surviving.push(r);
      }
    }
    lines.push(`${padId(r.id)}${String(applied).padEnd(9)}${caughtCol.padEnd(8)}${statusCol}`);
  }
  lines.push("-".repeat(78));

  if (hardFailures === 0) {
    lines.push(`PASS — ${results.length} mutations checked, all caught or documented as known-surviving.`);
  } else {
    lines.push(`FAIL — ${hardFailures} of ${results.length} mutations did not verify.`);
  }

  const describeFailures = (rows, heading) => {
    if (rows.length === 0) return;
    lines.push("");
    lines.push(heading);
    for (const r of rows) {
      const m = mutations.find((mm) => mm.id === r.id) ?? knownSurviving.find((mm) => mm.id === r.id);
      lines.push(`  [${r.id}] ${m?.file ?? "?"}`);
      lines.push(`    ${r.reason}`);
    }
  };

  const gateFailures = results.filter((r) => r.status === "gate-failure");
  describeFailures(
    gateFailures.filter((r) => r.failureKind === "drift"),
    "Table drift (the mutation was NOT applied) — gate failures, not skips. Fix the table:",
  );
  describeFailures(
    gateFailures.filter((r) => r.failureKind === "inconclusive"),
    "Inconclusive runs (the mutation WAS applied, but the test run proved nothing) — never read as caught:",
  );

  if (surviving.length > 0) {
    lines.push("");
    lines.push("SURVIVING MUTANTS — the invariant broke and no listed test noticed:");
    for (const r of surviving) {
      const m = mutations.find((mm) => mm.id === r.id);
      lines.push(`  [${r.id}]`);
      lines.push(`    invariant: ${m?.invariant}`);
      lines.push(`    file:      ${m?.file}`);
      lines.push(`    expected one of these tests to go RED: ${m?.tests.join(", ")}`);
    }
  }

  if (knownSurvivingHit.length > 0) {
    lines.push("");
    lines.push("KNOWN SURVIVING (documented gap, does not fail the gate — fix these when you can):");
    for (const r of knownSurvivingHit) {
      const m = knownSurviving.find((mm) => mm.id === r.id);
      lines.push(`  [${r.id}] ${m?.issue ?? "(no issue filed)"}  — ${m?.note ?? ""}`);
    }
  }

  lines.push("");
  return { text: lines.join("\n"), hardFailures };
}

// ============================================================================
// Orchestration
// ============================================================================

/**
 * Runs the full table (MUTATIONS + KNOWN_SURVIVING) against `cwd`. Refuses
 * up front if any target file already has uncommitted changes. Exported so
 * the self-test can call it directly against a synthetic table/cwd.
 *
 * @param {object} [options]
 * @param {Mutation[]} [options.mutations=MUTATIONS] - Table to verify.
 * @param {Mutation[]} [options.knownSurviving=KNOWN_SURVIVING] - Documented
 *   surviving mutants; present but not failing.
 * @param {string} [options.cwd=REPO_ROOT] - Repo root to mutate within.
 * @param {string} [options.vitestCwd=cwd] - Directory to spawn vitest from.
 * @param {string[]} [options.vitestExtraArgs=[]] - Extra vitest CLI args.
 * @returns {{message: string, ok: boolean}} Caller maps `ok` to the exit code.
 */
export function runMutationGate({
  mutations = MUTATIONS,
  knownSurviving = KNOWN_SURVIVING,
  cwd = REPO_ROOT,
  vitestCwd = cwd,
  vitestExtraArgs = [],
} = {}) {
  installExitSafetyNet();

  const all = [...mutations, ...knownSurviving];
  const targetFiles = [...new Set(all.map((m) => m.file))];
  const dirty = dirtyFiles(targetFiles, cwd);
  if (dirty.length > 0) {
    const message = [
      "Refusing to run: the working tree already has uncommitted changes to files",
      "this mutation table touches. The gate cannot tell its own mutation apart",
      "from a real edit in progress, and a crash mid-run could then destroy it.",
      "",
      "Commit, stash, or revert these before running the mutation gate:",
      ...dirty.map((d) => `  ${d}`),
      "",
    ].join("\n");
    return { ok: false, reason: "dirty-working-tree", message, results: [] };
  }

  const results = all.map((mutation) => runOneMutation(mutation, { cwd, vitestCwd, vitestExtraArgs }));
  const { text, hardFailures } = formatReport(results, all, knownSurviving);
  return { ok: hardFailures === 0, reason: null, message: text, results };
}

// ============================================================================
// CLI entry point
// ============================================================================

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const start = Date.now();
  console.log(`mutation-gate: verifying ${MUTATIONS.length} invariant mutation(s)...`);
  for (const m of MUTATIONS) {
    console.log(`  - ${m.id}`);
  }
  if (KNOWN_SURVIVING.length > 0) {
    console.log(`  + ${KNOWN_SURVIVING.length} documented KNOWN_SURVIVING (checked, don't fail the gate)`);
  }

  const outcome = runMutationGate({});
  console.log(outcome.message);

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`mutation-gate finished in ${elapsedSec}s`);

  if (!outcome.ok) {
    process.exit(1);
  }
}
