// Digest flush for band-lineup announcements.
//
// Groups pending band_announce_queue entries by (email, event_id) and sends
// one email per fan per event. Fans following a single announced band on the
// event get the standard per-band email; fans following multiple get a digest.
//
// band_follow_notifications remains the idempotency ledger: each entry is
// claimed (INSERT OR IGNORE) immediately before sending. A send failure
// releases the claim so resend-announcement can retry. A concurrent flush or
// resend that already claimed a slot simply skips that entry.
//
// Sends are dispatched in bounded-concurrency chunks (SEND_CONCURRENCY) so
// a large queue does not exhaust the Worker subrequest cap or wall-clock limit.

import { sendEmail } from "./email.js";
import { logger } from "./logger.js";
import { escapeHtml } from "./html.js";
import { getPublicBaseUrl } from "./publicUrl.js";

const SEND_CONCURRENCY = 8;

export async function flushAnnounceDigest(env, DB) {
  const publicUrl = getPublicBaseUrl(env);

  // Fetch every pending entry, joining band_follows for email + unsubscribe_token.
  const { results: queue } = await DB.prepare(
    `SELECT q.id, q.band_follow_id, q.performance_id, q.event_id,
            q.band_name, q.event_name, q.event_slug, q.band_profile_id,
            bf.email, bf.unsubscribe_token
     FROM band_announce_queue q
     JOIN band_follows bf ON bf.id = q.band_follow_id
     ORDER BY q.event_id, bf.email, q.queued_at`,
  ).all();

  if (!queue.length) return { sent: 0, failed: 0, skipped: 0 };

  // Group by (email, event_id) — one digest per fan per event.
  const groups = new Map();
  for (const item of queue) {
    const key = `${item.email}::${item.event_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  let skipped = 0;

  // ── Phase A (sequential) ─────────────────────────────────────────────────
  // For each group: claim slots, delete queue rows, build the email payload.
  // Ordering is preserved: claim-before-send is the idempotency contract.
  const sendTasks = [];

  for (const items of groups.values()) {
    const { email, event_name, event_slug } = items[0];
    const eventUrl = `${publicUrl}/event/${event_slug}`;

    // Claim each (performance_id, band_follow_id) atomically before sending.
    // INSERT OR IGNORE: changes=0 means already claimed by a concurrent flush
    // or by the resend-announcement endpoint — skip those items.
    const claimed = [];
    for (const item of items) {
      const result = await DB.prepare(
        "INSERT OR IGNORE INTO band_follow_notifications (performance_id, band_follow_id) VALUES (?, ?)",
      )
        .bind(item.performance_id, item.band_follow_id)
        .run();
      if (result.meta.changes > 0) claimed.push(item);
    }

    // Delete every queue entry for this group — whether claimed now or
    // already handled by a concurrent path.
    await DB.batch(items.map((item) => DB.prepare("DELETE FROM band_announce_queue WHERE id = ?").bind(item.id)));

    if (!claimed.length) {
      skipped += items.length;
      continue;
    }

    // Build the email payload.
    const bands = claimed.map((item) => item.band_name);
    const subject =
      bands.length === 1
        ? `${bands[0]} just joined the lineup for ${event_name}!`
        : `${bands.length} bands you follow are playing ${event_name}!`;

    const bandListText = bands.map((b) => `• ${b}`).join("\n");
    const bandListHtml = bands.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
    const unsubText = claimed
      .map(
        (item) =>
          `Unfollow ${item.band_name}: ${publicUrl}/api/bands/${item.band_profile_id}/unfollow?token=${item.unsubscribe_token}`,
      )
      .join("\n");
    const unsubHtml = claimed
      .map(
        (item) =>
          `<a href="${publicUrl}/api/bands/${item.band_profile_id}/unfollow?token=${item.unsubscribe_token}">Unfollow ${escapeHtml(item.band_name)}</a>`,
      )
      .join(" · ");

    const text =
      bands.length === 1
        ? `${bands[0]} is now on the lineup for ${event_name}.\n\nView the schedule: ${eventUrl}\n\n${unsubText}`
        : `${bands.length} bands you follow just joined the lineup for ${event_name}:\n\n${bandListText}\n\nView the schedule: ${eventUrl}\n\n${unsubText}`;

    const html =
      bands.length === 1
        ? `<p><strong>${escapeHtml(bands[0])}</strong> is now on the lineup for <strong>${escapeHtml(event_name)}</strong>.</p><p><a href="${eventUrl}">View the schedule</a></p><p style="font-size:0.85em">${unsubHtml}</p>`
        : `<p><strong>${bands.length} bands you follow</strong> just joined the lineup for <strong>${escapeHtml(event_name)}</strong>:</p><ul>${bandListHtml}</ul><p><a href="${eventUrl}">View the schedule</a></p><p style="font-size:0.85em">${unsubHtml}</p>`;

    sendTasks.push({ email, subject, text, html, claimed });
  }

  // ── Phase B (bounded concurrency) ────────────────────────────────────────
  // Send the collected tasks in chunks of SEND_CONCURRENCY. On send failure,
  // release that task's claims so resend-announcement can recover.
  let sent = 0;
  let failed = 0;

  async function sendOne(task) {
    const result = await sendEmail(env, {
      to: task.email,
      subject: task.subject,
      text: task.text,
      html: task.html,
    });
    if (result?.delivered) {
      sent++;
    } else {
      // Release claims so resend-announcement can recover this fan.
      await DB.batch(
        task.claimed.map((item) =>
          DB.prepare("DELETE FROM band_follow_notifications WHERE performance_id = ? AND band_follow_id = ?").bind(
            item.performance_id,
            item.band_follow_id,
          ),
        ),
      );
      failed++;
    }
  }

  for (let i = 0; i < sendTasks.length; i += SEND_CONCURRENCY) {
    const chunk = sendTasks.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(sendOne));
    // #672: a thrown sendOne (e.g. the claim-releasing DB.batch above) was
    // discarded entirely by allSettled — make it observable. Counts/behaviour
    // are unchanged; this is additive logging only.
    for (const result of results) {
      if (result.status === "rejected") {
        logger.error("announce digest sendOne rejected (claim release may not have run)", { error: result.reason });
      }
    }
  }

  if (failed > 0) {
    logger.warn("announce digest partially failed", { sent, failed, skipped });
  }
  return { sent, failed, skipped };
}
