// Shared helper for server-rendering OG/Twitter meta + JSON-LD into the SPA shell
// for crawlers. Public pages are otherwise client-rendered, and React Helmet only
// runs in-browser — social crawlers (iMessage, WhatsApp, Facebook, Twitter) and the
// initial crawl pass don't execute JS, so they'd only ever see the homepage card.
//
// Each route function queries D1, builds its meta + JSON-LD, and calls
// serveWithInjectedMeta(). On ANY problem (gate closed, not found, DB error, asset
// fetch fail) the caller falls back to env.ASSETS.fetch(request) — the SPA still
// renders client-side, just without the rich tags.
//
// OWNERSHIP: on every route this injects into, identity meta (canonical, og:*,
// twitter:*, description) is SSR-only — the page's own client <Helmet> must NOT
// also declare them. react-helmet-async marks tags it manages with data-rh; a
// plain <meta>/<link> injected here carries no such marker, so Helmet can't tell
// it owns the slot and APPENDS a second copy on mount instead of replacing the
// first — two canonicals, two og:url, live in the DOM at once. That produced a
// real "Duplicate, Google chose different canonical than user" Search Console
// error (see CLAUDE.md, "SSR owns identity meta"). The fix is ownership, not
// coordination: making SSR-injected tags Helmet-adoptable (a data-rh marker) was
// considered and rejected — it would make correctness depend on Helmet reliably
// adopting and replacing tags it didn't create, the same behavior already
// documented elsewhere in this repo as unreliable for document.title under React
// 19. A route's client Helmet may still set <title> (backed by a direct
// `document.title = ...` assignment, same reasoning) — just never the identity
// tags this file injects.
//
// JSON-LD ownership follows the same rule, scoped to whether THIS file's
// caller passes a jsonLd block for the route it's serving: where it does
// (currently /band/*, /venue/* and /event/*), SSR owns it and the page's
// client Helmet must not also declare it, for the identical append-not-replace
// reason above (#790). Where the route's SSR handler emits no jsonLd (the
// STATIC_PAGES registry entries and the recap page currently pass none, and
// `/` is excluded from this file's ownership entirely), the page's own
// client Helmet remains the only copy and stays responsible for it.

// Canonical host for SSR-injected canonicals and og:url. Preview deploys
// (*.pages.dev) must NOT emit their own host as the canonical — pin to prod.
export const CANONICAL_HOST = "https://settimes.ca";

// Branded 1200x630 fallback for event/band/venue pages that have no photo or
// poster of their own — otherwise those pages emit no og:image at all and
// social shares render with no preview image (#644).
export const DEFAULT_OG_IMAGE = `${CANONICAL_HOST}/og-default.png`;

export function escapeAttr(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Strip markdown syntax and HTML tags + collapse whitespace for a meta
// description, truncating to a crawler-friendly length. Band descriptions may
// contain markdown, sanitized HTML, or plain text — all must produce clean text.
export function toPlainText(rawInput, maxLength = 200) {
  let text = String(rawInput ?? "");

  // --- Strip markdown syntax (order matters) ---

  // Code fences (``` ... ```) — remove the fence markers, keep content
  text = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*\n?/g, "").trim());
  // Inline code: `code` → code
  text = text.replace(/`([^`]+)`/g, "$1");
  // Images: ![alt](url) → alt
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Links: [text](url) → text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Headings: ## text → text
  text = text.replace(/^#{1,6}\s+/gm, "");
  // Bold/italic: **text**, __text__, *text*, _text_ → text
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/([*_])(.*?)\1/g, "$2");
  // Blockquotes: > text → text
  text = text.replace(/^>\s*/gm, "");
  // Horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, "");
  // List markers: - item / * item / 1. item → item
  text = text.replace(/^[\s]*[-*+]\s+/gm, "");
  text = text.replace(/^[\s]*\d+\.\s+/gm, "");

  // --- Strip HTML tags ---
  text = text.replace(/<[^>]*>/g, " ");
  // Decode a small set of HTML entities in a SINGLE pass, so no replacement can
  // re-introduce an entity that a later pass would decode again — the
  // double-unescaping class CodeQL flags (e.g. "&amp;lt;" must become "&lt;",
  // never "<"). Decoding &amp; first-then-cascade is the bug.
  const ENTITY_MAP = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
  };
  text = text.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? m);

  text = text.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

// Default homepage meta tags baked into index.html — stripped so the page-specific
// ones replace (not duplicate) them. Facebook often honours the FIRST og:title, so
// appending isn't enough; the defaults must be removed. Every og:*/twitter:*/
// description property index.html declares must be listed here — #784's
// ownership sweep found og:site_name missing (index.html has always had one;
// nothing SSR-injected emitted its own until this sweep added it), which
// would have produced a fresh, real duplicate the moment it was added instead
// of the silent-drop this file's other og:site_name comments describe.
const DEFAULT_META_RE =
  /[ \t]*<meta\s+(?:property="og:(?:title|description|image|type|url|site_name)"|name="(?:description|twitter:(?:card|title|description|image))")[^>]*>\r?\n?/gi;

// Fetch the SPA index.html, strip the default homepage meta, swap the <title>, and
// inject the page-specific meta tags + an optional JSON-LD block just before </head>.
// metaTags is an array of HTML strings; jsonLd is a JS object OR an array of objects
// (for pages that need multiple schemas, e.g. MusicEvent + BreadcrumbList); title
// sets <title>. Returns the rewritten HTML Response, or falls back to the raw asset
// on failure. Existing single-object callers are unaffected.
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
    // jsonLd may be a single schema object or an array of schema objects.
    // Each is injected as its own <script type="application/ld+json"> block so
    // validators see independent schemas rather than requiring @graph parsing.
    const schemas = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
    for (const schema of schemas) {
      // Escape "<" so a "</script>" inside any string value can't break out of the tag.
      const json = JSON.stringify(schema).replace(/</g, "\\u003c");
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
