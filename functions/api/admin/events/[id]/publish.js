// Publish/Unpublish event endpoint
// POST /api/admin/events/{id}/publish

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP } from "../../../../utils/request.js";
import { safeReflectSocialLinksString } from "../../../../utils/validation.js";

// Helper to extract event ID from path
function getEventId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("events") + 1;
  return parts[idIndex];
}

// POST - Publish or unpublish event (editor and admin only)
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Check permission (editor and above)
    const permCheck = await checkPermission(context, "editor");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;
    const eventId = getEventId(request);

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid event ID",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Get current event
    const event = await DB.prepare(`SELECT * FROM events WHERE id = ?`).bind(eventId).first();

    if (!event) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Event not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.json().catch(() => ({}));
    const { publish, allowEmptyLineup } = body;

    if (typeof publish !== "boolean") {
      return new Response(JSON.stringify({ error: "Bad request", message: "publish must be a boolean" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // allowEmptyLineup is an explicit opt-in to publish an event with zero
    // booked performances. "Lineup TBA" is a supported published state
    // (EventTimeline.jsx renders it for exactly this case), and announcing
    // an event before the lineup is booked -- to start accruing SEO runway,
    // e.g. -- is an intentional workflow, not an oversight the guard below
    // should categorically block. Validated the same way `publish` is
    // validated above: reject a non-boolean rather than coercing a truthy
    // string into an unlock.
    if (allowEmptyLineup !== undefined && typeof allowEmptyLineup !== "boolean") {
      return new Response(JSON.stringify({ error: "Bad request", message: "allowEmptyLineup must be a boolean" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.status === "archived") {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Archived events cannot be published or unpublished",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Determine new status
    const newStatus = publish ? "published" : "draft";

    // If publishing, check that event has at least 1 band
    if (publish) {
      const bandCount = await DB.prepare(`SELECT COUNT(*) as count FROM performances WHERE event_id = ?`)
        .bind(eventId)
        .first();

      if (bandCount.count === 0 && !allowEmptyLineup) {
        // `code` is additive -- `error`/`message` stay byte-for-byte identical
        // to the pre-override guard so existing callers see no behaviour
        // change. It exists so the admin UI can detect this specific
        // rejection and offer the override without string-matching `message`.
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Cannot publish event with no bands. Add at least one band first.",
            code: "EMPTY_LINEUP",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Update event status
    // Re-check status at write time: if a concurrent request archived this
    // event between the read above and this UPDATE, an unconditional write
    // would silently resurrect it by publishing/unpublishing over
    // 'archived' instead of the read-time check above catching it.
    const result = await DB.prepare(
      `
      UPDATE events
      SET status = ?, updated_by_user_id = ?
      WHERE id = ? AND status IN ('draft', 'published')
      RETURNING *
    `,
    )
      .bind(newStatus, currentUser.userId, eventId)
      .first();

    if (!result) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "Event status changed concurrently. Reload and try again.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Read-path sanitize (#493): RETURNING * echoes the full row, so
    // social_links may reflect a pre-#483 (or otherwise legacy) value.
    result.social_links = safeReflectSocialLinksString(result.social_links, ["instagram", "x", "tiktok"]);

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      publish ? "event.published" : "event.unpublished",
      "event",
      eventId,
      {
        name: event.name,
        status: newStatus,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
        message: publish ? "Event published successfully" : "Event unpublished successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error publishing/unpublishing event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update event publish status",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
