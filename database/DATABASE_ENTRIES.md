# Database Entries - Long Weekend Band Crawl

This document lists all events loaded in the database.

## Events in Database

### Event: Long Weekend Band Crawl 14
- **Slug:** `vol-14`
- **Date:** 2025-10-12
- **Status:** Published ✅
- **Venues:** 4
- **Bands:** 18

#### Venues
1. Room 47
2. Prohibition Warehouse
3. AristoCanine
4. Princess Cafe

#### All 18 Bands

**Room 47:**
1. Real Sickies - 20:00-20:30
2. Doghouse Rose - 21:00-21:30
3. BA Johnston - 22:30-23:10
4. Ripcordz - 00:10-00:50

**Prohibition Warehouse:**
5. Mr Hands - 18:45-19:15
6. Uppercut - 19:30-20:00
7. Heartland Province - 20:30-21:00
8. Chris Murray - 22:00-22:30
9. Handheld - 23:10-23:40

**AristoCanine:**
10. Petrochemicals - 19:15-19:45
11. Harm School - 20:30-21:00
12. Lee Reed - 21:30-22:00
13. Blackout! - 23:40-23:59
14. Afterparty with DJ Chives - 01:00-02:00

**Princess Cafe:**
15. Kate & Friends - 18:45-19:15
16. Making Woman - 19:30-20:00
17. EJ Fleming - 20:30-21:00
18. Ben Stager - 21:45-22:15

---

## Database Status

**Total Events:** 1  
**Total Venues:** 4  
**Total Bands:** 18 performances  

**Database Location:**
- Local: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/[hash].sqlite`
- Remote: Available via `wrangler d1 execute bandcrawl-db --remote`

## Usage

### Query Event
```bash
npx wrangler d1 execute bandcrawl-db --local --command="SELECT * FROM events WHERE slug = 'vol-14'"
```

### Query All Bands
```bash
npx wrangler d1 execute bandcrawl-db --local --command="SELECT b.*, v.name as venue_name FROM bands b JOIN venues v ON b.venue_id = v.id WHERE b.event_id = 1 ORDER BY b.start_time"
```

### Query Bands by Venue
```bash
npx wrangler d1 execute bandcrawl-db --local --command="SELECT b.name, b.start_time, b.end_time, v.name as venue FROM bands b JOIN venues v ON b.venue_id = v.id WHERE v.id = 1 ORDER BY b.start_time"
```

## Notes

- All times in HH:MM 24-hour format
- Event is published and visible to the public
- API endpoints will serve this data at `/api/events/vol-14/public.json`
- iCal feed available at `/api/feeds/vol-14.ics`