// Bump when the follow/subscribe form or confirmation email wording changes.
// The stored value identifies the wording the person agreed to.
export const CONSENT_VERSION = "2026-10-13";

export const CONFIRMATION_WINDOW_DAYS = 7;

export function pendingConfirmationLiveSql(alias) {
  const column = alias ? `${alias}.created_at` : "created_at";
  return `${column} >= datetime('now', '-${CONFIRMATION_WINDOW_DAYS} days')`;
}
