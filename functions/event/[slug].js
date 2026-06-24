// CF Pages Function: serve /event/[slug] with server-rendered meta + MusicEvent
// JSON-LD for crawlers. See functions/utils/ssrMeta.js for rationale + fallback.

import { isPublicDataEnabled } from "../utils/publicGate.js";
import { escapeAttr, toPlainText, serveWithInjectedMeta, WATERLOO_ADDRESS } from "../utils/ssrMeta.js";

export async function onRequest(context) {
  const { params, env, request } = context;
  const slug = params.slug;

  if (!/^[a-z0-9-]{1,64}$/i.test(slug || "") || !isPublicDataEnabled(env)) {
    return env.ASSETS.fetch(request);
  }

  let event = null;
  try {
    event = await env.DB.prepare(
      `SELECT name, date, slug, description, city FROM events
       WHERE slug = ? AND (is_published = 1 OR status = 'archived')`,
    )
      .bind(slug)
      .first();
  } catch (err) {
    console.error("SSR event lookup failed:", slug, err);
    return env.ASSETS.fetch(request);
  }
  if (!event) return env.ASSETS.fetch(request);

  const origin = new URL(request.url).origin;
  const url = `${origin}/event/${event.slug}`;
  const where = event.city || "Waterloo Region";
  const plainDesc = toPlainText(event.description, 200);
  const description = plainDesc || `${event.name} — live music in ${where} on SetTimes.${event.date ? ` ${event.date}.` : ""}`;

  const metaTags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:title" content="${escapeAttr(event.name)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeAttr(event.name)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.name,
    url,
    ...(event.date && { startDate: event.date }),
    location: {
      "@type": "Place",
      name: event.city || "Waterloo Region, ON",
      address: WATERLOO_ADDRESS,
    },
    ...(plainDesc && { description: plainDesc }),
  };

  return serveWithInjectedMeta(context, { title: `${event.name} | SetTimes`, metaTags, jsonLd });
}
