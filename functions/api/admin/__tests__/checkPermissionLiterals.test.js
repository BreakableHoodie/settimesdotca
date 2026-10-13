import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ADMIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROLE_CALL_PATTERN = /checkPermission\(context,\s*"([^"]+)"\)/g;
const VALID_ROLES = new Set(["viewer", "editor", "admin"]);

function listJavaScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : listJavaScriptFiles(entryPath);
    }
    return entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

describe("admin permission literals", () => {
  it("uses only known role names in every checkPermission call", () => {
    const sample = 'const result = checkPermission(context, "editor");';
    expect([...sample.matchAll(ROLE_CALL_PATTERN)].map((match) => match[1])).toEqual(["editor"]);

    const calls = listJavaScriptFiles(path.resolve(ADMIN_ROOT, "..", "..", "..", "functions"))
      .filter((filePath) => !filePath.includes(`${path.sep}__tests__${path.sep}`))
      .flatMap((filePath) => [...readFileSync(filePath, "utf8").matchAll(ROLE_CALL_PATTERN)]);

    expect(calls.length).toBeGreaterThanOrEqual(50);
    expect(calls.every((match) => VALID_ROLES.has(match[1]))).toBe(true);
  });
});
