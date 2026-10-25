/**
 * Public "N fans planned this set" figure on an artist's page (#1246).
 *
 * The count comes from `schedule_builds`, one row per planner per set (the
 * unique index on event_id, performance_id, visitor_hash), so COUNT(*) is the
 * number of distinct planners. Anonymised `anon:<n>` rows still count once each.
 */

// A count of one or two says very little and can embarrass a band, so it is
// not shown. This is a presentation floor, NOT a privacy control: builds are
// unauthenticated, so a caller can add their own planners to cross it and then
// subtract them (CodeRabbit, #1385). What protects people is that the count is
// anonymous: how many, never who. PrivacyPage.jsx states this number ("reaches
// three"): change both together.
export const PLANNED_COUNT_MIN = 3;

/**
 * The only way a planned count reaches a response. Returns null for a cancelled
 * set (nobody is going to see it) or a count under the floor, else the number.
 */
export function publicPlannedCount(count, isCancelled) {
  if (isCancelled) return null;
  if (!Number.isInteger(count) || count < PLANNED_COUNT_MIN) return null;
  return count;
}
