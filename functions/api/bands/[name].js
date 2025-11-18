/**
 * Public API: Get band profile by name
 * 
 * GET /api/bands/:name
 * 
 * Returns band profile with performance history
 */

export async function onRequestGet(context) {
  const { request, env } = context
  const { DB } = env
  
  try {
    const url = new URL(request.url)
    const parts = url.pathname.split('/')
    const searchParam = decodeURIComponent(parts[parts.length - 1])
    
    if (!searchParam) {
      return new Response(
        JSON.stringify({ error: 'Band identifier is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // Check if it's a numeric ID or a name
    let bandId = null
    let searchName = null
    
    if (!isNaN(searchParam) && parseInt(searchParam) > 0) {
      // It's a numeric ID
      bandId = parseInt(searchParam)
    } else {
      // It's a name - normalize search name: replace hyphens with spaces and trim
      searchName = searchParam.replace(/-/g, ' ').trim()
    }
    
    // Build query based on whether we're searching by ID or name
    let bands
    
    if (bandId) {
      // Search by ID
      bands = await DB.prepare(
        `
        SELECT
          b.id,
          b.name,
          b.url,
          b.event_id,
          b.venue_id,
          b.start_time,
          b.end_time,
          v.name as venue_name,
          v.address as venue_address,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          e.is_published as event_published
        FROM bands b
        LEFT JOIN venues v ON b.venue_id = v.id
        LEFT JOIN events e ON b.event_id = e.id
        WHERE b.id = ?
        LIMIT 1
        `
      )
        .bind(bandId)
        .first()
      
      // Convert single result to array format for consistency
      if (!bands) {
        return new Response(
          JSON.stringify({ error: 'Band not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
      
      // Get all performances for this band across all events by name
      const allPerformances = await DB.prepare(
        `
        SELECT
          b.id,
          b.event_id,
          b.venue_id,
          b.start_time,
          b.end_time,
          v.name as venue_name,
          v.address as venue_address,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          e.is_published as event_published
        FROM bands b
        LEFT JOIN venues v ON b.venue_id = v.id
        LEFT JOIN events e ON b.event_id = e.id
        WHERE b.name = ?
        ORDER BY e.date DESC, b.start_time
        `
      )
        .bind(bands.name)
        .all()
      
      // Build performances list (show all performances, regardless of event publication status)
      const performances = (allPerformances.results || [])
        .map(b => ({
          id: b.id,
          event_name: b.event_name,
          event_slug: b.event_slug,
          event_date: b.event_date,
          venue_name: b.venue_name,
          venue_address: b.venue_address,
          start_time: b.start_time,
          end_time: b.end_time,
        }))
      
      // Build profile object
      const profileData = {
        id: bands.id,
        name: bands.name,
        social: {
          website: bands.url,
        },
        performances,
      }
      
      return new Response(
        JSON.stringify(profileData),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      // Search by name (case-insensitive matching)
      const bandsList = await DB.prepare(
        `
        SELECT
          b.id,
          b.name,
          b.url,
          b.event_id,
          b.venue_id,
          b.start_time,
          b.end_time,
          v.name as venue_name,
          v.address as venue_address,
          e.name as event_name,
          e.slug as event_slug,
          e.date as event_date,
          e.is_published as event_published
        FROM bands b
        LEFT JOIN venues v ON b.venue_id = v.id
        LEFT JOIN events e ON b.event_id = e.id
        WHERE LOWER(TRIM(b.name)) = LOWER(?)
        ORDER BY e.date DESC, b.start_time
        `
      )
        .bind(searchName)
        .all()
      
      if (!bandsList.results || bandsList.results.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Band not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
      
      // Get unique profile data (should be the same for all instances)
      const profile = bandsList.results[0]
      
      // Build profile object
      const profileData = {
        id: profile.id,
        name: profile.name,
        social: {
          website: profile.url,
        },
        performances: bandsList.results
          .map(b => ({
            id: b.id,
            event_name: b.event_name,
            event_slug: b.event_slug,
            event_date: b.event_date,
            venue_name: b.venue_name,
            venue_address: b.venue_address,
            start_time: b.start_time,
            end_time: b.end_time,
          })),
      }
      
      return new Response(
        JSON.stringify(profileData),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('Error fetching band profile:', error, error.message, error.stack)
    
    return new Response(
      JSON.stringify({ error: 'Failed to fetch band profile', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

