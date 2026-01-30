const PROVIDERS = new Set(["postmark", "mailchannels", "resend"]);

function getProvider(env) {
  const provider = (env?.EMAIL_PROVIDER || "").toLowerCase();
  return PROVIDERS.has(provider) ? provider : null;
}

function getFrom(env) {
  return env?.EMAIL_FROM || env?.ADMIN_EMAIL || null;
}

export function isEmailConfigured(env) {
  const provider = getProvider(env);
  const from = getFrom(env);
  if (!provider || !from) {
    return false;
  }

  if (provider === "postmark") {
    return Boolean(env?.POSTMARK_API_TOKEN);
  }

  if (provider === "resend") {
    return Boolean(env?.RESEND_API_KEY);
  }

  return true;
}

export async function sendEmail(env, { to, subject, html, text }) {
  const provider = getProvider(env);
  const from = getFrom(env);

  if (!provider || !from) {
    console.info("[Email] Skipped: email provider not configured.");
    return { delivered: false, reason: "not_configured" };
  }

  if (!to || !subject) {
    return { delivered: false, reason: "missing_fields" };
  }

  if (provider === "postmark") {
    const token = env?.POSTMARK_API_TOKEN;
    if (!token) {
      return { delivered: false, reason: "missing_postmark_token" };
    }

    const payload = {
      From: from,
      To: to,
      Subject: subject,
      HtmlBody: html || undefined,
      TextBody: text || undefined,
    };

    let response;
    try {
      response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": token,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[Email] Postmark fetch error:", error);
      return { delivered: false, reason: "postmark_fetch_error" };
    }

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("[Email] Postmark error:", response.status, details);
      return { delivered: false, reason: "postmark_error" };
    }

    return { delivered: true };
  }

  if (provider === "mailchannels") {
    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        ...(html ? [{ type: "text/html", value: html }] : []),
        ...(text ? [{ type: "text/plain", value: text }] : []),
      ],
    };

    let response;
    try {
      response = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[Email] MailChannels fetch error:", error);
      return { delivered: false, reason: "mailchannels_fetch_error" };
    }

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("[Email] MailChannels error:", response.status, details);
      return { delivered: false, reason: "mailchannels_error" };
    }

    return { delivered: true };
  }

  if (provider === "resend") {
    const token = env?.RESEND_API_KEY;
    if (!token) {
      return { delivered: false, reason: "missing_resend_token" };
    }

    const payload = {
      from,
      to: [to],
      subject,
      html: html || undefined,
      text: text || undefined,
    };

    let response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[Email] Resend fetch error:", error);
      return { delivered: false, reason: "resend_fetch_error" };
    }

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("[Email] Resend error:", response.status, details);
      return { delivered: false, reason: "resend_error" };
    }

    return { delivered: true };
  }

  return { delivered: false, reason: "unsupported_provider" };
}
