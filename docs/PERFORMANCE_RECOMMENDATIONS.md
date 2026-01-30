# Performance Recommendations - SetTimes.ca

**Date:** 2025-11-18  
**Version:** 1.0.0  
**Status:** Advisory

---

## Executive Summary

The SetTimes.ca application demonstrates good performance practices with efficient database queries, proper indexing, and a serverless architecture optimized for edge computing. This document provides recommendations for further optimization as the application scales.

---

## Current Performance Strengths

### Database Design ✅

1. **Comprehensive Indexing**
   - All foreign keys properly indexed
   - Query-specific indexes in place (event_time, published status)
   - User lookup indexes (email, IP address)
   - Timestamp indexes for audit trails

2. **Efficient Queries**
   - All queries use parameterized statements
   - Proper use of JOINs instead of N+1 queries
   - Limited result sets where appropriate

3. **Edge-Optimized Architecture**
   - Cloudflare Workers (edge compute)
   - D1 database (distributed SQLite)
   - Global CDN for static assets
   - Low-latency responses worldwide

---

## Short-term Optimizations (Quick Wins)

### 1. Session Cleanup Job

**Issue:** Expired sessions accumulate in the database indefinitely.

**Impact:** Minimal now, but will slow down session queries over time.

**Solution:** Add a cleanup migration to run periodically:

```sql
-- migrations/legacy/migration-session-cleanup.sql
-- Run this manually or via cron job weekly

DELETE FROM sessions 
WHERE expires_at < datetime('now', '-7 days');

-- Optional: Also clean up very old auth attempts
DELETE FROM auth_attempts 
WHERE created_at < datetime('now', '-30 days');
```

**Implementation:**
- Create Cloudflare Worker with scheduled trigger (cron)
- Run weekly cleanup
- Log cleanup statistics

**Effort:** 1-2 hours  
**Priority:** Medium

### 2. Add Edge Caching Headers

**Issue:** Public API endpoints regenerate on every request.

**Current:** No cache headers set.

**Solution:** Add cache headers for public endpoints:

```javascript
// For /api/events/public
headers.set('Cache-Control', 'public, max-age=300, s-maxage=300'); // 5 min
headers.set('CDN-Cache-Control', 'max-age=300');

// For /api/feeds/ical
headers.set('Cache-Control', 'public, max-age=600, s-maxage=600'); // 10 min
headers.set('CDN-Cache-Control', 'max-age=600');
```

**Benefits:**
- Reduced database load
- Faster responses for end users
- Better resource utilization

**Effort:** 30 minutes  
**Priority:** High  
**Expected Impact:** 50-70% reduction in database queries for public endpoints

### 3. Add Database Connection Pooling

**Issue:** Each request creates a new database connection.

**Current State:** D1 handles this automatically, but we can optimize usage.

**Solution:** Reuse prepared statements within a single request:

```javascript
// Example optimization in timeline.js
const stmtCache = new Map();

function getPreparedStatement(db, key, sql) {
  if (!stmtCache.has(key)) {
    stmtCache.set(key, db.prepare(sql));
  }
  return stmtCache.get(key);
}
```

**Effort:** 2-3 hours  
**Priority:** Low  
**Expected Impact:** 5-10% reduction in query preparation overhead

---

## Medium-term Optimizations (1-2 Sprints)

### 4. Implement Query Result Caching

**Approach:** Use Cloudflare KV for frequently accessed data.

**Candidates:**
- Band profiles (rarely change)
- Venue information (rarely change)
- Published event schedules (change infrequently)

**Example Implementation:**

```javascript
// Cache band profile for 1 hour
async function getBandProfile(db, kv, bandId) {
  const cacheKey = `band_profile_${bandId}`;
  
  // Check cache first
  const cached = await kv.get(cacheKey, { type: 'json' });
  if (cached) return cached;
  
  // Fetch from database
  const band = await db.prepare(
    'SELECT * FROM band_profiles WHERE id = ?'
  ).bind(bandId).first();
  
  // Store in cache
  if (band) {
    await kv.put(cacheKey, JSON.stringify(band), { expirationTtl: 3600 });
  }
  
  return band;
}
```

**Considerations:**
- Cache invalidation strategy required
- KV storage costs (minimal for this use case)
- Complexity vs. benefit trade-off

**Effort:** 4-6 hours  
**Priority:** Low (D1 is already fast enough)  
**Expected Impact:** 20-30% reduction in database queries

### 5. Optimize Band Photo Storage

**Current:** Photos stored in R2, referenced in database.

**Recommendations:**
1. **Image Optimization:**
   - Resize images to standard dimensions on upload
   - Generate thumbnails (e.g., 200x200, 400x400)
   - Use WebP format with JPEG fallback

2. **CDN Caching:**
   - Set long cache headers for images (1 year)
   - Use versioned URLs for cache busting

3. **Lazy Loading:**
   - Implement lazy loading for band images in frontend
   - Use loading="lazy" attribute

**Effort:** 6-8 hours  
**Priority:** Medium  
**Expected Impact:** Faster page loads, reduced bandwidth costs

### 6. Database Query Optimization

**Audit Recommendations:**

