// Metrics ingestion endpoint
// POST /api/metrics
// Privacy-first: no PII, aggregated only

import { logger } from "../utils/logger.js";
import { eventLocalToday, eventLocalFestivalToday, eventLocalClock } from "../utils/eventDay.js";
import { parseJsonObjectBody } from "../utils/request.js";

const MAX_BATCH_STATEMENTS = 20;

const ALLOWED_EVENTS = new Set([
  "page_view",
  "event_view",
  "artist_profile_view",
  "social_link_click",
  "ticket_click",
  "visit",
]);

const SAFE_KEYS = new Set(["band_profile_id", "event_id", "link_type", "page", "referrer_bucket"]);

const REFERRER_BUCKETS = new Set(["instagram", "facebook", "google", "other_search", "direct", "other"]);

// Props come from the browser and flow into Analytics Engine blobs, which cap
// a datapoint at 16 KB. Every real value is a short path, link type, id or
// referrer bucket, so a string is truncated here and anything that is not a
// finite number or a string is dropped.
const MAX_PROP_LENGTH = 200;

function sanitizePropValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, MAX_PROP_LENGTH);
  return undefined;
}

function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!raw.event || typeof raw.event !== "string") return null;
  if (!ALLOWED_EVENTS.has(raw.event)) return null;

  const safeProps = {};
  if (raw.props && typeof raw.props === "object") {
    for (const key of SAFE_KEYS) {
      const value = sanitizePropValue(raw.props[key]);
      if (value !== undefined) {
        safeProps[key] = value;
      }
    }
  }

  if (raw.event === "visit") {
    if (!REFERRER_BUCKETS.has(safeProps.referrer_bucket)) return null;
  } else {
    delete safeProps.referrer_bucket;
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

// Every D1 write for one beacon. Each table is written in its own try/catch,
// so this never rejects for a write failure; the caller's catch is a backstop.
async function recordToD1(env, validEvents) {
  // Toronto-local, not UTC-sliced: new Date().toISOString() flips to the
  // next day at 8 PM Eastern, which misattributed evening traffic to
  // tomorrow's date key (CLAUDE.md "Server-side 'today'/'now' is
  // Toronto-local", #668).
  const today = eventLocalToday();
  const bandViewCounts = new Map();
  const socialClickCounts = new Map();
  const pageCounts = new Map(); // page path → count
  let visitBucket = null;
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

    if (event.event === "visit") {
      visitBucket = event.props.referrer_bucket;
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

  if (allBandIds.size > 0) {
    // Isolated like every write below, statements built inside the try
    // (prepare() can throw on a missing table): one failing batch must not
    // skip the rest of the beacon (#1411).
    try {
      const stmts = [...allBandIds].map((bandId) => {
        const views = bandViewCounts.get(bandId) || 0;
        const clicks = socialClickCounts.get(bandId) || 0;
        return env.DB.prepare(
          `INSERT INTO artist_daily_stats (band_profile_id, date, page_views, social_clicks)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (band_profile_id, date)
           DO UPDATE SET page_views = page_views + ?, social_clicks = social_clicks + ?`,
        ).bind(bandId, today, views, clicks, views, clicks);
      });
      await executeInChunks(env.DB, stmts);
    } catch (err) {
      logger.error("artist_daily_stats upsert failed; this batch's artist views and social clicks are lost", {
        error: err,
        bandCount: allBandIds.size,
      });
    }
  }

  // Store page views in a separate batch so a missing
  // page_views_daily table doesn't break artist_daily_stats writes.
  // Only real path keys (page_view events) are written here — event_view
  // and ticket_click are keyed by event_id, not path, and are written to
  // their own event_daily_stats table below (#706). Mixing event_id-keyed
  // synthetic keys into this path-keyed table previously double-counted
  // the same view under two key formats (#445) — keep the two tables
  // separate.
  if (pageCounts.size > 0) {
    try {
      const pvStmts = [...pageCounts].map(([page, count]) =>
        env.DB.prepare(
          `INSERT INTO page_views_daily (page, date, views)
           VALUES (?, ?, ?)
           ON CONFLICT (page, date)
           DO UPDATE SET views = views + ?`,
        ).bind(page, today, count, count),
      );
      await executeInChunks(env.DB, pvStmts);
    } catch (err) {
      logger.error("page_views_daily upsert failed; this batch's page views are lost", {
        error: err,
        statementCount: pageCounts.size,
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
  let resolvedEvents = [];
  if (candidateIds.length > 0) {
    try {
      const placeholders = candidateIds.map(() => "?").join(",");
      const { results } = await env.DB.prepare(`SELECT id, date, end_date FROM events WHERE id IN (${placeholders})`)
        .bind(...candidateIds)
        .all();
      resolvedEvents = results || [];
      allEventIds = resolvedEvents.map((row) => row.id);
    } catch (err) {
      logger.error("event id resolution failed; skipping event_daily_stats and event_hourly_views for this batch", {
        error: err,
      });
    }
  }

  if (allEventIds.length > 0) {
    try {
      const eventStmts = allEventIds.map((eventId) => {
        const views = eventViewCounts.get(eventId) || 0;
        const clicks = ticketClickCounts.get(eventId) || 0;
        return env.DB.prepare(
          `INSERT INTO event_daily_stats (event_id, date, event_views, ticket_clicks)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (event_id, date)
           DO UPDATE SET event_views = event_views + ?, ticket_clicks = ticket_clicks + ?`,
        ).bind(eventId, today, views, clicks, views, clicks);
      });
      await executeInChunks(env.DB, eventStmts);
    } catch (err) {
      logger.error("event_daily_stats upsert failed; this batch's event views and ticket clicks are lost", {
        error: err,
        statementCount: allEventIds.length,
      });
    }
  }

  // Show-night usage curve (#1246 Q1): "when do fans use the site on show
  // night?" One count per (event, FESTIVAL date, Toronto hour), from
  // event_view only, and only while the festival date falls inside the
  // event's own [date, end_date]. Festival date, not calendar date: a 01:00
  // view after the show belongs to the previous evening at hour 1, and a
  // 03:00 view on the morning of day 1 (festival date = the day before) is
  // outside the window and not counted. One `now` feeds both values so they
  // can never straddle a boundary. Aggregate counts, no visitor key.
  // Isolated in its own batch/try-catch, like event_daily_stats above, so
  // a failure here can never break the daily stats and vice versa.
  const now = new Date();
  const festivalDate = eventLocalFestivalToday(now);
  const hour = Number(eventLocalClock(now).time.slice(0, 2));
  const hourlyDue = resolvedEvents.filter(
    (row) =>
      (eventViewCounts.get(row.id) || 0) > 0 && festivalDate >= row.date && festivalDate <= (row.end_date || row.date),
  );

  if (hourlyDue.length > 0) {
    try {
      // Statements are built inside the try: prepare() can throw on a
      // missing table (better-sqlite3 validates eagerly).
      const hourlyStmts = hourlyDue.map((row) => {
        const views = eventViewCounts.get(row.id);
        return env.DB.prepare(
          `INSERT INTO event_hourly_views (event_id, festival_date, hour, views)
             VALUES (?, ?, ?, ?)
             ON CONFLICT (event_id, festival_date, hour)
             DO UPDATE SET views = views + ?`,
        ).bind(row.id, festivalDate, hour, views, views);
      });
      await executeInChunks(env.DB, hourlyStmts);
    } catch (err) {
      // error, not warn: this table fills only on show nights and cannot be
      // rebuilt from anywhere else, so a lost hour is a lost edition's curve.
      logger.error("event_hourly_views upsert failed; this show-night hour's views are lost", {
        error: err,
        statementCount: hourlyDue.length,
        festivalDate,
        hour,
      });
    }
  }

  if (visitBucket !== null) {
    try {
      await env.DB.prepare(
        `INSERT INTO referrer_daily_stats (date, bucket, visits)
           VALUES (?, ?, 1)
           ON CONFLICT (date, bucket)
           DO UPDATE SET visits = visits + 1`,
      )
        // Festival day, as the show-night curve uses: a 1 AM visit after the
        // last night's sets belongs to that night, not to the next date.
        .bind(festivalDate, visitBucket)
        .run();
    } catch (err) {
      logger.error("referrer_daily_stats upsert failed; this visit is lost", {
        error: err,
        bucket: visitBucket,
      });
    }
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await parseJsonObjectBody(request);
    if (payload === null) {
      return new Response("Invalid request body", { status: 400 });
    }
    const rawEvents = Array.isArray(payload?.events) ? payload.events : [];

    if (rawEvents.length === 0) {
      return new Response("OK", { status: 200 });
    }

    // A browser sends one `visit` per session, so a request carries at most
    // one: a hand-made POST of 50 visit events must not count 50, in D1 or in
    // Analytics Engine (#1246 Q3).
    let sawVisit = false;
    const validEvents = rawEvents
      .map(sanitizeEvent)
      .filter(Boolean)
      .slice(0, 50)
      .filter((event) => {
        if (event.event !== "visit") return true;
        if (sawVisit) return false;
        sawVisit = true;
        return true;
      });

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
      // The beacon's answer never depends on the writes, so the response goes
      // out at once and the writes finish in waitUntil (#1411): up to six D1
      // round trips no longer hold the request open. Without waitUntil (unit
      // tests, a bare call) the writes are awaited, as before.
      const writes = recordToD1(env, validEvents).catch((error) => {
        // Every table has its own guard, so reaching this means one is missing:
        // the writes after the failure were skipped.
        logger.error(
          "Metrics D1 recording failed outside a per-table guard; remaining writes for this beacon skipped",
          {
            error,
            eventCount: validEvents.length,
          },
        );
      });
      if (typeof context.waitUntil === "function") {
        context.waitUntil(writes);
      } else {
        await writes;
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("Metrics ingestion error", { error });
    return new Response("OK", { status: 200 });
  }
}
