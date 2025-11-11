# Multi-Org Generalization Plan (v2.0 - Future Vision)

**Status**: 🔮 Future Vision Document
**Timeline**: Post-demo (Q1 2026+)
**Dependencies**: v1.0 production-ready demo complete

---

⚠️ **This document describes the FUTURE multi-org vision, NOT current development priorities.**

For current roadmap, see: [/ROADMAP_TO_DEMO.md](/ROADMAP_TO_DEMO.md)

---

## Vision Statement

Transform Long Weekend Band Crawl's single-org system into a multi-tenant platform supporting multiple independent event promoters with optional collaboration features.

**This is explicitly OUT OF SCOPE for the November 30, 2025 demo.**

---

[Rest of GENERALIZATION_PLAN.md content preserved below...]

## 📊 Current State Analysis (Changes Made by Cursor)

### Schema Changes

**Key Improvement**: Bands can now exist independently of events ("orphaned bands")

```sql
-- BEFORE: Bands cascade deleted with events
event_id INTEGER NOT NULL,
FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE

-- AFTER: Bands become orphaned when event deleted
event_id INTEGER,  -- NULLABLE
FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
```

**Why This Matters**:

- Bands are reusable across multiple events
- Promoters can maintain a "roster" of bands
- Delete event without losing band data
- **Multi-tenant ready**: Different orgs can share band database

### Frontend Changes (BandsTab.jsx)

1. **Orphaned Band Management**
   - Shows bands without events in special view
   - Can create bands without assigning to event
   - Can assign orphaned bands to events later

2. **Duplicate Band Prevention**
   - Client-side check prevents duplicate band names
   - Backend validation (needs to be added)

3. **Conditional Fields**
   - Venue/time only required when event is selected
   - Supports "draft" bands for future assignment

4. **Improved UX**
   - Duration calculator (start time + duration = end time)
   - Better mobile responsive design
   - Conflict detection shows which bands overlap

### API Enhancements

- `GET /api/admin/bands` - returns ALL bands (orphaned + assigned)
- `GET /api/admin/bands?event_id=X` - returns bands for specific event
- `DELETE /api/admin/events/:id` - deletes event, orphans bands

---

## 🎯 Generalization Roadmap

### Phase 1: Rebrand & Multi-Org Foundation (2-3 weeks)

**Goal**: Make it usable for Pink Lemonade Records and Fat Scheid

#### 1.1 Naming & Branding

- [ ] Choose new product name (ideas below)
- [ ] Remove "Long Weekend Band Crawl" specific branding
- [ ] Generic terminology: "Performance" instead of "Band"
- [ ] Update all UI text to be promoter-neutral

#### 1.2 Organization/Promoter Model

```sql
-- New table for multi-tenancy
CREATE TABLE organizations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,              -- "Pink Lemonade Records"
  slug TEXT UNIQUE,                -- "pink-lemonade"
  created_at TEXT DEFAULT (datetime('now'))
);

-- Add org ownership to events
ALTER TABLE events ADD COLUMN org_id INTEGER REFERENCES organizations(id);

-- Add org ownership to venues (shared or org-specific)
ALTER TABLE venues ADD COLUMN org_id INTEGER REFERENCES organizations(id);
-- NULL = shared venue, non-NULL = org-specific

-- Add org ownership to bands (roster)
ALTER TABLE bands ADD COLUMN org_id INTEGER REFERENCES organizations(id);
```

#### 1.3 Multi-Org Authentication

```sql
-- User accounts linked to organizations
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  org_id INTEGER REFERENCES organizations(id),
  role TEXT DEFAULT 'admin',       -- admin, viewer, etc.
  created_at TEXT DEFAULT (datetime('now'))
);
```

#### 1.4 Collaboration Features

- [ ] Mark events as "collaborative" (multiple orgs)
- [ ] Share venues between orgs
- [ ] Share band roster entries (opt-in)

**Deliverable**: Pink Lemonade and Fat Scheid can independently manage their events

---

### Phase 2: Enhanced Event Management (3-4 weeks)

**Goal**: Make it valuable for general promoters

#### 2.1 Event Types & Templates

```sql
-- Event types: festival, crawl, series, single-show
ALTER TABLE events ADD COLUMN event_type TEXT DEFAULT 'crawl';
ALTER TABLE events ADD COLUMN template_id INTEGER; -- reuse event configs
```

#### 2.2 Performer Profiles

```sql
CREATE TABLE performers (
  id INTEGER PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id),
  name TEXT NOT NULL,
  genre TEXT,
  website TEXT,
  social_media TEXT,              -- JSON: {instagram, facebook, etc.}
  bio TEXT,
  image_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Link bands table to performers
ALTER TABLE bands ADD COLUMN performer_id INTEGER REFERENCES performers(id);
```

#### 2.3 Stage/Room Management

- Multi-stage festivals (Stage A, Stage B, Outdoor Stage)
- Room assignments for multi-venue crawls
- Visual timeline view per stage

#### 2.4 Public Event Pages

- SEO-friendly event landing pages
- Sharable schedules
- Embeddable widgets for promoter websites

**Deliverable**: Promoters can manage diverse event types professionally

---

### Phase 3: Business Model & Launch (4-6 weeks)

**Goal**: Validate market fit and monetization

#### 3.1 Market Research

