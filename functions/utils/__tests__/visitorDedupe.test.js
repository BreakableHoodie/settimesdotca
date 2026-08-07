import { describe, expect, it } from "vitest";
import { isLikelyCrawler, visitorHash } from "../visitorDedupe.js";

// RFC 5737 documentation range — never a real client.
const IP_A = "203.0.113.10";
const IP_B = "203.0.113.11";

const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

function req(ip, userAgent) {
  const headers = new Headers();
  if (userAgent !== undefined) headers.set("User-Agent", userAgent);
  headers.set("CF-Connecting-IP", ip);
  return new Request("https://settimes.ca/api/schedule/share/abc123", { headers });
}

describe("isLikelyCrawler", () => {
  // These are the actual unfurlers that hit a pasted share link. Each one that
  // slips through is a phantom "view" on a route nobody opened.
  it.each([
    ["facebookexternalhit/1.1", "facebook/iMessage"],
    ["Twitterbot/1.0", "twitter"],
    ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "slack"],
    ["WhatsApp/2.23.20.0", "whatsapp"],
    ["Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)", "discord"],
    ["TelegramBot (like TwitterBot)", "telegram"],
    ["LinkedInBot/1.0", "linkedin"],
    ["Mozilla/5.0 (compatible; Applebot/0.1)", "applebot"],
    ["SkypeUriPreview Preview/0.5", "skype"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1)", "googlebot"],
  ])("treats %s as a crawler (%s)", (ua) => {
    expect(isLikelyCrawler(ua)).toBe(true);
  });

  it("treats a missing or blank User-Agent as a crawler", () => {
    // Every real browser sends one. Failing this direction undercounts rather
    // than inflating, which is the safe direction for this metric.
    expect(isLikelyCrawler(undefined)).toBe(true);
    expect(isLikelyCrawler(null)).toBe(true);
    expect(isLikelyCrawler("")).toBe(true);
    expect(isLikelyCrawler("   ")).toBe(true);
  });

  it("does NOT treat real browsers as crawlers", () => {
    // The load-bearing half: if this regressed, the counter would read zero
    // forever and look like nobody opens share links.
    expect(isLikelyCrawler(CHROME)).toBe(false);
    expect(isLikelyCrawler(SAFARI_IOS)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isLikelyCrawler("SLACKBOT-LinkExpanding")).toBe(true);
  });
});

describe("visitorHash", () => {
  it("returns a 64-char lowercase hex digest", async () => {
    const hash = await visitorHash(req(IP_A, CHROME), "abc123");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same visitor and link", async () => {
    const a = await visitorHash(req(IP_A, CHROME), "abc123");
    const b = await visitorHash(req(IP_A, CHROME), "abc123");
    expect(a).toBe(b);
  });

  it("differs when the IP, the User-Agent, or the slug differs", async () => {
    const base = await visitorHash(req(IP_A, CHROME), "abc123");
    expect(await visitorHash(req(IP_B, CHROME), "abc123")).not.toBe(base);
    expect(await visitorHash(req(IP_A, SAFARI_IOS), "abc123")).not.toBe(base);
    // Per-link salting: the same person on a different link must not be
    // correlatable across the ledger.
    expect(await visitorHash(req(IP_A, CHROME), "xyz789")).not.toBe(base);
  });

  it("never contains the raw IP", async () => {
    const hash = await visitorHash(req(IP_A, CHROME), "abc123");
    expect(hash).not.toContain(IP_A);
  });
});
