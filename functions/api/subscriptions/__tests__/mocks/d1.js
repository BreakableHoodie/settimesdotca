// Mock D1 database for subscription system tests
export class MockD1Database {
  constructor() {
    this.data = {
      email_subscriptions: [],
      subscription_verifications: [],
      subscription_unsubscribes: [],
      events: [],
      venues: [],
      band_profiles: [],
      performances: []
    }
    this.idCounter = 1
  }

  prepare(query) {
    return {
      bind: (...params) => ({
        all: async () => this._executeSelect(query, params),
        run: async () => this._executeWrite(query, params)
      })
    }
  }

  _executeSelect(query, params) {
    const queryLower = query.toLowerCase()
    
    // SELECT from email_subscriptions with WHERE clauses
    if (queryLower.includes('select') && queryLower.includes('from email_subscriptions')) {
      let results = [...this.data.email_subscriptions]
      
      // Filter by WHERE clause
      // WHERE email = ? AND city = ? AND genre = ?
      if (queryLower.includes('where email = ?')) {
        const [email, city, genre] = params
        results = results.filter(sub => 
          sub.email === email && sub.city === city && sub.genre === genre
        )
      }
      
      // WHERE verification_token = ?
      if (queryLower.includes('where verification_token = ?')) {
        const [token] = params
        results = results.filter(sub => sub.verification_token === token)
      }
      
      // WHERE unsubscribe_token = ?
      if (queryLower.includes('where unsubscribe_token = ?')) {
        const [token] = params
        results = results.filter(sub => sub.unsubscribe_token === token)
      }
      
      // Map results based on SELECT columns
      if (queryLower.includes('select id, verified')) {
        results = results.map(sub => ({
          id: sub.id,
          verified: sub.verified
        }))
      } else if (queryLower.includes('select id, email, city, genre, verified')) {
        results = results.map(sub => ({
          id: sub.id,
          email: sub.email,
          city: sub.city,
          genre: sub.genre,
          verified: sub.verified
        }))
      } else if (queryLower.includes('select id, email, city, genre')) {
        results = results.map(sub => ({
          id: sub.id,
          email: sub.email,
          city: sub.city,
          genre: sub.genre
        }))
      } else if (queryLower.includes('select id, verification_token')) {
        results = results.map(sub => ({
          id: sub.id,
          verification_token: sub.verification_token
        }))
      }
      
      return { results }
    }
    
    // SELECT from subscription_verifications
    if (queryLower.includes('select') && queryLower.includes('from subscription_verifications')) {
      return { results: this.data.subscription_verifications }
    }
    
    // SELECT from subscription_unsubscribes
    if (queryLower.includes('select') && queryLower.includes('from subscription_unsubscribes')) {
      return { results: this.data.subscription_unsubscribes }
    }
    
    // SELECT from events (check if it's for bands/iCal feed by looking for band_name)
    if (queryLower.includes('select') && queryLower.includes('from events')) {
      // If query asks for band_name, it's for iCal feed
      if (queryLower.includes('bp.name as band_name') || queryLower.includes('p.start_time') || queryLower.includes('b.name as band_name') || queryLower.includes('b.start_time')) {
        return this._handleBandsQuery(queryLower, params)
      }
      // Otherwise it's for public API
      return this._handleEventsQuery(queryLower, params)
    }
    
    return { results: [] }
  }

  _executeWrite(query, params) {
    const queryLower = query.toLowerCase()
    
    // INSERT INTO email_subscriptions
    if (queryLower.includes('insert into email_subscriptions')) {
      const [email, city, genre, frequency, verificationToken, unsubscribeToken] = params
      
      const newSub = {
        id: this.idCounter++,
        email,
        city,
        genre,
        frequency,
        verification_token: verificationToken,
        unsubscribe_token: unsubscribeToken,
        verified: false,
        created_at: new Date().toISOString(),
        last_email_sent: null
      }
      
      this.data.email_subscriptions.push(newSub)
      return { success: true, meta: { changes: 1 } }
    }
    
    // UPDATE email_subscriptions SET verified = 1
    if (queryLower.includes('update email_subscriptions')) {
      // New atomic path: UPDATE ... WHERE verification_token = ? AND verified = 0
      if (queryLower.includes('where verification_token = ?')) {
        const [token] = params
        const subscription = this.data.email_subscriptions.find(
          sub => sub.verification_token === token && !sub.verified
        )

        if (subscription) {
          subscription.verified = true
          return { success: true, meta: { changes: 1 } }
        }

        return { success: true, meta: { changes: 0 } }
      }

      // Legacy path: UPDATE ... WHERE id = ?
      const [id] = params
      const subscription = this.data.email_subscriptions.find(sub => sub.id === id)

      if (subscription) {
        subscription.verified = true
        return { success: true, meta: { changes: 1 } }
      }

      return { success: true, meta: { changes: 0 } }
    }
    
    // DELETE FROM email_subscriptions
    if (queryLower.includes('delete from email_subscriptions')) {
      const [id] = params
      const index = this.data.email_subscriptions.findIndex(sub => sub.id === id)
      
      if (index !== -1) {
        this.data.email_subscriptions.splice(index, 1)
        return { success: true, meta: { changes: 1 } }
      }
      
      return { success: true, meta: { changes: 0 } }
    }
    
    // INSERT INTO subscription_verifications
    if (queryLower.includes('insert into subscription_verifications')) {
      const [subscriptionId] = params
      
      const verification = {
        id: this.data.subscription_verifications.length + 1,
        subscription_id: subscriptionId,
        verified_at: new Date().toISOString(),
        ip_address: null
      }
      
      this.data.subscription_verifications.push(verification)
      return { success: true, meta: { changes: 1 } }
    }
    
    // INSERT INTO subscription_unsubscribes
    if (queryLower.includes('insert into subscription_unsubscribes')) {
      const [subscriptionId] = params
      
      const unsub = {
        id: this.data.subscription_unsubscribes.length + 1,
        subscription_id: subscriptionId,
        unsubscribed_at: new Date().toISOString(),
        reason: null
      }
      
      this.data.subscription_unsubscribes.push(unsub)
      return { success: true, meta: { changes: 1 } }
    }
    
    return { success: true }
  }

