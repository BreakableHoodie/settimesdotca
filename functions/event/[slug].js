// CF Pages Function: serve /event/[slug] with server-rendered meta + MusicEvent
// JSON-LD for crawlers. See functions/utils/ssrMeta.js for rationale + fallback.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import {
  escapeAttr,
  toPlainText,
  serveWithInjectedMeta,
  serveNotFound,
  CANONICAL_HOST,
  DEFAULT_OG_IMAGE,
} from "../utils/ssrMeta.js";
import { normalizeHttpUrl } from "../utils/validation.js";
import { sortableName } from "../utils/sortableName.js";
import {
  torontoUtcOffsetAt,
  eventLocalFestivalToday,
  AFTER_MIDNIGHT_THRESHOLD_HOUR,
  nextCalendarDay,
} from "../utils/eventDay.js";
import { concludedEventSql, publicEventStatusSql } from "../utils/eventVisibility.js";

// Sets starting before 06:00 are after-midnight sets that belong to the
// PREVIOUS festival day (AFTER_MIDNIGHT_THRESHOLD_HOUR = 6 convention; the
// canonical server-side definition is functions/utils/eventDay.js, imported
// above — see CLAUDE.md).

/**
 * Extracts the integer hour from a performances.start_time value ("HH:MM",
 * "HH:MM:SS", or legacy "YYYY-MM-DD HH:MM"); null when absent/unparseable.
 * Mirrors normalizeStartTime in functions/api/events/timeline.js.
 */
function startHour(startTime) {
  if (typeof startTime !== "string") return null;
  const timePart = startTime.includes(" ") ? startTime.split(" ")[1] : startTime;
  const hour = Number.parseInt((timePart ?? "").slice(0, 2), 10);
  return Number.isFinite(hour) ? hour : null;
}

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeTime(time) {
  if (typeof time !== "string") return null;
  const value = time.includes(" ") ? time.split(" ")[1] : time;
  const hhmm = value?.slice(0, 5);
  return HHMM_REGEX.test(hhmm) ? hhmm : null;
}

function parseDoors(doorsJson) {
  if (!doorsJson) return {};
  try {
    const parsed = JSON.parse(doorsJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function dateTime(date, time) {
  return time ? `${date}T${time}:00${torontoUtcOffsetAt(date, time)}` : date;
}

function earliestTime(values) {
  return values.filter(Boolean).sort()[0] ?? null;
}

// The calendar date a festival-night time falls on: before 06:00 is the next
// morning (after-midnight convention; performance_date is the night).
function calendarDateOf(night, time) {
  return Number(time.slice(0, 2)) < AFTER_MIDNIGHT_THRESHOLD_HOUR ? nextCalendarDay(night) : night;
}

/**
 * The night's closing time, or null when it is not known. Each set's start is
 * placed on its calendar day, and its end relative to that start (a 05:00-07:00
 * set ends the next morning; 23:50-00:20 rolls over). The closing time is known
 * only when the LATEST-STARTING set has an end: otherwise an earlier set's end
 * would "close" the night before its last set begins (#1475 review).
 */
function closingBoundary(rows, fallbackDate) {
  let lastStart = null;
  let lastStartEndsKnown = false;
  let latestEnd = null;
  for (const row of rows) {
    const night = row.performance_date || fallbackDate;
    const start = normalizeTime(row.start_time);
    const end = normalizeTime(row.end_time);
    const startDate = start ? calendarDateOf(night, start) : null;
    const endDate = end
      ? startDate
        ? end < start
          ? nextCalendarDay(startDate)
          : startDate
        : calendarDateOf(night, end)
      : null;
    const endKey = end ? `${endDate}T${end}` : null;
    if (endKey && (!latestEnd || endKey > latestEnd.key)) latestEnd = { key: endKey, date: endDate, time: end };
    if (start) {
      const startKey = `${startDate}T${start}`;
      // Every set tied for the latest start must have an end; otherwise the
      // answer would depend on row order (#1475 review).
      if (!lastStart || startKey > lastStart) {
        lastStart = startKey;
        lastStartEndsKnown = Boolean(endKey);
      } else if (startKey === lastStart) {
        lastStartEndsKnown = lastStartEndsKnown && Boolean(endKey);
      }
    }
  }
  if (!latestEnd) return null;
  if (lastStart && (!lastStartEndsKnown || lastStart > latestEnd.key)) return null;
  return { date: latestEnd.date, time: latestEnd.time };
}

// endDate takes startDate's precision (Google: same format): a date-only start
// gets a date-only end.
function endDateFor(boundary, startTime) {
  return startTime ? dateTime(boundary.date, boundary.time) : boundary.date;
}

/**
 * Every calendar day from startDate to endDate inclusive, ascending.
 * Lexicographic YYYY-MM-DD comparison is safe (repo convention, see
 * CLAUDE.md). Guarded at 366 iterations so a malformed end_date before date
 * can't spin the loop.
 */
function eachCalendarDay(startDate, endDate) {
  const days = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 366) {
    days.push(cursor);
    cursor = nextCalendarDay(cursor);
    guard++;
  }
  return days;
}

// "Weekday, Month D" label for a subEvent's name, in the event's own
// timezone. Same noon-probe trick as torontoUtcOffset — never ambiguous
// around a DST transition, which always lands in the early morning.
const DAY_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Toronto",
  weekday: "long",
  month: "long",
  day: "numeric",
});
// Numeric floor of an admission restriction, for JSON-LD only. Returns null
// for "All Ages" and for anything with no digits, which the caller treats as
// "emit no audience block at all".
//
// The STORED value stays the human string ("19+", "All Ages") because that is
// what renders to a fan; only structured data needs a number. Parsed rather
// than hardcoded to 19 because the threshold is jurisdictional -- Ontario 19,
// Alberta and Quebec 18, a US date 21.
function minimumEntryAge(ageRestriction) {
  if (typeof ageRestriction !== "string") return null;
  // Only an explicit lower bound. A bare /\d+/ grabs the first number in any
  // string, so "Under 18 with guardian" would emit requiredMinAge: 18 --
  // asserting the OPPOSITE of what it says -- and "All Ages, 19+ licensed
  // section" would claim the whole event is 19+. Ambiguous text emits no
  // audience block, which says nothing rather than something false.
  //
  // The admin UI is a two-option select, but the API and any imported data
  // accept free text, so this cannot rely on the input being clean.
  const match = ageRestriction.trim().match(/^(\d{1,3})\s*\+$/);
  return match ? Number(match[1]) : null;
}

