// CF Pages Function: serve /venue/[id] with server-rendered meta + MusicVenue
// JSON-LD for crawlers. See functions/utils/ssrMeta.js for rationale + fallback.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import {
  escapeAttr,
  truncatePlainText,
  serveWithInjectedMeta,
  serveNotFound,
  CANONICAL_HOST,
  DEFAULT_OG_IMAGE,
} from "../utils/ssrMeta.js";
import { loadVenuePageContext } from "../utils/crawlableLinks.js";
import { publicRevealedPerformanceExistsSql } from "../utils/eventVisibility.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DESCRIPTION_MAX_LENGTH = 160;

// "<Venue> in <City>: N SetTimes editions, most recently <Event> (Mon YYYY). <address>".
// Only facts from D1; with no editions read (a failed read) it falls back to the
// name + address line. The month comes from the YYYY-MM-DD text, never a Date
// (UTC parsing shifts a first-of-month date back a month in Toronto).
function buildVenueDescription(venue, editions) {
  const [latest] = editions;
  if (!latest) {
    return (
      [venue.name, venue.address].filter(Boolean).join(" — ") ||
      `${venue.name} — a live music venue${venue.city ? ` in ${venue.city}, ON` : ""} on SetTimes.`
    );
  }
  const n = editions.length;
  const [year, month] = String(latest.last_date ?? "").split("-");
  const monthName = MONTHS[Number(month) - 1];
  const when = monthName && year ? ` (${monthName} ${year})` : "";
  const city = venue.city ? ` in ${venue.city}` : "";
  const head = `${venue.name}${city}: ${n} SetTimes ${n === 1 ? "edition" : "editions"}, most recently ${latest.name}${when}.`;
  return truncatePlainText(venue.address ? `${head} ${venue.address}` : head, DESCRIPTION_MAX_LENGTH);
}

export async function onRequest(context) {
  const { params, env, request } = context;
  const id = params.id;

  // Non-numeric ids fall through to the shell, which is safe ONLY because every
  // link to a venue is built from a numeric id (VenuesPage, BandProfilePage's two
  // sites) and the sitemap emits the same. /band/[id].js had this identical guard
  // while its links were slug-built, so Googlebot crawled a URL that answered 200
  // with the homepage title and no canonical, and 14 duplicates entered the index
  // (#983). If a /venue/<slug> link builder is ever added, this branch must resolve
  // and 301 the way redirectSlugToId does there -- do not just add the links.
  // The gate comes first: while public data is off, whether a venue exists must
  // not be observable, so a closed gate serves the plain shell (never a 404).
  if (!isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }
  // No venue has a non-numeric id, so this is a definite miss (#1446).
  if (!/^\d+$/.test(id || "")) {
    return serveNotFound(context);
  }

  let venue;
  try {
    venue = await env.DB.prepare(
      `SELECT name, address, address_line1, city, region, postal_code, latitude, longitude,
              website, phone, instagram, facebook
       FROM venues v
        WHERE v.id = ? AND ${publicRevealedPerformanceExistsSql("v", "id", "venue_id")}`,
    )
      .bind(Number(id))
      .first();
  } catch (err) {
    console.error("SSR venue lookup failed:", id, err);
    return env.ASSETS.fetch(request);
  }
  if (!venue) return serveNotFound(context);

  // Pin to the production host — preview deploys must not self-canonicalise.
  const url = `${CANONICAL_HOST}/venue/${id}`;
  const locality = venue.city;
  // Editions and artists as crawlable links (#1494). A failed read gives no
  // links and the plain name + address description.
  const linkContext = await loadVenuePageContext(env, Number(id));
  const pageLinks = linkContext?.linksHtml ?? "";
  const description = buildVenueDescription(venue, linkContext?.editions ?? []);

  const metaTags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:title" content="${escapeAttr(venue.name)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    // index.html's baked-in og:site_name is stripped by DEFAULT_META_RE
    // (ssrMeta.js) same as every other identity tag -- this route must
    // re-emit it or it silently disappears rather than merely de-duplicating
    // (#784 CodeRabbit follow-up).
    `<meta property="og:site_name" content="SetTimes" />`,
    `<meta property="og:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(venue.name)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  ];

  const hasGeo = typeof venue.latitude === "number" && typeof venue.longitude === "number";

  // Build sameAs from URL-valued social columns; filter out nulls and bare handles.
  const sameAs = [venue.website, venue.instagram, venue.facebook].filter(
    (v) => v && (v.startsWith("http://") || v.startsWith("https://")),
  );

  const musicVenue = {
    "@context": "https://schema.org",
    "@type": "MusicVenue",
    name: venue.name,
    url,
    address: {
      "@type": "PostalAddress",
      ...(venue.address_line1 || venue.address ? { streetAddress: venue.address_line1 || venue.address } : {}),
      ...(locality ? { addressLocality: locality } : {}),
      addressRegion: venue.region || "ON",
      ...(venue.postal_code ? { postalCode: venue.postal_code } : {}),
      addressCountry: "CA",
    },
    ...(hasGeo ? { geo: { "@type": "GeoCoordinates", latitude: venue.latitude, longitude: venue.longitude } } : {}),
    ...(venue.phone ? { telephone: venue.phone } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Venues",
        item: `${CANONICAL_HOST}/venues`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: venue.name,
        item: url,
      },
    ],
  };

  const title = `${venue.name} — Live Music Venue${locality ? ` in ${locality}, ON` : ""} | SetTimes`;

  return serveWithInjectedMeta(context, { title, metaTags, jsonLd: [musicVenue, breadcrumb], pageLinks });
}
