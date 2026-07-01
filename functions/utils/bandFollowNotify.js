// Shared "band joined the lineup" notification logic for band followers.
//
// Sends the announcement email to each given follower and records every
// SUCCESSFUL delivery in band_follow_notifications, keyed by (performance,
// follower). This lets a resend target only followers who were not yet
// notified for a performance — guaranteeing eventual delivery without ever
// double-sending. Used by the announce flow (bands/[id].js) and the resend
// endpoint (bands/[id]/resend-announcement.js).
import { sendEmail } from "./email.js";
import { logger } from "./logger.js";
import { getPublicBaseUrl } from "./publicUrl.js";
import { escapeHtml } from "./html.js";

export async function notifyBandFollowers(env, DB, { performanceId, bandProfileId, bandName, eventName, followers }) {
  const publicUrl = getPublicBaseUrl(env);

  const results = await Promise.allSettled(
    followers.map(async (follower) => {
      // Claim the follower atomically before delivery. INSERT OR IGNORE
      // returns changes=0 if another request already claimed this follower,
      // preventing concurrent resends from double-sending to the same person.
      const claim = await DB.prepare(
        "INSERT OR IGNORE INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)",
      )
        .bind(performanceId, follower.id)
        .run();

      if (claim.meta.changes === 0) {
        return false;
      }

      const unsubUrl = `${publicUrl}/api/bands/${bandProfileId}/unfollow?token=${follower.unsubscribe_token}`;
      const result = await sendEmail(env, {
        to: follower.email,
        subject: `${bandName} just joined the lineup for ${eventName}!`,
        text: `${bandName} is now on the lineup for ${eventName}.\n\nUnfollow: ${unsubUrl}`,
        html: `<p><strong>${escapeHtml(bandName)}</strong> is now on the lineup for <strong>${escapeHtml(eventName)}</strong>.</p><p><a href="${unsubUrl}">Unfollow this band</a></p>`,
      });

      const delivered = result?.delivered === true;
      if (!delivered) {
        // Email failed — release the claim so a future resend can retry.
        await DB.prepare("DELETE FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?")
          .bind(performanceId, follower.id)
          .run();
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
  if (failed > 0) {
    logger.warn("band follow notifications partially failed", {
      performanceId,
      sent,
      failed,
    });
  }
  return { sent, failed };
}
