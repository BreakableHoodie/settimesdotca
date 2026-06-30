// CF Pages Function: serve /s/[slug] with OG meta tags injected into index.html.
// Social crawlers (iMessage, WhatsApp, Twitter) hit this URL and need server-rendered
// meta tags — React Helmet only runs client-side and crawlers won't see it.

// Pin og:url to the production host so preview deploys (*.pages.dev) don't
// self-canonicalise — same class of bug as #443.
const CANONICAL_HOST = "https://settimes.ca";

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function onRequest(context) {
  const { params, env, request } = context;
  const { slug } = params;
  const { DB } = env;

  if (!slug || !/^[a-zA-Z0-9]{1,16}$/.test(slug)) {
    return env.ASSETS.fetch(request);
  }

  let row = null;
  try {
    row = await DB.prepare(
      `SELECT sl.slug, sl.band_names, e.name AS event_name
       FROM share_links sl
       JOIN events e ON e.id = sl.event_id
       WHERE sl.slug = ? AND sl.expires_at > datetime('now')`,
    )
      .bind(slug)
      .first();
  } catch (err) {
    // A DB error here is indistinguishable from "link not found" to the visitor
    // (the SPA still renders without rich OG tags), so log it to keep transient
    // failures visible rather than silently degrading.
    console.error("Share-link OG lookup failed:", slug, err);
    return env.ASSETS.fetch(request);
  }

  if (!row) {
    return env.ASSETS.fetch(request);
  }

  let bandNames;
  try {
    bandNames = JSON.parse(row.band_names);
  } catch (_err) {
    console.error("Share link band_names corrupted:", row.slug);
    return env.ASSETS.fetch(request);
  }

  if (!Array.isArray(bandNames) || bandNames.length === 0) {
    return env.ASSETS.fetch(request);
  }

  const count = bandNames.length;
  const ogTitle = `${count}-stop route for ${row.event_name}`;
  const featured = bandNames.slice(0, 3).join(", ");
  const remainder = count > 3 ? ` and ${count - 3} more` : "";
  const ogDescription = `Featuring ${featured}${remainder}`;

  const origin = new URL(request.url).origin;
  const ogUrl = `${CANONICAL_HOST}/s/${slug}`;
  const indexResponse = await env.ASSETS.fetch(new Request(`${origin}/`));
  if (!indexResponse.ok) {
    return env.ASSETS.fetch(request);
  }
  const html = await indexResponse.text();

  const metaTags = [
    `<meta property="og:title" content="${escapeAttr(ogTitle)}" />`,
    `<meta property="og:description" content="${escapeAttr(ogDescription)}" />`,
    `<meta property="og:url" content="${escapeAttr(ogUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeAttr(ogTitle)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(ogDescription)}" />`,
  ].join("\n    ");

  const injected = html.replace("</head>", `    ${metaTags}\n  </head>`);

  // Preserve original headers (CSP, ETag, etc.) and override content-type and cache
  const headers = new Headers(indexResponse.headers);
  headers.set("Content-Type", "text/html;charset=UTF-8");
  headers.set("Cache-Control", "public, max-age=300");

  return new Response(injected, { headers });
}
