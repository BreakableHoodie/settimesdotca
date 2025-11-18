# Front Page and Band Profile Redesign

## Overview

Transforming the application from a single-event focus to a comprehensive event discovery platform with rich band profiles inspired by sports trading cards.

## Current State Analysis

### App.jsx (Main Front Page)
- **Single Event Focus**: Loads only "current" event via `/api/schedule?event=current`
- **Schedule-Centric**: Shows band schedule for one event at a time
- **Limited Context**: No historical or upcoming events visible
- **No Band Profiles**: Bands are just names in a schedule, no depth

### Existing API Endpoints
- `/api/schedule?event=current|{slug}` - Single event schedule with bands and venues
- `/api/bands/{name}` - Basic band profile with performance history
- `/api/events/public` - List of published events (upcoming/past filtering available)

### Database Schema
**bands table** has rich profile data:
- `id`, `name`, `event_id`, `venue_id`
- `start_time`, `end_time`, `url`
- `description` - Band bio
- `photo_url` - Band photo
- `genre` - Genre tags
- `origin` - Where band is from
- `created_at`

## Design Goals

### Front Page Redesign
**"Events + Performers + Venues Together"** - User's explicit requirement

1. **What's Happening Now**
   - Current/today's events across all venues
   - Live "right now" bands performing
   - Countdown timers to next performances
   - Quick venue navigation

2. **Coming Up**
   - Next 7-30 days of upcoming events
   - Featured performers for each event
   - Venue breakdowns
   - Ticket links

3. **Look Back**
   - Past events archive
   - Historical performance records
   - Band frequency stats
   - Venue popularity

### Band Profile Pages (Sports Card Inspiration)
**Trading Card Aesthetic** with stats, facts, and history

#### Front of Card (Hero Section)
- **Large photo/artwork** (if available)
- **Band name** prominently displayed
- **Genre tags** as badges
- **Origin location** with icon
- **Social media links** (Instagram, Bandcamp, Facebook, Website)
- **"Quick Stats" box**:
  - Total shows performed
  - Venues played
  - First/last appearance dates
  - Signature venue (most played)

