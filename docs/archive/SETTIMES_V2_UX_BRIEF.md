# SetTimes v2 UX Brief

## Product Vision

SetTimes v2 should become:

> A live music companion that helps people discover, plan, and relive multi-venue music events.

SetTimes should not behave like a festival poster placed on the web. Posters announce. Instagram builds hype. Spreadsheets document. Facebook events collect RSVPs. None of them reliably answer the live question that matters most in a crowded venue: where should I go next, and how long do I have to get there?

SetTimes should differentiate on live utility:

- fastest path to a set time
- clear view of what is playing now
- easy venue switching while walking
- route planning around favorites and overlaps
- meaningful archive value after the event ends

The current product already has strong building blocks: public event timeline, event schedules, My Schedule, band profiles, venue info, and archive states. v2 should unify them into one coherent lifecycle instead of exposing them as loosely connected pages.

## Core UX Goals

- Find a band's set time in under 10 seconds.
- See what is playing right now without scanning the full lineup.
- Switch venues in one tap.
- Plan a personal route through the night.
- Revisit past events as a useful archive, not just a stale schedule.

Design priorities:

- speed
- mobile usability
- visual clarity
- minimal cognitive load

Success metrics:

- live answer visible above the fold on phones
- first meaningful event content in under 2 seconds on mid-range mobile
- venue switch in 1 tap from the live view
- favorites survive reloads and weak connectivity
- archive pages are worth returning to after the event

## Personas

### 1. Festival Hopper

Goals:

- discover the best thing happening right now
- bounce between venues with minimal dead time
- find unexpected bands worth catching

Frustrations:

- dense schedule grids on mobile
- missing sets while walking between venues
- unclear venue distance and transition cost
- too much scrolling to compare simultaneous shows

Devices:

- one-handed iPhone or Android
- often low battery

Environment:

- sidewalks, lineups, patios, dark rooms, noisy venues

Design implication:

- prioritize live modules, starting-soon blocks, venue switching, and leave-now cues

### 2. Dedicated Fan

Goals:

- protect must-see bands
- avoid overlapping saved sets
- know exactly when to move

Frustrations:

- buried set times
- weak reminders
- unclear venue labels
- losing a personal plan on reload

Devices:

- mobile during event
- desktop before event

Environment:

- plans at home, checks quickly in transit and inside venues

Design implication:

- improve favorites into a clear My Route mode with conflict and countdown support

### 3. Organizer

Goals:

- publish a schedule people can actually use
- reduce repetitive attendee questions
- preserve the event as a historical record afterward

Frustrations:

- last-minute changes are hard to communicate clearly
- old events become dead data
- venue data quality directly affects public clarity

Devices:

- desktop for setup
- phone for live verification

Environment:

- backstage, venue door, in motion, constantly interrupted

Design implication:

- lifecycle-aware event views, visible change states, clean venue metadata, and a strong archive destination

### 4. Music Archivist

Goals:

- revisit lineups and venue histories
- compare recurring event editions
- explore band histories across events

Frustrations:

- past events are hard to browse
- archives lack narrative and context
- venue and band history are not easy to traverse

Devices:

- desktop for browsing
- mobile for sharing

Environment:

- reflective, exploratory, after the event or months later

Design implication:

- build a searchable archive with cross-links among events, venues, and bands

## Event Lifecycle UX

### Phase 1: Before The Event

The event page should act as an event preview hub, not just a shell before schedules go live.

Ideal event preview page:

- event hero with name, date, city, band count, venue count, and primary CTA: Build Your Route
- lineup preview with filter chips for genre, venue, daypart, and organizer picks
- venue map with walking-time hints between venues
- featured bands row using existing profile content
- preview schedule that shows the shape of the night before the user commits
- favorite bands action available from lineup and band cards
- sections like Starting Early and Late Night Sets for lightweight planning

Primary user questions answered:

- Who is playing?
- Which venues matter to me?
- When should I arrive?
- What route should I roughly plan?

### Phase 2: During The Event

This is the core experience. The schedule should answer three questions in order:

1. What is happening now?
2. What starts next?
3. Where should I go?

Recommended live schedule view for phones:

- sticky top bar with event name, current time, venue switcher, search, and My Route toggle
- above-the-fold live modules:
  - Now Playing
  - Starting Soon
  - My Next Set
- main timeline below, grouped by actual start times
- each row contains time, band name, venue badge, live state, and favorite control
- countdown language such as Starts in 8m or 12m left
- past sets hidden by default with an explicit reveal toggle
- venue card access with address and open-in-maps action

Timeline structure:

- primary mobile layout: stacked live feed + chronological rows
- alternate view: venue lanes for comparing simultaneous sets
- personal view: My Route showing only saved sets in time order

### Phase 3: After The Event

Most schedule tools fail here. SetTimes should turn each event into an archive, recap, and discovery surface.

Recommended post-event archive experience:

