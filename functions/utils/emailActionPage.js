import { escapeHtml } from "./html.js";

export const MAX_EMAIL_ACTION_TOKEN_LENGTH = 256;

export async function readEmailActionToken(request) {
  let token;
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const formToken = form.get("token");
      if (typeof formToken === "string" && formToken) token = formToken;
    } catch (err) {
      // A malformed body (e.g. multipart with a bad boundary) falls back to the
      // query string, which is also where an RFC 8058 one-click POST carries
      // the token. Never log the token itself.
      console.warn("[email-action] unreadable form body, falling back to query string:", err?.name);
    }
  }

  if (!token) token = new URL(request.url).searchParams.get("token");

  return token && token.length <= MAX_EMAIL_ACTION_TOKEN_LENGTH ? token : null;
}

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

// The outcome page after a POST. Both arguments are HTML: callers escape any
// interpolated value themselves.
export function emailResultPage(headingHtml, messageHtml) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body><h2>${headingHtml}</h2><p>${messageHtml}</p></body></html>`,
    { status: 200, headers: PAGE_HEADERS },
  );
}

// The page a GET renders: it explains the action and offers one button that
// POSTs the token back. It writes nothing, so a mail scanner's fetch is inert.
//
// The referrer meta is load-bearing. functions/_middleware.js sends
// `Referrer-Policy: no-referrer` on every Function response, and under that
// policy a browser submits this form with `Origin: null`, which the middleware's
// origin allowlist rejects with 403. Measured in Chromium against wrangler
// (2026-10-14): every button failed. `curl` sends no Origin and passed, which is
// why only a real browser caught it. `same-origin` restores the real Origin on
// this same-origin POST and still sends nothing to other sites. Do not
// allowlist "null" instead: sandboxed iframes send it too.
export function emailActionPage({ action, token, heading, message, buttonLabel }) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="referrer" content="same-origin"></head><body><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(message)}</p><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">${escapeHtml(buttonLabel)}</button></form></body></html>`,
    { status: 200, headers: PAGE_HEADERS },
  );
}
