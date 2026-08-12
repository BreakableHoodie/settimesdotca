// Admin specific event operations
// PATCH /api/admin/events/{id} - Update event details
// PUT /api/admin/events/{id}/publish - Toggle publish status
// POST /api/admin/events/{id}/duplicate - Duplicate event
// DELETE /api/admin/events/{id} - Delete event

import { checkPermission, auditLog } from "../_middleware.js";
import {
  FIELD_LIMITS,
  isValidURL,
  normalizeHttpUrl,
  safeReflectSocialLinksString,
  sanitizeEventSocialLinks,
  sanitizeString,
  sanitizeVenueInfo,
  validateDate,
  validateDoorsJson,
} from "../../../utils/validation.js";
import { getClientIP } from "../../../utils/request.js";

// Helper to extract event ID from path
function getEventId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("events") + 1;
  return parts[idIndex];
}

function parseJsonField(value, label) {
  if (value === undefined) {
    return { value: undefined };
  }

  if (value === null || value === "") {
    return { value: null };
  }

  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return { value };
    } catch {
      return { error: `${label} must be valid JSON` };
    }
  }

  if (typeof value === "object") {
    try {
      return { value: JSON.stringify(value) };
    } catch {
      return { error: `${label} must be valid JSON` };
    }
  }

  return { error: `${label} must be valid JSON` };
}

