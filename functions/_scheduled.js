import { scheduled as aggregateStats } from "./scheduled/aggregate-stats.js";

export async function scheduled(event, env, ctx) {
  return aggregateStats(event, env, ctx);
}
