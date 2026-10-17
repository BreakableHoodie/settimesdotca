import { describe, expect, it } from "vitest";
import { routePath, trimTrailingSlashes } from "../routePath.js";

describe("routePath", () => {
  it.each([
    [new Request("https://example.test/API/Admin/Users?x=1"), "/api/admin/users"],
    [new URL("https://example.test/API/Admin/Users?x=1"), "/api/admin/users"],
    ["https://example.test/API/Admin/Users?x=1", "/api/admin/users"],
    ["https://example.test/a/", "/a"],
    ["https://example.test/a//", "/a"],
    ["https://example.test/", "/"],
  ])("accepts a URL-like input and lowercases its pathname", (input, expected) => {
    expect(routePath(input)).toBe(expected);
  });
});

describe("trimTrailingSlashes", () => {
  it.each([
    ["/a///", "/a"],
    ["/a//b", "/a//b"],
    ["///", "/"],
    ["", "/"],
    ["/a", "/a"],
  ])("trims %j to %j", (input, expected) => {
    expect(trimTrailingSlashes(input)).toBe(expected);
  });

  // Runs before authentication, so an attacker chooses the input. /\/+$/ took ~110 ms
  // on this shape; the loop is linear. A generous bound, so CI noise cannot flake it.
  it("is linear on a long run of slashes that does not end the path", () => {
    const hostile = `${"/".repeat(16000)}x`;
    const started = performance.now();
    for (let i = 0; i < 20; i++) trimTrailingSlashes(hostile);
    expect(performance.now() - started).toBeLessThan(200);
  });
});
