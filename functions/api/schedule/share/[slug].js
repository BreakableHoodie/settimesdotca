// Public API: Fetch a schedule share link snapshot
// GET /api/schedule/share/[slug]

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function onRequestGet(context) {
  const { params, env } = context
  const { DB } = env
  const { slug } = params

  if (!slug || !/^[a-zA-Z0-9]{1,16}$/.test(slug)) {
    return json({ error: 'Invalid slug' }, 400)
  }

  try {
    const row = await DB.prepare(
      `SELECT sl.slug, sl.event_slug, sl.performance_ids, sl.band_names, e.name AS event_name
       FROM share_links sl
       JOIN events e ON e.id = sl.event_id
       WHERE sl.slug = ? AND sl.expires_at > datetime('now')`
    )
      .bind(slug)
      .first()

    if (!row) {
      return json({ error: 'Share link not found or expired' }, 404)
    }

    return json({
      slug: row.slug,
      event_slug: row.event_slug,
      event_name: row.event_name,
      performance_ids: JSON.parse(row.performance_ids),
      band_names: JSON.parse(row.band_names),
    })
  } catch (err) {
    console.error('Share link fetch error:', err)
    return json({ error: 'Failed to fetch share link' }, 500)
  }
}
