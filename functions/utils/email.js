const PROVIDERS = new Set(["postmark", "mailchannels", "resend"]);

function getProvider(env) {
  const provider = (env?.EMAIL_PROVIDER || "").toLowerCase();
  return PROVIDERS.has(provider) ? provider : null;
}

function getFrom(env) {
  return env?.EMAIL_FROM || env?.ADMIN_EMAIL || null;
}

function maskToken(token) {
  if (!token) return "(not set)";
  if (token.length <= 8) return "****";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
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
    return { delivered: false, reason: "not_configured" };
  }

  if (!to || !subject) {
    return { delivered: false, reason: "missing_fields" };
  }

  if (provider === "postmark") {
    const token = env?.POSTMARK_API_TOKEN;
    console.log("[Email] Using Postmark provider, token:", maskToken(token));

    if (!token) {
      console.error("[Email] Postmark token missing");
      return { delivered: false, reason: "missing_postmark_token" };
    }

    const payload = {
      From: from,
      To: to,
      Subject: subject,
      HtmlBody: html || undefined,
      TextBody: text || undefined,
    };

    console.log("[Email] Postmark payload:", { From: from, To: to, Subject: subject });

    let response;
    try {
      console.log("[Email] Sending to Postmark API...");
      response = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Postmark-Server-Token": token,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[Email] Postmark fetch error:", error?.message || error);
      return { delivered: false, reason: "postmark_fetch_error" };
    }

    const responseBody = await response.text().catch(() => "");
    console.log("[Email] Postmark response:", {
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
    });

    if (!response.ok) {
      console.error("[Email] Postmark delivery failed:", response.status, responseBody);
      return { delivered: false, reason: "postmark_error", details: responseBody };
    }

    console.log("[Email] Postmark delivery successful");
    return { delivered: true, response: responseBody };
  }

  if (provider === "mailchannels") {
    console.log("[Email] Using MailChannels provider");

    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        ...(html ? [{ type: "text/html", value: html }] : []),
        ...(text ? [{ type: "text/plain", value: text }] : []),
      ],
    };

    console.log("[Email] MailChannels payload:", { from, to, subject });

    let response;
    try {
      console.log("[Email] Sending to MailChannels API...");
      response = await fetch("https://api.mailchannels.net/tx/v1/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[Email] MailChannels fetch error:", error?.message || error);
      return { delivered: false, reason: "mailchannels_fetch_error" };
    }

    const responseBody = await response.text().catch(() => "");
    console.log("[Email] MailChannels response:", {
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
    });

    if (!response.ok) {
      console.error("[Email] MailChannels delivery failed:", response.status, responseBody);
      return { delivered: false, reason: "mailchannels_error", details: responseBody };
    }

    console.log("[Email] MailChannels delivery successful");
    return { delivered: true, response: responseBody };
  }

  if (provider === "resend") {
    const token = env?.RESEND_API_KEY;
    console.log("[Email] Using Resend provider, token:", maskToken(token));

    if (!token) {
      console.error("[Email] Resend API key missing");
      return { delivered: false, reason: "missing_resend_token" };
    }

    const payload = {
      from,
      to: [to],
      subject,
      html: html || undefined,
      text: text || undefined,
    };

    console.log("[Email] Resend payload:", { from, to: [to], subject });

    let response;
    try {
      console.log("[Email] Sending to Resend API...");
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error("[Email] Resend fetch error:", error?.message || error);
      return { delivered: false, reason: "resend_fetch_error" };
    }

    const responseBody = await response.text().catch(() => "");
    console.log("[Email] Resend response:", {
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
    });

    if (!response.ok) {
      console.error("[Email] Resend delivery failed:", response.status, responseBody);
      return { delivered: false, reason: "resend_error", details: responseBody };
    }

    console.log("[Email] Resend delivery successful");
    return { delivered: true, response: responseBody };
  }

  console.error("[Email] Unsupported provider:", provider);
  return { delivered: false, reason: "unsupported_provider" };
}
