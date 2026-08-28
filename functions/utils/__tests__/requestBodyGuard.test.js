import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANONICAL = "utils/request.js";

// Bulk DELETE intentionally keeps its pre-existing malformed-JSON response
// distinct from the shared helper's `{}` fallback. It still rejects null,
// arrays, and scalars before reading any fields; the exception is limited to
// this file because changing the valid `{}` response shape would be a regression.
const EXCEPTIONS = new Set(["api/admin/bands/bulk.js"]);

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "__tests__" || entry === "node_modules" ? [] : sourceFiles(full);
    }
    return entry.endsWith(".js") ? [full] : [];
  });
}

function withoutComments(source) {
  return source.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
}

describe("JSON request parsing has a single entry point", () => {
  it("only the request utility calls request.json() directly", () => {
    const offenders = sourceFiles(FUNCTIONS_DIR)
      .filter((file) => /\brequest\.json\s*\(/.test(withoutComments(readFileSync(file, "utf8"))))
      .map((file) => relative(FUNCTIONS_DIR, file))
      .filter((file) => file !== CANONICAL && !EXCEPTIONS.has(file));

    expect(
      offenders,
      `These files call request.json() directly. Import parseJsonObjectBody from ` +
        `functions/utils/request.js instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
