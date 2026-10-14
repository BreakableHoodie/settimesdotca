import { logger } from "./logger.js";

const PROVIDERS = new Set(["postmark", "mailchannels", "resend"]);

function getProvider(env) {
  const provider = (env?.EMAIL_PROVIDER || "").toLowerCase();
  return PROVIDERS.has(provider) ? provider : null;
}

function getFrom(env) {
  return env?.EMAIL_FROM || env?.ADMIN_EMAIL || null;
}

function validateHeaders(headers) {
  if (headers === undefined) return;
  if (
    headers === null ||
    typeof headers !== "object" ||
    Array.isArray(headers) ||
    (Object.getPrototypeOf(headers) !== Object.prototype && Object.getPrototypeOf(headers) !== null)
  ) {
    throw new Error("headers must be a plain object");
  }
  for (const [name, value] of Object.entries(headers)) {
    // Only the headers this module builds. A free-form name would let a future
    // caller set From, Reply-To or Bcc, which some providers honour.
    if (!ALLOWED_EXTRA_HEADERS.has(name)) {
      throw new Error(`header not allowed: ${JSON.stringify(name)}`);
    }
    // Control characters (CR/LF above all) would let a value start a new header.
    if (typeof value !== "string" || hasControlCharacter(value)) {
      throw new Error("headers must contain string values without control characters");
    }
  }
}

// Tab (9) is legal folding whitespace; every other C0 control and DEL is not.
function hasControlCharacter(value) {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if ((code < 32 && code !== 9) || code === 127) return true;
  }
  return false;
}

const ALLOWED_EXTRA_HEADERS = new Set(["List-Unsubscribe", "List-Unsubscribe-Post"]);

export function listUnsubscribeHeaders(url) {
  // RFC 2369 wraps each URI in <...> and separates URIs with commas, so a URL
  // carrying either would split into extra targets.
  if (typeof url !== "string" || !/^https?:\/\/[!-~]+$/.test(url) || /[<>,]/.test(url)) {
    throw new Error("List-Unsubscribe URL must be a printable-ASCII http(s) URL without <, > or comma");
  }
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
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

/**
 * Send one email through the configured provider (EMAIL_PROVIDER).
 * @param {object} env
 * @param {{ to: string, subject: string, html: string, text?: string, idempotencyKey?: string, headers?: object }} message
 *   idempotencyKey (optional, 1-256 chars; throws if empty, longer, or not a string) is sent as
 *   `Idempotency-Key` on RESEND ONLY; Postmark and MailChannels have no equivalent and ignore it.
 *   Pass it only for claim-then-send mail, never for transactional mail a user may re-request.
 * @returns {Promise<{ delivered: boolean, reason?: string }>} Resend 409s are BOTH undelivered:
 *   `concurrent_idempotent_requests` -> reason "concurrent_idempotent_request" (a send in flight);
 *   `invalid_idempotent_request` -> reason "idempotency_payload_mismatch" (a reused key cannot prove
 *   a send, so it is never counted delivered -- see CLAUDE.md "A claim is not a delivery record").
 */
export async function sendEmail(env, { to, subject, html, text, idempotencyKey, headers }) {
  if (
    idempotencyKey !== undefined &&
    (typeof idempotencyKey !== "string" || idempotencyKey.length === 0 || idempotencyKey.length > 256)
  ) {
    throw new Error("idempotencyKey must be a string of 1 to 256 characters");
  }
  validateHeaders(headers);

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
    if (idempotencyKey !== undefined) {
      // Postmark has no provider-side equivalent, so only Resend receives this key.
      logger.debug("email idempotency key is unsupported by provider", { provider: "postmark" });
    }
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
      ...(headers !== undefined ? { Headers: Object.entries(headers).map(([Name, Value]) => ({ Name, Value })) } : {}),
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
    if (idempotencyKey !== undefined) {
      // MailChannels has no provider-side equivalent, so only Resend receives this key.
      logger.debug("email idempotency key is unsupported by provider", { provider: "mailchannels" });
    }
    logger.info("email provider selected", { provider: "mailchannels" });

    const payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        ...(html ? [{ type: "text/html", value: html }] : []),
        ...(text ? [{ type: "text/plain", value: text }] : []),
      ],
      ...(headers !== undefined ? { headers } : {}),
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
      ...(headers !== undefined ? { headers } : {}),
    };

    let response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(idempotencyKey !== undefined ? { "Idempotency-Key": idempotencyKey } : {}),
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
      if (response.status === 409) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = undefined;
        }

        // Same key, DIFFERENT payload. It is tempting to read this as "already
        // sent" and count it delivered -- but Resend returns "the same response"
        // for a reused key, i.e. it stores the first response whatever it was.
        // If that first attempt was REJECTED (never sent), counting this as
        // delivered drops the follower permanently and silently: the exact
        // failure #1152 removed. So it is NOT delivered: logged loudly, and
        // retried once the 24h key expires. A same-payload retry -- the common
        // case -- still gets the original success back and sends nothing twice.
        if (errorBody?.name === "invalid_idempotent_request") {
          logger.error("Resend idempotency key reused with a different payload; not counted as delivered", {
            provider: "resend",
            key: idempotencyKey,
          });
          return { delivered: false, reason: "idempotency_payload_mismatch" };
        }

        if (errorBody?.name === "concurrent_idempotent_requests") {
          return { delivered: false, reason: "concurrent_idempotent_request" };
        }
      }

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
