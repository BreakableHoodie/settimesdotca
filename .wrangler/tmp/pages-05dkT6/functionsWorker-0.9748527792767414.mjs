var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../.wrangler/tmp/bundle-m9AYrg/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// api/admin/events/[id]/metrics.js
async function onRequestGet(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const eventId = params.id;
  try {
    const metrics = await DB.prepare(`
      SELECT
        COUNT(*) as total_schedule_builds,
        COUNT(DISTINCT user_session) as unique_visitors,
        MAX(created_at) as last_updated
      FROM schedule_builds
      WHERE event_id = ?
    `).bind(eventId).first();
    const popularBands = await DB.prepare(`
      SELECT
        b.id as band_id,
        b.name as band_name,
        COUNT(sb.band_id) as schedule_count
      FROM schedule_builds sb
      JOIN bands b ON sb.band_id = b.id
      WHERE sb.event_id = ?
      GROUP BY b.id, b.name
      ORDER BY schedule_count DESC
      LIMIT 10
    `).bind(eventId).all();
    return new Response(JSON.stringify({
      success: true,
      metrics: {
        totalScheduleBuilds: metrics?.total_schedule_builds || 0,
        uniqueVisitors: metrics?.unique_visitors || 0,
        lastUpdated: metrics?.last_updated,
        popularBands: popularBands.results || []
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Metrics error:", error);
    return new Response(JSON.stringify({
      error: "Failed to load metrics"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestGet, "onRequestGet");

// api/admin/analytics/subscriptions.js
async function onRequestGet2(context) {
  const { env } = context;
  try {
    const { results: total } = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM email_subscriptions WHERE verified = 1
    `).all();
    const { results: byCity } = await env.DB.prepare(`
      SELECT city, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY city
      ORDER BY count DESC
    `).all();
    const { results: byGenre } = await env.DB.prepare(`
      SELECT genre, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY genre
      ORDER BY count DESC
    `).all();
    const { results: byFrequency } = await env.DB.prepare(`
      SELECT frequency, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY frequency
    `).all();
    const { results: growth } = await env.DB.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      AND created_at >= date('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all();
    const { results: unsubscribes } = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM subscription_unsubscribes
    `).all();
    return new Response(JSON.stringify({
      total_subscribers: total[0].count,
      by_city: byCity,
      by_genre: byGenre,
      by_frequency: byFrequency,
      growth_30_days: growth,
      total_unsubscribes: unsubscribes[0].count,
      unsubscribe_rate: total[0].count > 0 ? (unsubscribes[0].count / total[0].count * 100).toFixed(2) + "%" : "0%"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch analytics" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestGet2, "onRequestGet");

// utils/crypto.js
var SALT_LENGTH = 16;
var ITERATIONS = 1e5;
var KEY_LENGTH = 32;
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);
  const key = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    key,
    KEY_LENGTH * 8
  );
  const hashArray = new Uint8Array(derivedBits);
  const saltBase64 = btoa(String.fromCharCode(...salt));
  const hashBase64 = btoa(String.fromCharCode(...hashArray));
  return `${saltBase64}:${hashBase64}`;
}
__name(hashPassword, "hashPassword");
async function verifyPassword(password, storedHash) {
  try {
    const [saltBase64, hashBase64] = storedHash.split(":");
    if (!saltBase64 || !hashBase64) {
      return false;
    }
    const salt = Uint8Array.from(atob(saltBase64), (c) => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    const key = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: ITERATIONS,
        hash: "SHA-256"
      },
      key,
      KEY_LENGTH * 8
    );
    const hashArray = new Uint8Array(derivedBits);
    const computedHash = btoa(String.fromCharCode(...hashArray));
    return computedHash === hashBase64;
  } catch (error) {
    console.error("Password verification error:", error);
    return false;
  }
}
__name(verifyPassword, "verifyPassword");

// api/admin/auth/login.js
function getClientIP(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || "unknown";
}
__name(getClientIP, "getClientIP");
async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);
  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = body;
    if (!email || !password) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Email and password are required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const user = await DB.prepare(`
      SELECT id, email, password_hash, name, role, last_login
      FROM users
      WHERE email = ?
    `).bind(email).first();
    if (!user) {
      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    await DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    ).bind(user.id).run();
    const sessionToken = crypto.randomUUID();
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        sessionToken
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to process login request"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPost, "onRequestPost");

// api/admin/auth/reset.js
function getClientIP2(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || "unknown";
}
__name(getClientIP2, "getClientIP");
async function logAuthEvent(DB, ipAddress, action, success, details = null) {
  await DB.prepare(
    `
    INSERT INTO auth_audit (ip_address, action, success, user_agent, details)
    VALUES (?, ?, ?, ?, ?)
  `
  ).bind(
    ipAddress,
    action,
    success ? 1 : 0,
    details?.userAgent || null,
    details ? JSON.stringify(details) : null
  ).run();
}
__name(logAuthEvent, "logAuthEvent");
async function onRequestPost2(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP2(request);
  try {
    const body = await request.json().catch(() => ({}));
    const { masterPassword } = body;
    if (!masterPassword) {
      await logAuthEvent(DB, ipAddress, "password_reset", false, {
        reason: "missing_master_password"
      });
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Master password is required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const expectedMasterPassword = env.MASTER_PASSWORD;
    if (masterPassword !== expectedMasterPassword) {
      await logAuthEvent(DB, ipAddress, "password_reset", false, {
        reason: "invalid_master_password"
      });
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Invalid master password"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    await logAuthEvent(DB, ipAddress, "password_reset", true);
    return new Response(
      JSON.stringify({
        success: true,
        adminPassword: env.ADMIN_PASSWORD,
        message: "Admin password retrieved successfully"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Password reset error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to process password reset request"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPost2, "onRequestPost");

// api/admin/auth/signup.js
async function onRequestPost3(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const { email, password, name, role } = await request.json();
    if (!email || !password) {
      return new Response(JSON.stringify({
        error: "Validation error",
        message: "Email and password are required"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({
        error: "Validation error",
        message: "Invalid email format"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({
        error: "Validation error",
        message: "Password must be at least 8 characters"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const userRole = role === "admin" ? "admin" : "editor";
    const existingUser = await DB.prepare(
      "SELECT id FROM users WHERE email = ?"
    ).bind(email).first();
    if (existingUser) {
      return new Response(JSON.stringify({
        error: "Conflict",
        message: "Email already registered"
      }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      });
    }
    const passwordHash = await hashPassword(password);
    const user = await DB.prepare(
      "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?) RETURNING id, email, name, role"
    ).bind(email, passwordHash, name || null, userRole).first();
    const sessionToken = crypto.randomUUID();
    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      sessionToken
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(JSON.stringify({
      error: "Server error",
      message: "Failed to create account"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestPost3, "onRequestPost");

// api/admin/bands/bulk.js
async function onRequestPatch(context) {
  const { request, env } = context;
  const { band_ids, action, ignore_conflicts, ...params } = await request.json();
  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400
    });
  }
  try {
    let result;
    if (action === "move_venue") {
      const { venue_id } = params;
      const statements = band_ids.map(
        (id) => env.DB.prepare("UPDATE bands SET venue_id = ? WHERE id = ?").bind(
          venue_id,
          id
        )
      );
      result = await env.DB.batch(statements);
    } else if (action === "change_time") {
      const { start_time } = params;
      const statements = band_ids.map(
        (id) => env.DB.prepare(
          `
          UPDATE bands
          SET start_time = ?,
              end_time = datetime(?, '+' ||
                (strftime('%s', end_time) - strftime('%s', start_time)) || ' seconds')
          WHERE id = ?
        `
        ).bind(start_time, start_time, id)
      );
      result = await env.DB.batch(statements);
    } else if (action === "delete") {
      const placeholders = band_ids.map(() => "?").join(",");
      result = await env.DB.prepare(
        `DELETE FROM bands WHERE id IN (${placeholders})`
      ).bind(...band_ids).run();
    }
    return new Response(
      JSON.stringify({
        success: true,
        updated: band_ids.length,
        action
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Bulk operation failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Database operation failed",
        details: error.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPatch, "onRequestPatch");

// api/admin/bands/bulk-preview.js
async function onRequestPost4(context) {
  const { request, env } = context;
  const { band_ids, action, ...params } = await request.json();
  if (!Array.isArray(band_ids) || band_ids.length === 0) {
    return new Response(JSON.stringify({ error: "Invalid band_ids" }), {
      status: 400
    });
  }
  const changes = [];
  const conflicts = [];
  const placeholders = band_ids.map(() => "?").join(",");
  const bands = await env.DB.prepare(
    `SELECT * FROM bands WHERE id IN (${placeholders})`
  ).bind(...band_ids).all();
  if (action === "move_venue") {
    const { venue_id } = params;
    for (const band of bands.results) {
      const venue = await env.DB.prepare("SELECT name FROM venues WHERE id = ?").bind(venue_id).first();
      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_venue: band.venue_name,
        to_venue: venue.name
      });
    }
    for (const band of bands.results) {
      const overlaps = await env.DB.prepare(
        `
        SELECT name, start_time, end_time
        FROM bands
        WHERE venue_id = ?
          AND event_id = ?
          AND id NOT IN (${placeholders})
          AND (
            (start_time < ? AND end_time > ?) OR
            (start_time >= ? AND start_time < ?)
          )
      `
      ).bind(
        venue_id,
        band.event_id,
        ...band_ids,
        band.end_time,
        band.start_time,
        band.start_time,
        band.end_time
      ).all();
      overlaps.results.forEach((conflict) => {
        conflicts.push({
          band_id: band.id,
          message: `"${band.name}" overlaps with "${conflict.name}" at new venue (${conflict.start_time}-${conflict.end_time})`,
          severity: "error"
        });
      });
    }
  } else if (action === "change_time") {
    const { start_time } = params;
    for (const band of bands.results) {
      changes.push({
        band_id: band.id,
        band_name: band.name,
        from_time: band.start_time,
        to_time: start_time
      });
    }
    for (const band of bands.results) {
      const overlaps = await env.DB.prepare(
        `
        SELECT name, start_time, end_time
        FROM bands
        WHERE venue_id = ?
          AND event_id = ?
          AND id NOT IN (${placeholders})
          AND (
            (start_time < ? AND end_time > ?) OR
            (start_time >= ? AND start_time < ?)
          )
      `
      ).bind(
        band.venue_id,
        band.event_id,
        ...band_ids,
        band.end_time,
        start_time,
        start_time,
        band.end_time
      ).all();
      overlaps.results.forEach((conflict) => {
        conflicts.push({
          band_id: band.id,
          message: `"${band.name}" overlaps with "${conflict.name}" at venue (${conflict.start_time}-${conflict.end_time})`,
          severity: "error"
        });
      });
    }
  } else if (action === "delete") {
    for (const band of bands.results) {
      changes.push({
        band_id: band.id,
        band_name: band.name,
        action: "delete"
      });
    }
  }
  return new Response(JSON.stringify({ success: true, changes, conflicts }), {
    headers: { "Content-Type": "application/json" }
  });
}
__name(onRequestPost4, "onRequestPost");

// api/admin/bands/[id].js
function getBandId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("bands") + 1;
  return parts[idIndex];
}
__name(getBandId, "getBandId");
async function checkConflicts(DB, eventId, venueId, startTime, endTime, excludeBandId = null) {
  const conflicts = [];
  const toMinutes = /* @__PURE__ */ __name((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }, "toMinutes");
  const newStart = toMinutes(startTime);
  const newEnd = toMinutes(endTime);
  const query = excludeBandId ? `SELECT * FROM bands WHERE event_id = ? AND venue_id = ? AND id != ?` : `SELECT * FROM bands WHERE event_id = ? AND venue_id = ?`;
  const bindings = excludeBandId ? [eventId, venueId, excludeBandId] : [eventId, venueId];
  const result = await DB.prepare(query).bind(...bindings).all();
  const existingBands = result.results || [];
  for (const band of existingBands) {
    const bandStart = toMinutes(band.start_time);
    const bandEnd = toMinutes(band.end_time);
    if (newStart < bandEnd && newEnd > bandStart) {
      conflicts.push({
        id: band.id,
        name: band.name,
        startTime: band.start_time,
        endTime: band.end_time
      });
    }
  }
  return conflicts;
}
__name(checkConflicts, "checkConflicts");
async function onRequestPut(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const bandId = getBandId(request);
    if (!bandId || isNaN(bandId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid band ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const body = await request.json().catch(() => ({}));
    const { venueId, name, startTime, endTime, url } = body;
    if (!name) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Band name is required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid start time format. Use HH:MM (24-hour format)"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid end time format. Use HH:MM (24-hour format)"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (startTime >= endTime) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "End time must be after start time"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const band = await DB.prepare(
      `
      SELECT * FROM bands WHERE id = ?
    `
    ).bind(bandId).first();
    if (!band) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Band not found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const existingBand = await DB.prepare(
      `SELECT id, name FROM bands WHERE LOWER(name) = LOWER(?) AND id != ?`
    ).bind(name, bandId).first();
    if (existingBand) {
      return new Response(
        JSON.stringify({
          error: "Duplicate band name",
          message: `A band named "${name}" already exists. Please choose a different name.`
        }),
        {
          status: 409,
          // Conflict
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const venue = await DB.prepare(
      `
      SELECT id FROM venues WHERE id = ?
    `
    ).bind(venueId).first();
    if (!venue) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Venue not found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const conflicts = await checkConflicts(
      DB,
      band.event_id,
      venueId,
      startTime,
      endTime,
      bandId
    );
    const result = await DB.prepare(
      `
      UPDATE bands
      SET venue_id = ?, name = ?, start_time = ?, end_time = ?, url = ?
      WHERE id = ?
      RETURNING *
    `
    ).bind(venueId, name, startTime, endTime, url || null, bandId).first();
    return new Response(
      JSON.stringify({
        success: true,
        band: result,
        conflicts: conflicts.length > 0 ? conflicts : void 0,
        warning: conflicts.length > 0 ? `This band overlaps with ${conflicts.length} other band(s) at the same venue` : void 0
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error updating band:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update band"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPut, "onRequestPut");
async function onRequestDelete(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const bandId = getBandId(request);
    if (!bandId || isNaN(bandId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid band ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const band = await DB.prepare(
      `
      SELECT * FROM bands WHERE id = ?
    `
    ).bind(bandId).first();
    if (!band) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Band not found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    await DB.prepare(
      `
      DELETE FROM bands WHERE id = ?
    `
    ).bind(bandId).run();
    return new Response(
      JSON.stringify({
        success: true,
        message: "Band deleted successfully"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error deleting band:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to delete band"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestDelete, "onRequestDelete");

// api/admin/events/[id].js
function getEventId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("events") + 1;
  return parts[idIndex];
}
__name(getEventId, "getEventId");
async function onRequestPut2(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  try {
    const eventId = getEventId(request);
    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid event ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (url.pathname.endsWith("/publish")) {
      const event = await DB.prepare(
        `
        SELECT * FROM events WHERE id = ?
      `
      ).bind(eventId).first();
      if (!event) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Event not found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      const newStatus = event.is_published === 1 ? 0 : 1;
      const result = await DB.prepare(
        `
        UPDATE events
        SET is_published = ?
        WHERE id = ?
        RETURNING *
      `
      ).bind(newStatus, eventId).first();
      return new Response(
        JSON.stringify({
          success: true,
          event: result,
          message: newStatus === 1 ? "Event published" : "Event unpublished"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        error: "Not found",
        message: "Unknown operation"
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error updating event:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update event"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPut2, "onRequestPut");
async function onRequestPost5(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  try {
    const eventId = getEventId(request);
    if (!eventId || isNaN(eventId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid event ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (url.pathname.endsWith("/duplicate")) {
      const body = await request.json().catch(() => ({}));
      const { name, date, slug } = body;
      if (!name || !date || !slug) {
        return new Response(
          JSON.stringify({
            error: "Validation error",
            message: "Name, date, and slug are required for duplicate event"
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      const originalEvent = await DB.prepare(
        `
        SELECT * FROM events WHERE id = ?
      `
      ).bind(eventId).first();
      if (!originalEvent) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Original event not found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      const existingEvent = await DB.prepare(
        `
        SELECT id FROM events WHERE slug = ?
      `
      ).bind(slug).first();
      if (existingEvent) {
        return new Response(
          JSON.stringify({
            error: "Conflict",
            message: "An event with this slug already exists"
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      const newEvent = await DB.prepare(
        `
        INSERT INTO events (name, date, slug, is_published)
        VALUES (?, ?, ?, 0)
        RETURNING *
      `
      ).bind(name, date, slug).first();
      await DB.prepare(
        `
        INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url)
        SELECT ?, venue_id, name, start_time, end_time, url
        FROM bands
        WHERE event_id = ?
      `
      ).bind(newEvent.id, eventId).run();
      const bandCount = await DB.prepare(
        `
        SELECT COUNT(*) as count FROM bands WHERE event_id = ?
      `
      ).bind(newEvent.id).first();
      return new Response(
        JSON.stringify({
          success: true,
          event: newEvent,
          bandsCopied: bandCount.count,
          message: `Event duplicated successfully with ${bandCount.count} bands`
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    return new Response(
      JSON.stringify({
        error: "Not found",
        message: "Unknown operation"
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error duplicating event:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to duplicate event"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPost5, "onRequestPost");
async function onRequestDelete2(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const eventId = getEventId(request);
    const eventIdNum = parseInt(eventId);
    if (isNaN(eventIdNum)) {
      return new Response(
        JSON.stringify({ error: "Invalid event ID" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const event = await DB.prepare(
      "SELECT id, name FROM events WHERE id = ?"
    ).bind(eventIdNum).first();
    if (!event) {
      return new Response(
        JSON.stringify({ error: "Event not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const bandCount = await DB.prepare(
      "SELECT COUNT(*) as count FROM bands WHERE event_id = ?"
    ).bind(eventIdNum).first();
    await DB.prepare("DELETE FROM events WHERE id = ?").bind(eventIdNum).run();
    return new Response(
      JSON.stringify({
        success: true,
        message: `Event "${event.name}" deleted successfully${bandCount.count > 0 ? ` (${bandCount.count} band(s) are now unassigned and can be moved to other events)` : ""}`
      }),
      {
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Delete event error:", error);
    return new Response(
      JSON.stringify({
        error: "Database operation failed",
        details: error.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestDelete2, "onRequestDelete");

// api/admin/venues/[id].js
function getVenueId(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const idIndex = parts.indexOf("venues") + 1;
  return parts[idIndex];
}
__name(getVenueId, "getVenueId");
async function onRequestPut3(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const venueId = getVenueId(request);
    if (!venueId || isNaN(venueId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid venue ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const body = await request.json().catch(() => ({}));
    const { name, address } = body;
    if (!name) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Venue name is required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const venue = await DB.prepare(
      `
      SELECT * FROM venues WHERE id = ?
    `
    ).bind(venueId).first();
    if (!venue) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Venue not found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (name !== venue.name) {
      const existingVenue = await DB.prepare(
        `
        SELECT id FROM venues WHERE name = ? AND id != ?
      `
      ).bind(name, venueId).first();
      if (existingVenue) {
        return new Response(
          JSON.stringify({
            error: "Conflict",
            message: "A venue with this name already exists"
          }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }
    const result = await DB.prepare(
      `
      UPDATE venues
      SET name = ?, address = ?
      WHERE id = ?
      RETURNING *
    `
    ).bind(name, address || null, venueId).first();
    return new Response(
      JSON.stringify({
        success: true,
        venue: result
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error updating venue:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to update venue"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPut3, "onRequestPut");
async function onRequestDelete3(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const venueId = getVenueId(request);
    if (!venueId || isNaN(venueId)) {
      return new Response(
        JSON.stringify({
          error: "Bad request",
          message: "Invalid venue ID"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const venue = await DB.prepare(
      `
      SELECT * FROM venues WHERE id = ?
    `
    ).bind(venueId).first();
    if (!venue) {
      return new Response(
        JSON.stringify({
          error: "Not found",
          message: "Venue not found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const bandCount = await DB.prepare(
      `
      SELECT COUNT(*) as count FROM bands WHERE venue_id = ?
    `
    ).bind(venueId).first();
    if (bandCount.count > 0) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: `Cannot delete venue. It is used by ${bandCount.count} band(s).`
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    await DB.prepare(
      `
      DELETE FROM venues WHERE id = ?
    `
    ).bind(venueId).run();
    return new Response(
      JSON.stringify({
        success: true,
        message: "Venue deleted successfully"
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error deleting venue:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to delete venue"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestDelete3, "onRequestDelete");

// api/admin/bands.js
async function checkConflicts2(DB, eventId, venueId, startTime, endTime, excludeBandId = null) {
  const conflicts = [];
  const toMinutes = /* @__PURE__ */ __name((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }, "toMinutes");
  const newStart = toMinutes(startTime);
  const newEnd = toMinutes(endTime);
  const query = excludeBandId ? `SELECT * FROM bands WHERE event_id = ? AND venue_id = ? AND id != ?` : `SELECT * FROM bands WHERE event_id = ? AND venue_id = ?`;
  const bindings = excludeBandId ? [eventId, venueId, excludeBandId] : [eventId, venueId];
  const result = await DB.prepare(query).bind(...bindings).all();
  const existingBands = result.results || [];
  for (const band of existingBands) {
    const bandStart = toMinutes(band.start_time);
    const bandEnd = toMinutes(band.end_time);
    if (newStart < bandEnd && newEnd > bandStart) {
      conflicts.push({
        id: band.id,
        name: band.name,
        startTime: band.start_time,
        endTime: band.end_time
      });
    }
  }
  return conflicts;
}
__name(checkConflicts2, "checkConflicts");
async function onRequestGet3(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event_id");
  try {
    let result;
    if (eventId) {
      result = await DB.prepare(
        `
        SELECT
          b.*,
          v.name as venue_name,
          e.name as event_name
        FROM bands b
        INNER JOIN venues v ON b.venue_id = v.id
        INNER JOIN events e ON b.event_id = e.id
        WHERE b.event_id = ?
        ORDER BY b.start_time, v.name
      `
      ).bind(eventId).all();
    } else {
      result = await DB.prepare(
        `
        SELECT
          b.*,
          v.name as venue_name,
          e.name as event_name
        FROM bands b
        LEFT JOIN venues v ON b.venue_id = v.id
        LEFT JOIN events e ON b.event_id = e.id
        ORDER BY b.start_time, v.name
      `
      ).all();
    }
    return new Response(
      JSON.stringify({
        bands: result.results || []
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error fetching bands:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch bands"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestGet3, "onRequestGet");
async function onRequestPost6(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const body = await request.json().catch(() => ({}));
    const { eventId, venueId, name, startTime, endTime, url } = body;
    if (!name) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Band name is required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (eventId && (!venueId || !startTime || !endTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "For event bands, venueId, startTime, and endTime are required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (startTime && !/^\d{2}:\d{2}$/.test(startTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid start time format. Use HH:MM (24-hour format)"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (endTime && !/^\d{2}:\d{2}$/.test(endTime)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid end time format. Use HH:MM (24-hour format)"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (startTime && endTime && startTime >= endTime) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "End time must be after start time"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (eventId) {
      const event = await DB.prepare(
        `
        SELECT id FROM events WHERE id = ?
      `
      ).bind(eventId).first();
      if (!event) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Event not found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }
    if (venueId) {
      const venue = await DB.prepare(
        `
        SELECT id FROM venues WHERE id = ?
      `
      ).bind(venueId).first();
      if (!venue) {
        return new Response(
          JSON.stringify({
            error: "Not found",
            message: "Venue not found"
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
    }
    const existingBand = await DB.prepare(
      `SELECT id, name FROM bands WHERE LOWER(name) = LOWER(?)`
    ).bind(name).first();
    if (existingBand) {
      return new Response(
        JSON.stringify({
          error: "Duplicate band name",
          message: `A band named "${name}" already exists. Please choose a different name.`
        }),
        {
          status: 409,
          // Conflict
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    let conflicts = [];
    if (eventId && venueId && startTime && endTime) {
      conflicts = await checkConflicts2(
        DB,
        eventId,
        venueId,
        startTime,
        endTime
      );
    }
    const result = await DB.prepare(
      `
      INSERT INTO bands (event_id, venue_id, name, start_time, end_time, url)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING *
    `
    ).bind(eventId, venueId, name, startTime, endTime, url || null).first();
    return new Response(
      JSON.stringify({
        success: true,
        band: result,
        conflicts: conflicts.length > 0 ? conflicts : void 0,
        warning: conflicts.length > 0 ? `This band overlaps with ${conflicts.length} other band(s) at the same venue` : void 0
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error creating band:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to create band"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPost6, "onRequestPost");

// api/admin/events.js
async function onRequestGet4(context) {
  const { env } = context;
  const { DB } = env;
  try {
    const result = await DB.prepare(
      `
      SELECT
        e.*,
        COUNT(b.id) as band_count
      FROM events e
      LEFT JOIN bands b ON e.id = b.event_id
      GROUP BY e.id
      ORDER BY e.date DESC
    `
    ).all();
    return new Response(
      JSON.stringify({
        events: result.results || []
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error fetching events:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch events"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestGet4, "onRequestGet");
async function onRequestPost7(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const body = await request.json().catch(() => ({}));
    const { name, date, slug, isPublished = false } = body;
    if (!name || !date || !slug) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Name, date, and slug are required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Date must be in YYYY-MM-DD format"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Slug must contain only lowercase letters, numbers, and hyphens"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const existingEvent = await DB.prepare(
      `
      SELECT id FROM events WHERE slug = ?
    `
    ).bind(slug).first();
    if (existingEvent) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "An event with this slug already exists"
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const result = await DB.prepare(
      `
      INSERT INTO events (name, date, slug, is_published)
      VALUES (?, ?, ?, ?)
      RETURNING *
    `
    ).bind(name, date, slug, isPublished ? 1 : 0).first();
    return new Response(
      JSON.stringify({
        success: true,
        event: result
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error creating event:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to create event"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPost7, "onRequestPost");

// api/admin/venues.js
async function onRequestGet5(context) {
  const { env } = context;
  const { DB } = env;
  try {
    const result = await DB.prepare(
      `
      SELECT
        v.*,
        COUNT(b.id) as band_count
      FROM venues v
      LEFT JOIN bands b ON v.id = b.venue_id
      GROUP BY v.id
      ORDER BY v.name
    `
    ).all();
    return new Response(
      JSON.stringify({
        venues: result.results || []
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error fetching venues:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch venues"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestGet5, "onRequestGet");
async function onRequestPost8(context) {
  const { request, env } = context;
  const { DB } = env;
  try {
    const body = await request.json().catch(() => ({}));
    const { name, address } = body;
    if (!name) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Venue name is required"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const existingVenue = await DB.prepare(
      `
      SELECT id FROM venues WHERE name = ?
    `
    ).bind(name).first();
    if (existingVenue) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "A venue with this name already exists"
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const result = await DB.prepare(
      `
      INSERT INTO venues (name, address)
      VALUES (?, ?)
      RETURNING *
    `
    ).bind(name, address || null).first();
    return new Response(
      JSON.stringify({
        success: true,
        venue: result
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    console.error("Error creating venue:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to create venue"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestPost8, "onRequestPost");

// api/events/public.js
async function onRequestGet6(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const city = url.searchParams.get("city") || "all";
  const genre = url.searchParams.get("genre") || "all";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const upcoming = url.searchParams.get("upcoming") !== "false";
  try {
    let query = `
      SELECT
        e.id,
        e.name,
        e.slug,
        e.date,
        e.description,
        e.city,
        COUNT(DISTINCT b.id) as band_count,
        COUNT(DISTINCT v.id) as venue_count
      FROM events e
      LEFT JOIN bands b ON b.event_id = e.id
      LEFT JOIN venues v ON v.id IN (SELECT DISTINCT venue_id FROM bands WHERE event_id = e.id)
      WHERE e.published = 1
    `;
    const params = [];
    if (city !== "all") {
      query += ` AND LOWER(e.city) = LOWER(?)`;
      params.push(city);
    }
    if (upcoming) {
      query += ` AND e.date >= date('now')`;
    }
    query += `
      GROUP BY e.id
      ORDER BY e.date ASC
      LIMIT ?
    `;
    params.push(limit);
    const { results: events } = await env.DB.prepare(query).bind(...params).all();
    let filteredEvents = events;
    if (genre !== "all") {
      filteredEvents = [];
      for (const event of events) {
        const { results: bands } = await env.DB.prepare(`
          SELECT COUNT(*) as count
          FROM bands
          WHERE event_id = ? AND LOWER(genre) = LOWER(?)
        `).bind(event.id, genre).all();
        if (bands[0].count > 0) {
          filteredEvents.push(event);
        }
      }
    }
    return new Response(JSON.stringify({
      events: filteredEvents,
      filters: {
        city,
        genre,
        upcoming,
        limit
      },
      count: filteredEvents.length,
      generated_at: (/* @__PURE__ */ new Date()).toISOString()
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        // Allow anyone to consume
        "Cache-Control": "public, max-age=300"
        // Cache for 5 minutes
      }
    });
  } catch (error) {
    console.error("Public API error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch events" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestGet6, "onRequestGet");

// api/feeds/ical.js
async function onRequestGet7(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const hostname = url.hostname;
  const pathParts = url.pathname.split("/");
  const city = url.searchParams.get("city") || "all";
  const genre = url.searchParams.get("genre") || "all";
  try {
    let query = `
      SELECT DISTINCT
        e.id,
        e.name,
        e.slug,
        e.date,
        e.description,
        e.city,
        b.name as band_name,
        b.start_time,
        b.end_time,
        v.name as venue_name,
        v.address
      FROM events e
      LEFT JOIN bands b ON b.event_id = e.id
      LEFT JOIN venues v ON v.id = b.venue_id
      WHERE e.published = 1
      AND e.date >= date('now')
    `;
    const params = [];
    if (city !== "all") {
      query += ` AND LOWER(e.city) = LOWER(?)`;
      params.push(city);
    }
    if (genre !== "all") {
      query += ` AND LOWER(b.genre) = LOWER(?)`;
      params.push(genre);
    }
    query += ` ORDER BY e.date ASC, b.start_time ASC`;
    const { results: bands } = await env.DB.prepare(query).bind(...params).all();
    const ical = generateICal(bands, city, genre);
    return new Response(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${city}-${genre}.ics"`,
        "Cache-Control": "public, max-age=3600"
        // Cache for 1 hour
      }
    });
  } catch (error) {
    console.error("iCal generation error:", error);
    return new Response("Failed to generate calendar feed", { status: 500 });
  }
}
__name(onRequestGet7, "onRequestGet");
function generateICal(bands, city, genre) {
  const now = (/* @__PURE__ */ new Date()).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  let ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Concert Schedule//EN",
    `X-WR-CALNAME:${city} ${genre} Shows`,
    "X-WR-TIMEZONE:America/Los_Angeles",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];
  for (const band of bands) {
    if (!band.band_name) continue;
    const eventDate = band.date;
    const startTime = band.start_time || "20:00";
    const endTime = band.end_time || "21:00";
    const dtstart = `${eventDate.replace(/-/g, "")}T${startTime.replace(/:/g, "")}00`;
    const dtend = `${eventDate.replace(/-/g, "")}T${endTime.replace(/:/g, "")}00`;
    const uid = `band-${band.id}-${eventDate}@concertschedule.app`;
    const location = band.venue_name ? `${band.venue_name}${band.address ? ", " + band.address : ""}` : "TBD";
    const description = [
      band.band_name,
      band.venue_name ? `Venue: ${band.venue_name}` : "",
      band.description || ""
    ].filter(Boolean).join("\\n");
    ical.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${escapeIcal(band.band_name)}`,
      `LOCATION:${escapeIcal(location)}`,
      `DESCRIPTION:${escapeIcal(description)}`,
      "STATUS:CONFIRMED",
      "END:VEVENT"
    );
  }
  ical.push("END:VCALENDAR");
  return ical.join("\r\n");
}
__name(generateICal, "generateICal");
function escapeIcal(text) {
  if (!text) return "";
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
__name(escapeIcal, "escapeIcal");

// utils/tokens.js
function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(generateToken, "generateToken");

// api/subscriptions/subscribe.js
async function onRequestPost9(context) {
  const { request, env } = context;
  try {
    const { email, city, genre, frequency } = await request.json();
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (!city || !genre || !frequency) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    const verificationToken = generateToken();
    const unsubscribeToken = generateToken();
    const { results: existing } = await env.DB.prepare(`
      SELECT id, verified FROM email_subscriptions
      WHERE email = ? AND city = ? AND genre = ?
    `).bind(email, city, genre).all();
    if (existing.length > 0) {
      if (existing[0].verified) {
        return new Response(JSON.stringify({
          error: "You are already subscribed to this feed"
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      } else {
        await sendVerificationEmail(env, email, city, genre, existing[0].verification_token);
        return new Response(JSON.stringify({
          message: "Verification email sent. Please check your inbox."
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    const result = await env.DB.prepare(`
      INSERT INTO email_subscriptions (email, city, genre, frequency, verification_token, unsubscribe_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(email, city, genre, frequency, verificationToken, unsubscribeToken).run();
    await sendVerificationEmail(env, email, city, genre, verificationToken);
    return new Response(JSON.stringify({
      message: "Subscription created. Please check your email to verify."
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Subscription error:", error);
    return new Response(JSON.stringify({ error: "Subscription failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
__name(onRequestPost9, "onRequestPost");
async function sendVerificationEmail(env, email, city, genre, token) {
  const verifyUrl = `${env.PUBLIC_URL}/verify?token=${token}`;
  console.log(`Verification email for ${email}: ${verifyUrl}`);
}
__name(sendVerificationEmail, "sendVerificationEmail");

// api/subscriptions/unsubscribe.js
async function onRequestGet8(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing unsubscribe token", { status: 400 });
  }
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, email, city, genre
      FROM email_subscriptions
      WHERE unsubscribe_token = ?
    `).bind(token).all();
    if (results.length === 0) {
      return new Response("Invalid unsubscribe token", { status: 404 });
    }
    const subscription = results[0];
    await env.DB.prepare(`
      DELETE FROM email_subscriptions
      WHERE id = ?
    `).bind(subscription.id).run();
    await env.DB.prepare(`
      INSERT INTO subscription_unsubscribes (subscription_id)
      VALUES (?)
    `).bind(subscription.id).run();
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: system-ui, sans-serif;
              background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
              color: white;
              margin: 0;
              padding: 2rem;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #ff6b35; }
            p { opacity: 0.9; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>\u2713 Unsubscribed</h1>
            <p>You've been removed from ${subscription.city} ${subscription.genre} show notifications.</p>
            <p>You can resubscribe anytime at <a href="${env.PUBLIC_URL}/subscribe" style="color: #ff6b35;">${env.PUBLIC_URL}/subscribe</a></p>
          </div>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html" }
    });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return new Response("Unsubscribe failed", { status: 500 });
  }
}
__name(onRequestGet8, "onRequestGet");

// api/subscriptions/verify.js
async function onRequestGet9(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return new Response("Missing verification token", { status: 400 });
  }
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, email, city, genre, verified
      FROM email_subscriptions
      WHERE verification_token = ?
    `).bind(token).all();
    if (results.length === 0) {
      return new Response("Invalid verification token", { status: 404 });
    }
    const subscription = results[0];
    if (subscription.verified) {
      return new Response("Email already verified", { status: 200 });
    }
    await env.DB.prepare(`
      UPDATE email_subscriptions
      SET verified = 1
      WHERE id = ?
    `).bind(subscription.id).run();
    await env.DB.prepare(`
      INSERT INTO subscription_verifications (subscription_id)
      VALUES (?)
    `).bind(subscription.id).run();
    return Response.redirect(`${env.PUBLIC_URL}/subscribe?verified=true`, 302);
  } catch (error) {
    console.error("Verification error:", error);
    return new Response("Verification failed", { status: 500 });
  }
}
__name(onRequestGet9, "onRequestGet");

// api/schedule.js
async function onRequestGet10(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const eventParam = url.searchParams.get("event") || "current";
  try {
    const { DB } = env;
    let event;
    let bands;
    if (eventParam === "current") {
      event = await DB.prepare(
        `
        SELECT * FROM events
        WHERE is_published = 1
        ORDER BY date DESC
        LIMIT 1
      `
      ).first();
    } else {
      event = await DB.prepare(
        `
        SELECT * FROM events
        WHERE slug = ? AND is_published = 1
      `
      ).bind(eventParam).first();
    }
    if (!event) {
      return new Response(
        JSON.stringify({
          error: "Event not found",
          message: eventParam === "current" ? "No published events available" : `Event "${eventParam}" not found or not published`
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const bandsResult = await DB.prepare(
      `
      SELECT
        b.id,
        b.name,
        b.start_time as startTime,
        b.end_time as endTime,
        b.url,
        v.name as venue
      FROM bands b
      INNER JOIN venues v ON b.venue_id = v.id
      WHERE b.event_id = ?
      ORDER BY b.start_time, v.name
    `
    ).bind(event.id).all();
    bands = bandsResult.results || [];
    const formattedBands = bands.map((band) => ({
      id: `${band.name.toLowerCase().replace(/\s+/g, "-")}-${band.id}`,
      name: band.name,
      venue: band.venue,
      date: event.date,
      startTime: band.startTime,
      endTime: band.endTime,
      url: band.url || null
    }));
    return new Response(JSON.stringify(formattedBands), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300"
        // Cache for 5 minutes
      }
    });
  } catch (error) {
    console.error("Error fetching schedule:", error);
    return new Response(
      JSON.stringify({
        error: "Database error",
        message: "Failed to fetch event schedule"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequestGet10, "onRequestGet");

// api/admin/_middleware.js
var LOCKOUT_THRESHOLD = 5;
var LOCKOUT_WINDOW_MINUTES = 10;
var LOCKOUT_DURATION_HOURS = 1;
function getClientIP3(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || "unknown";
}
__name(getClientIP3, "getClientIP");
async function checkRateLimit(DB, ipAddress) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const record = await DB.prepare(
    `
    SELECT * FROM rate_limit WHERE ip_address = ?
  `
  ).bind(ipAddress).first();
  if (record && record.lockout_until) {
    const lockoutUntil = new Date(record.lockout_until);
    if (lockoutUntil > /* @__PURE__ */ new Date()) {
      const minutesRemaining = Math.ceil((lockoutUntil - /* @__PURE__ */ new Date()) / 6e4);
      return {
        allowed: false,
        locked: true,
        minutesRemaining
      };
    } else {
      await DB.prepare(
        `
        UPDATE rate_limit
        SET failed_attempts = 0, lockout_until = NULL, last_attempt = ?
        WHERE ip_address = ?
      `
      ).bind(now, ipAddress).run();
    }
  }
  return { allowed: true, locked: false };
}
__name(checkRateLimit, "checkRateLimit");
async function recordFailedAttempt(DB, ipAddress) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const windowStart = new Date(
    Date.now() - LOCKOUT_WINDOW_MINUTES * 6e4
  ).toISOString();
  let record = await DB.prepare(
    `
    SELECT * FROM rate_limit WHERE ip_address = ?
  `
  ).bind(ipAddress).first();
  if (!record) {
    await DB.prepare(
      `
      INSERT INTO rate_limit (ip_address, failed_attempts, last_attempt)
      VALUES (?, 1, ?)
    `
    ).bind(ipAddress, now).run();
    return 1;
  }
  const lastAttempt = new Date(record.last_attempt);
  const windowStartDate = new Date(windowStart);
  let failedAttempts = record.failed_attempts;
  if (lastAttempt < windowStartDate) {
    failedAttempts = 1;
  } else {
    failedAttempts += 1;
  }
  let lockoutUntil = null;
  if (failedAttempts >= LOCKOUT_THRESHOLD) {
    lockoutUntil = new Date(
      Date.now() + LOCKOUT_DURATION_HOURS * 60 * 6e4
    ).toISOString();
  }
  await DB.prepare(
    `
    UPDATE rate_limit
    SET failed_attempts = ?, lockout_until = ?, last_attempt = ?
    WHERE ip_address = ?
  `
  ).bind(failedAttempts, lockoutUntil, now, ipAddress).run();
  return failedAttempts;
}
__name(recordFailedAttempt, "recordFailedAttempt");
async function resetRateLimit(DB, ipAddress) {
  await DB.prepare(
    `
    UPDATE rate_limit
    SET failed_attempts = 0, lockout_until = NULL
    WHERE ip_address = ?
  `
  ).bind(ipAddress).run();
}
__name(resetRateLimit, "resetRateLimit");
async function logAuthEvent2(DB, ipAddress, action, success, details = null) {
  const userAgent = details?.userAgent || null;
  const detailsJson = details ? JSON.stringify(details) : null;
  await DB.prepare(
    `
    INSERT INTO auth_audit (ip_address, action, success, user_agent, details)
    VALUES (?, ?, ?, ?, ?)
  `
  ).bind(ipAddress, action, success ? 1 : 0, userAgent, detailsJson).run();
}
__name(logAuthEvent2, "logAuthEvent");
async function onRequest(context) {
  const { request, env, next } = context;
  const { pathname } = new URL(request.url);
  if (pathname.includes("/api/admin/auth/")) {
    return next();
  }
  const { DB } = env;
  const ipAddress = getClientIP3(request);
  try {
    const rateLimitCheck = await checkRateLimit(DB, ipAddress);
    if (!rateLimitCheck.allowed) {
      await logAuthEvent2(DB, ipAddress, "api_access_blocked", false, {
        reason: "rate_limited",
        minutesRemaining: rateLimitCheck.minutesRemaining
      });
      return new Response(
        JSON.stringify({
          error: "Too many failed attempts",
          message: `Your IP has been temporarily locked out. Please try again in ${rateLimitCheck.minutesRemaining} minutes.`,
          locked: true,
          minutesRemaining: rateLimitCheck.minutesRemaining
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    const adminPassword = request.headers.get("X-Admin-Password");
    const expectedPassword = env.ADMIN_PASSWORD;
    if (!adminPassword) {
      await logAuthEvent2(DB, ipAddress, "api_access_denied", false, {
        reason: "missing_password"
      });
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Admin password required"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (adminPassword !== expectedPassword) {
      await recordFailedAttempt(DB, ipAddress);
      await logAuthEvent2(DB, ipAddress, "api_access_denied", false, {
        reason: "invalid_password"
      });
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Invalid admin password"
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    await resetRateLimit(DB, ipAddress);
    await logAuthEvent2(DB, ipAddress, "api_access_granted", true);
    context.data = { ...context.data, authenticated: true, ipAddress };
    return next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return new Response(
      JSON.stringify({
        error: "Authentication error",
        message: "Failed to verify credentials"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
__name(onRequest, "onRequest");

// _middleware.js
async function onRequest2(context) {
  const { request } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Access-Control-Max-Age": "86400"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  try {
    const response = await context.next();
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    console.error("Middleware error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      }
    );
  }
}
__name(onRequest2, "onRequest");

// ../.wrangler/tmp/pages-05dkT6/functionsRoutes-0.7823626989782935.mjs
var routes = [
  {
    routePath: "/api/admin/events/:id/metrics",
    mountPath: "/api/admin/events/:id",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/admin/analytics/subscriptions",
    mountPath: "/api/admin/analytics",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/admin/auth/login",
    mountPath: "/api/admin/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/admin/auth/reset",
    mountPath: "/api/admin/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/admin/auth/signup",
    mountPath: "/api/admin/auth",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/admin/bands/bulk",
    mountPath: "/api/admin/bands",
    method: "PATCH",
    middlewares: [],
    modules: [onRequestPatch]
  },
  {
    routePath: "/api/admin/bands/bulk-preview",
    mountPath: "/api/admin/bands",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  },
  {
    routePath: "/api/admin/bands/:id",
    mountPath: "/api/admin/bands",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/admin/bands/:id",
    mountPath: "/api/admin/bands",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut]
  },
  {
    routePath: "/api/admin/events/:id",
    mountPath: "/api/admin/events",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete2]
  },
  {
    routePath: "/api/admin/events/:id",
    mountPath: "/api/admin/events",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost5]
  },
  {
    routePath: "/api/admin/events/:id",
    mountPath: "/api/admin/events",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut2]
  },
  {
    routePath: "/api/admin/venues/:id",
    mountPath: "/api/admin/venues",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete3]
  },
  {
    routePath: "/api/admin/venues/:id",
    mountPath: "/api/admin/venues",
    method: "PUT",
    middlewares: [],
    modules: [onRequestPut3]
  },
  {
    routePath: "/api/admin/bands",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/admin/bands",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost6]
  },
  {
    routePath: "/api/admin/events",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet4]
  },
  {
    routePath: "/api/admin/events",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost7]
  },
  {
    routePath: "/api/admin/venues",
    mountPath: "/api/admin",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet5]
  },
  {
    routePath: "/api/admin/venues",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost8]
  },
  {
    routePath: "/api/events/public",
    mountPath: "/api/events",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet6]
  },
  {
    routePath: "/api/feeds/ical",
    mountPath: "/api/feeds",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet7]
  },
  {
    routePath: "/api/subscriptions/subscribe",
    mountPath: "/api/subscriptions",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost9]
  },
  {
    routePath: "/api/subscriptions/unsubscribe",
    mountPath: "/api/subscriptions",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet8]
  },
  {
    routePath: "/api/subscriptions/verify",
    mountPath: "/api/subscriptions",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet9]
  },
  {
    routePath: "/api/schedule",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet10]
  },
  {
    routePath: "/api/admin",
    mountPath: "/api/admin",
    method: "",
    middlewares: [onRequest],
    modules: []
  },
  {
    routePath: "/",
    mountPath: "/",
    method: "",
    middlewares: [onRequest2],
    modules: []
  }
];

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-m9AYrg/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-m9AYrg/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.9748527792767414.mjs.map
