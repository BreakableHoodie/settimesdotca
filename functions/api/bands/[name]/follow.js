import { isValidEmail } from "../../../utils/validation.js";
import { generateToken, hashStoredToken } from "../../../utils/tokens.js";
import { sendEmail, isEmailConfigured } from "../../../utils/email.js";
import { verifyTurnstile } from "../../../utils/turnstile.js";
import { normalizeBandName } from "../../../utils/bandName.js";

import { escapeHtml } from "../../../utils/html.js";
import { getPublicBaseUrl } from "../../../utils/publicUrl.js";
import { parseJsonObjectBody } from "../../../utils/request.js";
import { CONSENT_VERSION, pendingConfirmationLiveSql } from "../../../utils/consent.js";
import { isDevRequest } from "../../../utils/auth.js";
import { allowEmailToRecipient, logRecipientSuppression } from "../../../utils/recipientEmailCap.js";

const MAX_EMAIL_LENGTH = 320;

// A pending row whose confirmation was never mailed can never be confirmed, yet a live one
// makes every re-request a no-op until it expires in 7 days. Delete it by its own token.
async function dropPendingFollow(DB, verificationTokenHash) {
  try {
    await DB.prepare("DELETE FROM band_follows WHERE verification_token = ? AND verified = 0")
      .bind(verificationTokenHash)
      .run();
  } catch (err) {
    console.error(
      "[band-follow] Failed to drop unmailed pending follow; re-requests are blocked until it expires:",
      err,
    );
  }
}

export async function onRequestPost(context) {
  const { request, env, params, waitUntil } = context;
  const { DB } = env;

  try {
    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const turnstileToken = body.turnstileToken;

    if (!email || email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const turnstileValid = await verifyTurnstile(request, env, turnstileToken);
    if (!turnstileValid) {
      return new Response(JSON.stringify({ error: "Bot verification failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Resolve band profile — params.name may be numeric ID or normalized name
    const nameOrId = params.name;
    let band;
    if (/^\d+$/.test(nameOrId)) {
      band = await DB.prepare("SELECT id, name FROM band_profiles WHERE id = ?").bind(Number(nameOrId)).first();
    } else {
      const normalized = normalizeBandName(nameOrId);
      band = await DB.prepare("SELECT id, name FROM band_profiles WHERE name_normalized = ?").bind(normalized).first();
    }

    if (!band) {
      return new Response(JSON.stringify({ error: "Band not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Per-recipient cap (#1337), checked BEFORE the write so a capped request inserts
    // nothing: no pending row whose token was never mailed, hence nothing to clean up.
    // A pre-read keeps a request that would be a no-op (already following, or a live
    // pending row) from spending the allowance. A race between read and write can cost
    // one unit at most. Over the cap: send nothing, answer exactly as on success.
    if (isEmailConfigured(env)) {
      const existing = await DB.prepare(
        `SELECT 1 AS found FROM band_follows
         WHERE email = ? AND band_profile_id = ? AND (verified = 1 OR ${pendingConfirmationLiveSql()})`,
      )
        .bind(email, band.id)
        .first();
      if (!existing) {
        const cap = await allowEmailToRecipient(DB, email);
        if (!cap.allowed) {
          logRecipientSuppression("band-follow", cap);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
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
    const verificationTokenHash = await hashStoredToken(verificationToken);
    const consentIp = request.headers.get("CF-Connecting-IP") ?? null;
    const [, result] = await DB.batch([
      DB.prepare(
        `DELETE FROM band_follows
         WHERE email = ? AND band_profile_id = ? AND verified = 0 AND NOT (${pendingConfirmationLiveSql()})`,
      ).bind(email, band.id),
      DB.prepare(
        `INSERT OR IGNORE INTO band_follows (email, band_profile_id, verified, verification_token, unsubscribe_token, consent_ip, consent_method, consent_version)
         VALUES (?, ?, 0, ?, ?, ?, 'web_form', ?)`,
      ).bind(email, band.id, verificationTokenHash, unsubscribeToken, consentIp, CONSENT_VERSION),
    ]);

    // changes=0 → this email already follows the band (verified or pending). Say
    // nothing further: don't leak follow state and don't re-send on every POST.
    const isNewFollow = result.meta.changes > 0;
    const publicUrl = getPublicBaseUrl(env);
    const confirmUrl = `${publicUrl}/api/bands/${band.id}/confirm-follow?token=${verificationToken}`;

    if (isNewFollow && isEmailConfigured(env)) {
      // Use waitUntil so the Worker stays alive for the email after the response is returned.
      waitUntil(
        sendEmail(env, {
          to: email,
          subject: `Confirm your follow of ${band.name} on SetTimes`,
          text: `Someone (hopefully you) asked to follow ${band.name} on SetTimes.\n\nConfirm to be notified when they join a lineup:\n${confirmUrl}\n\nIf this wasn't you, ignore this email — you won't be subscribed.`,
          html: `<p>Someone (hopefully you) asked to follow <strong>${escapeHtml(band.name)}</strong> on SetTimes.</p><p><a href="${escapeHtml(confirmUrl)}">Confirm your follow</a> to be notified when they join a lineup.</p><p>If this wasn't you, just ignore this email — you won't be subscribed.</p>`,
        })
          .then(async (emailResult) => {
            if (!emailResult?.delivered) {
              console.warn("[band-follow] Confirmation email not delivered:", emailResult?.reason);
              await dropPendingFollow(DB, verificationTokenHash);
            }
          })
          .catch(async (err) => {
            console.error("[band-follow] Failed to send confirmation email:", err);
            await dropPendingFollow(DB, verificationTokenHash);
          }),
      );
    }

    // When email delivery isn't configured (local/dev), surface the confirm URL
    // so the follow can still be verified — mirrors the subscriptions endpoint.
    // In production email IS configured, so the token is never returned here.
    const responseBody = { success: true };
    if (isNewFollow && !isEmailConfigured(env) && isDevRequest(request, env)) {
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
