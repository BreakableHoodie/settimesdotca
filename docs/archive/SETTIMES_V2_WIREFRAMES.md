# SetTimes v2 Mobile Wireframe Spec

## Purpose

This document turns the SetTimes v2 UX brief into concrete mobile-first wireframes for the core attendee journey.

Focus:

- before the event planning
- during the event live lookup
- after the event recap and archive

Primary device assumption:

- 390px wide phone
- one-handed use
- low light
- intermittent connectivity

---

## Screen 1: Home / Events

Goal:

- help users quickly enter the most relevant event state

Priority order:

1. live event now
2. upcoming events
3. archive discovery

### Mobile wireframe

```text
+--------------------------------------------------+
| SetTimes                                         |
| Discover · Plan · Experience                     |
+--------------------------------------------------+
| LIVE NOW                                         |
| Long Weekend Band Crawl                          |
| 8 venues • 42 bands • happening now              |
| [Open Live Schedule]                             |
+--------------------------------------------------+
| UPCOMING EVENTS                                  |
| [Event card]                                     |
|  Pouzza Fest 2026                                |
|  Jun 14 • Montreal • 12 venues                   |
|  [Preview Event] [Build Route]                   |
|                                                  |
| [Event card]                                     |
+--------------------------------------------------+
| ARCHIVE                                          |
| Search past events, bands, venues                |
| [Search archive]                                 |
| [Recent archive card]                            |
+--------------------------------------------------+
| Bottom Nav: Events | Live | My Route | Archive   |
+--------------------------------------------------+
```

### Behavior

- if an event is active, the top card dominates the first viewport
- if no event is active, upcoming becomes the hero module
- archive gets a lightweight search field and recent items

---

## Screen 2: Event Preview Page

Goal:

- help users understand the shape of the night before arrival

### Mobile wireframe

```text
+--------------------------------------------------+
| Back                                              |
| Long Weekend Band Crawl                           |
| Feb 15 • Waterloo                                 |
| 8 venues • 42 bands                               |
| [Build My Route]                                  |
+--------------------------------------------------+
| QUICK FACTS                                       |
| First set 6:30 PM                                 |
| Peak window 9:00 PM - 11:00 PM                    |
| Late night sets until 1:00 AM                     |
+--------------------------------------------------+
| FILTERS                                           |
| [Genre] [Venue] [Early] [Late] [Favorites]        |
+--------------------------------------------------+
| FEATURED LINEUP                                   |
| [Band card] [Band card] [Band card]               |
+--------------------------------------------------+
| NIGHT PREVIEW                                     |
| 6:30 PM  opening sets                             |
| 8:00 PM  most venues active                       |
| 10:30 PM late crossover window                    |
+--------------------------------------------------+
| VENUES                                            |
| [Mini venue cards with map links]                 |
+--------------------------------------------------+
| Bottom Nav: Overview | Live | Venues | Archive    |
+--------------------------------------------------+
```

### Notes

- this page is a planning surface, not a marketing landing page
- lineup cards should support one-tap favorite without leaving the page
- venue list should expose open-in-maps and address clarity

---

## Screen 3: Live Schedule

Goal:

- answer the next decision in under 10 seconds

### Mobile wireframe

```text
+--------------------------------------------------+
| Long Weekend Crawl          9:12 PM              |
| [All Venues v] [Search] [My Route]               |
+--------------------------------------------------+
| NOW PLAYING                                       |
| [Band] PUPPY ANGLE         [Venue Badge]         |
| 9:00 - 9:30 PM             18m left              |
| [Save]                                          |
|                                                  |
| [Band] NUCLEAR BLOOM       [Venue Badge]         |
| 8:50 - 9:20 PM             8m left               |
+--------------------------------------------------+
| STARTING SOON                                     |
| [Band] DEAD AIR           [Venue Badge]          |
| Starts in 6m              Leave now              |
| [Save]                                          |
+--------------------------------------------------+
| MY NEXT SET                                       |
| [Saved Band] PALM LINES   [Venue Badge]          |
| Starts in 18m             7 min walk             |
| [Open Maps] [Remove]                             |
+--------------------------------------------------+
| TIMELINE                                          |
| 9:30 PM                                          |
| [Band row]                                       |
| [Band row]                                       |
|                                                  |
| 10:00 PM                                         |
| [Band row]                                       |
+--------------------------------------------------+
| Bottom Nav: Live | My Route | Venues | Archive    |
+--------------------------------------------------+
```

### Required row anatomy

- monospaced time label
- band name, max two lines
- venue badge
- state label: now, soon, saved, conflict, finished
- one fast action: save or remove

### Live schedule rules

- `Now Playing` is always first if available
- `Starting Soon` only shows the next 15 to 20 minutes
- `My Next Set` only appears if the user has saved bands
- finished sets are hidden by default
- venue switching preserves position in the timeline

---

## Screen 4: Venue View

Goal:

- help spatial thinkers compare rooms without loading a full grid

### Mobile wireframe

