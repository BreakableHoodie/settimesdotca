import { describe, expect, it } from "vitest";

import { buildActivationEmail, buildInviteEmail, buildResetPasswordEmail } from "../emailTemplates.js";

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
