// Public API: Track schedule builds
// POST /api/schedule/build
// Body: { event_id: number, band_ids?: number[], performance_ids?: number[], user_session: string }

const MAX_USER_SESSION_LENGTH = 128;
const MAX_PERFORMANCE_IDS = 50;

function isSafeSessionId(value) {
  if (!value || typeof value !== "string") return false;
  return /^[A-Za-z0-9_-]+$/.test(value);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const body = await request.json().catch(() => ({}));
    const eventId = Number(body.event_id);
    const userSession = typeof body.user_session === "string" ? body.user_session.trim() : "";
    const performanceIdsInput = Array.isArray(body.performance_ids)
      ? body.performance_ids
      : Array.isArray(body.band_ids)
        ? body.band_ids
        : body.band_ids != null
          ? [body.band_ids]
          : [];

    if (!Number.isFinite(eventId)) {
      return new Response(
        JSON.stringify({ error: "Invalid event_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      !userSession ||
      userSession.length > MAX_USER_SESSION_LENGTH ||
      !isSafeSessionId(userSession)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid user_session" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (performanceIdsInput.length > MAX_PERFORMANCE_IDS) {
      return new Response(
        JSON.stringify({ error: "Too many performance_ids provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const performanceIds = performanceIdsInput
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));

    if (performanceIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "No performance_ids provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const statements = performanceIds.map((performanceId) =>
      DB.prepare(
        `
        INSERT OR IGNORE INTO schedule_builds (event_id, performance_id, user_session)
        VALUES (?, ?, ?)
      `,
      ).bind(eventId, performanceId, userSession),
    );

    try {
      await DB.batch(statements);
    } catch (error) {
      if (!String(error).includes("performance_id")) {
        throw error;
      }

      const legacyStatements = performanceIds.map((performanceId) =>
        DB.prepare(
          `
          INSERT OR IGNORE INTO schedule_builds (event_id, band_id, user_session)
          VALUES (?, ?, ?)
        `,
        ).bind(eventId, performanceId, userSession),
      );

      await DB.batch(legacyStatements);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Schedule build tracking error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to record schedule build" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