function festivalDayLabel(dateStr) {
  return DAY_LABEL_FORMAT.format(new Date(`${dateStr}T12:00:00Z`));
}

// Same label WITH the year, for the standalone meta description. A subEvent
// name (DAY_LABEL_FORMAT) sits inside an event already scoped to a year, so it
// omits one; a SERP snippet is read cold and needs it. Separate formats rather
// than one widened constant -- adding a year to DAY_LABEL_FORMAT would put it
// in every JSON-LD subEvent name too.
const DATE_LABEL_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Toronto",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

// Returns undefined -- never a partial, a wrong date, or "Invalid Date" -- for
// anything that is not a real calendar date, because this builds the <head> of
// a public page. Two failures it guards, in order of how easy they are to miss:
//
//   1. Intl.format() THROWS a RangeError on an invalid Date (it does not return
//      the string "Invalid Date" the way String(date) would), so an unparseable
//      column value would 500 the route rather than drop the date sentence.
//   2. Date SILENTLY NORMALIZES a day that overflows its month: "2026-02-30"
//      parses fine and becomes 2026-03-02, and "2026-02-29" (2026 is not a leap
//      year) becomes 2026-03-01. A typo would then publish a confidently WRONG
//      date into a SERP snippet, which is worse than publishing none.
//
// The toISOString round-trip is what catches (2); noon UTC sits far enough from
// either boundary that the UTC calendar day always equals the input for a real
// date. An explicit ^\d{4}-\d{2}-\d{2}$ regex was tried here and removed: it
// survived mutation, because every input it rejects is already rejected by the
// NaN check or the round-trip.
function eventDateLabel(dateStr) {
  if (typeof dateStr !== "string") return undefined;
  const probe = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(probe.getTime())) return undefined;
  if (probe.toISOString().slice(0, 10) !== dateStr) return undefined;
  return DATE_LABEL_FORMAT.format(probe);
}

