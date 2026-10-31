// The window an unconfirmed follow/subscription request stays live. Only the
// retention job still reads it, until the legacy tables are dropped.
export const CONFIRMATION_WINDOW_DAYS = 7;

export function pendingConfirmationLiveSql(alias) {
  const column = alias ? `${alias}.created_at` : "created_at";
  return `${column} >= datetime('now', '-${CONFIRMATION_WINDOW_DAYS} days')`;
}
