// Admin specific event operations
// PUT /api/admin/events/{id}/publish - Toggle publish status
// POST /api/admin/events/{id}/duplicate - Duplicate event

// Helper to extract event ID from path
function getEventId(request) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const idIndex = parts.indexOf('events') + 1
  return parts[idIndex]
}

// PUT - Toggle publish status
export async function onRequestPut(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)

  try {
    const eventId = getEventId(request)

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: 'Bad request',
          message: 'Invalid event ID'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if this is a publish request
    if (url.pathname.endsWith('/publish')) {
      // Get current event
      const event = await DB.prepare(`
        SELECT * FROM events WHERE id = ?
      `).bind(eventId).first()

      if (!event) {
        return new Response(
          JSON.stringify({
            error: 'Not found',
            message: 'Event not found'
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      // Toggle publish status
      const newStatus = event.is_published === 1 ? 0 : 1
      const result = await DB.prepare(`
        UPDATE events
        SET is_published = ?
        WHERE id = ?
        RETURNING *
      `).bind(newStatus, eventId).first()

      return new Response(
        JSON.stringify({
          success: true,
          event: result,
          message: newStatus === 1 ? 'Event published' : 'Event unpublished'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({
        error: 'Not found',
        message: 'Unknown operation'
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error updating event:', error)

    return new Response(
      JSON.stringify({
        error: 'Database error',
        message: 'Failed to update event'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

// POST - Duplicate event
export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)

  try {
    const eventId = getEventId(request)

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: 'Bad request',
          message: 'Invalid event ID'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if this is a duplicate request
    if (url.pathname.endsWith('/duplicate')) {
      const body = await request.json().catch(() => ({}))
      const { name, date, slug } = body

      // Validation
      if (!name || !date || !slug) {
        return new Response(
          JSON.stringify({
            error: 'Validation error',
            message: 'Name, date, and slug are required for duplicate event'
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      // Get original event
      const originalEvent = await DB.prepare(`
        SELECT * FROM events WHERE id = ?
      `).bind(eventId).first()

      if (!originalEvent) {
        return new Response(
          JSON.stringify({
            error: 'Not found',
            message: 'Original event not found'
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      // Check if slug already exists
      const existingEvent = await DB.prepare(`
        SELECT id FROM events WHERE slug = ?
      `).bind(slug).first()

      if (existingEvent) {
        return new Response(
          JSON.stringify({
            error: 'Conflict',
            message: 'An event with this slug already exists'
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      // Create new event (unpublished by default)
      const newEvent = await DB.prepare(`
        INSERT INTO events (name, date, slug, is_published)
        VALUES (?, ?, ?, 0)
        RETURNING *
      `).bind(name, date, slug).first()

      // Copy all bands from original event
      await DB.prepare(`
        INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url)
        SELECT ?, venue_id, name, start_time, end_time, url
        FROM bands
        WHERE event_id = ?
      `).bind(newEvent.id, eventId).run()

      // Get band count
      const bandCount = await DB.prepare(`
        SELECT COUNT(*) as count FROM bands WHERE event_id = ?
      `).bind(newEvent.id).first()

      return new Response(
        JSON.stringify({
          success: true,
          event: newEvent,
          bandsCopied: bandCount.count,
          message: `Event duplicated successfully with ${bandCount.count} bands`
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({
        error: 'Not found',
        message: 'Unknown operation'
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error duplicating event:', error)

    return new Response(
      JSON.stringify({
        error: 'Database error',
        message: 'Failed to duplicate event'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
