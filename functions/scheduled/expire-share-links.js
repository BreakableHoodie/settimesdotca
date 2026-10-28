import { toSqliteDateTime } from "../utils/authAttempts.js";

export async function expireShareLinks(_event, env, _ctx) {
  const { DB } = env;
  if (!DB) {
    console.error("[scheduled] Failed to clean up expired share links: DB binding is missing");
    return { failures: ["expire-share-links"] };
  }

  try {
    // Compute one cutoff so a link cannot fall between the aggregate fold and
    // either delete. The fold must share the deletes' atomic batch so a retry
    // cannot lose or double-count a link when the batch fails.
    const cutoff = toSqliteDateTime(new Date());

    // The ledger rows are deleted EXPLICITLY, not left to the FK cascade.
    // `share_link_views` declares ON DELETE CASCADE, but that only fires when
    // `PRAGMA foreign_keys = ON` is set for the session — and this is a cron
    // handler reached from `_scheduled.js`, which never passes through
    // `_middleware.js` where that pragma is applied. D1 defaults it OFF, so
    // relying on the cascade here would silently orphan a row per visitor,
    // forever, with no reclamation path.
    //
    // Child first, then parent, and batched so it is atomic (D1 has no
    // BEGIN/COMMIT — see CLAUDE.md). The FK is still worth declaring: the
    // event-deletion path DOES run through the middleware and cascades
    // correctly.
    await DB.batch([
      DB.prepare(
        `INSERT INTO event_share_totals (event_id, shares, views, views_legacy, imports)
         SELECT event_id, COUNT(*), COALESCE(SUM(view_count), 0),
                COALESCE(SUM(view_count_legacy), 0), COALESCE(SUM(import_count), 0)
         FROM share_links
         WHERE expires_at < ?
         GROUP BY event_id
         ON CONFLICT(event_id) DO UPDATE SET
           shares = event_share_totals.shares + excluded.shares,
           views = event_share_totals.views + excluded.views,
           views_legacy = event_share_totals.views_legacy + excluded.views_legacy,
           imports = event_share_totals.imports + excluded.imports`,
      ).bind(cutoff),
      DB.prepare(
        `DELETE FROM share_link_views WHERE slug IN
           (SELECT slug FROM share_links WHERE expires_at < ?)`,
      ).bind(cutoff),
      DB.prepare(`DELETE FROM share_links WHERE expires_at < ?`).bind(cutoff),
    ]);
  } catch (err) {
    console.error("[scheduled] Failed to clean up expired share links", err);
    return { failures: ["expire-share-links"] };
  }

  return { failures: [] };
}
