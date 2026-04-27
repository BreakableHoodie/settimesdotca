# SetTimes v2 Frontend Implementation Plan

## Goal

Implement the SetTimes v2 lifecycle experience on top of the existing React frontend without replacing the current schedule, timeline, favorites, and band profile foundations.

This plan maps the redesign to the current app structure.

Relevant existing entry points:

- `frontend/src/pages/EventsPage.jsx`
- `frontend/src/components/EventTimeline.jsx`
- `frontend/src/App.jsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/ScheduleView.jsx`
- `frontend/src/components/MySchedule.jsx`
- `frontend/src/components/ComingUp.jsx`
- `frontend/src/components/VenueInfo.jsx`
- `frontend/src/pages/BandProfilePage.jsx`
- `frontend/src/utils/eventLifecycle.js`

## Current Architecture Summary

### Public routes

- `/` -> `EventsPage`
- `/event/:slug` -> `App`
- `/band/:id` -> `BandProfilePage`

### Already present

- public timeline page with now/upcoming/past data
- schedule page with now-playing and chronological sections
- saved band state in local storage
- `MySchedule` personal view
- venue info block
- band profile page with history and schedule integration
- lifecycle utilities for upcoming, recently completed, archived

### Main gap

The pieces exist, but the attendee experience is still fragmented:

- `/` behaves more like an event list than a lifecycle entry point
- `/event/:slug` is schedule-first, not lifecycle-first
- `MySchedule` is useful but framed as a secondary list instead of a route planner
- post-event archive is not yet a strong public destination

## Recommended Delivery Strategy

Implement in vertical slices by event lifecycle.

Sequence:

1. establish lifecycle-aware event shell
2. improve live schedule and route planning
3. add archive and recap experience
4. refine venue-aware and discovery features

## Phase 1: Lifecycle-Aware Event Shell

### Objective

Make `/event/:slug` render differently based on event lifecycle.

### Existing fit

- `frontend/src/App.jsx` already owns event data fetch and schedule mode switching
- `frontend/src/utils/eventLifecycle.js` already defines upcoming, recently completed, archived

### Recommended changes

Create a top-level lifecycle shell inside `App.jsx`:

- `EventOverviewView`
- `EventLiveView`
- `EventRecapView`
- `EventArchiveView`

Recommended state decision:

- upcoming -> show preview-first shell with schedule preview sections
- recently completed -> show recap-first shell while keeping final schedule available
- archived -> show archive-first shell with recap and history navigation

### Proposed component additions

- `frontend/src/components/event/EventHero.jsx`
- `frontend/src/components/event/EventLifecycleNav.jsx`
- `frontend/src/components/event/EventPreviewSections.jsx`
- `frontend/src/components/event/EventRecapSections.jsx`
- `frontend/src/components/event/EventArchiveSections.jsx`

### Notes

- keep schedule data fetching in `App.jsx`
- route changes are not required for the initial implementation
- the same `/event/:slug` page can change presentation based on lifecycle state

## Phase 2: Live Schedule Redesign

### Objective

Turn the current schedule into a live-first mobile surface.

### Existing fit

- `ScheduleView.jsx` already derives now-playing, upcoming, and past groupings
- `ComingUp.jsx` already identifies the next set
- `Header.jsx` already supports switching between all and personal schedule

### Recommended changes

Refactor `ScheduleView.jsx` into smaller blocks:

- `LiveNowSection`
- `StartingSoonSection`
- `TimelineSection`
- `TimeGroup`
- `ScheduleRow`

Move from card-heavy scanning toward compact rows in the live flow.

### Proposed component additions

- `frontend/src/components/schedule/ScheduleRow.jsx`
- `frontend/src/components/schedule/LiveNowSection.jsx`
- `frontend/src/components/schedule/StartingSoonSection.jsx`
- `frontend/src/components/schedule/TimelineSection.jsx`
- `frontend/src/components/schedule/VenueSwitcher.jsx`

### Specific UI changes

- add sticky context bar with event title, current time, venue switcher, and My Route toggle
- keep `Now Playing` above the fold
- replace generic section density with more compact live rows
- show `Starting Soon` only for the next short window
- hide finished sets by default

### Data requirements

Mostly supported already.

Potential additions:

- derived `minutesUntilStart`
- derived `minutesRemaining`
- optional venue walking hint metadata if available later

## Phase 3: Rename And Upgrade My Schedule To My Route

### Objective

Turn the saved-band view into a route planner.

### Existing fit

- `MySchedule.jsx` already handles chronological saved selections, conflicts, and contextual reminders

### Recommended changes

Short term:

- rename attendee-facing label from `My Schedule` to `My Route`
- make the next saved set the dominant module
- keep conflicts closer to the specific overlapping items
- add venue movement guidance where possible

Mid term:

- split `MySchedule.jsx` into smaller route-focused components
- preserve existing local storage model to avoid migration risk

### Proposed component additions

- `frontend/src/components/route/MyRouteHeader.jsx`
- `frontend/src/components/route/NextSetCard.jsx`
- `frontend/src/components/route/RouteConflictGroup.jsx`
- `frontend/src/components/route/RouteTimeline.jsx`

### Labeling migration

Update the following surfaces:

- `Header.jsx`
- `EventsPage.jsx` banner copy if relevant
- `BandProfilePage.jsx` save-related affordances where attendee-facing

## Phase 4: Event Preview Experience

