import { describe, expect, it } from "vitest";
import { routePath } from "../routePath.js";

describe("routePath", () => {
  it.each([
    [new Request("https://example.test/API/Admin/Users?x=1"), "/api/admin/users"],
    [new URL("https://example.test/API/Admin/Users?x=1"), "/api/admin/users"],
    ["https://example.test/API/Admin/Users?x=1", "/api/admin/users"],
  ])("accepts a URL-like input and lowercases its pathname", (input, expected) => {
    expect(routePath(input)).toBe(expected);
  });
});
