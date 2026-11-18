import { describe, expect, it } from "vitest";
import { isApiRoute, routePath, trimTrailingSlashes } from "../routePath.js";

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
  describe("isApiRoute fails closed on alternate spellings (#1446)", () => {
    const api = (p) => isApiRoute(`https://settimes.ca${p}`);
    it.each([
      "/api/metrics",
      "/API/metrics",
      "//api/metrics",
      "/api//metrics",
      "/%61pi/metrics",
      "/%41PI/x",
      "/%2Fapi/metrics",
    ])("%s is the API", (p) => expect(api(p)).toBe(true));
    it("treats an undecodable path as the API", () => expect(api("/%E0%A4%A/x")).toBe(true));
    it.each(["/", "/band/1", "/apiary", "/about/api"])("%s is not the API", (p) => expect(api(p)).toBe(false));
  });
});
