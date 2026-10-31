import { scheduled as aggregateStats } from "./scheduled/aggregate-stats.js";
import { expireShareLinks } from "./scheduled/expire-share-links.js";
import { anonymizeScheduleBuilds } from "./scheduled/anonymize-schedule-builds.js";

export async function scheduled(event, env, ctx) {
  const failures = [];
  const errors = [];

  async function runStep(name, step) {
    try {
      const result = await step();
      const stepFailures = result?.failures || [];
      failures.push(...stepFailures);
      errors.push(...stepFailures.map((label) => new Error(label)));
    } catch (error) {
      console.error("[scheduled] %s failed", name, error);
      failures.push(name);
      errors.push(error);
    }
  }

  await runStep("aggregate-stats", () => aggregateStats(event, env, ctx));
  await runStep("expire-share-links", () => expireShareLinks(event, env, ctx));
  await runStep("anonymize-schedule-builds", () => anonymizeScheduleBuilds(event, env, ctx));

  if (failures.length > 0) {
    const error = new AggregateError(errors, `scheduled steps failed: ${failures.join(", ")}`);
    error.failedSteps = failures;
    throw error;
  }
}
