import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { onRequestGet } from "../index.js";
import { createTestEnv, insertEvent } from "../api/test-utils.js";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = path.join(path.dirname(CURRENT_FILE), "../..");
const SHELL = readFileSync(path.join(REPO_ROOT, "frontend", "index.html"), "utf8");
const SHELL_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "Content-Security-Policy": "default-src 'self'",
  "Content-Type": "text/html;charset=UTF-8",
  "Cross-Origin-Embedder-Policy": "credentialless",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  // Representation headers of the STATIC shell. They must NOT survive onto
  // the rewritten body (headersForRewrittenShell).
  ETag: '"static-shell-etag"',
  "Last-Modified": "Tue, 01 Sep 2026 00:00:00 GMT",
};

function headOf(html) {
  return html.match(/<head>[\s\S]*?<\/head>/)?.[0];
}

function createHomepageEnv({ body = SHELL, headers = SHELL_HEADERS } = {}) {
  const testEnv = createTestEnv();
  const assetFetch = async () => new Response(body, { status: 200, headers });
  return {
    rawDb: testEnv.rawDb,
    context: {
      request: new Request("https://settimes.ca/"),
      env: { ...testEnv.env, ASSETS: { fetch: assetFetch } },
    },
  };
}

describe("GET / — current event links", () => {
  test("links a current published event in the noscript nav and preserves head and headers", async () => {
    const { rawDb, context } = createHomepageEnv();
    insertEvent(rawDb, { name: "Long Weekend Band Crawl", slug: "lwbc18", date: "2099-10-11", status: "published" });

    const asset = await context.env.ASSETS.fetch(context.request);
    const response = await onRequestGet(context);
    const html = await response.text();

    expect(html).toContain('<a href="/event/lwbc18">Long Weekend Band Crawl</a>');
    expect(headOf(html)).toBe(headOf(await asset.text()));
    const REPRESENTATION = new Set(["etag", "last-modified", "content-length", "content-encoding"]);
    for (const [name, value] of asset.headers) {
      if (REPRESENTATION.has(name.toLowerCase())) continue;
      expect(response.headers.get(name), name).toBe(value);
    }
    // The body changed, so the shell's validators must not be reused.
    expect(response.headers.get("ETag")).toBeNull();
    expect(response.headers.get("Last-Modified")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  });

  test("has no event link between seasons", async () => {
    const { context } = createHomepageEnv();
    const response = await onRequestGet(context);
    const html = await response.text();

    expect(html).not.toContain("/event/");
    expect(html).not.toMatch(/<li><a\s+href=""><\/a><\/li>/);
    expect(html).not.toMatch(/<a\s+href=""><\/a>/);
  });

  test("links only published events that have not concluded", async () => {
    const { rawDb, context } = createHomepageEnv();
    insertEvent(rawDb, { name: "Upcoming", slug: "upcoming", date: "2099-01-01", status: "published" });
    insertEvent(rawDb, { name: "Concluded", slug: "concluded", date: "2020-01-01", status: "published" });
    insertEvent(rawDb, { name: "Archived", slug: "archived", date: "2099-02-01", status: "archived" });
    insertEvent(rawDb, { name: "Draft", slug: "draft", date: "2099-03-01", status: "draft" });

    const html = await (await onRequestGet(context)).text();

    expect(html).toContain('href="/event/upcoming"');
    expect(html).not.toContain("/event/concluded");
    expect(html).not.toContain("/event/archived");
    expect(html).not.toContain("/event/draft");
  });

  test("escapes event slugs and names for the injected HTML", async () => {
    const { rawDb, context } = createHomepageEnv();
    insertEvent(rawDb, {
      name: 'A <"special"> & event',
      slug: 'a<"special">&event',
      date: "2099-01-01",
      status: "published",
    });

    const html = await (await onRequestGet(context)).text();

    expect(html).toContain(
      '<a href="/event/a&lt;&quot;special&quot;&gt;&amp;event">A &lt;&quot;special&quot;&gt; &amp; event</a>',
    );
  });

  test("falls back to the untouched asset when D1 throws", async () => {
    const assetHeaders = { ...SHELL_HEADERS, "X-Asset-Only": "preserved" };
    const { context } = createHomepageEnv({ headers: assetHeaders });
    context.env.DB = {
      prepare: () => {
        throw new Error("D1 unavailable");
      },
    };
    const asset = await context.env.ASSETS.fetch(context.request);

    const response = await onRequestGet(context);

    expect(response.status).toBe(asset.status);
    expect(await response.text()).toBe(await asset.text());
  });

  test("falls back to the untouched asset when the marker is absent", async () => {
    const body = SHELL.replace("<!-- current-event-links -->", "");
    const { context } = createHomepageEnv({ body });
    context.env.DB = {
      prepare: () => {
        throw new Error("should not query D1");
      },
    };
    const asset = await context.env.ASSETS.fetch(context.request);

    const response = await onRequestGet(context);

    expect(await response.text()).toBe(await asset.text());
  });
});

describe("GET / — injected event route contract", () => {
  test("the injected event href corresponds to a real React Router route", async () => {
    const main = readFileSync(path.join(REPO_ROOT, "frontend", "src", "main.jsx"), "utf8");
    const routePath = main.match(/<Route\s+path="(\/event\/[^"]+)"/)?.[1];
    expect(routePath).toBeDefined();

    const { rawDb, context } = createHomepageEnv();
    insertEvent(rawDb, { name: "Route Check", slug: "route-check", date: "2099-01-01", status: "published" });
    const html = await (await onRequestGet(context)).text();
    const href = html.match(/href="(\/event\/[^"<]+)"/)?.[1];

    expect(href).toMatch(new RegExp(`^${routePath.replace(":slug", "[^/]+")}$`));
  });
});
