// Admin specific venue operations
// PUT /api/admin/venues/{id} - Update venue
// DELETE /api/admin/venues/{id} - Delete venue

// Helper to extract venue ID from path
function getVenueId(request) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/')
  const idIndex = parts.indexOf('venues') + 1
  return parts[idIndex]
}

// PUT - Update venue
export async function onRequestPut(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const venueId = getVenueId(request)

    if (!venueId || isNaN(venueId)) {
      return new Response(
        JSON.stringify({
          error: 'Bad request',
          message: 'Invalid venue ID'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { name, address } = body

    // Validation
    if (!name) {
      return new Response(
        JSON.stringify({
          error: 'Validation error',
          message: 'Venue name is required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if venue exists
    const venue = await DB.prepare(`
      SELECT * FROM venues WHERE id = ?
    `).bind(venueId).first()

    if (!venue) {
      return new Response(
        JSON.stringify({
          error: 'Not found',
          message: 'Venue not found'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if name is already taken by another venue
    if (name !== venue.name) {
      const existingVenue = await DB.prepare(`
        SELECT id FROM venues WHERE name = ? AND id != ?
      `).bind(name, venueId).first()

      if (existingVenue) {
        return new Response(
          JSON.stringify({
            error: 'Conflict',
            message: 'A venue with this name already exists'
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
    }

    // Update venue
    const result = await DB.prepare(`
      UPDATE venues
      SET name = ?, address = ?
      WHERE id = ?
      RETURNING *
    `).bind(name, address || null, venueId).first()

    return new Response(
      JSON.stringify({
        success: true,
        venue: result
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error updating venue:', error)

    return new Response(
      JSON.stringify({
        error: 'Database error',
        message: 'Failed to update venue'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

// DELETE - Delete venue
export async function onRequestDelete(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const venueId = getVenueId(request)

    if (!venueId || isNaN(venueId)) {
      return new Response(
        JSON.stringify({
          error: 'Bad request',
          message: 'Invalid venue ID'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if venue exists
    const venue = await DB.prepare(`
      SELECT * FROM venues WHERE id = ?
    `).bind(venueId).first()

    if (!venue) {
      return new Response(
        JSON.stringify({
          error: 'Not found',
          message: 'Venue not found'
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if venue is used by any bands
    const bandCount = await DB.prepare(`
      SELECT COUNT(*) as count FROM bands WHERE venue_id = ?
    `).bind(venueId).first()

    if (bandCount.count > 0) {
      return new Response(
        JSON.stringify({
          error: 'Conflict',
          message: `Cannot delete venue. It is used by ${bandCount.count} band(s).`
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Delete venue
    await DB.prepare(`
      DELETE FROM venues WHERE id = ?
    `).bind(venueId).run()

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Venue deleted successfully'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error deleting venue:', error)

    return new Response(
      JSON.stringify({
        error: 'Database error',
        message: 'Failed to delete venue'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
