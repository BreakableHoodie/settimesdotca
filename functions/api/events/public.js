// Public API for event discovery
// No authentication required
// Rate limited to prevent abuse

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)

  // Query parameters
  const city = url.searchParams.get('city') || 'all'
  const genre = url.searchParams.get('genre') || 'all'
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100)
  const upcoming = url.searchParams.get('upcoming') !== 'false' // Default true

  try {
    // Build query
    let query = `
      SELECT
        e.id,
        e.name,
        e.slug,
        e.date,
        e.description,
        e.city,
        COUNT(DISTINCT b.id) as band_count,
        COUNT(DISTINCT v.id) as venue_count
      FROM events e
      LEFT JOIN bands b ON b.event_id = e.id
      LEFT JOIN venues v ON v.id IN (SELECT DISTINCT venue_id FROM bands WHERE event_id = e.id)
      WHERE e.published = 1
    `

    const params = []

    // Filter by city
    if (city !== 'all') {
      query += ` AND LOWER(e.city) = LOWER(?)`
      params.push(city)
    }

    // Filter by genre (optimized to avoid N+1 queries)
    if (genre !== 'all') {
      query += ` AND EXISTS (
        SELECT 1 FROM bands
        WHERE bands.event_id = e.id
        AND LOWER(bands.genre) = LOWER(?)
      )`
      params.push(genre)
    }

    // Filter by upcoming (future events only)
    if (upcoming) {
      query += ` AND e.date >= date('now')`
    }

    query += `
      GROUP BY e.id
      ORDER BY e.date ASC
      LIMIT ?
    `
    params.push(limit)

    // Execute query (single query, no N+1 problem)
    const { results: filteredEvents } = await env.DB.prepare(query).bind(...params).all()

    // Return JSON
    return new Response(JSON.stringify({
      events: filteredEvents,
      filters: {
        city: city,
        genre: genre,
        upcoming: upcoming,
        limit: limit
      },
      count: filteredEvents.length,
      generated_at: new Date().toISOString()
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Allow anyone to consume
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    })

  } catch (error) {
    console.error('Public API error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch events' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
