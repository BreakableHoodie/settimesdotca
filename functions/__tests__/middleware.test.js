// Tests for the shared body-size guard in functions/_middleware.js (#481, #495).
//
// #481 bug: the guard parsed Content-Length via `Number(header || 0)`, which
// silently coerces an ABSENT header (chunked/streamed body — no Content-Length
// is ever sent) to 0. Since 0 is never > 1_000_000, an arbitrarily large
// streamed body sailed straight through to handlers that call
// `request.json()` unguarded (e.g. functions/api/metrics.js).
//
// #481 fix: when Content-Length is present and parses to a finite number,
// trust it (Cloudflare's edge enforces HTTP framing against a declared
// Content-Length, so it can't be smuggled past). Only when Content-Length is
// absent or unparseable do we count actual bytes off a cloned/teed body
// stream, bailing as soon as the running total crosses the limit.
//
// #495 bug: the guard exempted multipart bodies entirely, keyed solely off
// the client-supplied Content-Type — any client could set
// `Content-Type: multipart/form-data` on e.g. /api/metrics to skip the 1MB
// limit outright.
//
// #495 fix: multipart is no longer exempt from the guard, only allowed a
// higher ceiling (MULTIPART_MAX_BODY_BYTES), and only on the one route that
// legitimately needs it (/api/admin/bands/photos, which enforces its own
// precise 5MB-per-file limit downstream).
//
// COUPLING NOTE: /api/metrics is now routed through the D1-backed fail-closed
// rate limiter (#482/#494, already merged to main). Every request here sets
// `CF-Connecting-IP: 127.0.0.1`, which makes checkRateLimit() short-circuit
// to "allowed" for ANY path — including /api/metrics — before it ever
// touches D1 (see functions/utils/rateLimit.js:210-212), so the #495 tests
// below that target /api/metrics don't need a D1 binding in minimalEnv().
import { describe, expect, test, vi, afterEach } from "vitest";

import { onRequest } from "../_middleware.js";

const NEUTRAL_URL = "https://example.test/api/venues"; // neutral path, not /api/metrics
const LOOPBACK_HEADERS = { "CF-Connecting-IP": "127.0.0.1" };

function minimalEnv() {
  // The guard never needs env.DB (PRAGMA runs later, only if env.DB is set),
  // and checkRateLimit() returns "allowed" before touching env at all once it
  // sees a loopback IP — so an empty env is sufficient for every case here.
  return {};
}

function okNext() {
  return async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

function neverCalledNext() {
  return vi.fn(async () => {
    throw new Error("next() should not have been called — guard should have short-circuited");
  });
}

/** A ReadableStream that emits `chunks` (array of byte lengths) then closes. */
function streamOfChunks(chunkSizes) {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunkSizes.length) {
        controller.close();
        return;
      }
      controller.enqueue(new Uint8Array(chunkSizes[i]));
      i += 1;
    },
  });
}

/** A ReadableStream that emits one small chunk, then errors on the next read
 * (simulates a client aborting mid-stream). */
function erroringStream() {
  let stage = 0;
  return new ReadableStream({
    pull(controller) {
      if (stage === 0) {
        stage = 1;
        controller.enqueue(new Uint8Array(10));
        return;
      }
      controller.error(new Error("simulated client abort mid-stream"));
    },
  });
}

