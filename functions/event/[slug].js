// CF Pages Function: serve /event/[slug] with server-rendered meta + MusicEvent
// JSON-LD for crawlers. See functions/utils/ssrMeta.js for rationale + fallback.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import { escapeAttr, toPlainText, serveWithInjectedMeta, CANONICAL_HOST, DEFAULT_OG_IMAGE } from "../utils/ssrMeta.js";
import { normalizeHttpUrl } from "../utils/validation.js";
import { sortableName } from "../utils/sortableName.js";
import {
  torontoUtcOffset,
  AFTER_MIDNIGHT_THRESHOLD_HOUR,
  nextCalendarDay,
  previousCalendarDay,
} from "../utils/eventDay.js";
import { publicEventStatusSql } from "../utils/eventVisibility.js";

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

// Returns null -- never a partial, a wrong date, or "Invalid Date" -- for
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
  if (typeof dateStr !== "string") return null;
  const probe = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  if (probe.toISOString().slice(0, 10) !== dateStr) return null;
  return DATE_LABEL_FORMAT.format(probe);
}

// A multi-day event is its whole run, not its first day. Falls back to the
// start label alone if end_date is absent, equal, or unparseable.
function eventDateRangeLabel(dateStr, endDateStr) {
  const start = eventDateLabel(dateStr);
  if (!start) return null;
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
  let day = row.performance_date || event.date;
  const hour = startHour(row.start_time);
  if (hour !== null && hour < AFTER_MIDNIGHT_THRESHOLD_HOUR) {
    day = previousCalendarDay(day);
  }
  return festivalDays.includes(day) ? day : event.date;
}

export async function onRequest(context) {
  const { params, env, request } = context;
  const slug = params.slug;

  if (!/^[a-z0-9-]{1,64}$/i.test(slug || "") || !isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }

  let event;
  try {
    event = await env.DB.prepare(
      `SELECT id, name, date, end_date, slug, description, city, ticket_url, poster_url, created_at, reveal_mode
       FROM events
       WHERE slug = ? AND ${publicEventStatusSql()}`,
    )
      .bind(slug)
      .first();
  } catch (err) {
    console.error("SSR event lookup failed:", slug, err);
    return env.ASSETS.fetch(request);
  }
  if (!event) return env.ASSETS.fetch(request);

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
        `SELECT bp.id, bp.name, p.performance_date, p.start_time
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
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

  // Per-day subEvent (#542 PR-4): MULTI-DAY events only (end_date > date).
  // One MusicEvent per festival day in the event's own span, each carrying
  // that day's performers (bucketed via festivalDayForPerformance, which
  // applies the after-midnight convention). Single-day events never build
  // this — `subEvent` stays an empty array and the conditional spread below
  // omits the key entirely, keeping their JSON-LD byte-identical to before.
  const isMultiDay = Boolean(event.end_date && event.end_date > event.date);
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
      return {
        "@type": "MusicEvent",
        name: `${event.name} — ${festivalDayLabel(day)}`,
        // Same show-start convention as the top-level MusicEvent below.
        startDate: `${day}T18:45:00${torontoUtcOffset(day)}`,
        endDate: day,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        // Google requires `location` on every Event node, subEvents included.
        location,
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

  // Read-path sanitize (#504 convention, #616): a pre-validation legacy
  // poster_url must never be reflected into og:image/twitter:image or the
  // MusicEvent JSON-LD image — normalizeHttpUrl returns null for anything
  // that isn't a real http(s) URL, which drops the JSON-LD image and falls
  // the og:image/twitter:image back to the branded default below (#644).
  const safePosterUrl = normalizeHttpUrl(event.poster_url);

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

  // Read-path sanitize (#504): a pre-validation legacy ticket_url (e.g. a
  // javascript: scheme) must never be reflected into the Offer.url of the
  // MusicEvent JSON-LD — normalizeHttpUrl returns null for anything that
  // isn't a real http(s) URL, which drops the offers block entirely below.
  const safeTicketUrl = normalizeHttpUrl(event.ticket_url);

  // created_at is stored as SQLite `YYYY-MM-DD HH:MM:SS` (see CLAUDE.md); take
  // just the date part for the Offer.validFrom date literal. Guard against a
  // null/malformed value so the field is omitted rather than emitting garbage.
  const validFromDate =
    typeof event.created_at === "string" && /^\d{4}-\d{2}-\d{2}/.test(event.created_at)
      ? event.created_at.slice(0, 10)
      : null;

  const musicEvent = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.name,
    url,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    // Show doors at 6:30PM; set times start 6:45PM — use the show-start per
    // spec. torontoUtcOffset is DST-aware (#542 PR-4, folded pre-existing
    // bug): a hardcoded -04:00 (EDT) is wrong for a winter event (e.g. a
    // February show is EST, -05:00).
    ...(event.date ? { startDate: `${event.date}T18:45:00${torontoUtcOffset(event.date)}` } : {}),
    ...(event.date ? { endDate: event.end_date || event.date } : {}),
    location,
    ...(plainDesc ? { description: plainDesc } : {}),
    ...(safePosterUrl ? { image: [safePosterUrl] } : {}),
    organizer: {
      "@type": "Organization",
      name: "SetTimes",
      url: CANONICAL_HOST,
      sameAs: ["https://www.instagram.com/settimes.ca"],
    },
    ...(safeTicketUrl
      ? {
          offers: {
            "@type": "Offer",
            url: safeTicketUrl,
            priceCurrency: "CAD",
            availability: "https://schema.org/InStock",
            ...(validFromDate ? { validFrom: validFromDate } : {}),
          },
        }
      : {}),
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