- event recap header with visual identity, city, date, venue count, band count
- final schedule archive preserving the structure of the night
- venue recap showing who played each room and when
- bands you saved and bands you may have missed
- cross-links into band profiles and venue histories
- recurring event lineage such as Vol. 3 of 7
- optional community memory modules for photos, highlights, organizer notes, or setlist links
- discovery hooks to related bands, future appearances, and similar archived events

The existing lifecycle model maps cleanly to this:

- upcoming -> preview
- recently completed -> recap
- archived -> searchable history

## Information Architecture

Primary navigation:

- Events
- Live
- My Route
- Bands
- Archive

Event-level navigation:

- Overview
- Live Schedule
- Venues
- Lineup
- Archive

Navigation behavior:

- if an event is active, Live becomes the most prominent destination
- if no event is active, Events and Archive carry the homepage
- band pages should preserve event context when entered from an event flow

Core user flows:

### Find a band's set time

Event -> search or lineup filter -> band detail or quick result -> time and venue -> save or jump into live schedule

### See what's playing right now

Homepage or active event -> Live -> Now Playing -> tap band or venue for details

### Plan the next venue stop

Live or My Route -> Starting Soon -> compare venues -> open maps or switch venue -> move

### Revisit a past event

Archive -> year or event -> recap timeline -> venue or band detail -> related events

## Schedule UX Redesign

The schedule is the heart of SetTimes. It should be optimized for glanceability under divided attention.

Layout options:

- time-grouped cards: good for chronology, weaker for comparing venues
- venue columns: strong for venue comparison, constrained on small phones
- timeline grid: powerful on desktop, too dense for live mobile use
- live feed plus compact timeline: best fit for mobile event conditions

Recommendation:

- primary layout: live-first stacked mobile timeline
- supporting layout: venue-lane comparison view
- supporting layout: My Route view for saved bands only
- archive layout: recap timeline tuned for reflection rather than urgency

Primary schedule row should show at a glance:

- start time
- live state
- band name
- venue badge
- favorite state
- optional secondary meta like genre or note

## Mobile-First Layout Specs

Assume most usage happens one-handed on phones during the event.

Concrete mobile specs:

- target width range: 360px to 430px
- horizontal padding: 16px
- sticky header: 56px
- bottom nav: 64px
- minimum touch target: 44px, preferred 48px
- schedule row minimum height: 72px
- no more than two lines of critical text per row
- venue badges should remain single-line pills

Mobile behavior principles:

- bottom navigation with 4 to 5 items maximum
- live actions sit in thumb-friendly lower zones
- advanced filters move into a drawer, not persistent clutter
- first screen should answer the user's live question before requiring scroll
- avoid long uniform card walls
- keep content readable in low-light, high-glare conditions

Offline resilience:

- cache schedule, venue info, and saved route locally
- show last-updated timestamp
- degrade gracefully when network-dependent enrichment is unavailable

## Visual Design Direction

SetTimes should feel nightlife-friendly without becoming visually muddy.

Visual tone:

- energetic
- modern
- legible
- nightlife-aware

Principle:

- color communicates state and emphasis, not decoration

Suggested palette:

- background: #0B1020
- elevated surface: #151C32
- secondary surface: #1D2743
- primary accent: #FF6B2C
- secondary accent: #17C7B5
- live highlight: #F4D35E
- text primary: #F5F7FA
- text secondary: #AEB7C6
- muted line: #32405F
- success: #3DDC97
- conflict: #FF5D73

Typography:

- display: Space Grotesk or Sora
- body UI: IBM Plex Sans or Geist
- time labels: IBM Plex Mono or JetBrains Mono

Type scale:

- hero: 32/36
- h1: 28/32
- h2: 22/28
- h3: 18/24
- body: 16/22
- compact body: 14/20
- meta: 12/16

UI density:

- medium-compact
- enough information per row to reduce taps
- enough whitespace to avoid visual blur in dark environments

Icon style:

- simple, solid, geometric
- icons only where they reduce reading time

## Design System

Core components:

- Schedule Row
- Band Card
- Venue Badge
- Time Indicator
- Filter Controls
- Bottom Navigation
- Sticky Context Bar

Spacing tokens:

- 4
- 8
- 12
- 16
- 24
- 32

Recommended usage:

- row padding: 12 vertical, 14 horizontal
- section gap: 24
- card radius: 14
- chip radius: pill
- header-to-content gap: 16

Typography tokens:

- text-display
- text-title-lg
- text-title-md
- text-body
- text-body-sm
- text-meta
- text-time-mono

State tokens:

- state-live
- state-soon
- state-upcoming
- state-past
- state-conflict
- state-favorite

## Microinteractions

Microinteractions should reinforce clarity rather than add novelty.

