// Admin event duplication endpoint
// POST /api/admin/events/{id}/duplicate
// Body: { name, date, slug } — the new draft event's identity
// Returns: { success, event, bandsCopied, message }
//
// Copies an event's performances into a new unpublished draft. Lives in its own
// route file because Cloudflare Pages handlers match the path exactly — a
// sub-action like /duplicate is never delivered to the parent events/[id].js,
// so it needs a dedicated [id]/duplicate.js (mirrors publish.js / archive.js).

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP } from "../../../../utils/request.js";
import { safeReflectSocialLinksString, validateId } from "../../../../utils/validation.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Duplicating an event is an editor-and-above action.
    const permCheck = await checkPermission(context, "editor");
    if (permCheck.error) {
      return permCheck.response;
    }
    const currentUser = permCheck.user;

    const { valid, value: eventId, error: idError } = validateId(params.id);
    if (!valid) {
      return json({ error: "Bad request", message: idError }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const { name, date, slug } = body;

    if (!name || !date || !slug) {
      return json(
        {
          error: "Validation error",
          message: "Name, date, and slug are required for duplicate event",
        },
        400,
      );
    }

    // Source event to copy from.
    const originalEvent = await DB.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first();

    if (!originalEvent) {
      return json({ error: "Not found", message: "Original event not found" }, 404);
    }

    // Slug is unique — reject before inserting.
    const existingEvent = await DB.prepare("SELECT id FROM events WHERE slug = ?").bind(slug).first();

    if (existingEvent) {
      return json({ error: "Conflict", message: "An event with this slug already exists" }, 409);
    }

    // Create the new event as an unpublished draft, carrying over the source's
    // descriptive fields but not its publish state.
    const newEvent = await DB.prepare(
      `INSERT INTO events (
         name, date, slug, status, is_published, description, city,
         ticket_url, venue_info, social_links, theme_colors, created_by_user_id
       )
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
      .bind(
        name,
        date,
        slug,
        "draft",
        originalEvent.description || null,
        originalEvent.city || null,
        originalEvent.ticket_url || null,
        originalEvent.venue_info || null,
        originalEvent.social_links || null,
        originalEvent.theme_colors || null,
        currentUser.userId,
      )
      .first();

    if (!newEvent) {
      throw new Error("events INSERT returned null");
    }

    // Read-path sanitize (#493): social_links is copied verbatim from the
    // source event (INSERT ... originalEvent.social_links), so it may carry
    // a pre-#483 (or otherwise legacy) value. Sanitize what's reflected back
    // here; every other admin read path is sanitized too, so the stored
    // duplicate is never echoed unsanitized regardless of which one serves
    // a later request.
    newEvent.social_links = safeReflectSocialLinksString(newEvent.social_links, ["instagram", "x", "tiktok"]);

    // Copy performances. If the copy fails, compensate by deleting the new event
    // so we never leave an empty orphan draft behind (D1 has no BEGIN/COMMIT).
    try {
      await DB.prepare(
        `INSERT INTO performances (event_id, venue_id, band_profile_id, start_time, end_time, notes)
         SELECT ?, venue_id, band_profile_id, start_time, end_time, notes
         FROM performances
         WHERE event_id = ?`,
      )
        .bind(newEvent.id, eventId)
        .run();
    } catch (copyError) {
      await DB.prepare("DELETE FROM events WHERE id = ?").bind(newEvent.id).run();
      throw copyError;
    }

    const bandCount = await DB.prepare("SELECT COUNT(*) as count FROM performances WHERE event_id = ?")
      .bind(newEvent.id)
      .first();

    await auditLog(
      env,
      currentUser.userId,
      "event.duplicated",
      "event",
      newEvent.id,
      {
        name: newEvent.name,
        originalEventId: eventId,
        bandsCopied: bandCount.count,
      },
      ipAddress,
    );

    return json(
      {
        success: true,
        event: newEvent,
        bandsCopied: bandCount.count,
        message: `Event duplicated successfully with ${bandCount.count} bands`,
      },
      201,
    );
  } catch (error) {
    console.error("Error duplicating event:", error);
    return json({ error: "Database error", message: "Failed to duplicate event" }, 500);
  }
}
