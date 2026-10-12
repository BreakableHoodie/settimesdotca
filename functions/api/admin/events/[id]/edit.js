// Admin event editing endpoint
// PUT /api/admin/events/{id}/edit
// Body: { name, date, slug }
// Returns: { success: true, event: {...} } or error

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP, parseJsonObjectBody } from "../../../../utils/request.js";
import {
  safeReflectSocialLinksString,
  validateEntity,
  validateId,
  validationErrorResponse,
  VALIDATION_SCHEMAS,
} from "../../../../utils/validation.js";

// Same field rules as event creation (events.js), reused rather than retyped so
// an edit cannot accept a slug that create would reject (#1276). A slug lands
// unescaped in the sitemap <loc> and in email hrefs, so format is a security
// control here, not cosmetics. Renaming is still allowed -- only the shape is
// enforced.
const { name: nameRules, slug: slugRules, date: dateRules } = VALIDATION_SCHEMAS.event;
const IDENTITY_SCHEMA = { name: nameRules, slug: slugRules, date: dateRules };

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const { valid, value: eventId, error: idError } = validateId(params.id);
  if (!valid) {
    return new Response(JSON.stringify({ error: idError }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const ipAddress = getClientIP(request);

  try {
    const auth = await checkPermission(context, "editor");
    if (auth.error) {
      return auth.response;
    }

    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return new Response(
        JSON.stringify({ error: "Validation error", message: "Request body must be a JSON object" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    const { ticket_url } = body;
    let { name, date, slug } = body;

    // Validation
    if (!name || !date || !slug) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Name, date, and slug are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Format/length rules for name, date and slug (#1276). Use the sanitized
    // values for the write: they are what the rules were actually applied to.
    const identity = validateEntity({ name, date, slug }, IDENTITY_SCHEMA);
    if (!identity.valid) {
      return validationErrorResponse(Object.values(identity.errors)[0], { fields: identity.errors });
    }
    ({ name, date, slug } = identity.sanitized);

    // Validate ticket_url URL if provided
    if (ticket_url && !ticket_url.match(/^https?:\/\//)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Ticket link must be a valid URL starting with http:// or https://",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if event exists
    const existingEvent = await DB.prepare("SELECT * FROM events WHERE id = ?").bind(eventId).first();

    if (!existingEvent) {
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

    // Check if slug is already taken by another event
    if (slug !== existingEvent.slug) {
      const slugCheck = await DB.prepare("SELECT id FROM events WHERE slug = ? AND id != ?")
        .bind(slug, eventId)
        .first();

      if (slugCheck) {
        return new Response(
          JSON.stringify({
            error: "Conflict",
            message: "An event with this slug already exists",
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Update event
    const result = await DB.prepare(
      `
      UPDATE events
      SET name = ?, date = ?, slug = ?, ticket_url = ?
      WHERE id = ?
      RETURNING *
    `,
    )
      .bind(name, date, slug, ticket_url || null, eventId)
      .first();

    // Read-path sanitize (#493): RETURNING * echoes the full row, so
    // social_links may reflect a pre-#483 (or otherwise legacy) value even
    // though this endpoint doesn't touch that column itself.
    result.social_links = safeReflectSocialLinksString(result.social_links, ["instagram", "x", "tiktok"]);

    await auditLog(
      env,
      auth.user.userId,
      "event.updated",
      "event",
      eventId,
      {
        name,
        date,
        slug,
        ticket_url: ticket_url || null,
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
    console.error("Event edit error:", error);
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
