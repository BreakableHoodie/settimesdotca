// settimes.ca no longer emails fans (band follows and event subscriptions were
// removed). Links in old emails still land on five URLs, so each answers with
// this one static page. It never reads the token or the database.

const MESSAGE =
  "settimes.ca no longer sends email updates, and we have deleted the email addresses we stored for them. There is nothing you need to do.";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
};

const PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Email updates have ended | settimes.ca</title></head><body><h2>Email updates have ended</h2><p>${MESSAGE}</p><p><a href="/">Go to settimes.ca</a></p></body></html>`;

export function emailUpdatesEndedResponse() {
  return new Response(PAGE, { status: 410, headers: HEADERS });
}

// Route files re-export these three: `export { onRequestGet, onRequestPost, onRequest } from "...";`
// GET and POST answer 410; any other method is 405 (a more specific
// onRequestGet/onRequestPost takes precedence over onRequest in Pages).
export const onRequestGet = () => emailUpdatesEndedResponse();
export const onRequestPost = () => emailUpdatesEndedResponse();
export const onRequest = () =>
  new Response("Method not allowed.", {
    status: 405,
    headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", Allow: "GET, POST" },
  });