// A multi-day event is its whole run, not its first day. Falls back to the
// start label alone if end_date is absent, equal, or unparseable.
function eventDateRangeLabel(dateStr, endDateStr) {
  const start = eventDateLabel(dateStr);
  if (!start) return undefined;
  // Lexicographic ordering is exact for YYYY-MM-DD. An inverted pair would
  // otherwise render "October 11 ... to October 9"; nothing validates the
  // ordering on write, so degrade to the start date alone.
  if (!endDateStr || endDateStr <= dateStr) return start;
  const end = eventDateLabel(endDateStr);
  return end ? `${start} to ${end}` : start;
}

/**
 * Buckets a performance row into one of `festivalDays` (a MULTI-DAY event's
 * full [date, end_date] span), applying the after-midnight convention: a set
 * starting before 06:00 belongs to the PREVIOUS festival day, not the
 * calendar day its performance_date literally names (#542 PR-4; see
 * functions/api/events/timeline.js's isGatedBeforeStart for the same
 * exclusion applied to the day-1 start edge). NULL performance_date inherits
 * the event's own start date (#543 convention, ical.js/schedule.js). If the
 * shift lands outside the event's own day span (e.g. a stray early set on
 * literal day 1), it's clamped back to day 1 rather than silently dropped
 * from every subEvent.
 */
function festivalDayForPerformance(row, event, festivalDays) {
  // performance_date already IS the festival night: production stores a 00:35
  // set on the same date as the 23:50 set before it (BuddiesFest 2, checked
  // 2026-11-24). Stepping a pre-06:00 start back a day put night 2's late sets
  // into night 1 (#1448).
  const day = row.performance_date || event.date;
  return festivalDays.includes(day) ? day : event.date;
}