- [ ] Competitor analysis (Eventbrite, Bandsintown, DIY tools)
- [ ] Survey local promoters (what do they pay for now?)
- [ ] Identify pain points current tools don't solve

#### 3.2 Pricing Models (Options)

**Option A: Freemium**

- Free: 1 org, 5 events/year, basic features
- Pro: $20/mo - unlimited events, multi-user, branding
- Enterprise: $100/mo - multi-org, white-label, API access

**Option B: Per-Event**

- $5-10 per published event
- Free draft/planning mode
- Revenue tied to actual events

**Option C: Venue/Promoter License**

- $50-100/mo flat fee per venue/promoter
- Unlimited events within organization

#### 3.3 Launch Features

- [ ] User onboarding flow
- [ ] Documentation/help system
- [ ] Export schedules (PDF, CSV, iCal)
- [ ] Analytics dashboard (attendance tracking, popular venues)

**Deliverable**: Beta launch with paying customers

---

## 💡 Name Ideas

### Direct & Professional

- **ShowStack** (stack your shows)
- **VenueFlow** (flow between venues)
- **CrawlKit** (keeps band crawl in name)
- **GigPlanner** (straightforward)

### Creative & Memorable

- **Lineup** (simple, music-focused)
- **Setlist** (music terminology)
- **RosterHQ** (band roster headquarters)
- **StageMap** (mapping performances across stages/venues)

### Niche-Focused

- **LocalShows** (emphasizes grassroots)
- **DIYGigs** (targets indie promoters)
- **CrawlBase** (multi-venue event platform)

**Recommendation**: **ShowStack** or **Lineup**

- Short, memorable, .com available
- Generic enough for all event types
- Professional but not corporate

---

## 🔧 Technical Architecture for Multi-Tenancy

### Data Isolation Strategy

**Row-Level Security (RLS)**: Each query filtered by `org_id`

```sql
-- All queries automatically scoped to user's org
SELECT * FROM events WHERE org_id = :current_user_org_id
```

### Shared Resources

- **Venues**: Flagged as shared (org_id = NULL) or private
- **Performers**: Opt-in sharing via `is_public` flag
- **Templates**: Public templates all orgs can use

### Collaboration Model

```sql
-- Event collaborators table
CREATE TABLE event_collaborators (
  event_id INTEGER REFERENCES events(id),
  org_id INTEGER REFERENCES organizations(id),
  role TEXT, -- 'owner', 'collaborator'
  PRIMARY KEY (event_id, org_id)
);
```

When Pink Lemonade and Fat Scheid collaborate:

1. One org creates event (owner)
2. Invite other org as collaborator
3. Both can manage bands/schedule
4. Shared editing, separate band rosters

---

## 📋 Next Steps (For Cursor Implementation)

### Immediate (Week 1-2)

1. **Choose Name**: Decide on product name for rebranding
2. **Create Organizations Table**: Add Pink Lemonade & Fat Scheid
3. **Migrate Events**: Assign existing events to orgs
4. **Multi-Org Auth**: Basic user accounts per org

### Short-term (Week 3-4)

5. **Rebrand UI**: Remove LWBC-specific language
6. **Org Switcher**: UI to switch between orgs (if multi-org user)
7. **Shared Venues**: Mark venues as shared vs. org-specific

### Medium-term (Month 2)

8. **Performer Profiles**: Rich band/artist data
9. **Event Types**: Support festival, series, single-show
10. **Public Pages**: SEO-friendly event landing pages

---

## 💰 Monetization Considerations

### What Do Promoters Pay For Now?

- Eventbrite: 2-5% of ticket sales + fees
- Bandsintown: Free for bands, $$ for venues/promoters
- Poster printing: $50-200 per event
- Social media ads: $100-500 per event
- Website hosting: $10-30/mo

### Our Value Proposition

- **No ticket fees**: Not competing with ticketing
- **Scheduling made easy**: Conflict detection, multi-venue coordination
- **Professional presence**: Public event pages, sharable schedules
- **Time savings**: Bulk operations, templates, reusable rosters

### Pricing Sweet Spot

- **$20-50/mo per org** feels reasonable
- **$5-10 per event** for pay-as-you-go
- Free tier drives adoption, Pro tier for active promoters

---

## 🎯 Success Metrics

### Beta Phase (6 months)

- [ ] 5-10 active promoter organizations
- [ ] 50+ events created
- [ ] 2-3 paying customers

### Growth Phase (12 months)

- [ ] 50+ active organizations
- [ ] 500+ events created
- [ ] $1000+ MRR (monthly recurring revenue)
- [ ] Net Promoter Score > 50

---

## 🚀 Competitive Advantages

### What Makes This Different?

1. **Multi-Venue Focus**: Built for crawls, not single-venue shows
2. **Promoter-First**: Not band-centric like Bandsintown
3. **Conflict Detection**: Smart scheduling, no double-bookings
4. **Reusable Rosters**: Bands/venues persist across events
5. **Collaboration**: Multiple orgs working together

### Why Promoters Would Choose This Over:

- **Eventbrite**: No ticket fees, better multi-venue support
- **Google Sheets**: Professional UI, conflict detection, public pages
- **Custom Dev**: No dev cost, maintained & updated
- **Social Media**: Persistent event info, better UX for schedules