1. **Timeline Query** (`functions/api/events/timeline.js`)
   - Currently efficient with proper JOINs ✅
   - Consider adding materialized view for complex aggregations (future)

2. **Band Stats Query** (`functions/api/admin/bands/stats/[name].js`)
   - Already optimized with single query ✅
   - No changes needed

3. **Rate Limiting Query** (`functions/api/admin/auth/login.js`)
   - Currently checks 10-minute window efficiently ✅
   - Consider adding index on `(email, created_at)` for very high traffic

**Potential Index Addition:**

```sql
-- Only needed if rate limiting becomes a bottleneck
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email_created 
ON auth_attempts(email, created_at DESC);
```

**Priority:** Very Low (current indexes are sufficient)

---

## Long-term Optimizations (Future Sprints)

### 7. Implement Full-Text Search

**Use Case:** Search bands by name, genre, or bio.

**Options:**
1. SQLite FTS5 (Full-Text Search) - Native support in D1
2. External search service (Algolia, Elasticsearch)

**Example FTS5 Implementation:**

```sql
-- Create FTS virtual table
CREATE VIRTUAL TABLE band_profiles_fts USING fts5(
  name, 
  genre, 
  bio,
  content=band_profiles
);

-- Keep it in sync with triggers
CREATE TRIGGER band_profiles_ai AFTER INSERT ON band_profiles BEGIN
  INSERT INTO band_profiles_fts(rowid, name, genre, bio)
  VALUES (new.id, new.name, new.genre, new.bio);
END;
```

**Effort:** 8-12 hours  
**Priority:** Low (current search is adequate)

### 8. Analytics and Monitoring

**Implement:**
1. Query performance tracking
2. Slow query logging (>1000ms)
3. Request timing metrics
4. Error rate monitoring

**Tools:**
- Cloudflare Workers Analytics (built-in)
- Custom logging to Cloudflare Logs
- Grafana dashboard for visualization

**Effort:** 12-16 hours  
**Priority:** Medium

### 9. Load Testing & Benchmarking

**Establish Baselines:**
- Requests per second capacity
- 95th percentile response times
- Database query times
- Memory usage patterns

**Tools:**
- Apache JMeter
- k6 (modern load testing)
- Cloudflare Load Balancer (production testing)

**Target Metrics:**
- Public API: <200ms p95
- Admin API: <500ms p95
- Database queries: <50ms p95

**Effort:** 8-12 hours  
**Priority:** Medium (before production launch)

---

## Performance Monitoring Checklist

### Metrics to Track

- [ ] Request duration (p50, p95, p99)
- [ ] Database query time
- [ ] Cache hit rates (if implemented)
- [ ] Error rates by endpoint
- [ ] Concurrent users
- [ ] Memory usage
- [ ] Database size growth
- [ ] API response sizes

### Alerting Thresholds

- [ ] p95 response time > 1000ms
- [ ] Error rate > 1%
- [ ] Database queries > 100ms (p95)
- [ ] Failed authentication attempts > 100/hour
- [ ] Session table size > 10,000 rows

---

## Cost Optimization

### Cloudflare Free Tier Limits

- **Workers:** 100,000 requests/day
- **D1:** 5GB storage, 5M reads/day, 100k writes/day
- **R2:** 10GB storage, 10M Class A operations/month
- **Pages:** Unlimited requests

### Recommendations

1. **Monitor D1 Usage:**
   - Current usage: Low
   - Implement cleanup jobs to stay within limits
   - Upgrade to paid plan if needed ($5/month)

2. **Optimize R2 Uploads:**
   - Batch uploads when possible
   - Implement client-side image compression
   - Use direct uploads to reduce Worker overhead

3. **Cache Aggressively:**
   - Public endpoints can use long cache times
   - Reduces billable requests
   - Improves user experience

---

## Implementation Priority Matrix

| Priority | Optimization | Effort | Impact | Status |
|----------|-------------|--------|--------|--------|
| **High** | Edge caching headers | 30 min | High | Not Started |
| **Medium** | Session cleanup job | 1-2 hrs | Medium | Not Started |
| **Medium** | Image optimization | 6-8 hrs | Medium | Not Started |
| **Medium** | Load testing | 8-12 hrs | High | Not Started |
| **Low** | Query result caching | 4-6 hrs | Low | Not Started |
| **Low** | Connection pooling | 2-3 hrs | Low | Not Started |
| **Low** | Full-text search | 8-12 hrs | Low | Not Started |

---

## Conclusion

The SetTimes.ca application is already well-optimized for its current scale. The recommended optimizations are largely preventative and scale-focused. Prioritize implementing edge caching headers and session cleanup for immediate benefits.

### Key Takeaways

1. **Current Performance:** Excellent for current scale
2. **Database Design:** Well-indexed and efficient
3. **Quick Wins:** Edge caching and session cleanup
4. **Scale Readiness:** Ready for 10x growth with current architecture
5. **Monitoring:** Implement before production launch

### Next Steps

1. Implement edge caching headers (30 minutes)
2. Set up session cleanup job (1-2 hours)
3. Establish performance monitoring (4-6 hours)
4. Conduct load testing (8-12 hours)
5. Optimize based on real-world usage patterns

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-18  
**Next Review:** After production launch or at 1000+ daily active users
