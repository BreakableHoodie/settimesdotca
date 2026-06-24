// Shared helper for server-rendering OG/Twitter meta + JSON-LD into the SPA shell
// for crawlers. Public pages are otherwise client-rendered, and React Helmet only
// runs in-browser — social crawlers (iMessage, WhatsApp, Facebook, Twitter) and the
// initial crawl pass don't execute JS, so they'd only ever see the homepage card.
//
// Each route function queries D1, builds its meta + JSON-LD, and calls
// serveWithInjectedMeta(). On ANY problem (gate closed, not found, DB error, asset
// fetch fail) the caller falls back to env.ASSETS.fetch(request) — the SPA still
// renders client-side, just without the rich tags.

export function escapeAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Strip HTML tags + collapse whitespace for a meta description, truncating to a
// crawler-friendly length. Band/event descriptions may contain sanitized HTML.
export function toPlainText(html, maxLength = 200) {
  const text = String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

// Default homepage meta tags baked into index.html — stripped so the page-specific
// ones replace (not duplicate) them. Facebook often honours the FIRST og:title, so
// appending isn't enough; the defaults must be removed.
const DEFAULT_META_RE =
  /[ \t]*<meta\s+(?:property="og:(?:title|description|image|type|url)"|name="(?:description|twitter:(?:card|title|description|image))")[^>]*>\r?\n?/gi;

// Fetch the SPA index.html, strip the default homepage meta, swap the <title>, and
// inject the page-specific meta tags + an optional JSON-LD block just before </head>.
// metaTags is an array of HTML strings; jsonLd is a JS object; title sets <title>.
// Returns the rewritten HTML Response, or falls back to the raw asset on failure.
export async function serveWithInjectedMeta(context, { title = null, metaTags = [], jsonLd = null } = {}) {
  const { request, env } = context;
  try {
    const origin = new URL(request.url).origin;
    const indexResponse = await env.ASSETS.fetch(new Request(`${origin}/`));
    if (!indexResponse.ok) {
      return env.ASSETS.fetch(request);
    }
    let html = await indexResponse.text();

    html = html.replace(DEFAULT_META_RE, "");
    if (title) {
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttr(title)}</title>`);
    }

    const headParts = [...metaTags];
    if (jsonLd) {
      // Escape "<" so a "</script>" inside any string value can't break out of the tag.
      const json = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
      headParts.push(`<script type="application/ld+json">${json}</script>`);
    }
    const injected = html.replace("</head>", `    ${headParts.join("\n    ")}\n  </head>`);

    // Preserve the asset's headers (CSP, etc.); override content-type + cache.
    const headers = new Headers(indexResponse.headers);
    headers.set("Content-Type", "text/html;charset=UTF-8");
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(injected, { headers });
  } catch (err) {
    console.error("SSR meta injection failed:", err);
    return env.ASSETS.fetch(request);
  }
}

// Waterloo Region location block reused across event/venue structured data.
export const WATERLOO_ADDRESS = {
  "@type": "PostalAddress",
  addressLocality: "Waterloo",
  addressRegion: "ON",
  addressCountry: "CA",
};
