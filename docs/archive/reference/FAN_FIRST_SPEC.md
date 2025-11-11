# Fan-First Concert Schedule Platform - Core Specification

## 🎯 Product Vision

**For music fans** who struggle with Instagram grid schedules and PDFs,
**SetPlan** (working name) is a mobile-first schedule builder
**that** helps you plan your night across multiple bands and venues
**unlike** Bandsintown (artist-focused) or custom festival apps (expensive),
**our product** is event-focused, privacy-respecting, and works offline in clubs with poor signal.

---

## 🔑 Core Principles

### 1. Opening Band Equity

- **All bands get equal visual weight** (no headliner bias)
- **Chronological order** (earliest first, not headliner-first)
- **Set times prominently displayed** (doors ≠ show time)
- **Goal**: Fans discover opening acts, don't just show up for headliners

### 2. Performance First

- **Offline-first architecture** (works in clubs with 1 bar of signal)
- **Minimal images** (text + icons only for schedule view)
- **Aggressive caching** (PWA Service Worker)
- **Target**: < 100KB initial load, < 1s render on 3G

### 3. Privacy Respecting

- **No user accounts required** (localStorage only)
- **No tracking pixels** (no Google Analytics, Facebook Pixel, etc.)
- **Minimal server-side storage** (event-level metrics only)
- **No selling data** (business model = promoter subscriptions, not ads/data)
- **Optional features**: Friend schedules, notifications (opt-in only)

### 4. Platform Agnostic

- **Support all music platforms**:
  - Bandcamp (indie-friendly)
  - Spotify (mainstream)
  - SoundCloud (emerging artists)
  - YouTube (videos)
  - Apple Music
  - Generic URLs (artist websites)
- **No platform lock-in** (promoter chooses link type)
- **No API dependencies** (links only, no embedded players)

### 5. Promoter Self-Service

- **You don't manage events** (promoters do)
- **Easy event creation** (< 5 minutes to list an event)
- **Live updates** (promoters can fix typos, update set times)
- **Embeddable widgets** (promoters embed on their websites)

---

## 🏗️ Technical Architecture

### Performance Budget

```
Initial Load (3G):
- HTML: 10 KB
- CSS: 15 KB
- JS: 60 KB (Vite-bundled React)
- Data: 10 KB (schedule JSON)
- Images: 0 KB (text only)
TOTAL: ~100 KB, < 1s render

Subsequent Loads (cached):
- Data only: 10 KB
- Render: < 100ms
```

### Offline-First Strategy

```javascript
// Service Worker caching strategy
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Return cached version immediately
      // Fetch fresh in background, update cache
      const fetchPromise = fetch(event.request).then((response) => {
        caches.open("schedule-v1").then((cache) => {
          cache.put(event.request, response.clone());
        });
        return response;
      });
      return cached || fetchPromise;
    }),
  );
});
```

### Data Storage

**Fan-side (localStorage):**

```javascript
{
  "mySchedule": {
    "eventSlug": ["band_id_1", "band_id_2", ...],
    // No PII, no tracking
  },
  "settings": {
    "notificationsEnabled": false, // opt-in only
    "theme": "dark"
  }
}
```

**Server-side (minimal):**

```sql
-- Events + Bands (from before)
-- No user tracking tables
-- Only aggregate metrics:

CREATE TABLE event_metrics (
  event_id INTEGER PRIMARY KEY,
  total_schedule_builds INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,  -- IP hash, not stored
  last_updated TEXT
);
```

### Privacy-Preserving Analytics

**What promoters see:**

- "150 people built schedules"
- "Most popular band: X (50 schedules)"
- "Peak time: 9 PM (80 active schedules)"

**What you DON'T collect:**

- ❌ Names, emails, phone numbers
- ❌ Social profiles
- ❌ Precise location (IP geolocation)
- ❌ Cross-event tracking
- ❌ Third-party tracking pixels

**How to count without tracking:**

```javascript
// Client-side: Generate ephemeral session ID
const sessionId = crypto.randomUUID() // new each visit
const scheduleHash = hashSchedule(myBands) // content-based hash

// Server: Count unique hashes per event (not users)
POST /api/events/:slug/metrics
{ sessionId, scheduleHash }

// Server aggregates, doesn't store IDs
UPDATE event_metrics
SET unique_visitors = COUNT(DISTINCT schedule_hash)
WHERE event_id = ?
```

---

## 🎨 Fan Experience (Priority Features)

### Phase 1: Schedule Builder (DONE ✅)

- ✅ Mobile-first schedule view
- ✅ Tap to add/remove bands
- ✅ Coming up next notifications
- ✅ Conflict detection
- ✅ Offline support (PWA)

