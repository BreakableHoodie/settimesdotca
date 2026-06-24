// CF Pages Function: serve /band/[id] with server-rendered meta + MusicGroup JSON-LD
// for crawlers. See functions/utils/ssrMeta.js for the rationale + fallback contract.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import { escapeAttr, toPlainText, serveWithInjectedMeta } from "../utils/ssrMeta.js";

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
      `SELECT name, genre, origin, description, photo_url FROM band_profiles WHERE id = ?`,
    )
      .bind(Number(id))
      .first();
  } catch (err) {
    console.error("SSR band lookup failed:", id, err);
    return env.ASSETS.fetch(request);
  }
  if (!band) return env.ASSETS.fetch(request);

  const origin = new URL(request.url).origin;
  const url = `${origin}/band/${id}`;
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: band.name,
    url,
    ...(band.genre && { genre: band.genre }),
    ...(band.origin && { foundingLocation: band.origin }),
    ...(plainDesc && { description: plainDesc }),
    ...(band.photo_url && { image: band.photo_url }),
  };

  return serveWithInjectedMeta(context, {
    title: `${band.name} — Band Profile | SetTimes`,
    metaTags,
    jsonLd,
  });
}
