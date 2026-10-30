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
      performances: [],
    };
    this.idCounter = 1;
    this.rateLimitCounts = new Map();
  }

  _isPendingConfirmationLive(createdAt) {
    return (
      Date.parse(createdAt.replace(" ", "T") + (createdAt.includes("Z") ? "" : "Z")) >=
      Date.now() - 7 * 24 * 60 * 60 * 1000
    );
  }

  prepare(query) {
    return {
      bind: (...params) => ({
        all: async () => this._executeSelect(query, params),
        run: async () => this._executeWrite(query, params),
        // The rate_limits upsert-RETURNING (the per-recipient email cap, #1337)
        // counts calls per key like the real fixed-window counter; any other
        // first() is a SELECT's first row.
        first: async () => {
          if (!query.toLowerCase().includes("rate_limits")) {
            return (await this._executeSelect(query, params)).results?.[0] ?? null;
          }
          const [key, now] = params;
          const count = (this.rateLimitCounts.get(key) ?? 0) + 1;
          this.rateLimitCounts.set(key, count);
          return { count, window_start: now };
        },
      }),
    };
  }

  _executeSelect(query, params) {
    const queryLower = query.toLowerCase();

    // SELECT from email_subscriptions with WHERE clauses
    if (queryLower.includes("select") && queryLower.includes("from email_subscriptions")) {
      let results = [...this.data.email_subscriptions];

      // Filter by WHERE clause
      // WHERE email = ? AND city = ? AND genre = ?
      if (queryLower.includes("where email = ?")) {
        const [email, city, genre] = params;
        results = results.filter((sub) => sub.email === email && sub.city === city && sub.genre === genre);
      }

      if (queryLower.includes("where id = ?")) {
        const [id] = params;
        results = results.filter((sub) => sub.id === id);
      }

      // WHERE id = ? AND verification_token = ? (the rotation read-back)
      if (queryLower.includes("where id = ? and verification_token = ?")) {
        const [id, token] = params;
        results = results.filter((sub) => sub.id === id && sub.verification_token === token);
      }

      // WHERE verification_token = ?
      if (queryLower.includes("where verification_token = ?")) {
        const [token] = params;
        results = results.filter((sub) => sub.verification_token === token);
      }

      if (
        queryLower.includes("verified = 1 or (verified = 0") ||
        (queryLower.includes("verified = 0") && queryLower.includes("created_at >="))
      ) {
        results = results.filter((sub) => sub.verified || this._isPendingConfirmationLive(sub.created_at));
      }

      // WHERE unsubscribe_token = ?
      if (queryLower.includes("where unsubscribe_token = ?")) {
        const [token] = params;
        results = results.filter((sub) => sub.unsubscribe_token === token);
      }

      // Map results based on SELECT columns
      if (queryLower.includes("select id, verified, verification_token")) {
        results = results.map((sub) => ({
          id: sub.id,
          verified: sub.verified,
          verification_token: sub.verification_token,
        }));
      } else if (queryLower.includes("select id, verified")) {
        results = results.map((sub) => ({
          id: sub.id,
          verified: sub.verified,
        }));
      } else if (queryLower.includes("select id, email, city, genre, verified")) {
        results = results.map((sub) => ({
          id: sub.id,
          email: sub.email,
          city: sub.city,
          genre: sub.genre,
          verified: sub.verified,
        }));
      } else if (queryLower.includes("select id, email, city, genre")) {
        results = results.map((sub) => ({
          id: sub.id,
          email: sub.email,
          city: sub.city,
          genre: sub.genre,
        }));
      } else if (queryLower.includes("select id, verification_token")) {
        results = results.map((sub) => ({
          id: sub.id,
          verification_token: sub.verification_token,
        }));
      }

      return { results };
    }

    // SELECT from subscription_verifications
    if (queryLower.includes("select") && queryLower.includes("from subscription_verifications")) {
      return { results: this.data.subscription_verifications };
    }

    // SELECT from subscription_unsubscribes
    if (queryLower.includes("select") && queryLower.includes("from subscription_unsubscribes")) {
      return { results: this.data.subscription_unsubscribes };
    }

    // SELECT from events (check if it's for bands/iCal feed by looking for band_name)
    if (queryLower.includes("select") && queryLower.includes("from events")) {
      // If query asks for band_name, it's for iCal feed
      if (
        queryLower.includes("bp.name as band_name") ||
        queryLower.includes("p.start_time") ||
        queryLower.includes("b.name as band_name") ||
        queryLower.includes("b.start_time")
      ) {
        return this._handleBandsQuery(queryLower, params);
      }
      // Otherwise it's for public API
      return this._handleEventsQuery(queryLower, params);
    }

    return { results: [] };
  }

  _executeWrite(query, params) {
    const queryLower = query.toLowerCase();

    // INSERT INTO email_subscriptions
    if (queryLower.includes("insert into email_subscriptions")) {
      const [email, city, genre, frequency, verificationToken, unsubscribeToken, consentIp, consentVersion] = params;

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
        last_email_sent: null,
        consent_ip: consentIp ?? null,
        consent_method: "web_form",
        consent_version: consentVersion ?? null,
      };

      this.data.email_subscriptions.push(newSub);
      return { success: true, meta: { changes: 1 } };
    }

    // UPDATE email_subscriptions SET verified = 1
    if (queryLower.includes("update email_subscriptions")) {
      if (queryLower.includes("set verification_token = ?")) {
        const [newToken, id, currentToken] = params;
        const subscription = this.data.email_subscriptions.find(
          (sub) => sub.id === id && !sub.verified && sub.verification_token === currentToken,
        );
        if (
          subscription &&
          (!queryLower.includes("created_at >=") || this._isPendingConfirmationLive(subscription.created_at))
        ) {
          subscription.verification_token = newToken;
          // Follow the SQL: only a query that sets created_at moves it.
          if (queryLower.includes("created_at = datetime")) subscription.created_at = new Date().toISOString();
          return { success: true, meta: { changes: 1 } };
        }
        return { success: true, meta: { changes: 0 } };
      }

      // New atomic path: UPDATE ... WHERE verification_token = ? AND verified = 0
      if (queryLower.includes("where verification_token = ?")) {
        const [token] = params;
        const subscription = this.data.email_subscriptions.find(
          (sub) =>
            sub.verification_token === token &&
            !sub.verified &&
            (!queryLower.includes("created_at >=") || this._isPendingConfirmationLive(sub.created_at)),
        );

        if (subscription) {
          subscription.verified = true;
          if (queryLower.includes("confirmed_at")) {
            subscription.confirmed_at = new Date().toISOString().replace("T", " ").slice(0, 19);
          }
          return { success: true, meta: { changes: 1 } };
        }

        return { success: true, meta: { changes: 0 } };
      }

      // Legacy path: UPDATE ... WHERE id = ?
      const [id] = params;
      const subscription = this.data.email_subscriptions.find((sub) => sub.id === id);

      if (subscription) {
        subscription.verified = true;
        return { success: true, meta: { changes: 1 } };
      }

      return { success: true, meta: { changes: 0 } };
    }

    // DELETE FROM email_subscriptions
    if (queryLower.includes("delete from email_subscriptions")) {
      const [value] = params;
      const index = queryLower.includes("where verification_token = ?")
        ? this.data.email_subscriptions.findIndex((sub) => sub.verification_token === value)
        : this.data.email_subscriptions.findIndex((sub) => sub.id === value);

      if (
        index !== -1 &&
        (!queryLower.includes("created_at >=") ||
          !this._isPendingConfirmationLive(this.data.email_subscriptions[index].created_at))
      ) {
        this.data.email_subscriptions.splice(index, 1);
        return { success: true, meta: { changes: 1 } };
      }

      return { success: true, meta: { changes: 0 } };
    }

    // INSERT INTO subscription_verifications
    if (queryLower.includes("insert into subscription_verifications")) {
      const [subscriptionId] = params;

      const verification = {
        id: this.data.subscription_verifications.length + 1,
        subscription_id: subscriptionId,
        verified_at: new Date().toISOString(),
        ip_address: null,
      };

      this.data.subscription_verifications.push(verification);
      return { success: true, meta: { changes: 1 } };
    }

    // INSERT INTO subscription_unsubscribes
    if (queryLower.includes("insert into subscription_unsubscribes")) {
      const [subscriptionId] = params;

      const unsub = {
        id: this.data.subscription_unsubscribes.length + 1,
        subscription_id: subscriptionId,
        unsubscribed_at: new Date().toISOString(),
        reason: null,
      };

      this.data.subscription_unsubscribes.push(unsub);
      return { success: true, meta: { changes: 1 } };
    }

    return { success: true };
  }

  _handleEventsQuery(queryLower, params) {
    // Honor the SELECT projection for poster_url the way the real DB would.
    // Returning it unconditionally would let a test assert on poster_url and
    // still pass after someone drops `e.poster_url` from the query — the
    // assertion would be reading this mock, not the projection (#658).
    //
    // Scoped to the projection list so a mention in WHERE/ORDER BY doesn't
    // count as selecting the column. Slicing to the first FROM is deliberately
    // naive: no query routed here puts a subquery in its projection, and a
    // real SQL parser inside a test mock would be more fragile than the bug
    // it prevents. Wildcards (* / e.*) project everything, so they count;
    // COUNT(*) does not, since the trailing ")" fails the boundary check.
    const fromIndex = queryLower.indexOf(" from ");
    const selectList = fromIndex === -1 ? queryLower : queryLower.slice(0, fromIndex);
    const projectsWildcard = /(^|[\s,])(\*|[a-z_]+\.\*)(\s|,|$)/.test(selectList);
    const projectsPosterUrl = /\bposter_url\b/.test(selectList) || projectsWildcard;
    // `status` gets the same treatment for the same reason: api/events/public.js
    // filters ON status but does not SELECT it, so projecting it unconditionally
    // would let a test assert on a field the endpoint never returns.
    const projectsStatus = /\bstatus\b/.test(selectList) || projectsWildcard;

    // Gate on status against the SOURCE rows, before projection. The real query
    // filters in SQL, so filtering here on a projected `status` would force the
    // mock to expose a column it must not project (above).
    //
    // Every public query gates via functions/utils/eventVisibility.js, which
    // emits literal predicate text like "e.status IN ('published', 'archived')".
    // Matching that text — rather than dropping the branch — keeps the mock
    // filtering equivalently instead of silently returning every event.
    const gatesOnPublicStatus = queryLower.includes("in ('published', 'archived')");

    // This is a complex query with JOINs - return aggregated data
    let results = this.data.events
      .filter((event) => !gatesOnPublicStatus || event.status === "published" || event.status === "archived")
      .map((event) => {
        const eventPerformances = this.data.performances.filter((p) => p.event_id === event.id);
        const uniqueBandIds = new Set(eventPerformances.map((p) => p.band_profile_id));
        const uniqueVenueIds = new Set(eventPerformances.map((p) => p.venue_id).filter(Boolean));

        return {
          id: event.id,
          name: event.name,
          slug: event.slug || `event-${event.id}`,
          date: event.date,
          end_date: event.end_date ?? null,
          description: event.description,
          city: event.city,
          ticket_url: event.ticket_url,
          ...(projectsPosterUrl ? { poster_url: event.poster_url ?? null } : {}),
          band_count: uniqueBandIds.size,
          venue_count: uniqueVenueIds.size,
          ...(projectsStatus ? { status: event.status } : {}),
        };
      });

    // The public endpoint's CASE expression binds the festival-day cutoff
    // before its optional filters, matching the real SQL bind order.
    let paramIndex = queryLower.includes("case when coalesce(e.end_date, e.date) >= ?") ? 1 : 0;
    if (queryLower.includes("where city = ?") || queryLower.includes("lower(e.city) = lower(?)")) {
      const city = params[paramIndex++];
      results = results.filter((e) => e.city?.toLowerCase() === city.toLowerCase());
    }

    // Mirrors `instr(LOWER(bp.genre), LOWER(?)) > 0` — a substring match (#1214).
    if (queryLower.includes("instr(lower(bp.genre), lower(?)) > 0")) {
      const genre = params[paramIndex];
      results = results.filter((event) => {
        const performances = this.data.performances.filter((p) => p.event_id === event.id);
        return performances.some((perf) => {
          const band = this.data.band_profiles.find((bp) => bp.id === perf.band_profile_id);
          return (band?.genre?.toLowerCase() ?? "").includes(genre.toLowerCase());
        });
      });
    }

    // Mirrors the COALESCE(end_date, date) >= date('now', ...) window (#539):
    // a multi-day event stays "upcoming"/current through its end_date rather
    // than dropping off the day after it starts. NULL end_date falls back to
    // date, so single-day behavior is unchanged.
    if (queryLower.includes("and coalesce(e.end_date, e.date) >= ?")) {
      const festivalDay = params[paramIndex];
      results = results.filter((e) => (e.end_date || e.date) >= festivalDay);
    } else if (
      queryLower.includes("where date >= date('now')") ||
      queryLower.includes("e.date >= date('now'") ||
      queryLower.includes("coalesce(e.end_date, e.date) >= date('now'")
    ) {
      const today = new Date().toISOString().split("T")[0];
      results = results.filter((e) => (e.end_date || e.date) >= today);
    }

    // Sort
    if (queryLower.includes("order by e.date asc")) {
      results.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    }

    if (queryLower.includes("limit ?")) {
      const limit = params[params.length - 1];
      if (Number.isFinite(limit)) {
        results = results.slice(0, limit);
      }
    }

    return { results };
  }

  _handleBandsQuery(queryLower, params) {
    // For iCal feeds - returns bands with event/venue details
    // Params order: [cityFilter, genreFilter] if both filters present
    //                [cityFilter] if only city filter
    //                [] if no filters

    const results = [];
    let cityFilter = null;
    let genreFilter = null;

    // Simple param extraction - check query structure
    if (
      queryLower.includes("lower(e.city) = lower(?)") &&
      queryLower.includes("instr(lower(bp.genre), lower(?)) > 0")
    ) {
      // Both filters present
      cityFilter = params[0];
      genreFilter = params[1];
    } else if (queryLower.includes("lower(e.city) = lower(?)")) {
      // Only city filter
      cityFilter = params[0];
    } else if (queryLower.includes("instr(lower(bp.genre), lower(?)) > 0")) {
      // Only genre filter
      genreFilter = params[0];
    }

    for (const perf of this.data.performances) {
      const event = this.data.events.find((e) => e.id === perf.event_id);
      const band = this.data.band_profiles.find((bp) => bp.id === perf.band_profile_id);
      const venue = this.data.venues.find((v) => v.id === perf.venue_id);

      if (!event || !band) continue;

      // Check future events only. Mirrors the production
      // COALESCE(e.end_date, e.date) >= date('now') window (#539): a
      // multi-day event stays in the feed through its end_date instead of
      // dropping out the day after it starts. NULL end_date falls back to
      // date, so single-day behavior is unchanged.
      const today = new Date().toISOString().split("T")[0];
      if ((event.end_date || event.date) < today) continue;

      // Apply city filter
      if (cityFilter && event.city?.toLowerCase() !== cityFilter.toLowerCase()) {
        continue;
      }

      // Apply genre filter
      if (genreFilter && !(band.genre?.toLowerCase() ?? "").includes(genreFilter.toLowerCase())) {
        continue;
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
        venue_address: venue?.address,
      });
    }

    // Sort
    if (
      queryLower.includes("order by e.date asc, b.start_time asc") ||
      queryLower.includes("order by e.date asc, p.start_time asc")
    ) {
      results.sort((a, b) => {
        const dateCompare = (a.date || "").localeCompare(b.date || "");
        if (dateCompare !== 0) return dateCompare;
        return (a.start_time || "").localeCompare(b.start_time || "");
      });
    }

    return { results };
  }

  reset() {
    this.data = {
      email_subscriptions: [],
      subscription_verifications: [],
      subscription_unsubscribes: [],
      events: [],
      venues: [],
      band_profiles: [],
      performances: [],
    };
    this.idCounter = 1;
    this.rateLimitCounts = new Map();
  }
}