### Phase 2: Social Features (Privacy-Respecting)

**Share Schedule (No Account Required)**

```
https://setplan.app/lwbc-vol6/schedule/abc123

// abc123 = hash of selected band IDs (no user data)
// Anyone with link can view
// Not tied to user account
```

**Friend Schedules (Opt-In)**

- Generate shareable link for your schedule
- Friends can view (read-only)
- No centralized friend graph
- No tracking across schedules

### Phase 3: Discovery Features

**Event Discovery (Location-Based)**

```
// Coarse location only (city-level, no GPS)
GET /api/events?city=portland&month=2025-11

// Returns list of upcoming events
// No tracking of which events user viewed
```

**Band Discovery**

- "Similar to bands in your schedule" (client-side matching)
- No server-side recommendation engine
- No tracking of listening habits

### Phase 4: Enhanced UX

**Push Notifications (Opt-In)**

- "Band starts in 15 minutes"
- Web Push API (no app install)
- Unsubscribe anytime
- No notification tracking

**Venue Info**

- Address, directions
- Static map (no Google Maps tracking)
- Transit info (public APIs)

**Platform Links**

- One-click to Bandcamp/Spotify/etc.
- Preview artist name + genre
- No embedded players (privacy, performance)

---

## 🛠️ Promoter Tools (Self-Service)

### Event Creation Flow

**Step 1: Event Basics**

```
Name: "Long Weekend Band Crawl Vol. 6"
Date: 2025-06-14
Slug: lwbc-vol6 (auto-generated)
Description: "Annual multi-venue..."
```

**Step 2: Venues**

```
Add Venue: Room 47
Address: 123 Main St
```

**Step 3: Bands**

```
Band Name: The Rockers
Venue: Room 47
Set Time: 8:00 PM - 8:45 PM (45 min)
Link Type: Bandcamp
Link URL: https://therockers.bandcamp.com
Genre: Rock (optional)
```

**Step 4: Publish**

```
Preview public page
Publish → generates public URL
Embed code for promoter website
```

### Promoter Dashboard

**Metrics (Privacy-Preserving)**

- 150 schedule builds
- 12 schedules include your band
- Peak activity: 9 PM Saturday
- No individual user data

**Tools**

- Edit set times (live updates)
- Add/remove bands
- Unpublish event
- Export schedule (CSV, PDF)
- Embed widget code

### Freemium Model

**Free Tier:**

- 2 events per year
- Basic metrics
- Watermarked public page ("Powered by SetPlan")

**Pro Tier ($25/event or $100/year):**

- Unlimited events
- Remove watermark
- Custom branding (colors, logo)
- Enhanced metrics
- Priority support

**Platform Tier ($200/month):**

- Multi-org management (Pink Lemonade + Fat Scheid)
- White-label
- API access
- Custom domain

---

## 📱 Mobile-First UI Principles

### Design System

**Colors:**

- Dark mode default (better in clubs)
- High contrast (readable in bright light)
- Minimal use of images/gradients (performance)

**Typography:**

- Large touch targets (44px minimum)
- Readable fonts (system fonts, no web fonts)
- Clear hierarchy (band name > venue > time)

**Interactions:**

- Instant feedback (no loading spinners)
- Optimistic UI (update before server confirms)
- Swipe gestures (add to schedule)

### Example: Band Card

```jsx
<div className="band-card">
  <div className="time">8:00 PM</div>
  <div className="name">The Rockers</div>
  <div className="venue">Room 47</div>
  <div className="links">
    <a href="..." class="bandcamp">BC</a>
  </div>
  <button className="add-btn">+</button>
</div>

// CSS (performance)
.band-card {
  /* No shadows, gradients */
  /* Flat design, instant paint */
  border-bottom: 1px solid #333;
  padding: 12px;
}
```

---

## 🚀 Go-To-Market Strategy

### Phase 1: Local Validation (Months 1-3)

**Goal**: Prove fans love it, promoters will use it

1. **Long Weekend Band Crawl Vol. 6**
   - You use it (obviously)
   - Measure: Schedule builds, feedback

2. **Pink Lemonade + Fat Scheid Events**
   - Onboard both orgs
   - 5-10 events total
   - Collect testimonials

3. **Local Promoter Outreach**
   - Reach out to 10 local promoters
   - Offer FREE setup (white-glove service)
   - Ask for feedback, testimonials

**Success Metrics:**

- ✅ 200+ schedule builds across 10 events
- ✅ 3+ promoter testimonials
- ✅ 80%+ fan satisfaction (informal survey)

