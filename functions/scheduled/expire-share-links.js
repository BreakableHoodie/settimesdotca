export async function expireShareLinks(_event, env, _ctx) {
  const { DB } = env
  if (!DB) return

  try {
    await DB.prepare(`DELETE FROM share_links WHERE expires_at < datetime('now')`).run()
  } catch (err) {
    console.error('[scheduled] Failed to clean up expired share links', err)
  }
}
