import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scrub } from "../scrub-e2e-artifacts.mjs";

// Playwright writes typed values into snapshots, traces and step titles, and on
// 2026-10-15 failure artifacts on this public repo held the E2E admin password.
// See scripts/scrub-e2e-artifacts.mjs.

const TYPED_VALUE = "typed-into-the-login-form";
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "scrub-"));
  const results = path.join(root, "test-results", "auth-setup");
  mkdirSync(results, { recursive: true });
  writeFileSync(path.join(results, "error-context.md"), `- textbox "Password" [ref=e15]: ${TYPED_VALUE}\n`);
  writeFileSync(path.join(results, "trace.zip"), `PK fill ${TYPED_VALUE}`);
  writeFileSync(path.join(results, "test-failed-1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const report = path.join(root, "playwright-report");
  mkdirSync(report);
  writeFileSync(path.join(report, "index.html"), `<html>base64 of Fill "${TYPED_VALUE}"</html>`);
  return { root, results, report };
}

describe("scrub-e2e-artifacts", () => {
  it("removes the secret from snapshots and drops traces and the HTML report", () => {
    const { results, report } = fixture();
    const leaks = scrub([path.dirname(results), report], [TYPED_VALUE]);

    expect(leaks).toEqual([]);
    expect(readFileSync(path.join(results, "error-context.md"), "utf8")).toBe(
      '- textbox "Password" [ref=e15]: [REDACTED]\n',
    );
    expect(existsSync(path.join(results, "trace.zip"))).toBe(false);
    expect(existsSync(report)).toBe(false);
    // The diagnosis survives.
    expect(readdirSync(results).sort()).toEqual(["error-context.md", "test-failed-1.png"]);
  });

  it("refuses to call artifacts clean when it was given no secret", () => {
    const { results } = fixture();
    expect(() => scrub([results], [""])).toThrow(/no secret/);
    expect(() => scrub([results], [])).toThrow(/no secret/);
  });

  it("scrubs the URL-encoded and JSON-escaped spellings too", () => {
    const secret = 'pl@ce"holder/test';
    const root = mkdtempSync(path.join(tmpdir(), "scrub-"));
    writeFileSync(path.join(root, "a.md"), `${encodeURIComponent(secret)} ${JSON.stringify(secret)}`);
    expect(scrub([root], [secret])).toEqual([]);
    expect(readFileSync(path.join(root, "a.md"), "utf8")).not.toMatch(/holder/);
  });

  it("scrubs a non-ASCII secret by its UTF-8 bytes", () => {
    const secret = "pässwörd-placeholder";
    const root = mkdtempSync(path.join(tmpdir(), "scrub-"));
    writeFileSync(path.join(root, "a.md"), `value: ${secret}\n`, "utf8");
    expect(scrub([root], [secret])).toEqual([]);
    expect(readFileSync(path.join(root, "a.md"), "utf8")).toBe("value: [REDACTED]\n");
  });

  it("uses a padded secret exactly, so the padded value cannot survive", () => {
    const root = mkdtempSync(path.join(tmpdir(), "scrub-"));
    writeFileSync(path.join(root, "a.md"), "x: ab \ny: placeholderOther\n");
    expect(scrub([root], [" ab ", "placeholderOther"])).toEqual([]);
    expect(readFileSync(path.join(root, "a.md"), "utf8")).toBe("x:[REDACTED]\ny: [REDACTED]\n");
  });
});

// Every Playwright upload must go through the scrub, and must not upload when
// the scrub failed. `if: failure()` alone would still be true after a failed
// scrub step and upload the uncleaned files.
describe("workflow guard: no unscrubbed Playwright upload", () => {
  const dir = path.join(repoRoot, ".github/workflows");
  const workflows = readdirSync(dir).filter((f) => f.endsWith(".yml"));

  function uploadSteps(source) {
    // Split into steps on "- name:" / "- uses:" at any indent; enough for this check.
    // Comment lines are dropped first: a comment above a step would otherwise be
    // read as part of the step before it.
    const code = source.replace(/^\s*#.*$/gm, "");
    return code.split(/\n\s*- (?=name:|uses:)/).filter((s) => s.includes("actions/upload-artifact"));
  }

  it("finds the uploads it guards (a scan that matches nothing proves nothing)", () => {
    const all = workflows.flatMap((f) => uploadSteps(readFileSync(path.join(dir, f), "utf8")));
    expect(all.filter((s) => /test-results/.test(s)).length).toBeGreaterThanOrEqual(3);
  });

  it.each(workflows)("%s uploads no HTML report and only scrubbed test-results", (file) => {
    const source = readFileSync(path.join(dir, file), "utf8");
    for (const step of uploadSteps(source)) {
      expect(step).not.toMatch(/playwright-report/);
      if (/test-results/.test(step)) {
        expect(step).toMatch(/steps\.scrub\.outcome == 'success'/);
        expect(source).toMatch(/id: scrub\b[\s\S]*?scripts\/scrub-e2e-artifacts\.mjs/);
      }
    }
  });
});