```text
+--------------------------------------------------+
| Venues                                            |
| [The Hub] [Room 47] [Jane Bond] [AOK]            |
+--------------------------------------------------+
| Room 47                                           |
| 247 King St                                       |
| [Open Maps]                                       |
+--------------------------------------------------+
| NOW / NEXT                                         |
| Now: NUCLEAR BLOOM   ends in 8m                   |
| Next: DEAD AIR       starts in 12m                |
+--------------------------------------------------+
| FULL VENUE TIMELINE                               |
| 8:50 PM  Nuclear Bloom                            |
| 9:30 PM  Dead Air                                 |
| 10:15 PM Night Window                             |
+--------------------------------------------------+
```

### Notes

- this should be secondary to the live schedule, not the default
- venue tabs should be horizontally scrollable with large tap targets

---

## Screen 5: My Route

Goal:

- turn current favorites into a practical route-planning tool

### Mobile wireframe

```text
+--------------------------------------------------+
| My Route                                          |
| 6 saved sets                                      |
| [Show conflicts] [Edit selections]                |
+--------------------------------------------------+
| NEXT UP                                           |
| PALM LINES             9:30 PM                    |
| Jane Bond              7 min walk                 |
| [Open Maps] [Remove]                              |
+--------------------------------------------------+
| CONFLICTS                                          |
| 10:00 PM                                          |
| [Band A] Room 47                                  |
| [Band B] AOK                                      |
| [Keep A] [Keep B]                                 |
+--------------------------------------------------+
| REST OF NIGHT                                     |
| [Saved route row]                                 |
| [Saved route row]                                 |
+--------------------------------------------------+
```

### Notes

- `My Schedule` language should be replaced in attendee-facing UI with `My Route`
- conflict handling should be inline and non-blocking

---

## Screen 6: Band Profile In Event Context

Goal:

- support discovery without losing event context

### Mobile wireframe

```text
+--------------------------------------------------+
| Back to Live                                       |
| [Band photo]                                       |
| PALM LINES                                         |
| Post-punk • Toronto                                |
| [Save to Route]                                    |
+--------------------------------------------------+
| NEXT PERFORMANCE                                   |
| 9:30 PM - 10:00 PM                                 |
| Jane Bond                                          |
| [Jump to Schedule] [Open Maps]                     |
+--------------------------------------------------+
| ABOUT                                              |
| Bio text                                            |
+--------------------------------------------------+
| MORE HISTORY                                       |
| Played Long Weekend 2024, 2025, 2026               |
| [View archive appearances]                         |
+--------------------------------------------------+
```

### Notes

- the current band profile structure is already close
- the key improvement is preserving event context and adding stronger jump-back affordances

---

## Screen 7: Post-Event Archive

Goal:

- turn the event into a memory object and discovery surface

### Mobile wireframe

```text
+--------------------------------------------------+
| Archive                                            |
| Long Weekend Band Crawl 2026                       |
| Waterloo • 8 venues • 42 bands                     |
+--------------------------------------------------+
| RECAP                                              |
| First set 6:30 PM                                  |
| Final set 12:45 AM                                 |
| [View full final schedule]                         |
+--------------------------------------------------+
| YOUR NIGHT                                         |
| 4 saved bands played                               |
| 2 missed due to overlap                            |
| [See your route recap]                             |
+--------------------------------------------------+
| VENUE RECAP                                        |
| Room 47 • 6 sets                                   |
| Jane Bond • 5 sets                                 |
| [Browse venues]                                    |
+--------------------------------------------------+
| DISCOVER                                            |
| Bands from this lineup playing again soon          |
| Similar archived events                            |
+--------------------------------------------------+
```

### Notes

- archive should support search by event, band, venue, and year
- recurring event lineage should be visible on the page

---

## Screen 8: Archive Search

Goal:

- make history explorable instead of buried

### Mobile wireframe

```text
+--------------------------------------------------+
| Archive                                            |
| [Search events, bands, venues]                     |
| [Year] [City] [Venue] [Band]                       |
+--------------------------------------------------+
| RESULTS                                            |
| Pouzza Fest 2025                                   |
| Long Weekend Band Crawl 2026                       |
| Jane Bond venue history                            |
| Palm Lines archive appearances                     |
+--------------------------------------------------+
```

---

## Global Mobile Patterns

### Sticky top bar

- event title
- current time during live events
- venue switcher
- search
- My Route entry point

### Bottom navigation

Default:

- Events
- Live
- My Route
- Archive

Within event:

- Overview
- Live
- Venues
- Archive

### Status system

- `Now Playing`
- `Starting Soon`
- `Saved`
- `Conflict`
- `Finished`

Each state needs text and icon support, not color alone.

### Motion

- live dot pulse once, then hold steady
- filter chips animate in under 150ms
- venue switches preserve scroll and animate in under 180ms
- countdown updates must not shift layout

### Accessibility checks

- all tap targets 44px minimum
- support 200% zoom
- keyboard reachable controls on larger devices and desktops
- screen-reader-friendly time and venue phrasing
- reduced-motion mode disables pulsing and animated transitions

---

## MVP Screen Priorities

P0 screens:

- Home / Events
- Event Preview
- Live Schedule
- My Route
- Post-Event Archive

P1 screens:

- Venue View
- Archive Search
- richer route recap

P2 screens:

- community memory modules
- cross-event comparisons
- personalized caught-vs-missed summaries