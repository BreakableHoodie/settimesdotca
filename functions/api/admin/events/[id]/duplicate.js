// Admin event duplication endpoint
// POST /api/admin/events/{id}/duplicate
// Body: { name, date, slug } — the new draft event's identity
// Returns: { success, event, bands_copied, message }
//
// Copies an event's performances into a new unpublished draft. Lives in its own
// route file because Cloudflare Pages handlers match the path exactly — a
// sub-action like /duplicate is never delivered to the parent events/[id].js,
// so it needs a dedicated [id]/duplicate.js (mirrors publish.js / archive.js).

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP, parseJsonObjectBody } from "../../../../utils/request.js";
import { normalizeHttpUrl, safeReflectSocialLinksString, validateId } from "../../../../utils/validation.js";

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

    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return new Response(JSON.stringify({ error: "Bad request", message: "Request body must be a JSON object" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
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
    // descriptive fields but not its publish state. doors_json is deliberately
    // NOT in this column list: the new event has a different date (and
    // possibly no end_date at all), so the source's date-keyed doors times
    // would no longer fall within the new event's festival-day span and
    // would fail validateDoorsJson on the next edit anyway (#569). poster_url
    // is excluded for the same "edition-specific" reasoning (#616) — a new
    // edition gets its own poster, not the source event's. Leaving both out
    // of INSERT defaults the columns to NULL — start clean.
    const newEvent = await DB.prepare(
      `INSERT INTO events (
         name, date, slug, status, description, city,
         ticket_url, venue_info, social_links, theme_colors, created_by_user_id
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
      .bind(
        name,
        date,
        slug,
        "draft",
        originalEvent.description || null,
        originalEvent.city || null,
        normalizeHttpUrl(originalEvent.ticket_url || null),
        originalEvent.venue_info || null,
        safeReflectSocialLinksString(originalEvent.social_links || null, ["instagram", "x", "tiktok"]),
        originalEvent.theme_colors || null,
        currentUser.userId,
      )
      .first();

    if (!newEvent) {
      throw new Error("events INSERT returned null");
    }

    // Read-path sanitize (#493): the INSERT above already stores a sanitized
    // copy of social_links (#499) and ticket_url (#504), so this row can no
    // longer carry a stale pre-guard value. This reflection sanitize stays
    // anyway for consistency with every other admin read path (each
    // RETURNING * / SELECT * echo is sanitized independently), so a future
    // write path that skips sanitization still can't leak an unsafe value
    // through this response.
    newEvent.social_links = safeReflectSocialLinksString(newEvent.social_links, ["instagram", "x", "tiktok"]);
    newEvent.ticket_url = normalizeHttpUrl(newEvent.ticket_url);
    // Always NULL here (poster_url is excluded from INSERT above, #616) —
    // sanitized anyway for consistency with every other admin read path.
    newEvent.poster_url = normalizeHttpUrl(newEvent.poster_url);

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
        bands_copied: bandCount.count,
        message: `Event duplicated successfully with ${bandCount.count} bands`,
      },
      201,
    );
  } catch (error) {
    console.error("Error duplicating event:", error);
    return json({ error: "Database error", message: "Failed to duplicate event" }, 500);
  }
}
