/**
 * Public API: Get events timeline (now, upcoming, past)
 *
 * GET /api/events/timeline
 *
 * Returns events grouped by time period with bands and venues
 *
 * Performance: Uses JOIN queries to avoid N+1 query pattern
 */

export async function onRequestGet(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const url = new URL(request.url)
    const includeNow = url.searchParams.get('now') !== 'false' // default true
    const includeUpcoming = url.searchParams.get('upcoming') !== 'false' // default true
    const includePast = url.searchParams.get('past') !== 'false' // default true
    const pastLimit = parseInt(url.searchParams.get('pastLimit') || '10')

    const response = {
      now: [],
      upcoming: [],
      past: []
    }

    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // Helper function to group bands by event (processes results from JOIN query)
    function groupEventData(rows) {
      const eventsMap = new Map()

      for (const row of rows) {
        if (!eventsMap.has(row.event_id)) {
          eventsMap.set(row.event_id, {
            id: row.event_id,
            name: row.event_name,
            slug: row.event_slug,
            date: row.event_date,
            bands: [],
            venues: new Map()
          })
        }

        const event = eventsMap.get(row.event_id)

        // Add band if it exists
        if (row.band_id) {
          event.bands.push({
            id: row.band_id,
            name: row.band_name,
            start_time: row.start_time,
            end_time: row.end_time,
            url: row.url,
            genre: row.genre,
            origin: row.origin,
            photo_url: row.photo_url,
            venue_id: row.venue_id,
            venue_name: row.venue_name
          })

          // Track venue
          if (!event.venues.has(row.venue_id)) {
            event.venues.set(row.venue_id, {
              id: row.venue_id,
              name: row.venue_name,
              address: row.venue_address,
              band_count: 0
            })
          }
          event.venues.get(row.venue_id).band_count++
        }
      }

      return Array.from(eventsMap.values()).map(event => ({
        id: event.id,
        name: event.name,
        slug: event.slug,
        date: event.date,
        band_count: event.bands.length,
        venue_count: event.venues.size,
        bands: event.bands,
        venues: Array.from(event.venues.values())
      }))
    }

    // Get "Now" events (events happening today) - OPTIMIZED: Single query with JOIN
    if (includeNow) {
      const nowResult = await DB.prepare(`
        SELECT
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          b.id as band_id,
          b.name as band_name,
          b.start_time,
          b.end_time,
          b.url,
          b.genre,
          b.origin,
          b.photo_url,
          v.id as venue_id,
          v.name as venue_name,
          v.address as venue_address
        FROM events e
        LEFT JOIN bands b ON e.id = b.event_id
        LEFT JOIN venues v ON b.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date = ?
        ORDER BY e.date DESC, b.start_time, v.name
      `)
        .bind(today)
        .all()

      response.now = groupEventData(nowResult.results || [])
    }

    // Get "Upcoming" events (future events, next 30 days) - OPTIMIZED: Single query with JOIN
    if (includeUpcoming) {
      const upcomingResult = await DB.prepare(`
        SELECT
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          b.id as band_id,
          b.name as band_name,
          b.start_time,
          b.end_time,
          b.url,
          b.genre,
          b.origin,
          b.photo_url,
          v.id as venue_id,
          v.name as venue_name,
          v.address as venue_address
        FROM events e
        LEFT JOIN bands b ON e.id = b.event_id
        LEFT JOIN venues v ON b.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date > ?
        AND e.date <= date(?, '+30 days')
        AND e.id IN (
          SELECT id FROM events
          WHERE is_published = 1
          AND date > ?
          AND date <= date(?, '+30 days')
          ORDER BY date ASC
          LIMIT 10
        )
        ORDER BY e.date ASC, b.start_time, v.name
      `)
        .bind(today, today, today, today)
        .all()

      response.upcoming = groupEventData(upcomingResult.results || [])
    }

    // Get "Past" events (historical events) - OPTIMIZED: Single query with JOIN
    if (includePast) {
      const pastResult = await DB.prepare(`
        SELECT
          e.id as event_id,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          b.id as band_id,
          b.name as band_name,
          b.start_time,
          b.end_time,
          b.url,
          b.genre,
          b.origin,
          b.photo_url,
          v.id as venue_id,
          v.name as venue_name,
          v.address as venue_address
        FROM events e
        LEFT JOIN bands b ON e.id = b.event_id
        LEFT JOIN venues v ON b.venue_id = v.id
        WHERE e.is_published = 1
        AND e.date < ?
        AND e.id IN (
          SELECT id FROM events
          WHERE is_published = 1
          AND date < ?
          ORDER BY date DESC
          LIMIT ?
        )
        ORDER BY e.date DESC, b.start_time, v.name
      `)
        .bind(today, today, pastLimit)
        .all()

      response.past = groupEventData(pastResult.results || [])
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      }
    })
  } catch (error) {
    console.error('Error fetching events timeline:', error)

    return new Response(
      JSON.stringify({
        error: 'Failed to fetch events timeline'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}
