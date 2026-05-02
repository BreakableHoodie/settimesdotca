# Event Lifecycle Hub — Design Spec

**Date:** 2026-05-02
**Status:** Approved
**Hard deadline:** May 17, 2026 (next Long Weekend Band Crawl event)
**Primary goal:** Give fans meaningful reasons to visit the site before, during, and after an event — turning a single-use schedule tool into a year-round destination.

---

## Problem Statement

SetTimes.ca currently has no usage between events. Band profiles stay live year-round but there is no hook pulling fans back. The pre-event window is underutilized — fans can't share their schedule picks with friends, and there is no mechanism to build hype as the lineup is revealed progressively. Post-event, there is no recap or archive that rewards returning visitors.

---

## Ship Order

### Phase 1 — Before May 17 (hype window)

| # | Feature | Effort |
|---|---------|--------|
| 1 | Shareable schedule URLs | ~2 days |
| 2 | Pre-event reveal mode | ~3 days |
| 3 | "Notify me" band following | ~3 days |

### Phase 2 — After May 17 (retention and archive)

| # | Feature | Effort |
|---|---------|--------|
| 4 | Post-event recap page | ~2 days |
| 5 | Historical archive backfill admin UI | ~2 days |

Each feature is independently shippable with its own migration (if any) and PR.

---

## Feature 1: Shareable Schedule URLs

### Goal
Fans share their planned lineup with friends. Friends click the link, see the schedule pre-populated, and build their own. Zero friction — no account required.

### Approach
Encode selected performance IDs into a URL query param on the event schedule page:
```
/schedule/long-weekend-band-crawl-vol6?s=41,42,77
```

### Implementation

**Frontend only — no new endpoints, no DB changes.**

The schedule page lives in `frontend/src/App.jsx` at the `/event/:slug` route. The URL format for shared schedules:
```
/event/long-weekend-band-crawl-vol6?s=41,42,77
```

`frontend/src/App.jsx`
- On mount, after the event data loads, parse `?s=` from `useSearchParams()`. Validate each ID against the loaded `bands` array (performance IDs). Seed the per-slug localStorage key with valid IDs.
- Invalid or unknown IDs are silently dropped (graceful degradation if lineup changes).

`frontend/src/components/MySchedule.jsx`
- Add a "Share My Schedule" button alongside the existing "Copy Schedule" button.
- On click: construct `window.location.origin + /event/${slug}?s=${selectedIds.join(',')}` and call the existing `copyToClipboard` utility.
- Show transient confirmation ("Link copied!") using the same pattern as the existing copy button.

### Edge Cases
- If the lineup changes after a share link is created, unknown IDs are dropped silently — the fan sees a partial schedule with a note that some selections are no longer available.
- Empty schedule: Share button is hidden (nothing to share).
- URL length: 50 performance IDs at ~4 chars each = ~200 chars. Well within URL limits.

### Testing
- Unit: `scheduleStorage` correctly seeds localStorage from valid URL params; ignores invalid IDs.
- Unit: Share button generates correct URL from current localStorage state.
- E2E: Visit share URL → schedule pre-populated → Share button visible → copy produces same URL.

---

## Feature 2: Pre-Event Reveal Mode

### Goal
Organizer drips band announcements one at a time (or in batches), building weekly hype. The public schedule updates live as bands are announced. Unannounced bands are invisible to the public.

### Schema Changes

```sql
-- Migration: 0033_reveal_mode.sql
ALTER TABLE events ADD COLUMN reveal_mode INTEGER NOT NULL DEFAULT 0;
ALTER TABLE performances ADD COLUMN is_announced INTEGER NOT NULL DEFAULT 1;
```

Both default to the safe, backward-compatible state: existing events show everything.

### API Changes

`GET /api/schedule`
- When `event.reveal_mode = 1`, filter performances to `is_announced = 1` only.
- Admin-authenticated requests always see all performances regardless of `reveal_mode`.

`GET /api/events/:id/details`
- Same filter as above.

`PATCH /api/admin/performances/:id` (**new endpoint** in `functions/api/admin/bands.js`)
- Accept `is_announced` boolean in the request body.
- Validates the performance belongs to an event the requesting admin can edit.
- When `is_announced` flips `0 → 1`, triggers band-follower notifications (see Feature 3).

`PATCH /api/admin/events/:id` (existing endpoint in `functions/api/admin/events.js`)
- Accept `reveal_mode` boolean in the request body.

### Admin UI Changes

`frontend/src/admin/EventFormModal.jsx`
- Add "Reveal mode" toggle (off by default). Helper text: *"When on, only announced bands appear on the public schedule."*

`frontend/src/admin/LineupTab.jsx`
- Each performance row gets an "Announced" toggle (eye icon or checkbox).
- Rows with `is_announced = false` are visually dimmed in the admin view.
- Bulk action: "Announce selected" added to `BulkActionBar`.

### Public UI Changes

`frontend/src/pages/SchedulePage.jsx` (or wherever the schedule is rendered)
- When the API returns `reveal_mode: true` and fewer bands than expected (i.e., some are hidden), show a teaser banner:
  *"More bands dropping soon — [subscribe to be notified](#follow)."*
- Link anchor scrolls to a "Follow a band" or event subscription CTA.