  _handleEventsQuery(queryLower, params) {
    // This is a complex query with JOINs - return aggregated data
    let results = []
    
    results = this.data.events.map(event => {
      const eventPerformances = this.data.performances.filter(p => p.event_id === event.id)
      const uniqueBandIds = new Set(eventPerformances.map(p => p.band_profile_id))
      const uniqueVenueIds = new Set(eventPerformances.map(p => p.venue_id).filter(Boolean))

      return {
        id: event.id,
        name: event.name,
        slug: event.slug || `event-${event.id}`,
        date: event.date,
        description: event.description,
        city: event.city,
        ticket_url: event.ticket_url,
        band_count: uniqueBandIds.size,
        venue_count: uniqueVenueIds.size,
        is_published: event.is_published,
        published: event.published
      }
    })
    
    // Apply WHERE filters
    if (queryLower.includes('published = 1') || queryLower.includes('is_published = 1')) {
      results = results.filter(e => e.is_published !== 0 && e.published !== false)
    }
    
    let paramIndex = 0
    if (queryLower.includes("where city = ?") || queryLower.includes('lower(e.city) = lower(?)')) {
      const city = params[paramIndex++]
      results = results.filter(e => e.city?.toLowerCase() === city.toLowerCase())
    }

    if (queryLower.includes('lower(bp.genre) = lower(?)') || queryLower.includes('lower(b.genre) = lower(?)')) {
      const genre = params[paramIndex++]
      results = results.filter(event => {
        const performances = this.data.performances.filter(p => p.event_id === event.id)
        return performances.some(perf => {
          const band = this.data.band_profiles.find(bp => bp.id === perf.band_profile_id)
          return band?.genre?.toLowerCase() === genre.toLowerCase()
        })
      })
    }

    if (queryLower.includes("where date >= date('now')") || queryLower.includes("e.date >= date('now'")) {
      const today = new Date().toISOString().split('T')[0]
      results = results.filter(e => e.date >= today)
    }
    
    // Sort
    if (queryLower.includes('order by e.date asc')) {
      results.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    }

    if (queryLower.includes('limit ?')) {
      const limit = params[params.length - 1]
      if (Number.isFinite(limit)) {
        results = results.slice(0, limit)
      }
    }
    
    return { results }
  }

  _handleBandsQuery(queryLower, params) {
    // For iCal feeds - returns bands with event/venue details
    // Params order: [cityFilter, genreFilter] if both filters present
    //                [cityFilter] if only city filter
    //                [] if no filters
    
    let results = []
    let cityFilter = null
    let genreFilter = null
    
    // Simple param extraction - check query structure
    if (queryLower.includes('lower(e.city) = lower(?)') && (queryLower.includes('lower(b.genre) = lower(?)') || queryLower.includes('lower(bp.genre) = lower(?)'))) {
      // Both filters present
      cityFilter = params[0]
      genreFilter = params[1]
    } else if (queryLower.includes('lower(e.city) = lower(?)')) {
      // Only city filter
      cityFilter = params[0]
    } else if (queryLower.includes('lower(b.genre) = lower(?)') || queryLower.includes('lower(bp.genre) = lower(?)')) {
      // Only genre filter
      genreFilter = params[0]
    }
    
    for (const perf of this.data.performances) {
      const event = this.data.events.find(e => e.id === perf.event_id)
      const band = this.data.band_profiles.find(bp => bp.id === perf.band_profile_id)
      const venue = this.data.venues.find(v => v.id === perf.venue_id)
      
      if (!event || !band) continue
      
      // Check future events only
      const today = new Date().toISOString().split('T')[0]
      if (event.date < today) continue
      
      // Apply city filter
      if (cityFilter && event.city?.toLowerCase() !== cityFilter.toLowerCase()) {
        continue
      }
      
      // Apply genre filter
      if (genreFilter && band.genre?.toLowerCase() !== genreFilter.toLowerCase()) {
        continue
      }
      
      results.push({
        id: event.id,
        name: event.name,
        slug: event.slug || `event-${event.id}`,
        date: event.date,
        description: event.description,
        city: event.city,
        band_name: band.name,
        performance_id: perf.id,
        start_time: perf.start_time,
        end_time: perf.end_time,
        genre: band.genre,
        origin: band.origin,
        photo_url: band.photo_url,
        social_links: band.social_links,
        venue_name: venue?.name,
        address: venue?.address,
        event_id: event.id,
        event_name: event.name,
        event_slug: event.slug || `event-${event.id}`,
        event_date: event.date,
        band_id: band.id,
        venue_id: venue?.id,
        venue_address: venue?.address
      })
    }
    
    // Sort
    if (queryLower.includes('order by e.date asc, b.start_time asc') || queryLower.includes('order by e.date asc, p.start_time asc')) {
      results.sort((a, b) => {
        const dateCompare = (a.date || '').localeCompare(b.date || '')
        if (dateCompare !== 0) return dateCompare
        return (a.start_time || '').localeCompare(b.start_time || '')
      })
    }
    
    return { results }
  }

  reset() {
    this.data = {
      email_subscriptions: [],
      subscription_verifications: [],
      subscription_unsubscribes: [],
      events: [],
      venues: [],
      band_profiles: [],
      performances: []
    }
    this.idCounter = 1
  }
}