export async function onRequest(context) {
  const { params, env, request } = context;
  const slug = params.slug;

  // Gate first (existence must not be observable while data is off), then a
  // slug no event can have is a definite miss: 404, not a soft-404 shell (#1446).
  if (!isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }
  if (!/^[a-z0-9-]{1,64}$/i.test(slug || "")) {
    return serveNotFound(context);
  }

  let event;
  try {
    event = await env.DB.prepare(
      `SELECT id, name, date, end_date, slug, description, city, ticket_url, ticket_price, poster_url, created_at, reveal_mode, age_restriction, presented_by, presented_by_url, doors_json,
              CASE WHEN ${concludedEventSql()} THEN 1 ELSE 0 END AS is_concluded
       FROM events
       WHERE slug = ? AND ${publicEventStatusSql()}`,
    )
      .bind(eventLocalFestivalToday(), slug)
      .first();
  } catch (err) {
    console.error("SSR event lookup failed:", slug, err);
    return env.ASSETS.fetch(request);
  }
  if (!event) return serveNotFound(context);

  // Fetch the event's performances (band + per-set festival day) and
  // distinct venues in parallel. Row-level (not DISTINCT bp.id) because
  // subEvent grouping below needs each performance's own performance_date /
  // start_time; the flat `bands` performer list is deduped from these rows
  // in JS instead.
  //
  // Reveal-mode gate (#542 PR-4, folded pre-existing bug; extended to venues
  // in #635): mirrors the `(e.reveal_mode = 0 OR p.is_announced = 1)` filter
  // already applied in schedule.js/ical.js/timeline.js. Both queries below
  // apply it independently — a venue whose ONLY performance is unannounced
  // must not leak into crawler-facing JSON-LD `location` any more than an
  // unannounced band leaks into `performer`. No reveal-mode event exists in
  // prod today, so this was latent, not active.
  let performanceRows = [];
  let venues = [];
  try {
    const [performancesResult, venuesResult] = await Promise.all([
      env.DB.prepare(
        `SELECT bp.id, bp.name, v.name AS venue_name, p.performance_date, p.start_time, p.end_time
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         LEFT JOIN venues v ON p.venue_id = v.id
         WHERE p.event_id = ?
           AND (? = 0 OR p.is_announced = 1)
         ORDER BY bp.name`,
      )
        .bind(event.id, event.reveal_mode ?? 0)
        .all(),
      env.DB.prepare(
        `SELECT DISTINCT v.id, v.name, v.address_line1, v.address, v.city, v.region, v.postal_code
         FROM performances p
         JOIN venues v ON p.venue_id = v.id
         WHERE p.event_id = ?
           AND (? = 0 OR p.is_announced = 1)
         ORDER BY v.name`,
      )
        .bind(event.id, event.reveal_mode ?? 0)
        .all(),
    ]);
    performanceRows = performancesResult.results ?? [];
    venues = venuesResult.results ?? [];
  } catch (err) {
    // Non-fatal: fall through with empty arrays; MusicEvent still renders.
    console.error("SSR event bands/venues lookup failed:", slug, err);
  }

  // Flat performer list: one entry per band, first-seen from the
  // (already reveal-mode-gated) performance rows above — a band playing two
  // sets must not appear twice.
  const bandById = new Map();
  for (const row of performanceRows) {
    if (!bandById.has(row.id)) bandById.set(row.id, { id: row.id, name: row.name });
  }
  const bands = [...bandById.values()];

  // SQLite ORDER BY can't strip a leading article inline (#587); the query
  // above is a coarse pre-sort and the JSON-LD performer list is re-sorted
  // here by the article-stripped key so "The Anti-Queens" lists under A.
  bands.sort((a, b) => sortableName(a.name).localeCompare(sortableName(b.name)));

  // Build MusicEvent location: use per-venue MusicVenue entries when available,
  // otherwise fall back to a generic Place for the Waterloo Region. Computed
  // here (before subEvent) because each subEvent carries the same location —
  // `location` is a Google-required Event property, and the Rich Results Test
  // validates each nested subEvent node too, so omitting it there is a
  // "Missing field 'location'" failure (Vera, #542 PR-4).
  const location =
    venues.length > 0
      ? venues.map((v) => ({
          "@type": "MusicVenue",
          name: v.name,
          address: {
            "@type": "PostalAddress",
            ...(v.address_line1 || v.address ? { streetAddress: v.address_line1 || v.address } : {}),
            ...(v.city ? { addressLocality: v.city } : {}),
            addressRegion: v.region || "ON",
            ...(v.postal_code ? { postalCode: v.postal_code } : {}),
            addressCountry: "CA",
          },
        }))
      : {
          "@type": "Place",
          name: event.city || "Waterloo Region, ON",
          address: {
            "@type": "PostalAddress",
            ...(event.city ? { addressLocality: event.city } : {}),
            addressRegion: "ON",
            addressCountry: "CA",
          },
        };

  // Read-path sanitize (#504 convention, #616): a pre-validation legacy
  // poster_url must never be reflected into og:image/twitter:image or the
  // MusicEvent JSON-LD image — normalizeHttpUrl returns null for anything
  // that isn't a real http(s) URL, which drops the JSON-LD image and falls
  // the og:image/twitter:image back to the branded default below (#644).
  // Computed here, above subEvent, because every festival-day node reuses it.
  const safePosterUrl = normalizeHttpUrl(event.poster_url);

  // Per-day subEvent (#542 PR-4): MULTI-DAY events only (end_date > date).
  // One MusicEvent per festival day in the event's own span, each carrying
  // that day's performers (bucketed via festivalDayForPerformance, which
  // applies the after-midnight convention). Single-day events never build
  // this — `subEvent` stays an empty array and the conditional spread below
  // omits the key entirely, keeping their JSON-LD byte-identical to before.
  const isMultiDay = Boolean(event.end_date && event.end_date > event.date);
  // The organizer / offers / image values are built once and shared by the
  // top-level MusicEvent and every subEvent (#1196), so a festival-day node
  // can never disagree with its parent about who runs it or what it costs.
  //
  // Read-path sanitize (#504): a pre-validation legacy ticket_url (e.g. a
  // javascript: scheme) must never be reflected into the Offer.url —
  // normalizeHttpUrl returns null for anything that isn't a real http(s)
  // URL, which drops the offers block entirely. presented_by_url gets the
  // same treatment and, when it fails, the organizer simply has no url.
  const safeTicketUrl = normalizeHttpUrl(event.ticket_url);
  const safePresentedByUrl = normalizeHttpUrl(event.presented_by_url);
  const isSetTimesOrganizer =
    typeof event.presented_by === "string" && /^(?:settimes|settimes\.ca)$/i.test(event.presented_by.trim());
  // When a presenter is set, the presenting org takes the organizer slot;
  // otherwise it defaults to SetTimes. presented_by_url is ignored without a
  // presenter — it describes the presenter, not SetTimes.
  const organizer = event.presented_by
    ? {
        "@type": "Organization",
        name: event.presented_by,
        ...(safePresentedByUrl || isSetTimesOrganizer ? { url: safePresentedByUrl || CANONICAL_HOST } : {}),
      }
    : {
        "@type": "Organization",
        name: "SetTimes",
        url: CANONICAL_HOST,
        sameAs: ["https://www.instagram.com/settimes.ca"],
      };
  // created_at is stored as SQLite `YYYY-MM-DD HH:MM:SS` (see CLAUDE.md); take
  // just the date part for the Offer.validFrom date literal. Guard against a
  // null/malformed value so the field is omitted rather than emitting garbage.
  // Kept deliberately: #617 added it to clear a GSC "missing validFrom" warning.
  const validFromDate =
    typeof event.created_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(event.created_at)
      ? event.created_at.slice(0, 10)
      : null;
  const isConcluded = event.is_concluded === 1;
  // An Offer exists when there is a ticket link OR a stored price (#1197
  // review): a price entered without a link -- a free show, pay at the door
  // -- is still a true, useful fact, and gating it on the link dropped it
  // silently. Google then warns "missing offers.url" instead of "missing
  // offers": no worse, and the price reaches search.
  const hasTicketPrice = Number.isFinite(event.ticket_price);
  const offers =
    safeTicketUrl || hasTicketPrice
      ? {
          "@type": "Offer",
          ...(safeTicketUrl ? { url: safeTicketUrl } : {}),
          priceCurrency: "CAD",
          // EventScheduled means the event will take place or has taken place;
          // concluded events must not claim that tickets are still in stock.
          ...(isConcluded ? {} : { availability: "https://schema.org/InStock" }),
          ...(validFromDate ? { validFrom: validFromDate } : {}),
          // Only a price an admin actually entered (#1196) — never a fallback.
          // Number.isFinite, not truthiness: 0 is a real price (a free show),
          // and dropping it would erase a true fact rather than omit an unknown.
          ...(hasTicketPrice ? { price: event.ticket_price } : {}),
        }
      : undefined;
  const image = [safePosterUrl || DEFAULT_OG_IMAGE];
  const doors = parseDoors(event.doors_json);
  // Compared directly: festivalDayForPerformance's clamp would admit later nights.
  const firstDayRows = performanceRows.filter((row) => (row.performance_date || event.date) === event.date);
  const startTime = earliestTime([
    normalizeTime(doors[event.date]),
    ...firstDayRows
      .filter((row) => (startHour(row.start_time) ?? AFTER_MIDNIGHT_THRESHOLD_HOUR) >= AFTER_MIDNIGHT_THRESHOLD_HOUR)
      .map((row) => normalizeTime(row.start_time)),
  ]);
  const latestEnd = closingBoundary(performanceRows, event.date);
  const startDateValue = dateTime(event.date, startTime);
  const endDateValue = latestEnd
    ? endDateFor(latestEnd, startTime)
    : startTime
      ? undefined
      : event.end_date || event.date;
  let subEvent = [];
  if (isMultiDay) {
    const festivalDays = eachCalendarDay(event.date, event.end_date);
    const performersByDay = new Map(festivalDays.map((d) => [d, new Map()]));

    for (const row of performanceRows) {
      const day = festivalDayForPerformance(row, event, festivalDays);
      const bucket = performersByDay.get(day);
      if (!bucket.has(row.id)) bucket.set(row.id, { id: row.id, name: row.name });
    }

    subEvent = festivalDays.map((day) => {
      const performers = [...performersByDay.get(day).values()].sort((a, b) =>
        sortableName(a.name).localeCompare(sortableName(b.name)),
      );
      const dayRows = performanceRows.filter((row) => festivalDayForPerformance(row, event, festivalDays) === day);
      const dayStartTime = earliestTime([
        normalizeTime(doors[day]),
        ...dayRows
          .filter(
            (row) => (startHour(row.start_time) ?? AFTER_MIDNIGHT_THRESHOLD_HOUR) >= AFTER_MIDNIGHT_THRESHOLD_HOUR,
          )
          .map((row) => normalizeTime(row.start_time)),
      ]);
      const dayEnd = closingBoundary(dayRows, day);
      const venueNames = [...new Set(dayRows.map((row) => row.venue_name).filter(Boolean))];
      const description =
        performers.length > 0 && venueNames.length > 0
          ? `${performers.map((performer) => performer.name).join(", ")} at ${venueNames.join(", ")}, ${event.name}`
          : undefined;
      return {
        "@type": "MusicEvent",
        name: `${event.name} — ${festivalDayLabel(day)}`,
        ...(dayStartTime ? { startDate: dateTime(day, dayStartTime) } : { startDate: day }),
        ...(dayEnd ? { endDate: endDateFor(dayEnd, dayStartTime) } : dayStartTime ? {} : { endDate: day }),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        // Google requires `location` on every Event node, subEvents included;
        // organizer / offers / image are recommended, and without them each
        // festival day draws its own "missing field" warnings (#1196).
        location,
        organizer,
        ...(offers ? { offers } : {}),
        image,
        ...(description ? { description } : {}),
        ...(performers.length > 0
          ? {
              performer: performers.map((b) => ({
                "@type": "MusicGroup",
                name: b.name,
                url: `${CANONICAL_HOST}/band/${b.id}`,
              })),
            }
          : {}),
      };
    });
  }

  // Pin to the production host — preview deploys must not self-canonicalise.
  const url = `${CANONICAL_HOST}/event/${event.slug}`;
  const where = event.city || "Waterloo Region";
  const plainDesc = toPlainText(event.description, 200);
  const dateLabel = eventDateRangeLabel(event.date, event.end_date);
  const description =
    plainDesc || `${event.name} — live music in ${where} on SetTimes.${dateLabel ? ` ${dateLabel}.` : ""}`;

  const metaTags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:title" content="${escapeAttr(event.name)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    // App.jsx's old client Helmet declared og:site_name (and og:type="event",
    // which Facebook's OG spec requires event:start_time/end_time properties
    // for that this route never emitted — "website" below is the spec-valid
    // value every other route already uses). Carried forward here so the
    // ownership sweep (#784 CodeRabbit) doesn't silently drop it.
    `<meta property="og:site_name" content="SetTimes" />`,
    `<meta name="twitter:title" content="${escapeAttr(event.name)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  ];
  const ogImageUrl = safePosterUrl || DEFAULT_OG_IMAGE;
  metaTags.push(`<meta property="og:image" content="${escapeAttr(ogImageUrl)}" />`);
  metaTags.push(`<meta name="twitter:image" content="${escapeAttr(ogImageUrl)}" />`);
  metaTags.push(`<meta name="twitter:card" content="summary_large_image" />`);

  const musicEvent = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.name,
    url,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    // Use only stored doors/set times. When no time is known, a date-only value
    // is honest; when a start time is known but no end time is stored, omit the
    // end rather than inventing a closing time. torontoUtcOffset is DST-aware.
    ...(event.date ? { startDate: startDateValue } : {}),
    ...(endDateValue ? { endDate: endDateValue } : {}),
    location,
    ...(plainDesc ? { description: plainDesc } : {}),
    image,
    organizer,
    // `audience.requiredMinAge`, NOT `typicalAgeRange`. schema.org defines
    // typicalAgeRange as "the typical expected age range, e.g. '7-9', '11-'"
    // -- a statement about who a thing is FOR, the sort of value that belongs
    // on children's programming. A 19+ door is not that: it is a legal entry
    // restriction following from the venue holding a primary liquor licence
    // (Ontario's drinking age is 19), so the venue checks photo ID and refuses
    // entry outright. PeopleAudience.requiredMinAge is the property for
    // "audiences defined by a person's minimum age".
    //
    // An all-ages event emits NOTHING here. "No minimum" and "a minimum of
    // zero" are different claims, and the second is noise in a search index.
    ...(minimumEntryAge(event.age_restriction) !== null
      ? {
          audience: {
            "@type": "PeopleAudience",
            requiredMinAge: minimumEntryAge(event.age_restriction),
          },
        }
      : {}),
    ...(offers ? { offers } : {}),
    ...(bands.length > 0
      ? {
          performer: bands.map((b) => ({
            "@type": "MusicGroup",
            name: b.name,
            url: `${CANONICAL_HOST}/band/${b.id}`,
          })),
        }
      : {}),
    ...(isMultiDay ? { subEvent } : {}),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Events",
        item: `${CANONICAL_HOST}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: event.name,
        item: url,
      },
    ],
  };

  const title = `${event.name} — Set Times & Lineup${event.city ? ` in ${event.city}` : ""} | SetTimes`;

  return serveWithInjectedMeta(context, { title, metaTags, jsonLd: [musicEvent, breadcrumb] });
}
