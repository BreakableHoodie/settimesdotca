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
    } catch {
      // Fall back to the query string for malformed form bodies and RFC 8058.
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
export function emailActionPage({ action, token, heading, message, buttonLabel }) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"></head><body><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(message)}</p><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">${escapeHtml(buttonLabel)}</button></form></body></html>`,
    { status: 200, headers: PAGE_HEADERS },
  );
}
