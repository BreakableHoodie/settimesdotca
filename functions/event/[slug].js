// CF Pages Function: serve /event/[slug] with server-rendered meta + MusicEvent
// JSON-LD for crawlers. See functions/utils/ssrMeta.js for rationale + fallback.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import { escapeAttr, toPlainText, serveWithInjectedMeta, WATERLOO_ADDRESS, CANONICAL_HOST } from "../utils/ssrMeta.js";
import { normalizeHttpUrl } from "../utils/validation.js";
import { sortableName } from "../utils/sortableName.js";

export async function onRequest(context) {
  const { params, env, request } = context;
  const slug = params.slug;

  if (!/^[a-z0-9-]{1,64}$/i.test(slug || "") || !isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }

  let event;
  try {
    event = await env.DB.prepare(
      `SELECT id, name, date, end_date, slug, description, city, ticket_url, poster_url, created_at
       FROM events
       WHERE slug = ? AND (is_published = 1 OR status = 'archived')`,
    )
      .bind(slug)
      .first();
  } catch (err) {
    console.error("SSR event lookup failed:", slug, err);
    return env.ASSETS.fetch(request);
  }
  if (!event) return env.ASSETS.fetch(request);

  // Fetch the event's bands and distinct venues in parallel.
  let bands = [];
  let venues = [];
  try {
    const [bandsResult, venuesResult] = await Promise.all([
      env.DB.prepare(
        `SELECT DISTINCT bp.id, bp.name
         FROM performances p
         JOIN band_profiles bp ON p.band_profile_id = bp.id
         WHERE p.event_id = ?
         ORDER BY bp.name`,
      )
        .bind(event.id)
        .all(),
      env.DB.prepare(
        `SELECT DISTINCT v.id, v.name, v.address_line1, v.address, v.city, v.region, v.postal_code
         FROM performances p
         JOIN venues v ON p.venue_id = v.id
         WHERE p.event_id = ?
         ORDER BY v.name`,
      )
        .bind(event.id)
        .all(),
    ]);
    bands = bandsResult.results ?? [];
    venues = venuesResult.results ?? [];
  } catch (err) {
    // Non-fatal: fall through with empty arrays; MusicEvent still renders.
    console.error("SSR event bands/venues lookup failed:", slug, err);
  }

  // SQLite ORDER BY can't strip a leading article inline (#587); the query
  // above is a coarse pre-sort and the JSON-LD performer list is re-sorted
  // here by the article-stripped key so "The Anti-Queens" lists under A.
  bands.sort((a, b) => sortableName(a.name).localeCompare(sortableName(b.name)));

  // Pin to the production host — preview deploys must not self-canonicalise.
  const url = `${CANONICAL_HOST}/event/${event.slug}`;
  const where = event.city || "Waterloo Region";
  const plainDesc = toPlainText(event.description, 200);
  const description =
    plainDesc || `${event.name} — live music in ${where} on SetTimes.${event.date ? ` ${event.date}.` : ""}`;

  // Read-path sanitize (#504 convention, #616): a pre-validation legacy
  // poster_url must never be reflected into og:image/twitter:image or the
  // MusicEvent JSON-LD image — normalizeHttpUrl returns null for anything
  // that isn't a real http(s) URL, which omits the image entirely below.
  const safePosterUrl = normalizeHttpUrl(event.poster_url);

  const metaTags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:title" content="${escapeAttr(event.name)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta name="twitter:title" content="${escapeAttr(event.name)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  ];
  if (safePosterUrl) {
    metaTags.push(`<meta property="og:image" content="${escapeAttr(safePosterUrl)}" />`);
    metaTags.push(`<meta name="twitter:image" content="${escapeAttr(safePosterUrl)}" />`);
    metaTags.push(`<meta name="twitter:card" content="summary_large_image" />`);
  } else {
    metaTags.push(`<meta name="twitter:card" content="summary" />`);
  }

  // Build MusicEvent location: use per-venue MusicVenue entries when available,
  // otherwise fall back to a generic Place for the Waterloo Region.
  const location =
    venues.length > 0
      ? venues.map((v) => ({
          "@type": "MusicVenue",
          name: v.name,
          address: {
            "@type": "PostalAddress",
            ...(v.address_line1 || v.address ? { streetAddress: v.address_line1 || v.address } : {}),
            addressLocality: v.city || "Waterloo",
            addressRegion: v.region || "ON",
            ...(v.postal_code ? { postalCode: v.postal_code } : {}),
            addressCountry: "CA",
          },
        }))
      : {
          "@type": "Place",
          name: event.city || "Waterloo Region, ON",
          address: WATERLOO_ADDRESS,
        };

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
    // Show doors at 6:30PM; set times start 6:45PM — use the show-start per spec.
    ...(event.date ? { startDate: `${event.date}T18:45:00-04:00` } : {}),
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

  const title = `${event.name} — Set Times & Lineup in Waterloo | SetTimes`;

  return serveWithInjectedMeta(context, { title, metaTags, jsonLd: [musicEvent, breadcrumb] });
}
