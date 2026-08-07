// Visitor deduplication for public counters (#705).
//
// The share-link view counter used to increment on every GET, which counted
// fetches rather than people. Two distinct sources of inflation:
//
//   1. Link-preview crawlers. Pasting a share link into iMessage, Slack,
//      WhatsApp, Twitter, Discord or Telegram makes each of those services
//      fetch the URL to build an unfurl card. Sharing a route once could add
//      several "views" before any human opened it.
//   2. Reloads. The same person refreshing counted every time.
//
// These helpers address both: crawlers are excluded outright, and humans are
// collapsed to one view per link via a hashed visitor key.

import { getClientIP } from "./request.js";

// Substring matches, lowercased. The named entries are the unfurlers that
// actually hit this app's share links; the generic tail catches the long
// tail of well-behaved bots, which conventionally self-identify.
const CRAWLER_MARKERS = [
  "facebookexternalhit",
  "twitterbot",
  "slackbot",
  "whatsapp",
  "discordbot",
  "telegrambot",
  "linkedinbot",
  "applebot",
  "skypeuripreview",
  "redditbot",
  "googlebot",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "embedly",
  "quora link preview",
  "pinterest",
  "vkshare",
  "bot",
  "crawler",
  "spider",
  "preview",
];

/**
 * Is this User-Agent a link-preview crawler or bot rather than a person?
 *
 * An absent or blank UA counts as a crawler. Every real browser sends one, so
 * a missing UA is either a scripted client or something deliberately hiding —
 * neither is a fan worth counting, and excluding them fails toward
 * undercounting rather than inflation, which is the direction this metric
 * needs to be trustworthy in.
 *
 * @param {string|null|undefined} userAgent
 * @returns {boolean}
 */
export function isLikelyCrawler(userAgent) {
  if (typeof userAgent !== "string") return true;
  const ua = userAgent.trim().toLowerCase();
  if (ua === "") return true;
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
