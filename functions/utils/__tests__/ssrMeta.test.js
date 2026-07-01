import { describe, expect, it } from "vitest";

import { escapeAttr, toPlainText, serveWithInjectedMeta, CANONICAL_HOST } from "../ssrMeta.js";

const DEFAULT_HTML = `<!doctype html><html><head>
    <meta name="description" content="Homepage description" />
    <meta property="og:title" content="SetTimes – Live Music Events" />
    <meta property="og:description" content="Homepage og description" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="SetTimes" />
    <title>SetTimes – Live Music Events &amp; Show Schedules</title>
  </head><body><div id="root"></div></body></html>`;

function makeContext({ url = "https://settimes.ca/band/49", assetsOk = true } = {}) {
  return {
    request: new Request(url),
    env: {
      ASSETS: {
        fetch: async () =>
          assetsOk
            ? new Response(DEFAULT_HTML, { status: 200, headers: { "content-type": "text/html" } })
            : new Response("nope", { status: 500 }),
      },
    },
  };
}

describe("ssrMeta.escapeAttr", () => {
  it('escapes &, ", <, >', () => {
    expect(escapeAttr('Tom & "Jerry" <b>')).toBe("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
  });
  it("handles null/undefined", () => {
    expect(escapeAttr(null)).toBe("");
    expect(escapeAttr(undefined)).toBe("");
  });
});

describe("ssrMeta.toPlainText", () => {
  it("strips tags, decodes entities, collapses whitespace", () => {
    expect(toPlainText("<p>Heavy   <strong>doom</strong> &amp; sludge.</p>")).toBe("Heavy doom & sludge.");
  });
  it("decodes entities in a single pass (no double-unescaping)", () => {
    // &amp;lt; must decode ONCE to the literal "&lt;", never cascade to "<".
    expect(toPlainText("a &amp;lt; b")).toBe("a &lt; b");
    expect(toPlainText("Rock &amp; Roll")).toBe("Rock & Roll");
    // &amp;amp; decodes once to "&amp;", not "&".
    expect(toPlainText("&amp;amp;")).toBe("&amp;");
  });
  it("truncates with an ellipsis", () => {
    const out = toPlainText("x".repeat(250), 50);
    expect(out.length).toBe(50);
    expect(out.endsWith("…")).toBe(true);
  });
  it("returns empty string for empty input", () => {
    expect(toPlainText(null)).toBe("");
  });
});

describe("ssrMeta.serveWithInjectedMeta", () => {
  it("replaces defaults (not duplicates) and injects page meta + JSON-LD", async () => {
    const res = await serveWithInjectedMeta(makeContext(), {
      title: "Broadcast Zero — Band Profile | SetTimes",
      metaTags: ['<meta property="og:title" content="Broadcast Zero" />'],
      jsonLd: { "@type": "MusicGroup", name: "Broadcast Zero" },
    });
    const html = await res.text();
    const ogTitles = html.match(/property="og:title"/g) || [];

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html;charset=UTF-8");
    expect(ogTitles).toHaveLength(1); // homepage default stripped
    expect(html).toContain('content="Broadcast Zero"');
    expect(html).not.toContain("SetTimes – Live Music Events"); // default og:title gone
    expect(html).toContain("<title>Broadcast Zero — Band Profile | SetTimes</title>");
    expect(html).not.toContain("Homepage description"); // default description stripped
    expect(html).toContain("application/ld+json");
    expect(html).toContain('id="root"'); // SPA shell intact
  });

  it("escapes </script> inside JSON-LD to prevent breakout", async () => {
    const res = await serveWithInjectedMeta(makeContext(), {
      jsonLd: { "@type": "MusicGroup", name: "evil </script><script>alert(1)</script>" },
    });
    const html = await res.text();
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script>");
  });

  it("falls back to the raw asset when the index fetch fails", async () => {
    const res = await serveWithInjectedMeta(makeContext({ assetsOk: false }), {
      metaTags: ['<meta property="og:title" content="X" />'],
    });
    expect(res.status).toBe(500);
  });

  it("injects multiple JSON-LD schemas when given an array (MusicEvent + BreadcrumbList)", async () => {
    const res = await serveWithInjectedMeta(makeContext(), {
      jsonLd: [
        { "@type": "MusicEvent", name: "Long Weekend Band Crawl Vol. 17", url: `${CANONICAL_HOST}/event/lwbc17` },
        { "@type": "BreadcrumbList", itemListElement: [] },
      ],
    });
    const html = await res.text();
    const blocks = html.match(/application\/ld\+json/g) || [];

    expect(blocks).toHaveLength(2); // two independent schema blocks, not one @graph
    expect(html).toContain("MusicEvent");
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain(`${CANONICAL_HOST}/event/lwbc17`); // canonical host pinned
  });
});
