# ✅ Server Running with Database!

## Access URLs

**Local Machine:**
- http://localhost:8788

**Network (for mobile testing):**
1. Find your network IP: `ipconfig getifaddr en0`
2. Or check: http://YOUR_IP_HERE:8788

## What's Available

### Public Pages
- **Main Schedule:** http://localhost:8788/
- **Subscribe:** http://localhost:8788/subscribe
- **Admin Login:** http://localhost:8788/admin

### API Endpoints
- **Public Events API:** http://localhost:8788/api/events/public.json
- **LWBC 14 Event:** http://localhost:8788/api/events/vol-14/public.json
- **iCal Feed:** http://localhost:8788/api/feeds/vol-14.ics

### Database Status
✅ **Event:** Long Weekend Band Crawl 14
- Date: October 12, 2025
- Slug: `vol-14`
- Status: Published
- **18 bands** across **4 venues**

## What You Can Test Now

### 1. Public Schedule
Visit http://localhost:8788/ to see the schedule with LWBC 14 data

### 2. Mobile Optimizations
- Bottom navigation on mobile
- Touch-friendly buttons (44-48px)
- Optimized input fields
- Responsive layout

### 3. Admin Panel
Visit http://localhost:8788/admin and:
- Sign up to create an account
- Manage events/venues/bands
- Test all the mobile UI improvements

### 4. API Endpoints
Test the public API endpoints to see the database data being served.

## Database Query Examples

```bash
# Query the event
npx wrangler d1 execute bandcrawl-db --local --command="SELECT * FROM events WHERE slug = 'vol-14'"

# Query all bands
npx wrangler d1 execute bandcrawl-db --local --command="SELECT b.*, v.name as venue FROM bands b JOIN venues v ON b.venue_id = v.id ORDER BY b.start_time"
```

---

**Ready to test!** 🎸

