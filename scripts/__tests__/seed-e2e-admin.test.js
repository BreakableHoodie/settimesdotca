import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const scriptsDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(scriptsDirectory, "seed-e2e-admin.mjs");

const runScript = (args, password) => {
  const env = { ...process.env };
  if (password === undefined) {
    delete env.E2E_ADMIN_PASSWORD;
  } else {
    env.E2E_ADMIN_PASSWORD = password;
  }

  return execFileSync(process.execPath, [scriptPath, ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
};

describe("seed-e2e-admin", () => {
  it("fails when E2E_ADMIN_PASSWORD is missing", () => {
    expect(() => runScript(["--email", "admin@example.com"], undefined)).toThrowError(
      expect.objectContaining({
        status: 1,
        stderr: expect.stringContaining("E2E_ADMIN_PASSWORD"),
      }),
    );
  });

  // The security property this script exists to hold (#867) is not "env is
  // required" but "argv is refused" — those are independent. A script reading
  // env-first-then-argv satisfies the first and violates the second, and the
  // missing-password test above stays green the whole time. This is the only
  // assertion that goes red if an argv fallback is ever reintroduced.
  it("refuses a password passed on argv, even though that used to be the interface", () => {
    expect(() =>
      runScript(["--email", "admin@example.com", "--password", "placeholder-argv-value"], undefined),
    ).toThrowError(
      expect.objectContaining({
        status: 1,
        stderr: expect.stringContaining("E2E_ADMIN_PASSWORD"),
      }),
    );
  });

  // The dangerous case is not argv-alone (that already fails for lack of a
  // password) but argv ALONGSIDE a valid environment password: there the script
  // has everything it needs and would happily succeed with the secret sitting in
  // the process list. This is the assertion that makes the refusal load-bearing.
  it.each([["--password", "placeholder-argv-value"], ["--password=placeholder-argv-value"]])(
    "refuses %s even when E2E_ADMIN_PASSWORD is set",
    (...argvPassword) => {
      expect(() =>
        runScript(["--email", "admin@example.com", ...argvPassword], "placeholder-not-a-real-password"),
      ).toThrowError(expect.objectContaining({ status: 1 }));
    },
  );

  it("emits the admin INSERT SQL when the password is supplied through the environment", () => {
    const output = runScript(["--email", "admin@example.com"], "placeholder-test-password");

    expect(output).toContain("INSERT OR REPLACE INTO users");
    expect(output).toContain("'admin@example.com'");
    expect(output).toContain("'admin'");
  });
});
