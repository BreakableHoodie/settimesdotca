import { describe, it, expect } from "vitest";

import * as unfollow from "../../api/bands/[name]/unfollow.js";
import * as confirmFollow from "../../api/bands/[name]/confirm-follow.js";
import * as confirmBatch from "../../api/bands/confirm-follow-batch.js";
import * as unsubscribe from "../../api/subscriptions/unsubscribe.js";
import * as verify from "../../api/subscriptions/verify.js";

const ROUTES = { unfollow, confirmFollow, confirmBatch, unsubscribe, verify };

// No DB binding at all: any read or write would throw.
const ctx = (method) => ({
  request: new Request("https://settimes.ca/x?token=abc", { method }),
  env: {},
  params: { name: "band" },
});

describe("retired email-update links answer 410 without touching the database", () => {
  for (const [name, mod] of Object.entries(ROUTES)) {
    for (const [method, handler] of [
      ["GET", "onRequestGet"],
      ["POST", "onRequestPost"],
    ]) {
      it(`${name} ${method} -> 410 goodbye page`, async () => {
        const res = await mod[handler](ctx(method));
        expect(res.status).toBe(410);
        expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
        const body = await res.text();
        expect(body).toContain(
          "settimes.ca no longer sends email updates, and we have deleted the email addresses we stored for them. There is nothing you need to do.",
        );
        expect(body).toContain('href="/"');
      });
    }
    it(`${name} other methods -> 405`, async () => {
      const res = await mod.onRequest(ctx("DELETE"));
      expect(res.status).toBe(405);
    });
  }
});
