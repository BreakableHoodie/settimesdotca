// Registry of statically-routed pages that need SSR meta injection.
//
// frontend/index.html hardcodes the HOMEPAGE's identity meta (og:url="/",
// generic og:title/description, etc.). React Helmet only manages tags it
// created itself, so client-side it APPENDS a page-specific copy rather than
// replacing the homepage defaults — a crawler that doesn't execute JS (and
// even Google's og:url canonicalization hint, which prefers the FIRST tag)
// only ever sees the homepage identity, never the page's own. See
// functions/utils/ssrMeta.js for the full rationale and DEFAULT_META_RE,
// which strips those defaults before this file's tags are injected.
//
// Every value below is copied VERBATIM from the corresponding page's own
// <Helmet> block (frontend/src/pages/*.jsx) so the server-rendered meta
// matches what client-side hydration ultimately settles on. Duplication
// across the two render passes is harmless when the values AGREE — it is
// only fatal when they disagree, which is the bug this registry fixes.
//
// Pages whose Helmet has no og:title/og:description (About, Contact,
// Privacy, Terms) derive them from that same page's own title/description —
// never from the homepage strings, and never invented marketing copy.
//
// `/` is deliberately NOT in this registry: index.html's baked-in defaults
// ARE the homepage's correct meta, and EventsPage's own Helmet canonical is
// already CANONICAL_HOST + "/". Adding a handler for `/` would just
// duplicate what's already correct.
import { serveWithInjectedMeta, escapeAttr, CANONICAL_HOST, DEFAULT_OG_IMAGE } from "./ssrMeta.js";

export const STATIC_PAGES = {
  "/artists": {
    title: "Artists – SetTimes",
    description:
      "Browse and search every artist who has played a SetTimes event — explore their profiles, past sets, and upcoming shows.",
    ogTitle: "Artists – SetTimes",
    ogDescription: "Browse and search every artist who has played a SetTimes event.",
  },
  "/venues": {
    title: "Venues – SetTimes",
    description:
      "Browse every venue that has hosted a SetTimes event — explore their lineups, past shows, and upcoming performances.",
    ogTitle: "Venues – SetTimes",
    ogDescription: "Browse every venue that has hosted a SetTimes event.",
  },
  "/about": {
    title: "About | SetTimes",
    description:
      "A free, community-run live-music schedule tool for Waterloo Region, Ontario. Plan your night across venues and discover local artists with SetTimes.",
    ogTitle: "About | SetTimes",
    ogDescription:
      "A free, community-run live-music schedule tool for Waterloo Region, Ontario. Plan your night across venues and discover local artists with SetTimes.",
  },
  "/contact": {
    title: "Contact | SetTimes",
    description:
      "Contact SetTimes — get your band or event listed, request a correction or takedown, or reach out for press and general inquiries.",
    ogTitle: "Contact | SetTimes",
    ogDescription:
      "Contact SetTimes — get your band or event listed, request a correction or takedown, or reach out for press and general inquiries.",
  },
  "/stats": {
    title: "Stats | SetTimes",
    description:
      "SetTimes by the numbers — bands, venues, events, and fan engagement across our free Waterloo Region live-music schedule tool.",
    ogTitle: "Stats | SetTimes",
    ogDescription: "SetTimes by the numbers — bands, venues, events, and fan engagement across Waterloo Region.",
  },
  "/privacy": {
    title: "Privacy Policy | SetTimes",
    description: "Privacy policy for SetTimes — Waterloo region music festival scheduling.",
    ogTitle: "Privacy Policy | SetTimes",
    ogDescription: "Privacy policy for SetTimes — Waterloo region music festival scheduling.",
  },
  "/terms": {
    title: "Terms of Service | SetTimes",
    description: "Terms of Service for SetTimes — Waterloo region live music event scheduling tool.",
    ogTitle: "Terms of Service | SetTimes",
    ogDescription: "Terms of Service for SetTimes — Waterloo region live music event scheduling tool.",
  },
  "/subscribe": {
    title: "Subscribe — Never Miss a Show | SetTimes",
    description:
      "Get notified about new live music events and lineup announcements in Waterloo Region. Subscribe for show alerts from SetTimes.",
    ogTitle: "Subscribe — Never Miss a Show | SetTimes",
    ogDescription:
      "Get notified about new live music events and lineup announcements in Waterloo Region. Subscribe for show alerts from SetTimes.",
  },
};

// Builds the CF Pages Function handler for one registered static page. All
// URLs are built from CANONICAL_HOST + path — never request.url — so preview
// deploys (*.pages.dev) never self-canonicalise (same rule as ssrMeta.js and
// functions/s/[slug].js).
export function staticPageHandler(path) {
  const page = STATIC_PAGES[path];
  if (!page) {
    throw new Error(`staticPageHandler: no STATIC_PAGES entry for "${path}"`);
  }

  return async function onRequestGet(context) {
    const url = `${CANONICAL_HOST}${path}`;
    const { title, description, ogTitle, ogDescription } = page;

    const metaTags = [
      `<link rel="canonical" href="${escapeAttr(url)}" />`,
      `<meta name="description" content="${escapeAttr(description)}" />`,
      `<meta property="og:url" content="${escapeAttr(url)}" />`,
      `<meta property="og:title" content="${escapeAttr(ogTitle)}" />`,
      `<meta property="og:description" content="${escapeAttr(ogDescription)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${escapeAttr(ogTitle)}" />`,
      `<meta name="twitter:description" content="${escapeAttr(ogDescription)}" />`,
      `<meta name="twitter:image" content="${escapeAttr(DEFAULT_OG_IMAGE)}" />`,
    ];

    return serveWithInjectedMeta(context, { title, metaTags });
  };
}
