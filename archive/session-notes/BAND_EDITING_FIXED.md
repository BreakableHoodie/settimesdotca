# ✅ Band Editing Fixed for Global View

## Problem
Editing bands in global view still showed event-specific fields (venue, start time, end time, duration), which was confusing since in global view you're editing the **band profile**, not a performance.

## Solution
The form now adapts based on context:

### Global View Form (when no event selected)
**Shows ONLY:**
- Band Name
- URL (if applicable)

**Hides:**
- Event dropdown
- Venue dropdown  
- Start time
- End time
- Duration
- Conflict warnings

This makes it clear you're editing the **band itself**, not a performance schedule.

### Event View Form (when event is selected)
**Shows ALL fields:**
- Band Name
- Event
- Venue
- Start time
- End time
- Duration
- URL
- Conflict warnings

This is for scheduling **performances** at events.

## Button Labels
- Global View: "Add Band" / "Update Band"
- Event View: "Add Performance" / "Update Performance"

This makes it crystal clear what you're editing!

## User Experience

### Editing in Global View
> "I'm updating the band name or URL"

**Form shows:** Only relevant fields (name, URL)

### Editing in Event View
> "I'm scheduling this band to perform at LWBC 14"

**Form shows:** Full scheduling details (event, venue, times)

---

**The form now matches the context perfectly!** 🎸

