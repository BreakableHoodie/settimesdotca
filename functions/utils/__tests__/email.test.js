// Tests for functions/utils/email.js — the fire-and-forget transactional
// email sender behind (among other things) the band-follow double opt-in
// confirmation email, the ONLY path to `band_follows.verified = 1`.
//
// #1015: this module sat at 35.7% statement coverage. What was covered was
// the config/precondition logic (not-configured, missing fields); the
// provider dispatch and all three `fetch` calls (Postmark, MailChannels,
// Resend) had never executed under test, because every OTHER test file that
// touches this module (bandFollowNotify.test.js, announce-*.test.js, etc.)
// stubs `sendEmail` wholesale via `vi.mock("../email.js", ...)`.
//
// No real network calls: every test stubs `globalThis.fetch` directly and
// restores it in afterEach, matching the idiom in turnstile.test.js (the
// closest sibling: another best-effort external HTTP call whose failure must
// never throw to the caller).
import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailConfigured, sendEmail } from "../email.js";

const PAYLOAD = {
  to: "fan@example.com",
  subject: "Confirm your follow",
  html: "<p>Click to confirm</p>",
  text: "Click to confirm",
};

function jsonResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isEmailConfigured", () => {
  it("is false with no EMAIL_PROVIDER set", () => {
    expect(isEmailConfigured({})).toBe(false);
  });

  it("is false when EMAIL_PROVIDER is set but there is no from address", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "mailchannels" })).toBe(false);
  });

  it("is false for an unrecognized provider name, even with a from address", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "sendgrid", EMAIL_FROM: "a@b.com" })).toBe(false);
  });

  it("honours EMAIL_PROVIDER case-insensitively (line 6 lowercases it)", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "MailChannels", EMAIL_FROM: "a@b.com" })).toBe(true);
  });

  it("EMAIL_FROM takes precedence, but ADMIN_EMAIL is an accepted fallback", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "mailchannels", ADMIN_EMAIL: "admin@b.com" })).toBe(true);
  });

  it("mailchannels needs only a provider + from — no token gate", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "mailchannels", EMAIL_FROM: "a@b.com" })).toBe(true);
  });

  it("postmark is not configured without POSTMARK_API_TOKEN", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "postmark", EMAIL_FROM: "a@b.com" })).toBe(false);
  });

  it("postmark is configured once POSTMARK_API_TOKEN is present", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "postmark", EMAIL_FROM: "a@b.com", POSTMARK_API_TOKEN: "tok" })).toBe(
      true,
    );
  });

  it("resend is not configured without RESEND_API_KEY", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.com" })).toBe(false);
  });

  it("resend is configured once RESEND_API_KEY is present", () => {
    expect(isEmailConfigured({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.com", RESEND_API_KEY: "key" })).toBe(true);
  });
});

describe("sendEmail — preconditions", () => {
  it("returns not_configured (and never calls fetch) with no provider", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail({}, PAYLOAD);

    expect(result).toEqual({ delivered: false, reason: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns not_configured with a provider but no from address", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail({ EMAIL_PROVIDER: "mailchannels" }, PAYLOAD);

    expect(result).toEqual({ delivered: false, reason: "not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns missing_fields (and never calls fetch) when `to` is absent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env = { EMAIL_PROVIDER: "mailchannels", EMAIL_FROM: "noreply@settimes.ca" };

    const result = await sendEmail(env, { ...PAYLOAD, to: undefined });

    expect(result).toEqual({ delivered: false, reason: "missing_fields" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns missing_fields (and never calls fetch) when `subject` is absent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env = { EMAIL_PROVIDER: "mailchannels", EMAIL_FROM: "noreply@settimes.ca" };

    const result = await sendEmail(env, { ...PAYLOAD, subject: undefined });

    expect(result).toEqual({ delivered: false, reason: "missing_fields" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns missing_postmark_token (and never calls fetch) when the provider is postmark with no token", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env = { EMAIL_PROVIDER: "postmark", EMAIL_FROM: "noreply@settimes.ca" };

    const result = await sendEmail(env, PAYLOAD);

    expect(result).toEqual({ delivered: false, reason: "missing_postmark_token" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns missing_resend_token (and never calls fetch) when the provider is resend with no token", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const env = { EMAIL_PROVIDER: "resend", EMAIL_FROM: "noreply@settimes.ca" };

    const result = await sendEmail(env, PAYLOAD);

    expect(result).toEqual({ delivered: false, reason: "missing_resend_token" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("sendEmail — Postmark", () => {
  const env = {
    EMAIL_PROVIDER: "postmark",
    EMAIL_FROM: "noreply@settimes.ca",
    POSTMARK_API_TOKEN: "postmark-test-token",
  };

  it("POSTs to the Postmark URL with the token header and the right payload shape", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail(env, PAYLOAD);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.postmarkapp.com/email");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["X-Postmark-Server-Token"]).toBe("postmark-test-token");
    // No bearer/auth header of a DIFFERENT shape should leak in.
    expect(options.headers.Authorization).toBeUndefined();

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      From: "noreply@settimes.ca",
      To: PAYLOAD.to,
      Subject: PAYLOAD.subject,
      HtmlBody: PAYLOAD.html,
      TextBody: PAYLOAD.text,
    });

    expect(result).toEqual({ delivered: true });
  });

  it("a 2xx response yields delivered: true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200)),
    );
    const result = await sendEmail(env, PAYLOAD);
    expect(result).toEqual({ delivered: true });
  });

  it("a non-2xx response yields delivered: false with a derived reason, and does not throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(422, { Message: "invalid" })),
    );
    const result = await sendEmail(env, PAYLOAD);
    expect(result).toEqual({ delivered: false, reason: "postmark_error" });
  });

  it("a network-level fetch rejection yields delivered: false, never a rejected promise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("simulated network failure");
      }),
    );

    await expect(sendEmail(env, PAYLOAD)).resolves.toEqual({
      delivered: false,
      reason: "postmark_fetch_error",
    });
  });
});

describe("sendEmail — MailChannels", () => {
  const env = { EMAIL_PROVIDER: "mailchannels", EMAIL_FROM: "noreply@settimes.ca" };

  it("POSTs to the MailChannels URL with NO auth header and the right payload shape", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(202));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail(env, PAYLOAD);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.mailchannels.net/tx/v1/send");
    expect(options.method).toBe("POST");
    // MailChannels needs no bearer/API-key header at all — pin that absence.
    expect(Object.keys(options.headers)).toEqual(["Content-Type"]);
    expect(options.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      personalizations: [{ to: [{ email: PAYLOAD.to }] }],
      from: { email: "noreply@settimes.ca" },
      subject: PAYLOAD.subject,
      content: [
        { type: "text/html", value: PAYLOAD.html },
        { type: "text/plain", value: PAYLOAD.text },
      ],
    });

    expect(result).toEqual({ delivered: true });
  });

  it("omits the text/plain content entry when no text body is given", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(202));
    vi.stubGlobal("fetch", fetchSpy);

    await sendEmail(env, { ...PAYLOAD, text: undefined });

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.content).toEqual([{ type: "text/html", value: PAYLOAD.html }]);
  });

  it("a non-2xx response yields delivered: false with a derived reason, and does not throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(500)),
    );
    const result = await sendEmail(env, PAYLOAD);
    expect(result).toEqual({ delivered: false, reason: "mailchannels_error" });
  });

  it("a network-level fetch rejection yields delivered: false, never a rejected promise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("simulated network failure");
      }),
    );

    await expect(sendEmail(env, PAYLOAD)).resolves.toEqual({
      delivered: false,
      reason: "mailchannels_fetch_error",
    });
  });
});

