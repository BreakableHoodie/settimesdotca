import { scheduled as aggregateStats } from './scheduled/aggregate-stats.js'
import { expireShareLinks } from './scheduled/expire-share-links.js'

export async function scheduled(event, env, ctx) {
  await aggregateStats(event, env, ctx)
  await expireShareLinks(event, env, ctx)
}
