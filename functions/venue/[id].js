// CF Pages Function: serve /venue/[id] with server-rendered meta + MusicVenue
// JSON-LD for crawlers. See functions/utils/ssrMeta.js for rationale + fallback.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import { escapeAttr, serveWithInjectedMeta } from "../utils/ssrMeta.js";

export async function onRequest(context) {
  const { params, env, request } = context;
  const id = params.id;

  if (!/^\d+$/.test(id || "") || !isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }

  let venue = null;
  try {
    venue = await env.DB.prepare(
      `SELECT name, address, address_line1, city, region, postal_code, latitude, longitude
       FROM venues WHERE id = ?`,
    )
      .bind(Number(id))
      .first();
  } catch (err) {
    console.error("SSR venue lookup failed:", id, err);
    return env.ASSETS.fetch(request);
  }
  if (!venue) return env.ASSETS.fetch(request);

  const origin = new URL(request.url).origin;
  const url = `${origin}/venue/${id}`;
  const locality = venue.city || "Waterloo";
  const description =
    [venue.name, venue.address].filter(Boolean).join(" — ") ||
    `${venue.name} — a live music venue in ${locality}, ON on SetTimes.`;

  const metaTags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:title" content="${escapeAttr(venue.name)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeAttr(venue.name)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  ];

  const hasGeo = typeof venue.latitude === "number" && typeof venue.longitude === "number";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicVenue",
    name: venue.name,
    url,
    address: {
      "@type": "PostalAddress",
      ...(venue.address_line1 || venue.address ? { streetAddress: venue.address_line1 || venue.address } : {}),
      addressLocality: locality,
      addressRegion: venue.region || "ON",
      ...(venue.postal_code && { postalCode: venue.postal_code }),
      addressCountry: "CA",
    },
    ...(hasGeo && {
      geo: { "@type": "GeoCoordinates", latitude: venue.latitude, longitude: venue.longitude },
    }),
  };

  return serveWithInjectedMeta(context, { title: `${venue.name} | SetTimes`, metaTags, jsonLd });
}