describe("sendEmail — Resend", () => {
  const env = { EMAIL_PROVIDER: "resend", EMAIL_FROM: "noreply@settimes.ca", RESEND_API_KEY: "resend-test-key" };

  it("POSTs to the Resend URL with a Bearer auth header and the right payload shape", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(200));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await sendEmail(env, PAYLOAD);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers.Authorization).toBe("Bearer resend-test-key");
    // Never the Postmark-shaped header on this provider.
    expect(options.headers["X-Postmark-Server-Token"]).toBeUndefined();

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      from: "noreply@settimes.ca",
      to: [PAYLOAD.to],
      subject: PAYLOAD.subject,
      html: PAYLOAD.html,
      text: PAYLOAD.text,
    });

    expect(result).toEqual({ delivered: true });
  });

  it("a non-2xx response yields delivered: false with a derived reason, and does not throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(401, { message: "invalid api key" })),
    );
    const result = await sendEmail(env, PAYLOAD);
    expect(result).toEqual({ delivered: false, reason: "resend_error" });
  });

  it("a network-level fetch rejection yields delivered: false, never a rejected promise", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("simulated network failure");
      }),
    );

    await expect(sendEmail(env, PAYLOAD)).resolves.toEqual({
      delivered: false,
      reason: "resend_fetch_error",
    });
  });
});
