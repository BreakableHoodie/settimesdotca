import { describe, it, expect } from "vitest";
import { emailActionPage, readEmailActionToken } from "../emailActionPage.js";

const page = (overrides = {}) =>
  emailActionPage({
    action: "/api/bands/1/confirm-follow",
    token: "tok",
    heading: "Confirm your follow",
    message: "Click the button below.",
    buttonLabel: "Confirm my follow",
    ...overrides,
  });

describe("emailActionPage (#1291)", () => {
  // functions/_middleware.js sends `Referrer-Policy: no-referrer`, under which
  // browsers submit this form with `Origin: null` and the origin allowlist
  // returns 403. Unit tests and curl cannot see that (no browser, no Origin), so
  // this pins the one line that fixes it. Measured in Chromium, Firefox and
  // WebKit against wrangler on 2026-10-14.
  it("overrides the middleware's no-referrer policy so the POST carries a real Origin", async () => {
    const html = await page().text();
    expect(html).toContain('<meta name="referrer" content="same-origin">');
  });

  it("escapes every interpolated value", async () => {
    const html = await page({ token: '"><script>x</script>', heading: "<b>h</b>" }).text();
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<b>h</b>");
    expect(html).toContain("&lt;b&gt;h&lt;/b&gt;");
  });

  it("is never cached or indexed", () => {
    const res = page();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
  });
});

describe("readEmailActionToken", () => {
  const post = (body, query = "", type = "application/x-www-form-urlencoded") =>
    new Request(`https://example.test/x${query}`, { method: "POST", headers: { "Content-Type": type }, body });

  it("prefers the form body over the query string", async () => {
    expect(await readEmailActionToken(post(new URLSearchParams({ token: "body" }), "?token=query"))).toBe("body");
  });

  it("falls back to the query string (RFC 8058 one-click body carries no token)", async () => {
    expect(await readEmailActionToken(post("List-Unsubscribe=One-Click", "?token=query"))).toBe("query");
  });

  it("falls back to the query string when the form body cannot be parsed", async () => {
    const req = post("garbage", "?token=query", "multipart/form-data; boundary=missing");
    expect(await readEmailActionToken(req)).toBe("query");
  });

  it("rejects a token over the length cap", async () => {
    expect(await readEmailActionToken(post(new URLSearchParams({ token: "a".repeat(257) })))).toBeNull();
  });
});
