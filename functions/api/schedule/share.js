// Public API: Create a schedule share link
// POST /api/schedule/share
// Body: { event_id, event_slug, performance_ids[], band_names[] }

import { toSqliteDateTime } from "../../utils/authAttempts.js";
import { publicEventStatusSql } from "../../utils/eventVisibility.js";
import { parseJsonObjectBody } from "../../utils/request.js";

const MAX_PERFORMANCE_IDS = 50;
const MAX_BAND_NAME_LENGTH = 100;
const SLUG_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateSlug(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => SLUG_CHARS[b % SLUG_CHARS.length]).join("");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { DB } = env;

    const body = await parseJsonObjectBody(request);
    if (body === null) {
      return json({ error: "Invalid request body" }, 400);
    }
    const { event_id, event_slug, performance_ids, band_names } = body;

    if (typeof event_id !== "number" || !Number.isFinite(event_id)) {
      return json({ error: "Invalid event_id" }, 400);
    }

    if (typeof event_slug !== "string" || !/^[a-z0-9-]+$/.test(event_slug)) {
      return json({ error: "Invalid event_slug" }, 400);
    }

    if (
      !Array.isArray(performance_ids) ||
      performance_ids.length === 0 ||
      performance_ids.length > MAX_PERFORMANCE_IDS
    ) {
      return json({ error: `performance_ids must be a non-empty array of up to ${MAX_PERFORMANCE_IDS} integers` }, 400);
    }

    if (!Array.isArray(band_names) || band_names.length !== performance_ids.length) {
      return json({ error: "band_names must be an array matching performance_ids length" }, 400);
    }

    const ids = performance_ids.map(Number);
    if (ids.some((id) => !Number.isFinite(id) || id <= 0)) {
      return json({ error: "All performance_ids must be positive integers" }, 400);
    }

    const names = band_names.map(String);
    if (names.some((n) => n.length > MAX_BAND_NAME_LENGTH)) {
      return json({ error: `Band names must not exceed ${MAX_BAND_NAME_LENGTH} characters` }, 400);
    }

    const event = await DB.prepare(`SELECT id FROM events WHERE id = ? AND ${publicEventStatusSql()}`)
      .bind(Number(event_id))
      .first();
    if (!event) {
      return json({ error: "Event not found" }, 404);
    }

    const expiresAt = toSqliteDateTime(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    for (let attempt = 0; attempt < 2; attempt++) {
      const slug = generateSlug();
      try {
        await DB.prepare(
          `INSERT INTO share_links (slug, event_id, event_slug, performance_ids, band_names, expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
          .bind(slug, Number(event_id), event_slug, JSON.stringify(ids), JSON.stringify(names), expiresAt)
          .run();
        return json({ slug });
      } catch (err) {
        if (attempt === 1 || !String(err).includes("UNIQUE")) throw err;
      }
    }
  } catch (error) {
    console.error("Schedule share error:", error);
    return json({ error: "Failed to create share link" }, 500);
  }
}
