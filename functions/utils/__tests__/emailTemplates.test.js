import { describe, expect, it } from "vitest";

import {
  buildActivationEmail,
  buildInviteEmail,
  buildMfaEnabledEmail,
  buildResetPasswordEmail,
} from "../emailTemplates.js";

// #1276: recipientName reached the HTML part raw (via `intro`), and the CTA URL
// was interpolated raw into href and link text.
const PAYLOAD = "<img src=x onerror=alert(1)>";

describe("emailTemplates escape the recipient name in HTML", () => {
  it.each([
    ["invite", () => buildInviteEmail({ inviteUrl: "https://settimes.ca/i", recipientName: PAYLOAD })],
    ["reset", () => buildResetPasswordEmail({ resetUrl: "https://settimes.ca/r", recipientName: PAYLOAD })],
    ["activation", () => buildActivationEmail({ activationUrl: "https://settimes.ca/a", recipientName: PAYLOAD })],
  ])("%s email", (_label, build) => {
    const { html, text } = build();
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    // The plain-text part is not HTML and must keep the name verbatim.
    expect(text).toContain(PAYLOAD);
  });
});

describe("emailTemplates escape the CTA URL", () => {
  it("cannot break out of the href attribute", () => {
    const { html, text } = buildInviteEmail({ inviteUrl: 'https://settimes.ca/i?a=1&b="><script>x</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("a=1&amp;b=&quot;&gt;&lt;script&gt;");
    expect(text).toContain('b="><script>');
  });
});

// #1318: the notice an attacker's enrolment leaves the owner. It must escape
// everything attacker-influenced (the IP header) and carry nothing actionable.
describe("buildMfaEnabledEmail", () => {
  const enabledAt = new Date("2026-10-17T16:05:00Z");

  it("escapes the recipient name and the IP address in HTML", () => {
    const { html } = buildMfaEnabledEmail({ recipientName: PAYLOAD, enabledAt, ipAddress: PAYLOAD });
    expect(html).not.toContain(PAYLOAD);
  });

  it("states what happened, when, from where, and what to do, with no link", () => {
    const { subject, text, html } = buildMfaEnabledEmail({ recipientName: "Dre", enabledAt, ipAddress: "203.0.113.9" });
    expect(subject).toBe("Two-factor authentication was turned on for your SetTimes account");
    expect(text).toContain("Two-factor authentication was turned on for your SetTimes account");
    expect(text).toContain("Oct 17, 2026");
    expect(text).toContain("203.0.113.9");
    expect(text).toContain("contact an admin immediately");
    expect(text).not.toMatch(/https?:/);
    expect(html).not.toMatch(/<a\s/);
  });

  it("words a re-enrolment as a move to a new app, and omits an unknown IP", () => {
    const { subject, text } = buildMfaEnabledEmail({ enabledAt, isReEnrolment: true });
    expect(subject).toMatch(/new app/);
    expect(text).toContain("moved to a new authenticator app");
    expect(text).not.toContain("From IP address");
  });
});
