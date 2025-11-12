// Minimal MockD1Database used by tests across subscriptions and events
// Provides a small in-memory store and a `prepare(sql).bind(...).all()/first()/run()` API
export class MockD1Database {
  constructor() {
    this.data = {
      events: [],
      venues: [],
      bands: [],
      email_subscriptions: [],
      subscription_verifications: [],
      subscription_unsubscribes: [],
    };
  }

  // Very small SQL matcher to support the project's test queries.
  // It doesn't parse SQL — it inspects the SQL string to determine intent.
  prepare(sql) {
    const self = this;

    function queryRunner(...params) {
      // Normalize SQL for simple detection
      const s = (sql || "").toLowerCase();

      // SELECT events with optional city/genre filters
      if (s.includes("from events") && s.includes("count(distinct b.id)")) {
        // Apply simple filters from params: city?, genre?, limit last param
        let events = [...self.data.events];

        // If params include city (string) and not a limit number
        const last = params[params.length - 1];
        const limit = typeof last === "number" ? last : 50;

        // If city provided as first param
        if (params.length >= 1 && typeof params[0] === "string" && params[0] !== "all") {
          const city = params[0].toLowerCase();
          events = events.filter((e) => (e.city || "").toLowerCase() === city);
        }

        // If genre provided as second param
        if (params.length >= 2 && typeof params[1] === "string" && params[1] !== "all") {
          const genre = params[1].toLowerCase();
          const eventIdsWithGenre = new Set(self.data.bands.filter(b => (b.genre||"").toLowerCase() === genre).map(b=>b.event_id));
          events = events.filter(e => eventIdsWithGenre.has(e.id));
        }

        // Sort by date ascending to emulate `ORDER BY e.date ASC` in SQL
        events.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

        const results = events.slice(0, limit).map(e => ({
          id: e.id,
          name: e.name,
          slug: e.slug,
          date: e.date,
          description: e.description,
          city: e.city,
          band_count: self.data.bands.filter(b => b.event_id === e.id).length,
          venue_count: new Set(self.data.bands.filter(b => b.event_id === e.id).map(b => b.venue_id)).size,
        }));

        return { results };
      }

      // Timeline queries: detect by presence of "e.date = ?" or "e.date > ?" or "e.date < ?"
      if (s.includes("e.date = ?") || s.includes("e.date > ?") || s.includes("e.date < ?")) {
        // Build rows by joining events -> bands -> venues according to requested date predicate
        const rows = [];
        for (const e of self.data.events) {
          // Only published events
          if (!e.is_published && !e.published) continue;

          // basic date comparison simulated by string compare
          const today = params.includes("today") ? new Date().toISOString().split('T')[0] : params[0];

          // If the SQL asked for equality
          if (s.includes("e.date = ?") && e.date !== params[0]) continue;
          if (s.includes("e.date > ?") && !(e.date > params[0])) continue;
          if (s.includes("e.date < ?") && !(e.date < params[0])) continue;

          const relatedBands = self.data.bands.filter(b => b.event_id === e.id);
          if (relatedBands.length === 0) {
            // push a row with null band
            rows.push({
              event_id: e.id,
              event_name: e.name,
              event_slug: e.slug,
              event_date: e.date,
              band_id: null,
              band_name: null,
              start_time: null,
              end_time: null,
              url: null,
              genre: null,
              origin: null,
              photo_url: null,
              venue_id: null,
              venue_name: null,
              venue_address: null,
            });
          } else {
            for (const b of relatedBands) {
              const v = self.data.venues.find(x => x.id === b.venue_id) || {};
              rows.push({
                event_id: e.id,
                event_name: e.name,
                event_slug: e.slug,
                event_date: e.date,
                band_id: b.id,
                band_name: b.name,
                start_time: b.start_time,
                end_time: b.end_time,
                url: b.url || null,
                genre: b.genre || null,
                origin: b.origin || null,
                photo_url: b.photo_url || null,
                venue_id: v.id || null,
                venue_name: v.name || null,
                venue_address: v.address || null,
              });
            }
          }
        }

        return { results: rows };
      }

      // Default: return empty
      return { results: [] };
    }

    const wrapper = {
      bind: (...params) => ({
        all: async () => queryRunner(...params),
        first: async () => {
          const r = queryRunner(...params);
          return Array.isArray(r.results) ? r.results[0] || null : null;
        },
        run: async () => ({ success: true }),
      }),
      all: async () => queryRunner(),
      first: async () => {
        const r = queryRunner();
        return Array.isArray(r.results) ? r.results[0] || null : null;
      },
      run: async () => ({ success: true }),
    };

    return wrapper;
  }
}

export default MockD1Database;
