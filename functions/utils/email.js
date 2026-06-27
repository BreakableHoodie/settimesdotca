import { logger } from "./logger.js";

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
    logger.warn("email delivery failed", {
      provider: provider ?? "none",
      reason: "not_configured",
    });
    return { delivered: false, reason: "not_configured" };
  }

  if (!to || !subject) {
    logger.warn("email delivery failed", {
      provider,
      reason: "missing_fields",
    });
    return { delivered: false, reason: "missing_fields" };
  }

  if (provider === "postmark") {
    const token = env?.POSTMARK_API_TOKEN;
    logger.info("email provider selected", { provider: "postmark" });

    if (!token) {
      logger.warn("email delivery failed", {
        provider: "postmark",
        reason: "missing_postmark_token",
      });
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
      logger.warn("email delivery failed", {
        provider: "postmark",
        reason: "postmark_fetch_error",
        error,
      });
      return { delivered: false, reason: "postmark_fetch_error" };
    }

    logger.info("email provider response received", {
      provider: "postmark",
      status: response.status,
    });

    if (!response.ok) {
      logger.warn("email delivery failed", {
        provider: "postmark",
        status: response.status,
        reason: "postmark_error",
      });
      return { delivered: false, reason: "postmark_error" };
    }

    logger.info("email delivered", { provider: "postmark" });
    return { delivered: true };
  }

  if (provider === "mailchannels") {
    logger.info("email provider selected", { provider: "mailchannels" });

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
      logger.warn("email delivery failed", {
        provider: "mailchannels",
        reason: "mailchannels_fetch_error",
        error,
      });
      return { delivered: false, reason: "mailchannels_fetch_error" };
    }

    logger.info("email provider response received", {
      provider: "mailchannels",
      status: response.status,
    });

    if (!response.ok) {
      logger.warn("email delivery failed", {
        provider: "mailchannels",
        status: response.status,
        reason: "mailchannels_error",
      });
      return { delivered: false, reason: "mailchannels_error" };
    }

    logger.info("email delivered", { provider: "mailchannels" });
    return { delivered: true };
  }

  if (provider === "resend") {
    const token = env?.RESEND_API_KEY;
    logger.info("email provider selected", { provider: "resend" });

    if (!token) {
      logger.warn("email delivery failed", {
        provider: "resend",
        reason: "missing_resend_token",
      });
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
      logger.warn("email delivery failed", {
        provider: "resend",
        reason: "resend_fetch_error",
        error,
      });
      return { delivered: false, reason: "resend_fetch_error" };
    }

    logger.info("email provider response received", {
      provider: "resend",
      status: response.status,
    });

    if (!response.ok) {
      logger.warn("email delivery failed", {
        provider: "resend",
        status: response.status,
        reason: "resend_error",
      });
      return { delivered: false, reason: "resend_error" };
    }

    logger.info("email delivered", { provider: "resend" });
    return { delivered: true };
  }

  logger.warn("email delivery failed", {
    provider,
    reason: "unsupported_provider",
  });
  return { delivered: false, reason: "unsupported_provider" };
}
