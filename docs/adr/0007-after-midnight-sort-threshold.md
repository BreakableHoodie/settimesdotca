---
title: "ADR-0007: Offset band sort times by +24h for performances starting before 6 AM"
status: "Accepted"
date: "2026-05-14"
authors: "Platform Engineering"
tags: ["architecture", "frontend", "scheduling", "datetime", "sorting"]
supersedes: ""
superseded_by: ""
---

## Status

Accepted

## Context

Music festival schedules routinely run past midnight. A band starting at 1:30 AM on Saturday is part of the Friday night lineup — attendees experience it as a continuous Friday evening, not as the first act of Saturday. Stored in the database, however, that performance carries a `date` of Saturday and a `startTime` of `01:30`.

A naive sort by `date + startTime` places all after-midnight acts at the top of the next calendar day's list, producing a schedule that reads:

```
Saturday
  01:30 AM — Late Night Act      ← looks wrong: this is the Friday night closer
  ...
  09:00 PM — First Evening Act
  11:00 PM — Headliner
```

This is the root of a recurring bug class. Any code path that sorts, filters, displays, or detects conflicts among performances without accounting for after-midnight sets will produce incorrect results.

The frontend represents performance times as `startMs` and `endMs` (milliseconds since epoch), computed by parsing `band.date` + `band.startTime/endTime` with `Date.parse()`. Without adjustment, after-midnight sets produce smaller `startMs` values than same-evening acts that started before midnight on the same calendar date. The comparison `afterMidnightBand.startMs < eveningBand.startMs` evaluates to `true`, causing the after-midnight band to sort first.

Two distinct sub-cases exist within a midnight-spanning set:

- **End crosses midnight** (e.g., starts 23:40, ends 00:10): `endMs` as parsed is less than `startMs`; adding `MS_PER_DAY` to `endMs` corrects this.
- **Start is after midnight** (e.g., starts 01:30, ends 02:30): both `startMs` and `endMs` are smaller than same-evening acts; adding `MS_PER_DAY` to both corrects the sort order.

The threshold between "this set belongs to the previous evening" and "this is a real morning act" requires a judgment call. A threshold of 06:00 covers all practical festival after-midnight programming while excluding early-morning activity such as sound checks, daytime stage setups, or legitimately scheduled morning acts.

## Decision

Any performance whose `startTime` hour is strictly less than `AFTER_MIDNIGHT_THRESHOLD_HOUR` (6) is treated as an after-midnight set belonging to the previous evening. The `prepareBands()` function in `frontend/src/utils/bandUtils.js` adds `MS_PER_DAY` (86,400,000 ms) to both `startMs` and `endMs` for these performances before they enter any sort, filter, conflict-detection, or time-display path.

```js
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const AFTER_MIDNIGHT_THRESHOLD_HOUR = 6;

export function prepareBands(list) {
  return list.map((band) => {
    let startMs = Date.parse(`${band.date}T${band.startTime}:00`);
    let endMs = Date.parse(`${band.date}T${band.endTime}:00`);

    if (!Number.isNaN(startMs)) {
      const startHour = parseInt(String(band.startTime ?? "").split(":")[0], 10);
      if (Number.isFinite(startHour) && startHour < AFTER_MIDNIGHT_THRESHOLD_HOUR) {
        startMs += MS_PER_DAY;
        if (!Number.isNaN(endMs)) endMs += MS_PER_DAY;
      }
    }

    // Correct end times that cross midnight without triggering the threshold
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
      endMs += MS_PER_DAY;
    }

    return { ...band, startMs: Number.isNaN(startMs) ? 0 : startMs, endMs: Number.isNaN(endMs) ? 0 : endMs };
  });
}
```

`prepareBands()` is called once per API response load, immediately after the raw band array is received and validated, at two entry points:

- `frontend/src/App.jsx:203` — main schedule view
- `frontend/src/pages/EmbedPage.jsx:45` — embeddable schedule widget

All downstream consumers (`MySchedule.jsx` conflict detection, `BandCard.jsx` "starting soon" logic, `ScheduleLiveRow.jsx` progress calculation) operate on the already-enriched `startMs`/`endMs` values. The offset is in-memory only — the raw `startTime`/`endTime` strings from the API are preserved on the band objects and used for display.

The threshold constant (`AFTER_MIDNIGHT_THRESHOLD_HOUR = 6`) must never be lowered without auditing all events in the database for performances that fall between the new threshold and 06:00.

## Consequences

### Positive

- **POS-001**: After-midnight sets sort correctly after same-evening acts without any schema change or new field on the `performances` table.
- **POS-002**: The offset is computed once at load time and stored on the band object, so all subsequent comparisons (`sort`, conflict detection, "starting soon" checks) are simple integer comparisons with no repeated threshold logic.
- **POS-003**: The raw `startTime`/`endTime` strings are preserved for display, so times shown to users always reflect the real clock time, not the offset value.
- **POS-004**: Threshold boundary behavior is explicitly unit-tested: 05:59 is treated as after-midnight, 06:00 is treated as same-day (`bandUtils.test.js`).

