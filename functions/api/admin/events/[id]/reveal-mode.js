// Admin event reveal-mode endpoint
// POST /api/admin/events/{id}/reveal-mode
// Body: { reveal_mode: boolean }
// Returns: { success: true, event: { id, reveal_mode } }

import { checkPermission, auditLog } from "../../_middleware.js";
import { getClientIP } from "../../../../utils/request.js";

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const eventId = params.id;
  const ipAddress = getClientIP(request);

  try {
    const auth = await checkPermission(context, "editor");
    if (auth.error) {
      return auth.response;
    }

    const currentUser = auth.user;

    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({ error: "Bad request", message: "Invalid event ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.reveal_mode !== "boolean") {
      return new Response(
        JSON.stringify({ error: "Bad request", message: "reveal_mode (boolean) is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const event = await DB.prepare("SELECT id FROM events WHERE id = ?")
      .bind(eventId)
      .first();

    if (!event) {
      return new Response(
        JSON.stringify({ error: "Not found", message: "Event not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const newValue = body.reveal_mode ? 1 : 0;
    await DB.prepare(
      "UPDATE events SET reveal_mode = ?, updated_at = datetime('now'), updated_by_user_id = ? WHERE id = ?"
    )
      .bind(newValue, currentUser.userId, eventId)
      .run();

    await auditLog(
      env,
      currentUser.userId,
      newValue ? "event.reveal_mode.on" : "event.reveal_mode.off",
      "event",
      eventId,
      { event_id: eventId },
      ipAddress
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: { id: Number(eventId), reveal_mode: newValue },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[reveal-mode] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
