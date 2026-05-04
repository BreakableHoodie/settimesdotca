import { isValidEmail } from "../../../utils/validation.js";
import { generateToken } from "../../../utils/tokens.js";
import { sendEmail, isEmailConfigured } from "../../../utils/email.js";

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const MAX_EMAIL_LENGTH = 320;

async function verifyTurnstile(request, env, token) {
  const secret = env?.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return true;
  }

  if (!token || typeof token !== "string") {
    return false;
  }

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const formData = new URLSearchParams();
  formData.set("secret", secret);
  formData.set("response", token);
  if (ip) {
    formData.set("remoteip", ip);
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      },
    );

    const result = await response.json().catch(() => ({}));
    return Boolean(result?.success);
  } catch (_error) {
    return false;
  }
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { DB } = env;

  try {
    const body = await request.json().catch(() => ({}));
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const turnstileToken = body.turnstileToken;

    if (!email || email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const turnstileValid = await verifyTurnstile(request, env, turnstileToken);
    if (!turnstileValid) {
      return new Response(
        JSON.stringify({ error: "Bot verification failed" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Resolve band profile — params.name may be numeric ID or normalized name
    const nameOrId = params.name;
    let band;
    if (/^\d+$/.test(nameOrId)) {
      band = await DB.prepare("SELECT id, name FROM band_profiles WHERE id = ?")
        .bind(Number(nameOrId))
        .first();
    } else {
      const normalized = nameOrId.toLowerCase().replace(/[^a-z0-9]/g, "");
      band = await DB.prepare(
        "SELECT id, name FROM band_profiles WHERE name_normalized = ?",
      )
        .bind(normalized)
        .first();
    }

    if (!band) {
      return new Response(JSON.stringify({ error: "Band not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Atomic upsert — INSERT OR IGNORE avoids the SELECT-then-INSERT race where two
    // concurrent requests both pass the existence check and one hits the UNIQUE constraint.
    const unsubscribeToken = generateToken();
    const result = await DB.prepare(
      `INSERT OR IGNORE INTO band_follows (email, band_profile_id, verified, unsubscribe_token)
       VALUES (?, ?, 1, ?)`,
    )
      .bind(email, band.id, unsubscribeToken)
      .run();

    // Only send confirmation when a new row was actually inserted (changes=0 → already followed)
    if (result.meta.changes > 0 && isEmailConfigured(env)) {
      const publicUrl = env.PUBLIC_URL || "https://settimes.ca";
      const unsubUrl = `${publicUrl}/api/bands/${band.id}/unfollow?token=${unsubscribeToken}`;
      sendEmail(env, {
        to: email,
        subject: `You're following ${band.name} on SetTimes`,
        text: `You'll be notified when ${band.name} joins a lineup.\n\nUnfollow: ${unsubUrl}`,
        html: `<p>You'll be notified when <strong>${escapeHtml(band.name)}</strong> joins a lineup.</p><p><a href="${unsubUrl}">Unfollow</a></p>`,
      }).then(result => {
        if (!result?.delivered) {
          console.warn("[band-follow] Confirmation email not delivered:", result?.reason);
        }
      }).catch(err => {
        console.error("[band-follow] Failed to send confirmation email:", err);
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[band-follow] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