describe("body-size guard (#481, #495)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("streamed body >1MB with no Content-Length is rejected with 413", async () => {
    // 5 chunks of 250,000 bytes = 1,250,000 bytes, well over the 1MB limit.
    // Constructed via a ReadableStream + duplex:'half' so undici omits
    // Content-Length entirely — this is exactly the bypass shape from #481.
    const body = streamOfChunks([250_000, 250_000, 250_000, 250_000, 250_000]);
    const request = new Request(NEUTRAL_URL, {
      method: "POST",
      headers: { ...LOOPBACK_HEADERS, "Content-Type": "application/json" },
      body,
      duplex: "half",
    });
    expect(request.headers.get("Content-Length")).toBeNull();

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: neverCalledNext(),
    });

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("Payload too large");
  });

  test.each(["", "abc", "0x10", "-1"])(
    "malformed Content-Length %j falls back to byte counting: >1MB streamed body is rejected with 413",
    async (malformedCl) => {
      // These are exactly the values a bare Number() coercion would mishandle:
      // Number("") → 0, Number("0x10") → 16 and Number("-1") → -1 all land in
      // the "trusted, under the limit" bucket and would skip byte counting
      // entirely — letting the oversized body through ("abc" → NaN is included
      // for completeness). The strict /^\d+$/ parse must treat them all as
      // unusable and fall back to counting the actual stream.
      const body = streamOfChunks([250_000, 250_000, 250_000, 250_000, 250_000]);
      const request = new Request(NEUTRAL_URL, {
        method: "POST",
        headers: {
          ...LOOPBACK_HEADERS,
          "Content-Type": "application/json",
          "Content-Length": malformedCl,
        },
        body,
        duplex: "half",
      });
      expect(request.headers.get("Content-Length")).toBe(malformedCl);

      const response = await onRequest({
        request,
        env: minimalEnv(),
        data: {},
        next: neverCalledNext(),
      });

      expect(response.status).toBe(413);
      const payload = await response.json();
      expect(payload.error).toBe("Payload too large");
    },
  );

  test("oversized stream whose cancel() throws still gets a 413 (cancel is fire-and-forget)", async () => {
    // The reject-path must not depend on reader.cancel() settling: on a teed
    // stream, cancelling one branch leaves the cancel promise PENDING until
    // the other branch is also cancelled/closed (verified empirically — so an
    // awaited cancel hangs the request forever), and an underlying source
    // whose cancel() throws can reject it. Either way the 413 must already
    // have been returned; the cleanup promise is fire-and-forget with a
    // swallow-.catch so no unhandled rejection can escape.
    const body = new ReadableStream({
      pull(controller) {
        // Endless 500KB chunks — the guard must bail by byte count, not
        // stream end.
        controller.enqueue(new Uint8Array(500_000));
      },
      cancel() {
        throw new Error("simulated cancel failure");
      },
    });
    const request = new Request(NEUTRAL_URL, {
      method: "POST",
      headers: { ...LOOPBACK_HEADERS, "Content-Type": "application/json" },
      body,
      duplex: "half",
    });
    expect(request.headers.get("Content-Length")).toBeNull();

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: neverCalledNext(),
    });

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("Payload too large");
  });

  test("declared Content-Length >1MB is rejected with 413 without consuming the body", async () => {
    // Node's built-in Request never auto-populates Content-Length from a
    // buffered body (that header is only added by the real HTTP transport
    // when a request goes over the wire) — set it explicitly to simulate
    // what Cloudflare's edge forwards for a real, non-streamed client
    // request. This exercises the "trust a present, parseable CL" branch,
    // which must reject WITHOUT ever reading the body.
    const large = JSON.stringify({ data: "x".repeat(1_100_000) });
    const request = new Request(NEUTRAL_URL, {
      method: "POST",
      headers: {
        ...LOOPBACK_HEADERS,
        "Content-Type": "application/json",
        "Content-Length": String(large.length),
      },
      body: large,
    });
    expect(Number(request.headers.get("Content-Length"))).toBeGreaterThan(1_000_000);

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: neverCalledNext(),
    });

    expect(response.status).toBe(413);
    // The guard must reject on the header alone — it should never have
    // touched (locked/consumed) the original body stream.
    expect(request.bodyUsed).toBe(false);
  });

  test("explicit Content-Length: 0 is trusted and passes through", async () => {
    // The heart of #481 was conflating ABSENT with ZERO: `Number(header || 0)`
    // coerced a missing header to 0, putting "no Content-Length at all" in
    // the same trusted bucket as a real empty body. The two must diverge: a
    // present, parseable "0" is a genuine framing declaration the edge
    // enforces (the body IS empty by the time it reaches the Worker), so the
    // guard trusts it and passes the request through — only ABSENCE falls
    // back to byte-counting (asserted by the streamed tests above).
    const request = new Request(NEUTRAL_URL, {
      method: "POST",
      headers: { ...LOOPBACK_HEADERS, "Content-Type": "application/json", "Content-Length": "0" },
    });
    expect(request.headers.get("Content-Length")).toBe("0");

    const next = vi.fn(okNext());
    const response = await onRequest({ request, env: minimalEnv(), data: {}, next });

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  test("small streamed JSON body (no Content-Length) passes through and the original body is still readable by next()", async () => {
    const payload = { hello: "world" };
    const encoded = new TextEncoder().encode(JSON.stringify(payload));
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });
    const request = new Request(NEUTRAL_URL, {
      method: "POST",
      headers: { ...LOOPBACK_HEADERS, "Content-Type": "application/json" },
      body,
      duplex: "half",
    });
    expect(request.headers.get("Content-Length")).toBeNull();

    // Mock next() that proves the ORIGINAL request body was never consumed
    // by the guard's byte-counting clone — if clone() had leaked/consumed
    // the original, this .json() call would throw or hang.
    const next = vi.fn(async () => {
      const parsed = await request.json();
      return new Response(JSON.stringify({ received: parsed }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    const response = await onRequest({ request, env: minimalEnv(), data: {}, next });

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.received).toEqual(payload);
  });

  test("multipart/form-data body >1MB on a non-photo-upload route is rejected with 413 (#495)", async () => {
    // #495: multipart used to be exempt everywhere, keyed solely off the
    // client-supplied Content-Type — any client could set
    // `Content-Type: multipart/form-data` on e.g. /api/metrics to skip the
    // 1MB guard entirely. URL here is the neutral /api/venues path (not the
    // one route — /api/admin/bands/photos — that legitimately gets a raised
    // ceiling), so this must now be rejected like any other oversized body.
    const boundary = "----test-boundary";
    const largeField = "x".repeat(1_100_000);
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"\r\n\r\n` +
      `${largeField}\r\n` +
      `--${boundary}--\r\n`;

    const request = new Request(NEUTRAL_URL, {
      method: "POST",
      headers: {
        ...LOOPBACK_HEADERS,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    });
    expect(Number(request.headers.get("Content-Length"))).toBeGreaterThan(1_000_000);

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: neverCalledNext(),
    });

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("Payload too large");
  });

  test("multipart-declared POST to /api/metrics with Content-Length >1MB is rejected with 413 (#495)", async () => {
    // The exact bypass shape from #495: declare multipart Content-Type on a
    // route that has no business accepting file uploads, to try to dodge the
    // 1MB limit. /api/metrics is not the pinned photo-upload route, so it
    // gets the standard 1MB ceiling like any other endpoint.
    const boundary = "----test-boundary";
    const largeField = "x".repeat(1_100_000);
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"\r\n\r\n` +
      `${largeField}\r\n` +
      `--${boundary}--\r\n`;

    const request = new Request("https://example.test/api/metrics", {
      method: "POST",
      headers: {
        ...LOOPBACK_HEADERS,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    });
    expect(Number(request.headers.get("Content-Length"))).toBeGreaterThan(1_000_000);

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: neverCalledNext(),
    });

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("Payload too large");
  });

  test("multipart-declared POST to /api/metrics with no Content-Length and a streamed body >1MB is rejected with 413 (#495)", async () => {
    // Same bypass attempt, but via the streamed/chunked path (no
    // Content-Length at all) instead of a declared one — must fall back to
    // byte-counting and still reject at the standard 1MB ceiling since
    // /api/metrics isn't the photo-upload route.
    const body = streamOfChunks([250_000, 250_000, 250_000, 250_000, 250_000]);
    const request = new Request("https://example.test/api/metrics", {
      method: "POST",
      headers: {
        ...LOOPBACK_HEADERS,
        "Content-Type": "multipart/form-data; boundary=----test-boundary",
      },
      body,
      duplex: "half",
    });
    expect(request.headers.get("Content-Length")).toBeNull();

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: neverCalledNext(),
    });

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("Payload too large");
  });

  test("multipart POST to /api/admin/bands/photos with Content-Length between 1MB and 6MB passes through (#495)", async () => {
    // The one route that legitimately gets a raised ceiling. 5MB is above
    // the standard 1MB guard but under the 6MB coarse DoS ceiling — this must
    // reach next(), leaving the precise 5MB-per-file business rule to
    // photos.js itself.
    const boundary = "----test-boundary";
    const fiveMbField = "x".repeat(5 * 1024 * 1024);
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="photo"; filename="band.jpg"\r\n\r\n` +
      `${fiveMbField}\r\n` +
      `--${boundary}--\r\n`;

    const request = new Request("https://example.test/api/admin/bands/photos", {
      method: "POST",
      headers: {
        ...LOOPBACK_HEADERS,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    });
    expect(Number(request.headers.get("Content-Length"))).toBeGreaterThan(1_000_000);
    expect(Number(request.headers.get("Content-Length"))).toBeLessThan(6_000_000);

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: okNext(),
    });

    expect(response.status).toBe(200);
  });

  test("multipart POST to /api/admin/bands/photos with Content-Length >6MB is rejected with 413 (#495)", async () => {
    // Even the pinned photo-upload route has a ceiling — 6MB is a coarse DoS
    // backstop, not a rubber stamp. A body well past any real upload (5MB
    // file + overhead) must still be rejected here, before photos.js ever
    // parses formData.
    const boundary = "----test-boundary";
    const sevenMbField = "x".repeat(7 * 1024 * 1024);
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="photo"; filename="band.jpg"\r\n\r\n` +
      `${sevenMbField}\r\n` +
      `--${boundary}--\r\n`;

    const request = new Request("https://example.test/api/admin/bands/photos", {
      method: "POST",
      headers: {
        ...LOOPBACK_HEADERS,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    });
    expect(Number(request.headers.get("Content-Length"))).toBeGreaterThan(6_000_000);

    const response = await onRequest({
      request,
      env: minimalEnv(),
      data: {},
      next: neverCalledNext(),
    });

    expect(response.status).toBe(413);
    const payload = await response.json();
    expect(payload.error).toBe("Payload too large");
  });

  test("erroring stream during byte-counting fails open: falls through to next(), no unhandled rejection", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const body = erroringStream();
    const request = new Request(NEUTRAL_URL, {
      method: "POST",
      headers: { ...LOOPBACK_HEADERS, "Content-Type": "application/json" },
      body,
      duplex: "half",
    });
    expect(request.headers.get("Content-Length")).toBeNull();

    const next = vi.fn(okNext());

    const response = await onRequest({ request, env: minimalEnv(), data: {}, next });

    // Fail open: the guard's own read error must not become a 413 or 500 —
    // the request proceeds to the real handler.
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    // Pin the GUARD's warn specifically (message + its totalBytes context
    // key), not just "some warn fired" — otherwise an unrelated warn added
    // earlier in the middleware would keep this green even if the guard's
    // logging were deleted. The exact byte count is NOT pinned: an erroring
    // web stream discards its queued chunks, so how many bytes get counted
    // before the read rejects is a timing detail, not a contract.
    const warnOutput = warnSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(warnOutput).toContain("Body-size guard: stream read failed");
    expect(warnOutput).toContain('"totalBytes":');
  });
});