### Testing
- Unit: schedule endpoint filters unannounced performances when reveal mode is on.
- Unit: admin-authenticated requests bypass reveal filter.
- Unit: toggling `is_announced` on a performance updates the public response immediately.
- E2E: admin enables reveal mode → unannounced band invisible on public schedule → admin announces band → band appears.

---

## Feature 3: "Notify Me" Band Following

### Goal
Fans subscribe to individual bands. When an admin announces a band (flips `is_announced = 1`), followers of that band receive an email.

This also serves as a general pre-event hook: fans following bands from past events get pulled back in when those bands appear on a new lineup.

### Schema Changes

```sql
-- Migration: 0034_band_follows.sql
ALTER TABLE email_subscriptions ADD COLUMN band_profile_id INTEGER REFERENCES band_profiles(id);
```

- `band_profile_id IS NULL` → existing event-level subscription (unchanged behavior).
- `band_profile_id IS NOT NULL` → band-specific follow.

The existing unsubscribe token, verification flow, and email delivery pipeline apply without modification.

### API Changes

`POST /api/subscriptions/subscribe`
- Accept optional `band_profile_id` in the request body.
- If provided, validate the band exists; store the follow. Skip the city/genre fields (not relevant for band follows).
- Reuse existing Turnstile bot-protection check.

`GET /api/subscriptions/verify` (existing)
- No change — token-based verification works identically.

`GET /api/subscriptions/unsubscribe` (existing)
- No change — token-based unsubscribe works identically.

### Notification Trigger

`PATCH /api/admin/performances/:id` (the announce toggle from Feature 2)
- When `is_announced` flips from `0 → 1`, query `email_subscriptions` for all confirmed followers of that `band_profile_id`.
- Send each a transactional email: *"[Band Name] just joined the lineup for [Event Name]! Check out their set time."*
- Fire-and-forget (do not block the API response on email delivery). Log failures to the existing audit log.
- De-duplicate: if a performance is un-announced and then re-announced, do not re-notify the same follower. Track this with a `band_follow_notified` column on `performances` (boolean, default 0); set to 1 on first notification and never reset.

### Public UI Changes

`frontend/src/pages/BandProfilePage.jsx`
- Add a "Follow [Band Name]" section below the profile hero.
- Email input + submit button. Same visual pattern as the existing `/subscribe` page.
- On submit: `POST /api/subscriptions/subscribe` with `band_profile_id`.
- Success state: *"You're following [Band Name]. We'll email you when they join a lineup."*

`frontend/src/admin/LineupTab.jsx`
- After a band is announced, show a non-blocking toast: *"Notified N followers of [Band Name]."*

### Testing
- Unit: `POST /api/subscriptions/subscribe` with `band_profile_id` stores a band follow, not an event follow.
- Unit: announcing a performance triggers emails to band followers only (not all subscribers).
- Unit: existing event-level subscriptions unaffected by the schema change.
- E2E: follow a band → admin announces band → verify notification email fired (mock email in test env).

---

## Feature 4: Post-Event Recap Page (Phase 2)

### Goal
Auto-generated event summary page that lives permanently at `/events/:slug/recap`. Rewards returning fans and feeds band profile traffic.

### New Endpoint
`GET /api/events/:slug/recap`

Response shape:
```json
{
  "event": { "name": "...", "date": "...", "slug": "..." },
  "stats": {
    "band_count": 24,
    "venue_count": 6,
    "total_sets": 28,
    "first_timers": 8,
    "returning_acts": 16
  },
  "bands": [ { "id": 7, "name": "...", "venue": "...", "startTime": "..." } ]
}
```

"First timers" vs "returning acts" determined by checking whether `band_profile_id` has prior performances in other events.

### New Frontend Page
`frontend/src/pages/EventRecapPage.jsx`
- Route: `/events/:slug/recap`
- Shows event stats, band list with links to profiles, and a CTA to subscribe to the next event.

---

## Feature 5: Historical Archive Backfill Admin UI (Phase 2)

### Goal
Give the organizer a fast path to enter past LWBC events (bands only, no times required). The optional venue/time feature already landed — this is pure admin UX.

### Admin UI Changes
`frontend/src/admin/EventsTab.jsx`
- "Import historical event" flow: create event with `is_archived = true` from the start, then a streamlined band-only lineup entry (no time fields shown, no venue required).
- Supports copy-paste of a band list (newline-separated names) with fuzzy match against existing `band_profiles`.

### No schema changes required.
The `performances` table already supports null venue and null time (migration 0032 on the current branch).

---

## Architecture Notes

- All three Phase 1 features are independently deployable. Merge order: Feature 1 → Feature 2 → Feature 3.
- Feature 2 and 3 each require a D1 migration. Use the existing `npm run migrate:local` / `npm run migrate:remote` workflow.
- The reveal mode filter in the schedule API must be covered by tests before merge — it is a security-adjacent gate (unpublished bands must not leak).
- Band follow emails reuse the existing email delivery environment variables and sender configuration. No new secrets required.
- URL param seeding in Feature 1 must not silently override an existing localStorage schedule. If the fan already has picks for that event slug, show a prompt: *"Load shared schedule? Your current picks will be replaced."* If no existing picks, seed silently.

---

## Out of Scope

- Push notifications (requires service worker + permission flow — post-May-17 at earliest)
- Photo uploads / R2 integration (separate feature track)
- Multi-tenant / multi-org (long-term vision document)
- Schedule conflict detection for fans (nice-to-have, revisit post-May-17)
