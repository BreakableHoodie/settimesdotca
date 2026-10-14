import { checkIcal, checkSitemap, checkSsrIdentity, retryFetch } from "../smoke-probes.mjs";

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
