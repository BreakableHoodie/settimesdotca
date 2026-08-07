// Visitor deduplication for public counters (#705).
//
// The share-link view counter used to increment on every GET, which counted
// fetches rather than people. The real cause is **reloads**: the same person
// refreshing a preview counted every time, which is what produced the observed
// "42 views" from one developer. The ledger fixes that.
//
// It is NOT link-preview crawlers, despite the obvious guess. Unfurlers
// (iMessage, Slack, WhatsApp, Twitter, Discord, Telegram) fetch the HTML
// document `/s/[slug]` — that is what `functions/s/[slug].js` exists for — and
// that handler does no counting at all. This JSON endpoint is fetched by the
// React app after hydration (SharePreviewPage, and App's ?import=1 refetch),
// so a crawler that does not execute JavaScript can never reach it.
//
// The filter below therefore guards a narrow case only: crawlers that DO
// render JavaScript (Googlebot, Applebot, bingbot). Keeping the non-JS
// unfurlers listed is free insurance in case this payload ever moves
// server-side; they cost one substring scan and currently match nothing.
//
// Generic markers were deliberately removed. A bare "bot" substring classifies
// the Android phone `CUBOT NOTE 20` as a crawler; "preview" classifies Safari
// Technology Preview and Edge preview channels; "pinterest" classifies the
// Pinterest in-app browser. Every UA that reaches this route belongs to a
// person, so a false positive here silently discards a real fan — the opposite
// of the problem being solved, and invisible when it happens.

import { getClientIP } from "./request.js";

// Substring matches, lowercased. Named agents only — see the note above on why
// generic "bot"/"crawler"/"spider"/"preview" markers are NOT here. Do not
// reintroduce them.
const CRAWLER_MARKERS = [
  // JS-rendering crawlers — the ones that can actually reach this route.
  "googlebot",
  "bingbot",
  "applebot",
  "yandexbot",
  "duckduckbot",
  // Non-JS unfurlers. Inert today (they fetch /s/[slug] instead), kept so the
  // filter still holds if this payload is ever served server-side.
  "facebookexternalhit",
  "twitterbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "linkedinbot",
  "skypeuripreview",
  "redditbot",
  "embedly",
];

/**
 * Is this User-Agent a crawler rather than a person?
 *
 * A missing or blank UA is treated as a PERSON, not a crawler. Only
 * browser-issued `fetch()` calls reach this route, so an absent UA is far more
 * likely a privacy extension stripping the header than a bot — and silently
 * discarding those visitors would be an invisible undercount with no trace.
 * (An earlier revision had this inverted, reasoning that browsers always send a
 * UA. True, but irrelevant once you know crawlers cannot get here.)
 *
 * @param {string|null|undefined} userAgent
 * @returns {boolean}
 */
export function isLikelyCrawler(userAgent) {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.trim().toLowerCase();
  if (ua === "") return false;
  return CRAWLER_MARKERS.some((marker) => ua.includes(marker));
}

/**
 * Stable, non-reversible key identifying one visitor of one share link.
 *
 * SHA-256 over `ip|user-agent|slug` via the platform's Web Crypto — the same
 * "use the runtime's primitive, add no crypto dependency" rule that governs
 * password hashing and TOTP in this codebase.
 *
 * The raw IP is never stored; only this digest reaches D1. Including the slug
 * salts each link separately, so the ledger cannot be used to correlate one
 * visitor across different share links — the hash for the same person differs
 * per link by construction.
 *
 * This is deliberately coarse. Shared NAT makes two fans on the same venue
 * wifi with identical browsers collide into one count, and a phone moving from
 * wifi to cellular counts twice. Both are acceptable for a share-view metric,
 * and both err smaller than the crawler inflation being removed. Do not
 * repurpose this for anything requiring real identity.
 *
 * @param {Request} request
 * @param {string} slug
 * @returns {Promise<string>} lowercase hex digest
 */
export async function visitorHash(request, slug) {
  const ip = getClientIP(request);
  const userAgent = request.headers.get("User-Agent") || "";
  const material = `${ip}|${userAgent}|${slug}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