### Objective

Make upcoming events useful before the first set starts.

### Existing fit

- `EventsPage.jsx` and `EventTimeline.jsx` already expose event cards and details
- band profiles and venue metadata already exist

### Recommended changes

Enhance `EventTimeline` cards and event page overview sections with:

- quick facts: first set, late-night end, venue count, band count
- lineup preview chips
- featured bands strip
- venue list with maps links
- preview timeline summary

### Proposed component additions

- `frontend/src/components/event/PreviewFacts.jsx`
- `frontend/src/components/event/FeaturedLineup.jsx`
- `frontend/src/components/event/PreviewTimelineSummary.jsx`

### API considerations

The current `/api/schedule` and `/api/events/timeline` endpoints appear sufficient for an initial pass.

Optional future additions:

- organizer picks
- genre aggregations per event
- event summary fields like first set and last set precomputed server-side

## Phase 5: Post-Event Recap And Archive

### Objective

Make completed events valuable after the night ends.

### Existing fit

- timeline already exposes past events
- lifecycle utilities already define archived states
- band profile pages already support historical context

### Recommended changes

Add recap and archive sections into the event page for completed events:

- final schedule view
- venue recap
- saved-route recap if local route exists
- related bands and recurring event lineage

Add a stronger archive discovery layer from `/`.

### Proposed component additions

- `frontend/src/components/archive/EventRecapHero.jsx`
- `frontend/src/components/archive/VenueRecapList.jsx`
- `frontend/src/components/archive/RelatedArchiveLinks.jsx`
- `frontend/src/components/archive/ArchiveSearchBar.jsx`

### Future route option

If archive grows significantly, add a dedicated public route:

- `/archive`
- `/archive/:slug`

That can be deferred until the archive model warrants a dedicated surface.

## Phase 6: Venue-Aware Live Utility

### Objective

Help attendees move between venues with less guesswork.

### Existing fit

- `VenueInfo.jsx` already exposes maps links
- `MySchedule.jsx` already contains venue-specific travel warnings in basic form

### Recommended changes

- centralize venue movement logic instead of leaving it embedded inside `MySchedule`
- surface venue changes in both live and route views
- make open-in-maps available from route-critical contexts

### Proposed utilities

- `frontend/src/utils/venueRouting.js`
- `frontend/src/utils/scheduleStatus.js`

### Proposed UI components

- `frontend/src/components/venues/VenueTravelHint.jsx`
- `frontend/src/components/venues/VenueActionBar.jsx`

## Phase 7: Design Tokens And Visual Refresh

### Objective

Support the new lifecycle UX with a more disciplined attendee-facing design system.

### Existing fit

- UI primitives already exist under `frontend/src/components/ui`
- there are design system fragments in both JS and TS component folders

### Recommended changes

- define shared tokens for live states, spacing, typography, and surface colors
- standardize attendee UI on one set of primitives where practical
- avoid broad rewrite during the first pass

### Suggested work items

- add lifecycle state tokens to global styles
- create venue badge variants
- create compact schedule row variants
- normalize button and chip usage in attendee views

## Suggested File-Level Plan

### High priority updates

- `frontend/src/App.jsx`
- `frontend/src/components/Header.jsx`
- `frontend/src/components/ScheduleView.jsx`
- `frontend/src/components/MySchedule.jsx`
- `frontend/src/components/ComingUp.jsx`
- `frontend/src/pages/EventsPage.jsx`

### New folders to add

- `frontend/src/components/event/`
- `frontend/src/components/schedule/`
- `frontend/src/components/route/`
- `frontend/src/components/archive/`
- `frontend/src/components/venues/`

### Optional route additions later

- `frontend/src/pages/ArchivePage.jsx`
- `frontend/src/pages/EventArchivePage.jsx`

## Performance Guidance

- keep `/` and `/event/:slug` fast on mobile first load
- lazy-load heavy recap and archive modules
- poll only while an active event is visible
- reserve layout space for live-state labels to avoid shifting rows
- continue using local storage for route persistence
- consider reintroducing service worker only after cache strategy is stable

## Accessibility Guidance

- ensure compact rows remain keyboard reachable on desktop and tablet
- do not rely on color alone for `Now Playing` or `Conflict`
- expose band, time, venue, and state in a single readable announcement for assistive tech
- preserve visible focus states in sticky headers, chips, and bottom navigation

## Delivery Milestones

### P0

- lifecycle-aware event shell in `App.jsx`
- live-first event schedule
- attendee-facing rename to `My Route`
- compact schedule rows
- stronger active-event hero on `/`
- recap-first rendering for recently completed events

### P1

- richer event preview sections
- venue switcher and venue-aware hints
- archive search entry and stronger past-event browsing
- route recap details and recurring event lineage

### P2

- dedicated archive routes
- richer discovery and similarity logic
- community memory modules and post-event media

## Recommended First PR Breakdown

PR 1:

- rename attendee-facing `My Schedule` strings to `My Route`
- add sticky live context bar
- refactor `ScheduleView` into section components without major feature additions

PR 2:

- add lifecycle-aware rendering to `App.jsx`
- add preview and recap hero sections

PR 3:

- add archive-focused UI on `/` and completed event pages
- add route recap and venue recap modules

PR 4:

- add venue-aware movement hints and secondary venue view

This sequencing keeps the highest-value user improvements closest to the current architecture and minimizes migration risk.
