export async function expireShareLinks(_event, env, _ctx) {
  const { DB } = env;
  if (!DB) return;

  try {
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
        `DELETE FROM share_link_views WHERE slug IN
           (SELECT slug FROM share_links WHERE expires_at < datetime('now'))`,
      ),
      DB.prepare(`DELETE FROM share_links WHERE expires_at < datetime('now')`),
    ]);
  } catch (err) {
    console.error("[scheduled] Failed to clean up expired share links", err);
  }
}
