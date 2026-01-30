const BRAND = {
  name: "SetTimes",
  accent: "#0ea5e9",
  background: "#0c0f1a",
  card: "#141927",
  text: "#e5e7eb",
  muted: "#9ca3af",
};

function renderEmail({
  title,
  preheader,
  intro,
  ctaLabel,
  ctaUrl,
  bodyHtml,
  footerNote,
}) {
  const preheaderText = preheader ? String(preheader) : "";
  const safeTitle = String(title);

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${safeTitle}</title>
      </head>
      <body style="margin:0; padding:0; background:${BRAND.background}; color:${BRAND.text};">
        <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; mso-hide:all;">
          ${preheaderText}
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.background};">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px; width:100%;">
                <tr>
                  <td style="text-align:center; padding-bottom:24px;">
                    <div style="font-size:28px; font-weight:700; letter-spacing:0.5px;">
                      <span style="color:${BRAND.accent};">Set</span><span style="color:${BRAND.text};">Times</span>
                    </div>
                    <div style="color:${BRAND.muted}; font-size:14px; margin-top:6px;">
                      Discover. Plan. Experience.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background:${BRAND.card}; border-radius:16px; padding:28px; border:1px solid rgba(255,255,255,0.08);">
                    <h1 style="margin:0 0 12px; font-size:22px; font-weight:700; color:${BRAND.text};">
                      ${safeTitle}
                    </h1>
                    ${intro ? `<p style="margin:0 0 16px; font-size:15px; color:${BRAND.muted};">${intro}</p>` : ""}
                    ${ctaLabel && ctaUrl ? `
                      <div style="margin:24px 0;">
                        <a href="${ctaUrl}" style="display:inline-block; background:${BRAND.accent}; color:${BRAND.background}; text-decoration:none; font-weight:700; padding:12px 20px; border-radius:10px;">
                          ${ctaLabel}
                        </a>
                      </div>
                      <div style="font-size:12px; color:${BRAND.muted}; word-break:break-all;">
                        Or copy this link:<br />
                        <a href="${ctaUrl}" style="color:${BRAND.accent}; text-decoration:none;">${ctaUrl}</a>
                      </div>
                    ` : ""}
                    ${bodyHtml ? `<div style="margin-top:20px; font-size:14px; color:${BRAND.text}; line-height:1.6;">${bodyHtml}</div>` : ""}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:20px; text-align:center; color:${BRAND.muted}; font-size:12px;">
                    ${footerNote || "If you did not expect this email, you can ignore it."}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
}

function formatExpiry(expiresAt) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildInviteEmail({ inviteUrl, expiresAt, recipientName }) {
  const expiresLabel = formatExpiry(expiresAt);
  const intro = recipientName
    ? `Hi ${recipientName}, you have been invited to SetTimes.`
    : "You have been invited to SetTimes.";

  const bodyHtml = `
    <p style="margin:0 0 12px;">Set up your account to manage events and schedules.</p>
    ${expiresLabel ? `<p style="margin:0;">This invite expires on ${expiresLabel}.</p>` : ""}
  `;

  return {
    subject: "You are invited to SetTimes",
    text: [
      intro,
      "",
      `Create your account: ${inviteUrl}`,
      expiresLabel ? `This invite expires on ${expiresLabel}.` : null,
      "",
      "If you did not expect this email, you can ignore it.",
    ]
      .filter(Boolean)
      .join("\n"),
    html: renderEmail({
      title: "You are invited",
      preheader: "Create your SetTimes account",
      intro,
      ctaLabel: "Create your account",
      ctaUrl: inviteUrl,
      bodyHtml,
    }),
  };
}

export function buildResetPasswordEmail({ resetUrl, recipientName }) {
  const intro = recipientName
    ? `Hi ${recipientName}, a password reset was requested for your account.`
    : "A password reset was requested for your account.";

  const bodyHtml = `
    <p style="margin:0 0 12px;">Use the button above to choose a new password.</p>
    <p style="margin:0;">If you did not request this reset, you can safely ignore this email.</p>
  `;

  return {
    subject: "Reset your SetTimes password",
    text: [
      intro,
      "",
      `Reset your password: ${resetUrl}`,
      "",
      "If you did not request this reset, you can ignore this email.",
    ].join("\n"),
    html: renderEmail({
      title: "Reset your password",
      preheader: "Set a new SetTimes password",
      intro,
      ctaLabel: "Reset password",
      ctaUrl: resetUrl,
      bodyHtml,
    }),
  };
}
