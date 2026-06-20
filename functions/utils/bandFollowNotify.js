// Shared "band joined the lineup" notification logic for band followers.
//
// Sends the announcement email to each given follower and records every
// SUCCESSFUL delivery in band_follow_notifications, keyed by (performance,
// follower). This lets a resend target only followers who were not yet
// notified for a performance — guaranteeing eventual delivery without ever
// double-sending. Used by the announce flow (bands/[id].js) and the resend
// endpoint (bands/[id]/resend-announcement.js).
import { sendEmail } from "./email.js";

// Escape plain-text band/event names for safe interpolation into the email HTML.
// Mirrors the escaper in bands/[id].js (regex .replace, the codebase convention).
const escapeHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export async function notifyBandFollowers(
  env,
  DB,
  { performanceId, bandProfileId, bandName, eventName, followers },
) {
  const publicUrl = env.PUBLIC_URL || "https://settimes.ca";

  const results = await Promise.allSettled(
    followers.map(async (follower) => {
      const unsubUrl = `${publicUrl}/api/bands/${bandProfileId}/unfollow?token=${follower.unsubscribe_token}`;
      const result = await sendEmail(env, {
        to: follower.email,
        subject: `${bandName} just joined the lineup for ${eventName}!`,
        text: `${bandName} is now on the lineup for ${eventName}.\n\nUnfollow: ${unsubUrl}`,
        html: `<p><strong>${escapeHtml(bandName)}</strong> is now on the lineup for <strong>${escapeHtml(eventName)}</strong>.</p><p><a href="${unsubUrl}">Unfollow this band</a></p>`,
      });

      // sendEmail returns { delivered: false } on failure rather than throwing.
      const delivered = result?.delivered === true;
      if (delivered) {
        // Record the success so a future resend skips this follower. A recording
        // failure must NOT flip the email result, so it is caught and logged.
        try {
          await DB.prepare(
            "INSERT OR IGNORE INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)",
          )
            .bind(performanceId, follower.id)
            .run();
        } catch (err) {
          console.error(
            "Failed to record band follow notification",
            performanceId,
            follower.id,
            err,
          );
        }
      }
      return delivered;
    }),
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && r.value === true) sent++;
    else failed++;
  }
  return { sent, failed };
}