### Negative

- **NEG-001**: Any new feature that reads `band.startMs` or `band.endMs` inherits the correct behavior automatically, but any feature that reads `band.startTime` or `band.date` and re-parses them with `Date.parse()` bypasses the offset and reintroduces the bug. This is the recurring failure mode documented in `CLAUDE.md`.
- **NEG-002**: The 6 AM threshold is a convention, not a derived value. A festival that genuinely programs acts starting at 5:30 AM (unlikely but possible) would have those acts misclassified as after-midnight sets of the previous evening.
- **NEG-003**: The offset is invisible in the stored data and in API responses. Debugging sort order issues requires knowing this transformation exists; developers unfamiliar with the codebase have historically missed it.
- **NEG-004**: `prepareBands()` has two call sites (`App.jsx` and `EmbedPage.jsx`). A third entry point added in future (e.g., a new page or a server-side render) that omits the `prepareBands()` call will silently produce incorrect sort order without a compile-time or runtime error.

## Alternatives Considered

##### Store an explicit "event day" field per performance

- **ALT-001**: **Description**: Add an `event_day` column to `performances` (e.g., "Friday", or an integer day index) that editors assign when creating the lineup. Sort by `event_day` first, then `start_time`.
- **ALT-002**: **Rejection Reason**: Requires a schema migration and a UI change. Editors must manually assign the day for every performance, introducing the same classification error this threshold handles automatically. The 6 AM threshold is derived from domain knowledge (festivals don't program real acts before 6 AM), not from user input, so automating it is strictly safer than requiring human judgment at data entry time.

##### Lower the threshold (e.g., 3 AM)

- **ALT-003**: **Description**: Use 03:00 as the after-midnight threshold instead of 06:00.
- **ALT-004**: **Rejection Reason**: Increases the risk of misclassifying legitimate early-morning acts (sound checks, ambient sets, daytime programming that starts between 03:00 and 06:00). The 6 AM value was chosen to provide a comfortable buffer above all observed festival after-midnight programming in the dataset.

##### Normalize times on the backend before serving the API

- **ALT-005**: **Description**: Apply the +24h offset on the server side and return pre-adjusted timestamps in the API response.
- **ALT-006**: **Rejection Reason**: Sorting and conflict detection are frontend concerns — the backend serves the canonical data and the frontend interprets it for display. Adjusting times in the API response would mean the API no longer returns the times as stored, complicating admin editing, audit logs, and any future backend-side schedule processing. The offset belongs at the rendering boundary, not in the data layer.

## Implementation Notes

- **IMP-001**: Every code path that compares or sorts performance times must use `startMs`/`endMs` from a band object that has passed through `prepareBands()`. Never call `Date.parse(band.date + 'T' + band.startTime)` directly in sort comparators, conflict detectors, or display components.
- **IMP-002**: When adding a new page, component, or data entry point that loads band data from the API, call `prepareBands()` on the raw array before storing it in state.
- **IMP-003**: `AFTER_MIDNIGHT_THRESHOLD_HOUR` must not be lowered without first querying all `performances` rows for `start_time < '06:00'` and confirming that none of them represent legitimate morning acts that should retain their calendar-day sort position.
- **IMP-004**: The threshold check is `startHour < AFTER_MIDNIGHT_THRESHOLD_HOUR` (strictly less than). A performance starting at exactly 06:00 is treated as a same-day act. This is the intended boundary.
- **IMP-005**: The conflict detection logic in `MySchedule.jsx` (`startMs < otherEnd && otherStart < currentEnd`) operates on already-enriched values and does not need to reapply the threshold. Do not add threshold logic to conflict detection.

## References

- **REF-001**: `frontend/src/utils/bandUtils.js` — `prepareBands()`, `AFTER_MIDNIGHT_THRESHOLD_HOUR`, `MS_PER_DAY`.
- **REF-002**: `frontend/src/utils/__tests__/bandUtils.test.js` — unit tests including threshold boundary (05:59 vs 06:00) and real-world A/B/C midnight-spanning cases.
- **REF-003**: `frontend/src/App.jsx:203` — primary call site.
- **REF-004**: `frontend/src/pages/EmbedPage.jsx:45` — secondary call site (embeddable widget).
- **REF-005**: `frontend/src/components/MySchedule.jsx:176` — conflict and overlap detection consuming `startMs`/`endMs`.
- **REF-006**: `CLAUDE.md` — "After-midnight band sorting" section marks this as a recurring bug class and documents the threshold invariant for AI assistants.
