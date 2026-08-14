// CF Pages Function: serve /venue/[id] with server-rendered meta + MusicVenue
// JSON-LD for crawlers. See functions/utils/ssrMeta.js for rationale + fallback.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import { escapeAttr, serveWithInjectedMeta, CANONICAL_HOST, DEFAULT_OG_IMAGE } from "../utils/ssrMeta.js";

export async function onRequest(context) {
  const { params, env, request } = context;
  const id = params.id;

  if (!/^\d+$/.test(id || "") || !isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }

  let venue;
  try {
    venue = await env.DB.prepare(
      `SELECT name, address, address_line1, city, region, postal_code, latitude, longitude,
              website, phone, instagram, facebook
       FROM venues WHERE id = ?`,
    )
      .bind(Number(id))
      .first();
  } catch (err) {
    console.error("SSR venue lookup failed:", id, err);
    return env.ASSETS.fetch(request);
  }
  if (!venue) return env.ASSETS.fetch(request);

  // Pin to the production host — preview deploys must not self-canonicalise.
  const url = `${CANONICAL_HOST}/venue/${id}`;
  const locality = venue.city;
  const description =
    [venue.name, venue.address].filter(Boolean).join(" — ") ||
    `${venue.name} — a live music venue${locality ? ` in ${locality}, ON` : ""} on SetTimes.`;

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

  return serveWithInjectedMeta(context, { title, metaTags, jsonLd: [musicVenue, breadcrumb] });
}
