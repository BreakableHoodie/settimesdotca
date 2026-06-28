import { scheduled as aggregateStats } from "./scheduled/aggregate-stats.js";
import { expireShareLinks } from "./scheduled/expire-share-links.js";
import { flushAnnounceDigest } from "./utils/announceDigest.js";

export async function scheduled(event, env, ctx) {
  await aggregateStats(event, env, ctx);
  await expireShareLinks(event, env, ctx);
  try {
    await flushAnnounceDigest(env, env.DB);
  } catch (err) {
    console.error("[scheduled] flushAnnounceDigest failed", err);
  }
}