- filtering schedules: active chips fill immediately and update result count without heavy motion
- highlighting current sets: one subtle pulse on the live dot, then static state
- favoriting bands: fast star or plus-to-check transition with optional haptic feedback
- switching venues: preserve scroll position and animate content in 120-180ms
- countdown updates: move from Starts in 2m to Now Playing without layout shift
- conflict handling: show inline warning near the action instead of a blocking modal
- offline state: subtle persistent bar stating that cached schedule data is in use

## Accessibility

SetTimes should meet WCAG 2.1 AA as a baseline.

- maintain 4.5:1 contrast for body text and 3:1 for large text and key surfaces
- never rely on color alone for live state
- use semantic headings, navigation, lists, buttons, and time elements
- keep schedule rows fully keyboard reachable with visible focus states
- make filter chips and venue switching keyboard operable
- use aria-live only for concise summary changes, not constant row noise
- expose time, venue, and state in readable screen reader phrasing
- support 200% zoom without layout breakage
- respect reduced-motion preferences
- ensure sticky bars and bottom nav work with safe-area insets and screen readers

## Discovery Features

Discovery should improve live utility, not distract from it.

Recommended features:

- Playing Now
- Starting Soon
- Closest Saved Band
- venue switcher with walking relevance
- genre filtering
- organizer picks
- similar bands later tonight
- open-in-maps venue links
- late-night sets collection
- archive-driven suggestions such as bands from this crawl playing again soon

## Usability Testing Plan

Test in realistic conditions: standing, one-handed, mild distraction, dim brightness, and unreliable connectivity.

Tasks:

1. Find a band's set time.
2. Discover a new band starting soon.
3. Plan the next venue stop.
4. Revisit a past event and find who played a given venue.

Measure:

- completion time
- wrong taps
- backtracks
- scroll depth
- confusion points
- confidence rating out of 5

Target thresholds:

- band set time found in under 10 seconds
- new starting-soon band found in under 15 seconds
- next venue decision made in under 20 seconds

Qualitative prompts:

- What felt fastest?
- What made you hesitate?
- Could you tell what was live immediately?
- Did venue switching feel obvious?

## Front-End Implementation Guidance

Build on the current platform rather than replacing it.

- keep current now/upcoming/past data buckets as the basis for lifecycle views
- layer a live shell above the existing schedule data model
- evolve My Schedule into My Route instead of creating a second planning system
- reuse band profiles as deep-detail destinations
- use event lifecycle states to switch among preview, live, recap, and archive

Performance:

- prerender event shells where possible
- lazy-load archive extras and heavy media
- use aggressive caching with stale-while-revalidate
- reserve space for live-state labels to minimize layout shift
- only poll actively while a live event is visible

Responsive strategy:

- use one core schedule-row component with variants
- keep phones single-column
- progressively enhance venue-lane layouts on larger screens

Maintainability:

- model event lifecycle as explicit UI states
- centralize time, status, and venue badge logic
- keep components aligned with user tasks rather than raw data tables
- drive styling through shared tokens

Progressive enhancement:

- baseline HTML should still show schedule and venue info
- countdowns and personalized hints should enhance, not gate, usability

## Product Roadmap

### P0

- redesign event page into lifecycle-aware preview/live/archive shell
- add live-first mobile schedule with Now Playing, Starting Soon, and sticky venue switcher
- relabel and redesign My Schedule as My Route
- improve save/remove actions and overlap warnings
- preserve offline-readable schedule and favorites
- create a meaningful post-event archive page

### P1

- add venue-lane alternate view
- add walking-time hints and map-aware next-stop suggestions
- expand archive recap modules and event lineage
- add smarter discovery based on favorites, genre, and history

### P2

- organizer highlights and more live update controls
- community recap modules for photos and highlights
- personalized memory view of what the attendee caught
- richer archive comparison across years and recurring events

## Ideal Future Experience

SetTimes should feel fast, intuitive, and alive. Before the event, it should help attendees understand the shape of the night and build a loose route. During the event, it should answer the next decision in seconds, even in the dark, on the move, with one hand. After the event, it should become a memory object and local-scene archive that people return to, not just a schedule that expired at midnight.

The fully realized product should feel:

- fast
- intuitive
- community-driven
- mobile-optimized
- useful before, during, and after events

## Top 10 UX Improvements That Would Most Improve the Event Experience

1. Make the active event default to a live-first view with Now Playing, Starting Soon, and My Next Set above the fold.
2. Replace schedule-heavy scanning with a sticky venue switcher and persistent My Route toggle.
3. Turn My Schedule into a clearer route-planning mode with countdowns and overlap warnings.
4. Add a real event preview page so planning starts before the night begins.
5. Introduce a meaningful post-event archive and recap experience.
6. Reduce live schedule rows to a compact, glanceable mobile format.
7. Add venue-aware movement cues such as maps links and leave-now suggestions.
8. Use lifecycle-aware rendering so the same event naturally becomes preview, live companion, recap, and archive.
9. Improve low-light readability with stronger contrast and clearer state labels.
10. Preserve utility under bad connectivity by caching the schedule, favorites, venue info, and last updated state.