// Metrics ingestion endpoint
// POST /api/metrics
// Privacy-first: no PII, aggregated only

const ALLOWED_EVENTS = new Set([
  "page_view",
  "event_view",
  "artist_profile_view",
  "social_link_click",
  "share_event",
  "filter_use",
]);

const SAFE_KEYS = new Set(["band_profile_id", "event_id", "link_type", "page"]);

function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.event || typeof raw.event !== "string") return null;
  if (!ALLOWED_EVENTS.has(raw.event)) return null;

  const safeProps = {};
  if (raw.props && typeof raw.props === "object") {
    for (const key of SAFE_KEYS) {
      if (raw.props[key] !== undefined && raw.props[key] !== null) {
        safeProps[key] = raw.props[key];
      }
    }
  }

  return {
    event: raw.event,
    props: safeProps,
  };
}

function parseInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json().catch(() => null);
    const rawEvents = Array.isArray(payload?.events) ? payload.events : [];

    if (rawEvents.length === 0) {
      return new Response("OK", { status: 200 });
    }

    const validEvents = rawEvents
      .map(sanitizeEvent)
      .filter(Boolean)
      .slice(0, 50);

    if (validEvents.length === 0) {
      return new Response("OK", { status: 200 });
    }

    if (env.ANALYTICS) {
      for (const event of validEvents) {
        env.ANALYTICS.writeDataPoint({
          blobs: [
            event.event,
            String(event.props?.band_profile_id ?? ""),
            String(event.props?.event_id ?? ""),
            String(event.props?.link_type ?? ""),
            String(event.props?.page ?? ""),
          ],
          doubles: [Date.now()],
          indexes: [event.event],
        });
      }
    }

    if (env.DB) {
      const today = new Date().toISOString().split("T")[0];
      const bandViewCounts = new Map();
      const socialClickCounts = new Map();

      for (const event of validEvents) {
        if (event.event === "artist_profile_view") {
          const bandId = parseInteger(event.props?.band_profile_id);
          if (bandId) {
            bandViewCounts.set(bandId, (bandViewCounts.get(bandId) || 0) + 1);
          }
        }

        if (event.event === "social_link_click") {
          const bandId = parseInteger(event.props?.band_profile_id);
          if (bandId) {
            socialClickCounts.set(
              bandId,
              (socialClickCounts.get(bandId) || 0) + 1,
            );
          }
        }
      }

      const stmts = [];

      for (const [bandId, count] of bandViewCounts.entries()) {
        stmts.push(
          env.DB.prepare(
            `
          INSERT INTO artist_daily_stats (band_profile_id, date, page_views)
          VALUES (?, ?, ?)
          ON CONFLICT (band_profile_id, date)
          DO UPDATE SET page_views = page_views + ?
        `,
          ).bind(bandId, today, count, count),
        );
      }

      for (const [bandId, count] of socialClickCounts.entries()) {
        stmts.push(
          env.DB.prepare(
            `
          INSERT INTO artist_daily_stats (band_profile_id, date, social_clicks)
          VALUES (?, ?, ?)
          ON CONFLICT (band_profile_id, date)
          DO UPDATE SET social_clicks = social_clicks + ?
        `,
          ).bind(bandId, today, count, count),
        );
      }

      if (stmts.length > 0) {
        await env.DB.batch(stmts);
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("[Metrics] Ingestion error:", error);
    return new Response("OK", { status: 200 });
  }
}
