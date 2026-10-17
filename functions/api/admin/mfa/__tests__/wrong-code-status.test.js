// A wrong 2FA code is 400 INVALID_MFA_CODE on every authenticated MFA route.
// The admin client treats ANY 401 as "session gone" and signs the user out, so
// a typo in a code must never be a 401 (#1324). 401 stays for "no valid session".
import { describe, expect, it } from "vitest";
import { createTestEnv } from "../../../test-utils.js";
import * as enableHandler from "../enable.js";
import * as disableHandler from "../disable.js";
import * as backupHandler from "../backup-codes.js";
import * as setupHandler from "../setup.js";

const post = (handler, env, headers, code) =>
  handler.onRequestPost({
    request: new Request("https://example.test/api/admin/mfa/x", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }),
    env,
  });

async function expectInvalidCode(response) {
  expect(response.status).toBe(400);
  const payload = await response.json();
  expect(payload.code).toBe("INVALID_MFA_CODE");
  expect(payload.message).toBe("Invalid authentication code");
}

describe("wrong 2FA code answers 400, not 401", () => {
  it("disable", async () => {
    const { env, headers } = createTestEnv({ role: "viewer", mfaEnrolled: true });
    await expectInvalidCode(await post(disableHandler, env, headers, "000000"));
  });

  it("backup-codes regeneration", async () => {
    const { env, headers } = createTestEnv({ role: "viewer", mfaEnrolled: true });
    await expectInvalidCode(await post(backupHandler, env, headers, "000000"));
  });

  it("enable", async () => {
    const { env, headers } = createTestEnv({ role: "viewer", mfaEnrolled: false });
    const setup = await setupHandler.onRequestPost({
      request: new Request("https://example.test/api/admin/mfa/setup", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
    });
    expect(setup.status).toBe(200);
    await expectInvalidCode(await post(enableHandler, env, headers, "000000"));
  });
});
