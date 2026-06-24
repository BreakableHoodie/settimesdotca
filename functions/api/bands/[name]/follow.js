import { isValidEmail } from "../../../utils/validation.js";
import { generateToken } from "../../../utils/tokens.js";
import { sendEmail, isEmailConfigured } from "../../../utils/email.js";
import { verifyTurnstile } from "../../../utils/turnstile.js";

const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const MAX_EMAIL_LENGTH = 320;

export async function onRequestPost(context) {
  const { request, env, params, waitUntil } = context;
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
    //
    // Double opt-in: the follow is created UNVERIFIED (verified=0) and only a
    // confirmation email is sent. Announcement emails go to verified=1 followers
    // only (see admin/bands/[id].js + resend-announcement.js), so an address the
    // submitter doesn't control can never be enrolled in the announcement stream
    // — it receives at most this single confirmation email it can ignore.
    const unsubscribeToken = generateToken();
    const verificationToken = generateToken();
    const result = await DB.prepare(
      `INSERT OR IGNORE INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token)
       VALUES (?, ?, 0, ?, ?)`,
    )
      .bind(email, band.id, verificationToken, unsubscribeToken)
      .run();

    // changes=0 → this email already follows the band (verified or pending). Say
    // nothing further: don't leak follow state and don't re-send on every POST.
    const isNewFollow = result.meta.changes > 0;
    const publicUrl = env.PUBLIC_URL || "https://settimes.ca";
    const confirmUrl = `${publicUrl}/api/bands/${band.id}/confirm-follow?token=${verificationToken}`;

    if (isNewFollow && isEmailConfigured(env)) {
      // Use waitUntil so the Worker stays alive for the email after the response is returned.
      waitUntil(
        sendEmail(env, {
          to: email,
          subject: `Confirm your follow of ${band.name} on SetTimes`,
          text: `Someone (hopefully you) asked to follow ${band.name} on SetTimes.\n\nConfirm to be notified when they join a lineup:\n${confirmUrl}\n\nIf this wasn't you, ignore this email — you won't be subscribed.`,
          html: `<p>Someone (hopefully you) asked to follow <strong>${escapeHtml(band.name)}</strong> on SetTimes.</p><p><a href="${confirmUrl}">Confirm your follow</a> to be notified when they join a lineup.</p><p>If this wasn't you, just ignore this email — you won't be subscribed.</p>`,
        }).then(emailResult => {
          if (!emailResult?.delivered) {
            console.warn("[band-follow] Confirmation email not delivered:", emailResult?.reason);
          }
        }).catch(err => {
          console.error("[band-follow] Failed to send confirmation email:", err);
        })
      );
    }

    // When email delivery isn't configured (local/dev), surface the confirm URL
    // so the follow can still be verified — mirrors the subscriptions endpoint.
    // In production email IS configured, so the token is never returned here.
    const responseBody = { success: true };
    if (isNewFollow && !isEmailConfigured(env)) {
      responseBody.confirmUrl = confirmUrl;
    }

    return new Response(JSON.stringify(responseBody), {
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
