// POST /api/admin/flush-announce-digest
//
// Groups pending band_announce_queue entries by (email, event) and sends one
// digest email per fan per event, then records each successful send in
// band_follow_notifications (the idempotency ledger). Failed sends release
// their claims so resend-announcement can recover them.
//
// Call this after a batch of announce toggles so fans following multiple bands
// on the same bill receive one digest rather than N separate emails.

import { checkPermission, auditLog } from "./_middleware.js";
import { getClientIP } from "../../utils/request.js";
import { isEmailConfigured } from "../../utils/email.js";
import { flushAnnounceDigest } from "../../utils/announceDigest.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  const perm = await checkPermission(context, "editor");
  if (perm.error) return perm.response;

  if (!isEmailConfigured(env)) {
    return json(
      { error: "Email not configured", message: "Configure an email provider before flushing." },
      400,
    );
  }

  const { sent, failed, skipped } = await flushAnnounceDigest(env, DB);

  await auditLog(
    env,
    perm.user.userId,
    "announce_digest.flushed",
    "system",
    null,
    { sent, failed, skipped },
    getClientIP(request),
  ).catch(() => {});

  return json({ success: true, sent, failed, skipped });
}
