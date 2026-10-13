import { describe, expect, it } from "vitest";
import { checkPermission } from "../_middleware.js";

// The caller's role is looked up as an OWN key. A bare `roleHierarchy[role]`
// returns an inherited function or object for these names, `x < required`
// is then false, and the request was ALLOWED on admin routes. users.role has
// no CHECK constraint, so one bad write would have been a full RBAC bypass.
describe("checkPermission: the caller's role", () => {
  const request = new Request("https://example.test/api/admin/users", { method: "GET" });

  for (const role of ["constructor", "toString", "__proto__", "hasOwnProperty", "Admin", ""]) {
    it(`denies a caller whose role is ${JSON.stringify(role)}`, async () => {
      const result = await checkPermission({ request, env: {}, data: { user: { userId: 1, role } } }, "viewer");
      expect(result.error).toBe(true);
      expect(result.response.status).toBe(403);
    });
  }

  it("still allows a real role at or above the requirement", async () => {
    const result = await checkPermission({ request, env: {}, data: { user: { userId: 1, role: "editor" } } }, "editor");
    expect(result.error).toBe(false);
  });
});
