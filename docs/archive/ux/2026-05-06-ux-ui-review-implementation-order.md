# UX/UI Review Implementation Order

This document captures the recommended rollout order for the UX/UI review issues created on 2026-05-06.

Issue range:

- `#247` through `#258`

Primary goal:

- stabilize broken or misleading core flows first
- preserve user work before adding new UX surface area
- batch related changes together to reduce rework

## Recommended Order

### Wave 1: Restore Trust In The Public Schedule

1. `#247` Select All should respect active schedule filters and hidden-finished state

Why first:

- it is a core public workflow defect
- the fix is well-bounded and should be low-risk
- it reduces immediate confusion in My Schedule

Implementation notes:

- make `ScheduleView` the source of truth for visible IDs
- compute `All Selected` against the visible subset, not the full lineup
- verify venue, genre, and finished-set interactions together

2. `#248` Embedded schedule should not expose no-op schedule-building actions

Why second:

- also a public-facing dead-end interaction
- likely a contained cleanup after understanding the schedule action surface from `#247`

Implementation notes:

- decide whether embed is read-only or truly interactive
- if read-only, remove add/remove/select-all affordances completely

### Wave 2: Stabilize The Admin Event Workflow

3. `#249` Event wizard should preserve venue and band lists across step navigation

Why here:

- this is the most direct admin workflow breakage
- it affects event creation confidence and can cause duplicate entry

Implementation notes:

- render from canonical wizard state
- keep only unsaved draft inputs local to each step

4. `#254` Create Event should use the shared modal primitive with focus management

Why with `#249`:

- both changes touch the same surface
- fixing them together avoids revisiting wizard container structure twice

Implementation notes:

- migrate the current overlay to the shared `Modal`
- preserve existing wizard sizing and step layout while inheriting focus trap and scroll lock

5. `#250` Admin should preserve active tab and event context across reloads and idle session recovery

Why after `#249` and `#254`:

- this is the largest admin state-management change
- it should build on the cleaned-up wizard and event selection flow

Implementation notes:

- persist `activeTab`, `selectedEventId`, and recoverable workflow state
- stop clearing selected event context on routine refreshes
- reuse `EventContext` rather than adding another overlapping state source

6. `#253` Admin bottom nav should respect iOS safe-area insets

Why in the same wave:

- it is a fast admin/mobile polish fix
- it can ship alongside the admin-shell work with very low risk

Implementation notes:

- use the existing safe-area token in base styles
- verify bottom spacing with the admin content container

### Wave 3: Improve Live Navigation And Findability

7. `#251` Restore public time filtering in the live schedule

Why here:

- it is an information-architecture issue, not a broken save flow
- it should come after core schedule correctness is restored

Decision gate:

- confirm product still wants a user-facing time filter
- if not, close the issue by removing dead public time-filter plumbing instead of shipping half-owned UI

8. `#252` Preserve source event context when navigating from a schedule to a band profile

Why next:

- it improves flow continuity between event schedule and band detail
- it is easier to validate once the public schedule controls are stable again

Implementation notes:

- pass source event context explicitly through link state or query params
- use that source for breadcrumb and return actions

### Wave 4: Expand Live Planning UX

9. `#255` Move venue switching and route controls into the sticky live bar

Why after `#251`:

- the live control surface should be designed with the final filtering model in mind
- this is a broader UI enhancement and should not precede correctness fixes

Implementation notes:

- keep the sticky bar compact on phones
- prioritize venue switching and My Route over secondary metrics

10. `#256` Shared schedule import should support merge in addition to replace

Why here:

- it builds on stable schedule selection behavior
- it adds flexibility without blocking the core event experience

Implementation notes:

- support `Replace`, `Merge`, and `Cancel`
- preview incoming vs already-selected items if practical

11. `#257` Replace clear-schedule confirmation with an undo flow

Why after `#256`:

- it is lower-risk polish once schedule state behavior is already trustworthy
- undo patterns are easier to validate after merge and replace behaviors are defined

Implementation notes:

- keep the last cleared selection briefly in memory
- provide a reversible toast action instead of a blocking confirmation dialog

### Wave 5: Increase Archive Value

12. `#258` Expand event recap into a returnable archive surface

Why last:

- it is the broadest content and UX enhancement in the set
- it does not block live-event usability or admin correctness
- it benefits from learning gathered during earlier schedule and navigation fixes

Implementation notes:

- start with venue recap and saved-vs-missed modules
- expand only after the minimum archive value is established

## Suggested Delivery Grouping

If these are split across multiple PRs or sprints, the cleanest grouping is:

1. Public schedule correctness: `#247`, `#248`
2. Admin workflow stabilization: `#249`, `#254`, `#250`, `#253`
3. Live schedule navigation and control surface: `#251`, `#252`, `#255`
4. Schedule planning quality-of-life: `#256`, `#257`
5. Archive expansion: `#258`

## Validation Priorities

For every wave, verify on:

1. Mobile width around `375px`
2. Tablet width around `768px`
3. Desktop width around `1280px`

High-risk regression areas:

- selected-band persistence
- schedule filtering interactions
- admin event context after refresh and auth changes
- keyboard focus behavior in modal and dialog flows
- band-profile return navigation into the source event
