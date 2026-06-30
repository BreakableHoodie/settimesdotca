import { isValidEmail } from "../../utils/validation.js";
import { isEmailConfigured, sendEmail } from "../../utils/email.js";
import { buildActivationEmail } from "../../utils/emailTemplates.js";
import { getPublicBaseUrl } from "../../utils/publicUrl.js";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  let email;
  try {
    const body = await request.json();
    email = body?.email;
  } catch (_error) {
    email = null;
  }

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
      message:
        "If an inactive account exists with this email, an activation link has been sent.",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );

  try {
    const user = await DB.prepare(
      `
      SELECT id, first_name, last_name, is_active, activated_at
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

    const activationToken =
      crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
    const activationExpires = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();

    try {
      await DB.prepare(
        `
      UPDATE users
      SET activation_token = ?,
          activation_token_expires_at = ?
      WHERE id = ?
    `,
      )
        .bind(activationToken, activationExpires, user.id)
        .run();
    } catch (writeErr) {
      // The generic response is intentionally returned for all paths (user
      // enumeration resistance), but a failed token write is infrastructural,
      // not a benign not-found/already-active branch — log it distinctly so it
      // is alertable rather than hidden behind the generic 200.
      console.error(
        "[ResendActivation] activation token write failed:",
        writeErr,
      );
      return genericResponse;
    }

    const baseUrl = getPublicBaseUrl(env);
    const activationUrl = new URL("/activate", baseUrl);
    activationUrl.searchParams.set("token", activationToken);

    if (isEmailConfigured(env)) {
      const fullName = [user.first_name, user.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
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
      console.log(
        "[ResendActivation] Activation email delivery attempted:",
        emailResult.reason || "delivered",
      );
    } else {
      console.warn(
        "[ResendActivation] Email not configured; activation email was not sent.",
      );
    }

    return genericResponse;
  } catch (error) {
    console.error("Resend activation error:", error);
    return genericResponse;
  }
}
