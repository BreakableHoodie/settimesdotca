// Metrics ingestion endpoint
// POST /api/metrics
// Privacy-first: no PII, aggregated only

import { logger } from "../utils/logger.js";
import { eventLocalToday } from "../utils/eventDay.js";

const MAX_BATCH_STATEMENTS = 20;

const ALLOWED_EVENTS = new Set([
  "page_view",
  "event_view",
  "artist_profile_view",
  "social_link_click",
  "ticket_click",
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

async function executeInChunks(db, statements, chunkSize = MAX_BATCH_STATEMENTS) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize));
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json().catch(() => null);
    const rawEvents = Array.isArray(payload?.events) ? payload.events : [];

    if (rawEvents.length === 0) {
      return new Response("OK", { status: 200 });
    }

    const validEvents = rawEvents.map(sanitizeEvent).filter(Boolean).slice(0, 50);

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
      // Toronto-local, not UTC-sliced: new Date().toISOString() flips to the
      // next day at 8 PM Eastern, which misattributed evening traffic to
      // tomorrow's date key (CLAUDE.md "Server-side 'today'/'now' is
      // Toronto-local", #668).
      const today = eventLocalToday();
      const bandViewCounts = new Map();
      const socialClickCounts = new Map();
      const pageCounts = new Map(); // page path → count
      // `share_event` and `filter_use` are allowlisted but deliberately have no
      // consumer. A share CREATE is a share_links row and a share VIEW
      // increments share_links.view_count, so persisting share_event here would
      // double-count it — CLAUDE.md "Metrics & Analytics" forbids wiring it up.
      // `filter_use` has no decision attached to it yet; it stays allowlisted so
      // clients already emitting it are not rejected. Tracked in #706.
      const eventViewCounts = new Map();
      const ticketClickCounts = new Map();

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
            socialClickCounts.set(bandId, (socialClickCounts.get(bandId) || 0) + 1);
          }
        }

        if (event.event === "page_view") {
          const page = String(event.props?.page || "/").slice(0, 255);
          pageCounts.set(page, (pageCounts.get(page) || 0) + 1);
        }

        if (event.event === "event_view") {
          const eventId = parseInteger(event.props?.event_id);
          if (eventId) {
            eventViewCounts.set(eventId, (eventViewCounts.get(eventId) || 0) + 1);
          }
        }

        if (event.event === "ticket_click") {
          const eventId = parseInteger(event.props?.event_id);
          if (eventId) {
            ticketClickCounts.set(eventId, (ticketClickCounts.get(eventId) || 0) + 1);
          }
        }
      }

      // Merge view and click counts per band into a single upsert each
      const allBandIds = new Set([...bandViewCounts.keys(), ...socialClickCounts.keys()]);

      const stmts = [];
      for (const bandId of allBandIds) {
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

      if (stmts.length > 0) {
        await executeInChunks(env.DB, stmts);
      }

      // Store page views in a separate batch so a missing
      // page_views_daily table doesn't break artist_daily_stats writes.
      // Only real path keys (page_view events) are written here — event_view
      // and ticket_click are keyed by event_id, not path, and are written to
      // their own event_daily_stats table below (#706). Mixing event_id-keyed
      // synthetic keys into this path-keyed table previously double-counted
      // the same view under two key formats (#445) — keep the two tables
      // separate.
      const pvStmts = [];
      for (const [page, count] of pageCounts) {
        pvStmts.push(
          env.DB.prepare(
            `INSERT INTO page_views_daily (page, date, views)
             VALUES (?, ?, ?)
             ON CONFLICT (page, date)
             DO UPDATE SET views = views + ?`,
          ).bind(page, today, count, count),
        );
      }

      if (pvStmts.length > 0) {
        try {
          await executeInChunks(env.DB, pvStmts);
        } catch (err) {
          logger.warn("page_views_daily upsert failed (table may be missing or write error)", {
            error: err,
            statementCount: pvStmts.length,
          });
        }
      }

      // event_view (event-page traffic) and ticket_click (the site's
      // highest-value conversion signal) both attribute per event_id via
      // event_daily_stats (#706). Previously allowlisted, validated, and
      // rate-limited but never consumed — every one was silently dropped.
      // Isolated in its own batch/try-catch so a missing table or write error
      // can't break the artist/page-view writes above (best-effort,
      // fire-and-forget — CLAUDE.md "Metrics & Analytics").
      // FK guard. event_daily_stats has FOREIGN KEY (event_id) REFERENCES
      // events(id), and _middleware.js sets PRAGMA foreign_keys = ON for every
      // mutating request. DB.batch() is atomic, so a SINGLE unknown event_id
      // fails the whole chunk and rolls back every valid row alongside it.
      // event_id is client-supplied and only integer-validated, so a stale
      // client or a crafted payload could otherwise wipe real metrics. Resolve
      // against events first and keep only ids that exist.
      const candidateIds = [...new Set([...eventViewCounts.keys(), ...ticketClickCounts.keys()])];
      let allEventIds = [];
      if (candidateIds.length > 0) {
        try {
          const placeholders = candidateIds.map(() => "?").join(",");
          const { results } = await env.DB.prepare(`SELECT id FROM events WHERE id IN (${placeholders})`)
            .bind(...candidateIds)
            .all();
          allEventIds = (results || []).map((row) => row.id);
        } catch (err) {
          logger.warn("event_daily_stats id resolution failed; skipping event stats for this batch", { error: err });
        }
      }

      const eventStmts = [];
      for (const eventId of allEventIds) {
        const views = eventViewCounts.get(eventId) || 0;
        const clicks = ticketClickCounts.get(eventId) || 0;

        eventStmts.push(
          env.DB.prepare(
            `INSERT INTO event_daily_stats (event_id, date, event_views, ticket_clicks)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (event_id, date)
             DO UPDATE SET event_views = event_views + ?, ticket_clicks = ticket_clicks + ?`,
          ).bind(eventId, today, views, clicks, views, clicks),
        );
      }

      if (eventStmts.length > 0) {
        try {
          await executeInChunks(env.DB, eventStmts);
        } catch (err) {
          logger.warn("event_daily_stats upsert failed (table may be missing or write error)", {
            error: err,
            statementCount: eventStmts.length,
          });
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("Metrics ingestion error", { error });
    return new Response("OK", { status: 200 });
  }
}
