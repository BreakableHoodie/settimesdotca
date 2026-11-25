import {
  checkBandIcal,
  checkIcal,
  checkInvalidBandRefused,
  checkRetired,
  checkSitemap,
  checkSsrIdentity,
  RETIRED_PATHS,
  retryFetch,
  runProbes,
} from "../smoke-probes.mjs";

const homepageTitle = "SetTimes – Live Music Events & Show Schedules";
const validIcal = [
  "BEGIN:VCALENDAR",
  "BEGIN:VTIMEZONE",
  "TZID:America/Toronto",
  "END:VTIMEZONE",
  "END:VCALENDAR",
  "",
].join("\r\n");
const validSitemap = `<urlset>${Array.from({ length: 20 }, (_, index) => `<url><loc>https://settimes.ca/band/${index + 1}</loc></url>`).join("")}</urlset>`;
const validSsr =
  '<html><head><title>Some Event | SetTimes</title><link rel="canonical" href="https://settimes.ca/event/some-event"><meta property="og:title" content="Some Event"></head></html>';

describe("smoke probe checkers", () => {
  it("accepts an empty, Toronto-bound iCal calendar", () => {
    expect(checkIcal(validIcal)).toEqual({ ok: true });
  });

  it("rejects iCal without a VTIMEZONE", () => {
    expect(checkIcal("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n").ok).toBe(false);
  });

  // Both cases build a well-formed calendar, so the TZID rule is the only
  // thing that can reject them. An earlier version appended the DTSTART after
  // END:VCALENDAR and was rejected for that instead, passing with the TZID rule
  // deleted.
  const calendarWith = (...lines) =>
    [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "TZID:America/Toronto",
      "BEGIN:STANDARD",
      "DTSTART:19701101T020000",
      "END:STANDARD",
      "END:VTIMEZONE",
      ...lines,
      "END:VCALENDAR",
      "",
    ].join("\r\n");

  it("accepts a Toronto-bound event, and TZID-less DTSTARTs inside VTIMEZONE (as production serves)", () => {
    expect(
      checkIcal(calendarWith("BEGIN:VEVENT", "DTSTART;TZID=America/Toronto:20261011T200000", "END:VEVENT")),
    ).toEqual({
      ok: true,
    });
  });

  it("rejects a floating DTSTART on an event", () => {
    expect(checkIcal(calendarWith("BEGIN:VEVENT", "DTSTART:20261011T200000", "END:VEVENT"))).toEqual({
      ok: false,
      reason: "DTSTART is not bound to America/Toronto",
    });
  });

  it("rejects unbalanced iCal blocks", () => {
    expect(checkIcal(validIcal.replace("END:VTIMEZONE", "END:VEVENT")).ok).toBe(false);
  });

  it("accepts a sitemap with enough canonical absolute URLs", () => {
    expect(checkSitemap(validSitemap)).toEqual({ ok: true });
  });

  it.each([
    ["a relative URL", validSitemap.replace("https://settimes.ca/band/1", "/band/1")],
    ["a non-SetTimes URL", validSitemap.replace("https://settimes.ca/band/1", "https://example.com/band/1")],
    ["too few entries", "<urlset><url><loc>https://settimes.ca/band/1</loc></url></urlset>"],
  ])("rejects sitemap with %s", (_, body) => {
    expect(checkSitemap(body).ok).toBe(false);
  });

  it("accepts SSR identity meta", () => {
    expect(checkSsrIdentity(validSsr, homepageTitle)).toEqual({ ok: true });
  });

  it("rejects SSR pages with two canonicals", () => {
    const twoCanonicals = validSsr.replace(
      "</head>",
      '<link rel="canonical" href="https://settimes.ca/event/other"></head>',
    );
    expect(checkSsrIdentity(twoCanonicals, homepageTitle).ok).toBe(false);
  });

  // A title whose text is literally "&lt;x&gt;" (served as &amp;lt;x&amp;gt;)
  // is not the title "<x>". Decoding &amp; first would make them equal.
  it("does not double-unescape titles when comparing with the homepage title", () => {
    const page = validSsr.replace("Some Event | SetTimes", "&amp;lt;x&amp;gt;");
    expect(checkSsrIdentity(page, "<x>")).toEqual({ ok: true });
  });

  it("rejects SSR pages using the homepage title", () => {
    expect(checkSsrIdentity(validSsr.replace("Some Event | SetTimes", homepageTitle), homepageTitle).ok).toBe(false);
  });

  it("retries transient responses and succeeds", async () => {
    const responses = [new Response("blocked", { status: 403 }), new Response("ok", { status: 200 })];
    let calls = 0;
    const result = await retryFetch("https://settimes.ca", {
      fetchImpl: async () => responses[calls++],
      sleep: async () => {},
    });
    expect(result.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("fails after five transient responses", async () => {
    let calls = 0;
    const result = await retryFetch("https://settimes.ca", {
      fetchImpl: async () => {
        calls += 1;
        return new Response("blocked", { status: 403 });
      },
      sleep: async () => {},
    });
    expect(checkIcal(await result.text(), result.status).ok).toBe(false);
    expect(calls).toBe(5);
  });
});

describe("per-artist iCal and retired-URL probes", () => {
  it("accepts a text/calendar band feed and rejects another content type", () => {
    expect(checkBandIcal(validIcal, 200, "text/calendar; charset=utf-8")).toEqual({ ok: true });
    expect(checkBandIcal(validIcal, 200, "text/html").ok).toBe(false);
    expect(checkBandIcal(validIcal, 404, "text/calendar").ok).toBe(false);
  });

  it("requires exactly 400 for an invalid band id and exactly 410 for retired URLs", () => {
    expect(checkInvalidBandRefused("", 400)).toEqual({ ok: true });
    expect(checkInvalidBandRefused("", 200).ok).toBe(false);
    expect(checkRetired("", 410)).toEqual({ ok: true });
    expect(checkRetired("", 200).ok).toBe(false);
    expect(checkRetired("", 404).ok).toBe(false);
  });

  it("lists the six retired URLs", () => {
    expect(RETIRED_PATHS).toHaveLength(6);
  });

  function fakeFetch({ retiredStatus = 410, bandIcalType = "text/calendar; charset=utf-8", sitemapBand = true } = {}) {
    const calls = [];
    const sitemap = `<urlset>${Array.from(
      { length: 20 },
      (_, i) => `<url><loc>https://settimes.ca/${i === 0 && sitemapBand ? "band/77" : `event/e${i}`}</loc></url>`,
    ).join("")}</urlset>`;
    const impl = async (url) => {
      const u = new URL(url);
      calls.push(u.pathname + u.search);
      if (u.pathname === "/sitemap.xml") return new Response(sitemap, { status: 200 });
      if (u.pathname === "/api/feeds/ical" && u.searchParams.get("band") === "abc") {
        return new Response("Invalid band id", { status: 400 });
      }
      if (u.pathname === "/api/feeds/ical") {
        const type = u.searchParams.has("band") ? bandIcalType : "text/calendar";
        return new Response(validIcal, { status: 200, headers: { "Content-Type": type } });
      }
      if (RETIRED_PATHS.includes(u.pathname)) return new Response("gone", { status: retiredStatus });
      return new Response(validSsr, { status: 200 });
    };
    return { impl, calls };
  }
  const named = (results, prefix) => results.filter(([name]) => name.startsWith(prefix));

  it("derives the band id from the sitemap and probes every retired URL", async () => {
    const { impl, calls } = fakeFetch();
    const results = await runProbes("https://settimes.ca", { fetchImpl: impl, sleep: async () => {} });
    expect(calls).toContain("/api/feeds/ical?band=77");
    expect(calls).toContain("/api/feeds/ical?band=abc");
    for (const path of RETIRED_PATHS) expect(calls).toContain(path);
    expect(named(results, "per-artist iCal").every(([, r]) => r.ok)).toBe(true);
    expect(named(results, "retired").filter(([, r]) => r.ok)).toHaveLength(6);
  });

  it("fails a retired URL that stopped answering 410", async () => {
    const { impl } = fakeFetch({ retiredStatus: 200 });
    const results = await runProbes("https://settimes.ca", { fetchImpl: impl, sleep: async () => {} });
    expect(named(results, "retired").every(([, r]) => !r.ok)).toBe(true);
  });

  it("fails the per-artist feed on a wrong content type or a sitemap with no band", async () => {
    let results = await runProbes("https://settimes.ca", {
      fetchImpl: fakeFetch({ bandIcalType: "text/plain" }).impl,
      sleep: async () => {},
    });
    expect(results.find(([n]) => n === "per-artist iCal")[1].ok).toBe(false);
    results = await runProbes("https://settimes.ca", {
      fetchImpl: fakeFetch({ sitemapBand: false }).impl,
      sleep: async () => {},
    });
    expect(results.find(([n]) => n === "per-artist iCal")[1].ok).toBe(false);
  });
});
