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
  it.each([
    // JS-rendering crawlers — the only ones that can actually reach the JSON
    // route this guards. Non-JS unfurlers fetch /s/[slug] instead.
    ["Mozilla/5.0 (compatible; Googlebot/2.1)", "googlebot"],
    ["Mozilla/5.0 (compatible; Applebot/0.1)", "applebot"],
    ["Mozilla/5.0 (compatible; bingbot/2.0)", "bingbot"],
    // Listed but inert today; kept in case the payload moves server-side.
    ["facebookexternalhit/1.1", "facebook/iMessage"],
    ["Twitterbot/1.0", "twitter"],
    ["Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)", "slack"],
    ["Mozilla/5.0 (compatible; Discordbot/2.0)", "discord"],
  ])("treats %s as a crawler (%s)", (ua) => {
    expect(isLikelyCrawler(ua)).toBe(true);
  });

  it("treats a missing or blank User-Agent as a PERSON", () => {
    // Only browser fetch() reaches this route, so an absent UA is far more
    // likely a privacy extension than a bot. Discarding those visitors would
    // be an invisible undercount. An earlier revision had this inverted.
    expect(isLikelyCrawler(undefined)).toBe(false);
    expect(isLikelyCrawler(null)).toBe(false);
    expect(isLikelyCrawler("")).toBe(false);
    expect(isLikelyCrawler("   ")).toBe(false);
  });

  it("does NOT treat real browsers as crawlers", () => {
    // The load-bearing half: if this regressed, the counter would read zero
    // forever and look like nobody opens share links.
    expect(isLikelyCrawler(CHROME)).toBe(false);
    expect(isLikelyCrawler(SAFARI_IOS)).toBe(false);
  });

  // Regression guard for real people a generic substring list silently ate.
  // Every UA reaching this route belongs to a human, so a false positive here
  // discards a fan with no trace. Do not reintroduce bare "bot"/"preview"/
  // "pinterest"/"crawler"/"spider" markers.
  it.each([
    ["Mozilla/5.0 (Linux; Android 11; CUBOT NOTE 20) AppleWebKit/537.36 Chrome/124", 'phone model contains "bot"'],
    ["Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Safari Technology Preview/17.0", 'channel contains "preview"'],
    ["Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 [Pinterest/iOS]", 'in-app browser contains "pinterest"'],
    ["Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 [FBAN/FBIOS;FB_IAB/FB4A]", "Messenger in-app browser"],
  ])("counts %s as a person (%s)", (ua) => {
    expect(isLikelyCrawler(ua)).toBe(false);
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