#### Stats Section
```
PERFORMANCE STATISTICS
━━━━━━━━━━━━━━━━━━━━━━━━
Total Appearances       │  12
Unique Venues          │   5
Events Participated    │   3
Average Set Time       │  45 min
Signature Venue        │  Room 47 (5 shows)
Debut Performance      │  May 2023
Latest Performance     │  Oct 2024
━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Bio/Description
- Band description from database
- Rich text display
- "About this artist" section

#### Next Shows (Upcoming)
- List of future scheduled performances
- Event name, date, venue, time
- Countdown to next show
- Ticket links if available
- "No upcoming shows" state if none scheduled

#### Performance History (Past Shows)
- Chronological list of all past performances
- Group by event or by date
- Venue + time information
- Links to event pages
- Timeline visualization option

#### Facts & Trivia
- Auto-generated interesting facts:
  - "Played at Long Weekend Vol. 1, 2, and 3"
  - "Most frequent venue: Room 47"
  - "Average set length: 45 minutes"
  - "Genre: Rock, Alternative"
  - "From: Waterloo, ON"

## API Requirements

### New/Enhanced Endpoints

#### 1. `/api/events/timeline`
**Purpose**: Get all events grouped by time period

**Query Parameters**:
- `now` - Events happening today/this weekend
- `upcoming` - Future events (next 30 days)
- `past` - Historical events (optional limit)

**Response**:
```json
{
  "now": [
    {
      "id": 5,
      "name": "Long Weekend Vol. 5",
      "slug": "vol-5",
      "date": "2024-10-26",
      "band_count": 24,
      "venue_count": 8,
      "bands": [...],
      "venues": [...]
    }
  ],
  "upcoming": [...],
  "past": [...]
}
```

#### 2. `/api/bands/{name}/stats`
**Purpose**: Rich stats for band profile card

**Response**:
```json
{
  "id": 123,
  "name": "The Rockers",
  "photo_url": "...",
  "description": "...",
  "genre": "Rock, Alternative",
  "origin": "Waterloo, ON",
  "social": {
    "website": "...",
    "instagram": "@therockers",
    "bandcamp": "...",
    "facebook": "..."
  },
  "stats": {
    "total_performances": 12,
    "unique_venues": 5,
    "unique_events": 3,
    "debut_date": "2023-05-20",
    "latest_date": "2024-10-26",
    "signature_venue": {
      "name": "Room 47",
      "count": 5
    },
    "average_set_minutes": 45
  },
  "upcoming": [
    {
      "event_name": "Vol. 6",
      "event_slug": "vol-6",
      "event_date": "2025-02-14",
      "venue_name": "Room 47",
      "start_time": "20:00",
      "end_time": "20:45"
    }
  ],
  "past": [...]
}
```

## Component Architecture

### Front Page Components

#### 1. `EventTimeline.jsx`
Main container for the three timeline sections

#### 2. `NowPlaying.jsx`
- Live event cards with current/next bands
- Real-time updates
- Venue quick links

#### 3. `UpcomingEvents.jsx`
- Upcoming event cards
- Featured bands preview
- Ticket links

#### 4. `PastEvents.jsx`
- Historical event archive
- Collapsible/expandable
- Search/filter capabilities

#### 5. `EventCard.jsx`
Reusable card showing:
- Event name and date
- Venue count and band count
- Featured bands (top 3-5)
- View details link

### Band Profile Components

#### 1. `BandProfileCard.jsx`
Sports card-style hero with:
- Photo backdrop
- Name/genre/origin badges
- Quick stats box
- Social links

#### 2. `BandStats.jsx`
Performance statistics table

#### 3. `BandBio.jsx`
Description/about section

#### 4. `UpcomingShows.jsx`
Future performances list

#### 5. `PerformanceHistory.jsx`
Past shows with timeline

#### 6. `BandFacts.jsx`
Auto-generated trivia

## Visual Design Notes

### Sports Card Aesthetic
- **Card Frame**: Border styling reminiscent of trading cards
- **Stats Grid**: Clean, readable stats layout
- **Badge System**: Genre/origin as collectible-style badges
- **Photo Treatment**: High-quality photo with subtle effects
- **Color Scheme**: Match existing band-navy/band-orange/band-purple
- **Typography**: Mix of bold headings and readable body text
- **Icons**: Use for stats and facts (🎸 🎤 📍 📅)

### Responsive Considerations
- **Desktop**: Side-by-side stats and info
- **Mobile**: Stacked card layout
- **Touch Targets**: Large, tappable elements
- **Scrolling**: Smooth scrolling sections

## Data Migration Considerations

### Existing Data
- All bands have `id`, `name`, `event_id`, `venue_id`, `start_time`, `end_time`
- Most have `url` (social links)
- Some may have `description`, `photo_url`, `genre`, `origin` (from recent migrations)

### Missing Data Handling
- **No photo**: Use placeholder or band initial avatar
- **No description**: "No bio available yet" state
- **No genre**: Show "Genre not specified"
- **No origin**: Hide origin badge if null
- **Graceful degradation**: Show what's available, hide what's not

## Implementation Phases

### Phase 1: Front Page Timeline
1. ✅ Create `/api/events/timeline` endpoint
2. Build `EventTimeline` component structure
3. Implement `NowPlaying` section
4. Implement `UpcomingEvents` section
5. Implement `PastEvents` section
6. Replace App.jsx single-event logic with timeline

### Phase 2: Enhanced Band Profiles
1. Create `/api/bands/{name}/stats` endpoint
2. Build sports card-inspired layout
3. Implement stats calculations
4. Add upcoming/past shows sections
5. Auto-generate facts and trivia
6. Add photo/bio rendering

### Phase 3: Linking & Navigation
1. Add band profile links from front page
2. Add band profile links from event schedules
3. Cross-link venues to events
4. Add breadcrumb navigation
5. Implement search/filter for bands

### Phase 4: Polish & Optimization
1. Add loading states
2. Implement error boundaries
3. Optimize API caching
4. Add smooth transitions
5. Responsive refinements
6. Performance monitoring

## Success Metrics

- **User Engagement**: Time spent on band profiles
- **Navigation Patterns**: Event discovery flow
- **Data Completeness**: % of bands with full profiles
- **Performance**: Page load times < 2s
- **Mobile Experience**: Usability on small screens

## Future Enhancements

- **Band Search**: Full-text search across all bands
- **Genre Filtering**: Browse by genre
- **Venue Profiles**: Similar treatment for venues
- **User Collections**: Save favorite bands
- **Social Sharing**: Share band profiles
- **Performance Analytics**: Track band popularity over time