### Phase 2: Regional Expansion (Months 4-6)

**Goal**: Self-service works, promoters can onboard themselves

4. **Self-Service Launch**
   - Open signups
   - Documentation/tutorials
   - First 20 promoters free

5. **Content Marketing**
   - Blog: "Instagram grids are killing your event"
   - Guides: "How to promote local shows"
   - SEO: "band schedule builder", "multi-venue event app"

6. **Community Building**
   - Subreddit: r/concertpromoters
   - Discord: Promoter community
   - User showcase: Best event pages

**Success Metrics:**

- ✅ 50+ events listed
- ✅ 2000+ schedule builds
- ✅ 5+ paying customers ($25/event)

### Phase 3: Scale (Months 7-12)

**Goal**: Sustainable business, product-market fit

7. **Partnerships**
   - Music blogs (Pitchfork, Consequence, local blogs)
   - Venue associations
   - Promoter networks

8. **Feature Expansion**
   - Friend schedules
   - Push notifications
   - Event discovery

9. **Revenue Growth**
   - 100+ events
   - $500-1000 MRR
   - Break-even on hosting costs

---

## 🎯 Competitive Advantages

### vs. Instagram Grids/PDFs

✅ Interactive, filterable
✅ Personal schedule builder
✅ Works offline
✅ Mobile-optimized

### vs. Bandsintown

✅ Event-focused (not artist-focused)
✅ Multi-venue native
✅ Opening band equity
✅ Platform agnostic (Bandcamp, not just Spotify)

### vs. Custom Festival Apps

✅ Affordable ($25 vs $10k+)
✅ Works for small events
✅ Self-service (no dev needed)
✅ Reusable across events

### vs. VenuePilot/Prism

✅ Fan-facing (not B2B backend)
✅ Public event pages
✅ Free for fans
✅ Simpler, focused scope

---

## 🔒 Privacy Implementation Details

### GDPR/CCPA Compliance

**No PII collected** → minimal compliance burden

**What's stored:**

- Event data (public information)
- Aggregate metrics (no user identifiers)
- Optional: Email for promoter login (hashed)

**User rights:**

- Right to access: Nothing to access (no account)
- Right to deletion: Clear localStorage (client-side)
- Right to portability: Export schedule (JSON)

### Cookie Policy

**Essential cookies only:**

- Session cookie (promoter login)
- CSRF token

**NO:**

- ❌ Tracking cookies
- ❌ Marketing cookies
- ❌ Third-party cookies

### Data Retention

**Event data**: 1 year after event date (then archived)
**Metrics**: Aggregated, retained indefinitely
**User data**: None (localStorage only)

---

## 📊 Metrics That Matter

### Fan Engagement

- Schedule builds per event
- Average bands per schedule
- Time spent on site
- Return visits (same event)

### Promoter Success

- Events published
- Schedule builds per event
- Click-throughs to music platforms
- Conversion to paid tier

### Business Health

- MRR (monthly recurring revenue)
- CAC (customer acquisition cost)
- Churn rate
- NPS (net promoter score)

---

## 🛠️ Next Steps for Cursor Implementation

### Sprint 1: Promoter Self-Service (Week 1-2)

1. **Signup flow** for promoters
2. **Event creation wizard** (4 steps)
3. **Embed widget generator**
4. **Basic metrics dashboard**

### Sprint 2: Performance Optimization (Week 3-4)

5. **Service Worker** aggressive caching
6. **Bundle size optimization** (< 100KB)
7. **Lazy loading** for non-critical features
8. **Image optimization** (if any images used)

### Sprint 3: Social Features (Week 5-6)

9. **Shareable schedule links** (hash-based)
10. **Friend schedule viewer** (read-only)
11. **Event discovery** (city-based)

### Sprint 4: Polish & Launch (Week 7-8)

12. **Onboarding tutorial** (first-time fans)
13. **Promoter documentation**
14. **Landing page** (marketing site)
15. **Beta launch** (invite-only)

---

## 💡 Product Name Finalists

**My recommendation: SetPlan**

**Why:**

- Clear, simple, memorable
- Describes what it does ("plan your sets")
- .com available (~$12/year)
- Neutral (not music-genre specific)
- Works for fans AND promoters

**Alternatives:**

- **ShowFlow** (good, but vague)
- **NightPlan** (limits to nighttime events)
- **ScheduleMe** (generic)
- **LocalShows** (too niche)

**Brand voice: Helpful, unpretentious, music-loving**

- "Build your night" (not "optimize your experience")
- "Support opening bands" (not "discover emerging artists")
- "Works in shitty club wifi" (honest, relatable)
