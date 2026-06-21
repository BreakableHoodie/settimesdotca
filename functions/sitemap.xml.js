/**
 * Dynamic XML sitemap generated from the database.
 * Includes all published events and band profiles with at least one published performance.
 */
import { getPublicDataGateResponse } from "./utils/publicGate.js";

export async function onRequestGet(context) {
  const { env } = context;

  const gate = getPublicDataGateResponse(env);
  if (gate) {
    return new Response("", { status: 503 });
  }

  try {
    const [{ results: events }, { results: bands }] = await Promise.all([
      env.DB.prepare(
        `SELECT slug, date FROM events WHERE is_published = 1 ORDER BY date DESC`,
      ).all(),
      env.DB.prepare(
        `SELECT DISTINCT bp.id
         FROM band_profiles bp
         INNER JOIN performances p ON p.band_profile_id = bp.id
         INNER JOIN events e ON e.id = p.event_id
         WHERE e.is_published = 1`,
      ).all(),
    ]);

    const rows = [
      `  <url>
    <loc>https://settimes.ca/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`,
      `  <url>
    <loc>https://settimes.ca/artists</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`,
    ];

    for (const event of events) {
      rows.push(`  <url>
    <loc>https://settimes.ca/event/${event.slug}</loc>
    <lastmod>${event.date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
    }

    for (const band of bands) {
      rows.push(`  <url>
    <loc>https://settimes.ca/band/${band.id}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=UTF-8",
        "Cache-Control": "public, max-age=3600",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://settimes.ca/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`,
      {
        status: 500,
        headers: {
          "Content-Type": "application/xml; charset=UTF-8",
          "Cache-Control": "no-store",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      },
    );
  }
}
