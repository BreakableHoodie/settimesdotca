// CF Pages Function: serve /band/[id] with server-rendered meta + MusicGroup JSON-LD
// for crawlers. See functions/utils/ssrMeta.js for the rationale + fallback contract.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import { escapeAttr, toPlainText, serveWithInjectedMeta, CANONICAL_HOST } from "../utils/ssrMeta.js";

export async function onRequest(context) {
  const { params, env, request } = context;
  const id = params.id;

  // Only numeric band ids are server-rendered; non-numeric or gated data → plain SPA.
  if (!/^\d+$/.test(id || "") || !isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }

  let band = null;
  try {
    band = await env.DB.prepare(
      `SELECT name, genre, origin, origin_city, origin_region, description, photo_url, social_links
       FROM band_profiles WHERE id = ?`,
    )
      .bind(Number(id))
      .first();
  } catch (err) {
    console.error("SSR band lookup failed:", id, err);
    return env.ASSETS.fetch(request);
  }
  if (!band) return env.ASSETS.fetch(request);

  // Pin to the production host — preview deploys must not self-canonicalise.
  const url = `${CANONICAL_HOST}/band/${id}`;
  const plainDesc = toPlainText(band.description, 200);
  const tagline = [band.genre, band.origin].filter(Boolean).join(" · ");
  const description =
    plainDesc ||
    `${band.name}${tagline ? ` — ${tagline}` : ""} on SetTimes, Waterloo Region's live music platform.`;

  const metaTags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:title" content="${escapeAttr(band.name)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta name="twitter:title" content="${escapeAttr(band.name)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  ];
  if (band.photo_url) {
    metaTags.push(`<meta property="og:image" content="${escapeAttr(band.photo_url)}" />`);
    metaTags.push(`<meta name="twitter:image" content="${escapeAttr(band.photo_url)}" />`);
    metaTags.push(`<meta name="twitter:card" content="summary_large_image" />`);
  } else {
    metaTags.push(`<meta name="twitter:card" content="summary" />`);
  }

  // Extract full URLs from social_links JSON for sameAs (handles like "@band" are excluded).
  let sameAs = [];
  if (band.social_links) {
    try {
      const links = JSON.parse(band.social_links);
      sameAs = Object.values(links).filter(
        (v) => typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://")),
      );
    } catch (err) {
      // Malformed JSON — skip sameAs rather than surface an error to the user,
      // but log it so the bad row is observable (no silent failures).
      console.error("band SSR: malformed social_links JSON for band", id, err);
    }
  }

  // Prefer the structured origin_city/origin_region columns; fall back to the
  // legacy free-text origin string (used as-is in foundingLocation.name).
  const foundingLocation =
    band.origin_city
      ? {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: band.origin_city,
            ...(band.origin_region ? { addressRegion: band.origin_region } : {}),
            addressCountry: "CA",
          },
        }
      : band.origin
        ? { "@type": "Place", name: band.origin }
        : null;

  const musicGroup = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: band.name,
    url,
    ...(band.genre ? { genre: band.genre } : {}),
    ...(foundingLocation ? { foundingLocation } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(plainDesc ? { description: plainDesc } : {}),
    ...(band.photo_url ? { image: band.photo_url } : {}),
  };

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Artists",
        item: `${CANONICAL_HOST}/artists`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: band.name,
        item: url,
      },
    ],
  };

  // Geo title: include genre for local-query capture; omit cleanly when absent.
  const titleGenre = band.genre ? ` — ${band.genre}` : "";
  const title = `${band.name}${titleGenre} in Waterloo Region | SetTimes`;

  return serveWithInjectedMeta(context, { title, metaTags, jsonLd: [musicGroup, breadcrumb] });
}
