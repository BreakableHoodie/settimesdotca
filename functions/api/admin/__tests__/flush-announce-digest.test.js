// Tests for POST /api/admin/flush-announce-digest (functions/api/admin/flush-announce-digest.js).
//
// The digest ALGORITHM (functions/utils/announceDigest.js) is already covered
// at 97.3% by functions/api/admin/bands/__tests__/announce-digest*.test.js and
// is deliberately not retested here. What this file covers is the 11-statement
// handler shell that was at 0% execution coverage: the permission gate, the
// isEmailConfigured precondition, the response shape, and the audit-log write.

import { describe, expect, test } from "vitest";
import { onRequestPost } from "../flush-announce-digest.js";
import { createTestEnv } from "../../test-utils.js";

function authedUser(role, id) {
  return { role, id, userId: id, email: `${role}@test.local` };
}

function flushRequest() {
  return new Request("https://example.test/api/admin/flush-announce-digest", { method: "POST" });
}

describe("POST /api/admin/flush-announce-digest", () => {
  test("viewer role is refused with 403 (route requires editor)", async () => {
    const { env } = createTestEnv({ role: "viewer" });

    const res = await onRequestPost({
      request: flushRequest(),
      env,
      data: { user: authedUser("viewer", 3) },
    });

    expect(res.status).toBe(403);
  });

  test("unauthenticated request is refused with 401", async () => {
    const { env } = createTestEnv({ role: "editor" });

    const res = await onRequestPost({
      request: flushRequest(),
      env,
      data: {},
    });

    expect(res.status).toBe(401);
  });

  test("email not configured returns 400 before touching the digest", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    // createTestEnv() sets no EMAIL_PROVIDER/EMAIL_FROM, so isEmailConfigured(env) is false.

    const res = await onRequestPost({
      request: flushRequest(),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Email not configured");

    const audit = rawDb.prepare("SELECT * FROM audit_log WHERE action = 'announce_digest.flushed'").get();
    expect(audit).toBeUndefined();
  });

  test("happy path returns the {sent, failed, skipped} shape and writes an announce_digest.flushed audit row", async () => {
    const { env, rawDb } = createTestEnv({ role: "editor" });
    env.EMAIL_PROVIDER = "mailchannels";
    env.EMAIL_FROM = "no-reply@settimes.ca";
    // No pending band_announce_queue rows -- flushAnnounceDigest short-circuits to
    // zeroed stats without needing to send any mail, which is exactly what keeps
    // this test from re-exercising the already-covered digest algorithm.

    const res = await onRequestPost({
      request: flushRequest(),
      env,
      data: { user: authedUser("editor", 2) },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, sent: 0, failed: 0, skipped: 0 });

    const audit = rawDb.prepare("SELECT * FROM audit_log WHERE action = 'announce_digest.flushed'").get();
    expect(audit).toBeTruthy();
    expect(audit.resource_type).toBe("system");
    expect(audit.resource_id).toBeNull();
    expect(audit.user_id).toBe(2);
    expect(JSON.parse(audit.details)).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });
});
