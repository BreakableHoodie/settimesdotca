/**
 * Admin API: Performers (Global Band/Performer Registry)
 * 
 * GET    /api/admin/performers       - List all performers
 * GET    /api/admin/performers/:id   - Get single performer
 * POST   /api/admin/performers       - Create new performer
 * PUT    /api/admin/performers/:id   - Update performer
 * DELETE /api/admin/performers/:id   - Delete performer
 */

// GET - List all performers
export async function onRequestGet(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()

  try {
    // GET /api/admin/performers/:id - Get single performer
    if (id && id !== 'performers') {
      const performer = await DB.prepare(
        'SELECT * FROM performers WHERE id = ?'
      ).bind(id).first()

      if (!performer) {
        return new Response(
          JSON.stringify({ error: 'Performer not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Get performance stats for this performer
      const stats = await DB.prepare(`
        SELECT 
          COUNT(*) as total_performances,
          COUNT(DISTINCT event_id) as total_events,
          COUNT(DISTINCT venue_id) as total_venues
        FROM bands 
        WHERE performer_id = ?
      `).bind(id).first()

      return new Response(
        JSON.stringify({ 
          success: true, 
          performer: { ...performer, stats }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // GET /api/admin/performers - List all performers
    const result = await DB.prepare(`
      SELECT 
        p.*,
        COUNT(b.id) as performance_count
      FROM performers p
      LEFT JOIN bands b ON b.performer_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all()

    return new Response(
      JSON.stringify({ success: true, performers: result.results || [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to fetch performers:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch performers', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// POST - Create new performer
export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const body = await request.json()
    const { 
      name, genre, origin, description, photo_url, url, 
      instagram, bandcamp, facebook 
    } = body

    // Validation
    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Performer name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check for duplicate name
    const existing = await DB.prepare(
      'SELECT id FROM performers WHERE name = ?'
    ).bind(name.trim()).first()

    if (existing) {
      return new Response(
        JSON.stringify({ 
          error: 'A performer with this name already exists',
          existing_id: existing.id
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Create performer
    const result = await DB.prepare(`
      INSERT INTO performers (
        name, genre, origin, description, photo_url, url,
        instagram, bandcamp, facebook
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      name.trim(),
      genre?.trim() || null,
      origin?.trim() || null,
      description?.trim() || null,
      photo_url?.trim() || null,
      url?.trim() || null,
      instagram?.trim() || null,
      bandcamp?.trim() || null,
      facebook?.trim() || null
    ).first()

    return new Response(
      JSON.stringify({ success: true, performer: result }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to create performer:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create performer', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// PUT - Update performer
export async function onRequestPut(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()

  if (!id || id === 'performers') {
    return new Response(
      JSON.stringify({ error: 'Performer ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await request.json()
    const { 
      name, genre, origin, description, photo_url, url: performerUrl, 
      instagram, bandcamp, facebook 
    } = body

    // Check performer exists
    const existing = await DB.prepare(
      'SELECT id FROM performers WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return new Response(
        JSON.stringify({ error: 'Performer not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validation
    if (name && !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Performer name cannot be empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check for duplicate name (if name is being changed)
    if (name) {
      const duplicate = await DB.prepare(
        'SELECT id FROM performers WHERE name = ? AND id != ?'
      ).bind(name.trim(), id).first()

      if (duplicate) {
        return new Response(
          JSON.stringify({ error: 'A performer with this name already exists' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Update performer
    const result = await DB.prepare(`
      UPDATE performers
      SET 
        name = COALESCE(?, name),
        genre = ?,
        origin = ?,
        description = ?,
        photo_url = ?,
        url = ?,
        instagram = ?,
        bandcamp = ?,
        facebook = ?,
        updated_at = datetime('now')
      WHERE id = ?
      RETURNING *
    `).bind(
      name?.trim() || null,
      genre?.trim() || null,
      origin?.trim() || null,
      description?.trim() || null,
      photo_url?.trim() || null,
      performerUrl?.trim() || null,
      instagram?.trim() || null,
      bandcamp?.trim() || null,
      facebook?.trim() || null,
      id
    ).first()

    return new Response(
      JSON.stringify({ success: true, performer: result }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to update performer:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to update performer', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// DELETE - Delete performer
export async function onRequestDelete(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()

  if (!id || id === 'performers') {
    return new Response(
      JSON.stringify({ error: 'Performer ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Check if performer has any performances
    const performances = await DB.prepare(
      'SELECT COUNT(*) as count FROM bands WHERE performer_id = ?'
    ).bind(id).first()

    if (performances.count > 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Cannot delete performer with existing performances',
          performance_count: performances.count,
          suggestion: 'Remove or unlink all performances first'
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Delete performer
    await DB.prepare('DELETE FROM performers WHERE id = ?').bind(id).run()

    return new Response(
      JSON.stringify({ success: true, message: 'Performer deleted' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to delete performer:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to delete performer', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
