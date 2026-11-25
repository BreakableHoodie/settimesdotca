import { isValidEmail } from "../../utils/validation.js";
import { isEmailConfigured, sendEmail } from "../../utils/email.js";
import { buildActivationEmail } from "../../utils/emailTemplates.js";
import { getPublicBaseUrl } from "../../utils/publicUrl.js";
import { toSqliteDateTime } from "../../utils/authAttempts.js";
import { hashStoredToken } from "../../utils/tokens.js";
import { parseJsonObjectBody } from "../../utils/request.js";
import { allowEmailToRecipient, logRecipientSuppression } from "../../utils/recipientEmailCap.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  const body = await parseJsonObjectBody(request);
  // Users are stored lowercased (signup, users.js); match that or a
  // mixed-case request never finds its account.
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : body?.email;

  if (!email || typeof email !== "string") {
    return new Response(
      JSON.stringify({
        error: "Validation error",
        message: "Email is required",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  if (!isValidEmail(email)) {
    return new Response(
      JSON.stringify({
        error: "Validation error",
        message: "Invalid email format",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const genericResponse = new Response(
    JSON.stringify({
      success: true,
      message: "If an inactive account exists with this email, an activation link has been sent.",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );

  try {
    const user = await DB.prepare(
      `
      SELECT id, first_name, last_name, is_active, activated_at, deactivated_at
      FROM users
      WHERE email = ?
    `,
    )
      .bind(email)
      .first();

    if (!user || user.is_active === 1) {
      return genericResponse;
    }

    if (user.activated_at) {
      return genericResponse;
    }

    // An admin deactivated this invitee before they activated: no new link.
    if (user.deactivated_at) {
      return genericResponse;
    }

    // Per-recipient cap (#1337), checked BEFORE the token is rotated: rotating it while
    // suppressing the email would kill the link the person already holds and mail
    // nothing in its place. Over the cap: change nothing, send nothing, same response.
    if (isEmailConfigured(env)) {
      const cap = await allowEmailToRecipient(DB, email);
      if (!cap.allowed) {
        logRecipientSuppression("ResendActivation", cap);
        return genericResponse;
      }
    }

    const activationToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    // Only the digest is stored (#1482); the plaintext goes out in the email.
    const activationTokenHash = await hashStoredToken(activationToken);
    // SEC-F1 class (#670): must be space-separated to compare correctly
    // against D1's datetime('now') in activate.js's SQL expiry guard.
    const activationExpires = toSqliteDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000));

    let writeResult;
    try {
      writeResult = await DB.prepare(
        `
      UPDATE users
      SET activation_token = ?,
          activation_token_expires_at = ?
      WHERE id = ?
        AND is_active = 0
        AND activated_at IS NULL
        AND deactivated_at IS NULL
    `,
      )
        .bind(activationTokenHash, activationExpires, user.id)
        .run();
    } catch (writeErr) {
      // The generic response is intentionally returned for all paths (user
      // enumeration resistance), but a failed token write is infrastructural,
      // not a benign not-found/already-active branch — log it distinctly so it
      // is alertable rather than hidden behind the generic 200.
      console.error("[ResendActivation] activation token write failed:", writeErr);
      return genericResponse;
    }

    // The row changed state between the read and this write (e.g. an admin deactivated
    // it): nothing was stored, so nothing is sent. Only an EXPLICIT 0 counts as not
    // applied; an absent meta must not suppress a committed write's email.
    if (writeResult?.meta?.changes === 0) {
      return genericResponse;
    }

    const baseUrl = getPublicBaseUrl(env);
    const activationUrl = new URL("/activate", baseUrl);
    activationUrl.searchParams.set("token", activationToken);

    if (isEmailConfigured(env)) {
      const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
      const emailPayload = buildActivationEmail({
        activationUrl: activationUrl.toString(),
        recipientName: fullName || null,
      });

      const emailResult = await sendEmail(env, {
        to: email,
        subject: emailPayload.subject,
        text: emailPayload.text,
        html: emailPayload.html,
      });
      console.log("[ResendActivation] Activation email delivery attempted:", emailResult.reason || "delivered");
    } else {
      console.warn("[ResendActivation] Email not configured; activation email was not sent.");
    }

    return genericResponse;
  } catch (error) {
    console.error("Resend activation error:", error);
    return genericResponse;
  }
}