// PATCH - Update event details (editor and admin only)
export async function onRequestPatch(context) {
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
    if (body.ticketLink && !body.ticket_url) {
      body.ticket_url = body.ticketLink;
    }
    const {
      name,
      date,
      end_date,
      status,
      description,
      city,
      ticket_url,
      poster_url,
      venue_info,
      social_links,
      theme_colors,
      doors_json,
    } = body;

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];

    if (body.slug !== undefined && body.slug !== event.slug) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Slug cannot be changed after creation",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (name !== undefined) {
      if (name.trim().length < 3) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Name must be at least 3 characters",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      updates.push("name = ?");
      params.push(name);
    }

    if (date !== undefined) {
      const dateResult = validateDate(date);
      if (!dateResult.valid) {
        return new Response(JSON.stringify({ error: "Validation error", message: dateResult.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      updates.push("date = ?");
      params.push(date);
    }

    if (end_date !== undefined) {
      const normalizedEndDate = end_date || null;
      if (normalizedEndDate !== null) {
        const endDateResult = validateDate(normalizedEndDate);
        if (!endDateResult.valid) {
          return new Response(JSON.stringify({ error: "Validation error", message: endDateResult.error }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const effectiveStartDate = date ?? event.date;
        if (normalizedEndDate < effectiveStartDate) {
          return new Response(
            JSON.stringify({ error: "Validation error", message: "End date must be on or after the event start date" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      updates.push("end_date = ?");
      params.push(normalizedEndDate);
    }

    if (status !== undefined) {
      // Validate status
      if (!["draft", "published", "archived"].includes(status)) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Status must be: draft, published, or archived",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (status === "archived") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Use the dedicated archive action to archive events",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      // Archiving is one-way: once a row is archived, its status must never
      // change via PATCH, including a request that targets draft/published.
      // Without this guard, PATCH {status: "published"} on an archived event
      // silently un-archives and republishes it -- the same resurrection bug
      // the PUT toggle and the dedicated publish endpoint already reject.
      if (event.status === "archived") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Archived events cannot change status",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      updates.push("status = ?");
      params.push(status);
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Description must be a string",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const sanitized = description ? sanitizeString(description) : "";
      if (sanitized.length > FIELD_LIMITS.eventDescription.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `Description must be no more than ${FIELD_LIMITS.eventDescription.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("description = ?");
      params.push(sanitized || null);
    }

    if (city !== undefined) {
      if (city !== null && typeof city !== "string") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "City must be a string",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const sanitized = city ? sanitizeString(city) : "";
      if (sanitized.length > FIELD_LIMITS.eventCity.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `City must be no more than ${FIELD_LIMITS.eventCity.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("city = ?");
      params.push(sanitized || null);
    }

    if (ticket_url !== undefined) {
      if (ticket_url !== null && typeof ticket_url !== "string") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Ticket link must be a string",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const trimmed = ticket_url ? ticket_url.trim() : "";
      if (trimmed && !isValidURL(trimmed)) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Ticket link must be a valid URL",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (trimmed.length > FIELD_LIMITS.ticketLink.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `Ticket link must be no more than ${FIELD_LIMITS.ticketLink.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("ticket_url = ?");
      params.push(trimmed || null);
    }

    if (poster_url !== undefined) {
      if (poster_url !== null && typeof poster_url !== "string") {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Poster image must be a string",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      const trimmed = poster_url ? poster_url.trim() : "";
      if (trimmed && !isValidURL(trimmed)) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Poster image must be a valid URL",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (trimmed.length > FIELD_LIMITS.eventPosterUrl.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `Poster image must be no more than ${FIELD_LIMITS.eventPosterUrl.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      // #616: unlike ticket_url above, poster_url is normalized on write too
      // (not just read-reflected) — the design spec calls for it explicitly,
      // and it's cheap since normalizeHttpUrl(validURL) is a no-op reparse.
      updates.push("poster_url = ?");
      params.push(normalizeHttpUrl(trimmed) || null);
    }

    if (venue_info !== undefined) {
      try {
        const sanitizedVenueInfo = sanitizeVenueInfo(venue_info);
        if (sanitizedVenueInfo && sanitizedVenueInfo.length > FIELD_LIMITS.eventVenueInfo.max) {
          return new Response(
            JSON.stringify({
              error: "Validation error",
              message: `Venue info must be no more than ${FIELD_LIMITS.eventVenueInfo.max} characters`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        updates.push("venue_info = ?");
        params.push(sanitizedVenueInfo ?? null);
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: error.message,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (social_links !== undefined) {
      try {
        const sanitizedSocialLinks = sanitizeEventSocialLinks(social_links);
        if (sanitizedSocialLinks && sanitizedSocialLinks.length > FIELD_LIMITS.eventSocialLinks.max) {
          return new Response(
            JSON.stringify({
              error: "Validation error",
              message: `Social links must be no more than ${FIELD_LIMITS.eventSocialLinks.max} characters`,
            }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        updates.push("social_links = ?");
        params.push(sanitizedSocialLinks ?? null);
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: error.message,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (theme_colors !== undefined) {
      const parsed = parseJsonField(theme_colors, "Theme colors");
      if (parsed.error) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: parsed.error,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (typeof parsed.value === "string" && parsed.value.length > FIELD_LIMITS.eventThemeColors.max) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: `Theme colors must be no more than ${FIELD_LIMITS.eventThemeColors.max} characters`,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("theme_colors = ?");
      params.push(parsed.value ?? null);
    }

    if (doors_json !== undefined) {
      // Validate against the EFFECTIVE date span — if this same request also
      // changes date/end_date, doors_json must be checked against the new
      // span, not the stale one on `event` (mirrors the end_date block above).
      const effectiveDate = date !== undefined ? date : event.date;
      const effectiveEndDate = end_date !== undefined ? end_date || null : event.end_date;
      const doorsCheck = validateDoorsJson(doors_json, { date: effectiveDate, end_date: effectiveEndDate });
      if (!doorsCheck.valid) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: doorsCheck.error,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      updates.push("doors_json = ?");
      params.push(doorsCheck.value);
    }

    // Always update updated_by_user_id
    updates.push("updated_by_user_id = ?");
    params.push(currentUser.userId);

    // Add event ID as the last parameter
    params.push(eventId);

    if (updates.length === 1) {
      // Only updated_by_user_id, no actual changes
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "No fields to update",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // When this PATCH writes `status`, re-check the status at write time for
    // the same reason the PUT toggle, publish.js and archive.js do: the
    // archived guard above read the row at the top of the handler, and a
    // concurrent archive committing in that gap would otherwise be silently
    // overwritten. The predicate is conditional because PATCHing an archived
    // event's OTHER fields (description, poster, venue info) is legitimate and
    // deliberately still allowed — only a status change is one-way.
    const patchesStatus = status !== undefined;
    const statusGuardSql = patchesStatus ? " AND status IN ('draft', 'published')" : "";
    const result = await DB.prepare(`UPDATE events SET ${updates.join(", ")} WHERE id = ?${statusGuardSql} RETURNING *`)
      .bind(...params)
      .first();

    // A null result is only reachable by concurrent mutation, and it must be
    // handled: every line below dereferences `result`, so falling through
    // would turn a lost race into a 500.
    if (!result) {
      return patchesStatus
        ? new Response(
            JSON.stringify({
              error: "Conflict",
              message: "Event status changed concurrently. Reload and try again.",
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          )
        : new Response(JSON.stringify({ error: "Not found", message: "Event not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
    }

    // Read-path sanitize (#493): RETURNING * echoes the full row, so
    // social_links may reflect a pre-#483 (or otherwise legacy) value even
    // when this request didn't touch social_links itself. poster_url gets
    // the same #504-style read-reflect as ticket_url (#616).
    result.social_links = safeReflectSocialLinksString(result.social_links, ["instagram", "x", "tiktok"]);
    result.poster_url = normalizeHttpUrl(result.poster_url);

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "event.updated",
      "event",
      eventId,
      {
        name: name || event.name,
        changes: { name, date, status, slug: body.slug },
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: result,
        message: "Event updated successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update event",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// PUT - Toggle publish status (editor and admin only)
export async function onRequestPut(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
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

    // Check if this is a publish request
    if (url.pathname.endsWith("/publish")) {
      // Get current event
      const event = await DB.prepare(
        `
        SELECT * FROM events WHERE id = ?
      `,
      )
        .bind(eventId)
        .first();

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

      // Toggle publish status. Previously this flipped on the deprecated
      // publish-boolean column, which could disagree with status (e.g. an
      // archived event always had that column cleared — see archive.js) and
      // would silently RESURRECT an archived event as "published" the next
      // time this toggle ran. status is now the only source of truth (#799),
      // so archived is rejected outright, matching the dedicated POST
      // .../publish endpoint's guard — an archived event must never become
      // published through this toggle.
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
      // Deliberately no band-count check here, unlike POST .../publish. This
      // toggle carries no lineup requirement at all -- adding one would be a
      // NEW restriction (this endpoint never had one), not a fix, and would
      // make this route stricter than its sibling instead of matching it.
      // POST .../publish is the guarded path, and its guard is bypassable via
      // an explicit `allowEmptyLineup: true` on that endpoint (a supported
      // "Lineup TBA" publish, e.g. announcing an event before booking is
      // complete) -- don't "fix" the asymmetry by tightening this toggle;
      // that would block the same workflow the other endpoint's override
      // exists to allow.
      const nextStatus = event.status === "published" ? "draft" : "published";
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
        .bind(nextStatus, currentUser.userId, eventId)
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

      // Read-path sanitize (#493): see the PATCH handler above.
      result.social_links = safeReflectSocialLinksString(result.social_links, ["instagram", "x", "tiktok"]);
      result.poster_url = normalizeHttpUrl(result.poster_url);

      // Audit log
      await auditLog(
        env,
        currentUser.userId,
        nextStatus === "published" ? "event.published" : "event.unpublished",
        "event",
        eventId,
        {
          name: event.name,
        },
        ipAddress,
      );

      return new Response(
        JSON.stringify({
          success: true,
          event: result,
          message: nextStatus === "published" ? "Event published" : "Event unpublished",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: "Not found",
        message: "Unknown operation",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating event:", error);

    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update event",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

// DELETE - Delete event (admin only)
export async function onRequestDelete(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  try {
    // Check permission (admin only)
    const permCheck = await checkPermission(context, "admin");
    if (permCheck.error) {
      return permCheck.response;
    }

    const currentUser = permCheck.user;
    const eventId = getEventId(request);
    const eventIdNum = parseInt(eventId);

    if (isNaN(eventIdNum)) {
      return new Response(JSON.stringify({ error: "Invalid event ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if event exists
    const event = await DB.prepare("SELECT id, name FROM events WHERE id = ?").bind(eventIdNum).first();

    if (!event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if event has any performances (for informational message)
    const performanceCount = await DB.prepare("SELECT COUNT(*) as count FROM performances WHERE event_id = ?")
      .bind(eventIdNum)
      .first();

    const body = await request.json().catch(() => ({}));
    const url = new URL(request.url);
    const confirmCascade = body?.confirmCascade === true || url.searchParams.get("confirmCascade") === "true";

    if (performanceCount.count > 0 && !confirmCascade) {
      return new Response(
        JSON.stringify({
          error: "Confirmation required",
          message:
            "Deleting this event will permanently remove associated performance records. Repeat the request with confirmCascade=true to continue.",
          affected_performance_count: performanceCount.count,
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Delete the event (performance records are removed automatically via ON DELETE CASCADE)
    await DB.prepare("DELETE FROM events WHERE id = ?").bind(eventIdNum).run();

    // Audit log
    await auditLog(
      env,
      currentUser.userId,
      "event.deleted",
      "event",
      eventIdNum,
      {
        name: event.name,
        performanceCount: performanceCount.count,
      },
      ipAddress,
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Event "${event.name}" deleted successfully${performanceCount.count > 0 ? ` (${performanceCount.count} performance record(s) were permanently deleted with this event)` : ""}`,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Delete event error:", error);
    return new Response(
      JSON.stringify({
        error: "Database operation failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
