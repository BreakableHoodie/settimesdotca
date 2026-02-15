// Metrics ingestion endpoint
// POST /api/metrics
// Privacy-first: no PII, aggregated only

const MAX_BATCH_STATEMENTS = 20;

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
      const pageCounts = new Map(); // page path → count
      const eventViewCounts = new Map(); // event_id → count

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

        if (event.event === "page_view") {
          const page = String(event.props?.page || "/").slice(0, 255);
          pageCounts.set(page, (pageCounts.get(page) || 0) + 1);
        }

        if (event.event === "event_view") {
          const eventId = parseInteger(event.props?.event_id);
          if (eventId) {
            eventViewCounts.set(
              eventId,
              (eventViewCounts.get(eventId) || 0) + 1,
            );
          }
        }
      }

      // Merge view and click counts per band into a single upsert each
      const allBandIds = new Set([
        ...bandViewCounts.keys(),
        ...socialClickCounts.keys(),
      ]);

      const stmts = [];
      for (const bandId of allBandIds) {
        if (stmts.length >= MAX_BATCH_STATEMENTS) break;

        const views = bandViewCounts.get(bandId) || 0;
        const clicks = socialClickCounts.get(bandId) || 0;

        stmts.push(
          env.DB.prepare(
            `INSERT INTO artist_daily_stats (band_profile_id, date, page_views, social_clicks)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (band_profile_id, date)
             DO UPDATE SET page_views = page_views + ?, social_clicks = social_clicks + ?`,
          ).bind(bandId, today, views, clicks, views, clicks),
        );
      }

      // Store page views and event views
      for (const [page, count] of pageCounts) {
        if (stmts.length >= MAX_BATCH_STATEMENTS) break;
        stmts.push(
          env.DB.prepare(
            `INSERT INTO page_views_daily (page, date, views)
             VALUES (?, ?, ?)
             ON CONFLICT (page, date)
             DO UPDATE SET views = views + ?`,
          ).bind(page, today, count, count),
        );
      }

      for (const [eventId, count] of eventViewCounts) {
        if (stmts.length >= MAX_BATCH_STATEMENTS) break;
        stmts.push(
          env.DB.prepare(
            `INSERT INTO page_views_daily (page, date, views)
             VALUES (?, ?, ?)
             ON CONFLICT (page, date)
             DO UPDATE SET views = views + ?`,
          ).bind(`event:${eventId}`, today, count, count),
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
