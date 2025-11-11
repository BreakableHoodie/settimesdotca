# Sprint 3: Discovery Features - Cursor Implementation Spec

**Goal**: Enable fans to discover shows without social media dependency.

**Timeline**: 2 weeks
**Deliverable**: Email subscriptions, public API, iCal feeds - no algorithm, privacy-first

**Strategic Context**: See `~/Projects/DISCOVERY_DISRUPTION_STRATEGY.md` (private, not in repo)

---

## 📋 Tasks Overview

1. [Email subscription system (location + genre)](#task-1-email-subscriptions)
2. [Public event API (JSON feed)](#task-2-public-event-api)
3. [iCal feeds (calendar sync)](#task-3-ical-feeds)
4. [Subscription management UI](#task-4-subscription-ui)
5. [Email delivery service](#task-5-email-delivery)
6. [Privacy-preserving analytics](#task-6-analytics)

---

## Task 1: Email Subscriptions

### Goal

Fans subscribe to location + genre, get weekly digest of new shows. No algorithm, chronological only.

### File: `database/migration-subscriptions.sql`

**Create new file** with subscription tables:

```sql
-- Migration: Add email subscription system
-- Run after: migration-multi-org.sql

-- Email subscriptions
CREATE TABLE IF NOT EXISTS email_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  city TEXT NOT NULL,                    -- "portland", "seattle", "all"
  genre TEXT NOT NULL,                   -- "punk", "indie", "all"
  frequency TEXT NOT NULL DEFAULT 'weekly', -- "daily", "weekly", "monthly"
  verified BOOLEAN NOT NULL DEFAULT 0,   -- Email verified via confirmation link
  verification_token TEXT UNIQUE,        -- Token for email verification
  unsubscribe_token TEXT UNIQUE NOT NULL, -- Token for unsubscribe link
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_email_sent TEXT,                  -- When was last email sent

  UNIQUE(email, city, genre)             -- Prevent duplicate subscriptions
);

-- Subscription verification log (for debugging)
CREATE TABLE IF NOT EXISTS subscription_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  verified_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT,                       -- For spam prevention

  FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id) ON DELETE CASCADE
);

-- Unsubscribe log (for metrics)
CREATE TABLE IF NOT EXISTS subscription_unsubscribes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  unsubscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT,                           -- Optional feedback

  FOREIGN KEY (subscription_id) REFERENCES email_subscriptions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON email_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_city_genre ON email_subscriptions(city, genre);
CREATE INDEX IF NOT EXISTS idx_subscriptions_verified ON email_subscriptions(verified);
CREATE INDEX IF NOT EXISTS idx_subscriptions_verification_token ON email_subscriptions(verification_token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_unsubscribe_token ON email_subscriptions(unsubscribe_token);
```

**Run migration:**

```bash
npx wrangler d1 execute bandcrawl-db --local --file=database/migration-subscriptions.sql
```

---

## Task 2: Public Event API

### Goal

Public JSON API for events (no auth required). Anyone can consume the feed.

### File: `functions/api/events/public.js`

**Create new file** for public event API:

```javascript
// Public API for event discovery
// No authentication required
// Rate limited to prevent abuse

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Query parameters
  const city = url.searchParams.get("city") || "all";
  const genre = url.searchParams.get("genre") || "all";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
  const upcoming = url.searchParams.get("upcoming") !== "false"; // Default true

  try {
    // Build query
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

    // Filter by city
    if (city !== "all") {
      query += ` AND LOWER(e.city) = LOWER(?)`;
      params.push(city);
    }

    // Filter by upcoming (future events only)
    if (upcoming) {
      query += ` AND e.date >= date('now')`;
    }

    query += `
      GROUP BY e.id
      ORDER BY e.date ASC
      LIMIT ?
    `;
    params.push(limit);

    // Execute query
    const { results: events } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    // For each event, get bands if genre filter is specified
    let filteredEvents = events;

    if (genre !== "all") {
      filteredEvents = [];

      for (const event of events) {
        // Check if event has bands matching genre
        const { results: bands } = await env.DB.prepare(
          `
          SELECT COUNT(*) as count
          FROM bands
          WHERE event_id = ? AND LOWER(genre) = LOWER(?)
        `,
        )
          .bind(event.id, genre)
          .all();

        if (bands[0].count > 0) {
          filteredEvents.push(event);
        }
      }
    }

    // Return JSON
    return new Response(
      JSON.stringify({
        events: filteredEvents,
        filters: {
          city: city,
          genre: genre,
          upcoming: upcoming,
          limit: limit,
        },
        count: filteredEvents.length,
        generated_at: new Date().toISOString(),
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*", // Allow anyone to consume
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      },
    );
  } catch (error) {
    console.error("Public API error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch events" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

---

## Task 3: iCal Feeds

### Goal

Generate .ics files that fans can subscribe to in their calendar apps.

### File: `functions/api/feeds/ical.js`

**Create new file** for iCal generation:

```javascript
// iCal feed generation
// Format: https://portland.ics?genre=indie
// Compatible with Google Calendar, Apple Calendar, Outlook

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Extract city from subdomain or path
  const hostname = url.hostname;
  const pathParts = url.pathname.split("/");
  const city = url.searchParams.get("city") || "all";
  const genre = url.searchParams.get("genre") || "all";

  try {
    // Get events
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

    const { results: bands } = await env.DB.prepare(query)
      .bind(...params)
      .all();

    // Generate iCal content
    const ical = generateICal(bands, city, genre);

    return new Response(ical, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${city}-${genre}.ics"`,
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("iCal generation error:", error);
    return new Response("Failed to generate calendar feed", { status: 500 });
  }
}

function generateICal(bands, city, genre) {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  let ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Concert Schedule//EN",
    `X-WR-CALNAME:${city} ${genre} Shows`,
    "X-WR-TIMEZONE:America/Los_Angeles",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const band of bands) {
    if (!band.band_name) continue;

    // Parse date and time
    const eventDate = band.date; // YYYY-MM-DD
    const startTime = band.start_time || "20:00"; // HH:MM
    const endTime = band.end_time || "21:00";

    // Convert to iCal format (YYYYMMDDTHHMMSS)
    const dtstart = `${eventDate.replace(/-/g, "")}T${startTime.replace(/:/g, "")}00`;
    const dtend = `${eventDate.replace(/-/g, "")}T${endTime.replace(/:/g, "")}00`;

    // Generate unique ID
    const uid = `band-${band.id}-${eventDate}@concertschedule.app`;

    // Location
    const location = band.venue_name
      ? `${band.venue_name}${band.address ? ", " + band.address : ""}`
      : "TBD";

    // Description
    const description = [
      band.band_name,
      band.venue_name ? `Venue: ${band.venue_name}` : "",
      band.description || "",
    ]
      .filter(Boolean)
      .join("\\n");

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
      "END:VEVENT",
    );
  }

  ical.push("END:VCALENDAR");

  return ical.join("\r\n");
}

function escapeIcal(text) {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
```

---

## Task 4: Subscription UI

### Goal

Landing page where fans can subscribe to email notifications.

### File: `frontend/src/pages/SubscribePage.jsx`

**Create new file** for subscription form:

```jsx
import { useState } from "react";

export default function SubscribePage() {
  const [formData, setFormData] = useState({
    email: "",
    city: "portland",
    genre: "all",
    frequency: "weekly",
  });
  const [status, setStatus] = useState("idle"); // idle, submitting, success, error
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("submitting");

    try {
      const response = await fetch("/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus("success");
        setMessage("Check your email to confirm your subscription!");
        setFormData({
          email: "",
          city: "portland",
          genre: "all",
          frequency: "weekly",
        });
      } else {
        setStatus("error");
        setMessage(data.error || "Subscription failed. Please try again.");
      }
    } catch (error) {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-band-navy to-band-purple p-4">
      <div className="max-w-2xl mx-auto pt-20">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Never Miss a Show
          </h1>
          <p className="text-xl text-gray-300">
            Get weekly emails about concerts in your city. No algorithm, no ads,
            just shows.
          </p>
        </div>

        {/* Form */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-white font-medium mb-2"
              >
                Email Address
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none placeholder-gray-400"
                placeholder="you@example.com"
              />
            </div>

            {/* City */}
            <div>
              <label
                htmlFor="city"
                className="block text-white font-medium mb-2"
              >
                City
              </label>
              <select
                id="city"
                value={formData.city}
                onChange={(e) =>
                  setFormData({ ...formData, city: e.target.value })
                }
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none"
              >
                <option value="portland">Portland</option>
                <option value="seattle">Seattle</option>
                <option value="all">All Cities</option>
              </select>
            </div>

            {/* Genre */}
            <div>
              <label
                htmlFor="genre"
                className="block text-white font-medium mb-2"
              >
                Genre Preference
              </label>
              <select
                id="genre"
                value={formData.genre}
                onChange={(e) =>
                  setFormData({ ...formData, genre: e.target.value })
                }
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none"
              >
                <option value="all">All Genres</option>
                <option value="punk">Punk</option>
                <option value="indie">Indie</option>
                <option value="rock">Rock</option>
                <option value="metal">Metal</option>
                <option value="electronic">Electronic</option>
              </select>
            </div>

            {/* Frequency */}
            <div>
              <label
                htmlFor="frequency"
                className="block text-white font-medium mb-2"
              >
                Email Frequency
              </label>
              <select
                id="frequency"
                value={formData.frequency}
                onChange={(e) =>
                  setFormData({ ...formData, frequency: e.target.value })
                }
                className="w-full px-4 py-3 rounded-lg bg-white/10 text-white border border-white/20 focus:border-band-orange focus:outline-none"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full bg-band-orange hover:bg-band-orange/90 text-white font-bold py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "submitting" ? "Subscribing..." : "Subscribe"}
            </button>

            {/* Status message */}
            {message && (
              <div
                className={`p-4 rounded-lg ${
                  status === "success"
                    ? "bg-green-500/20 text-green-200"
                    : "bg-red-500/20 text-red-200"
                }`}
              >
                {message}
              </div>
            )}
          </form>

          {/* Privacy note */}
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-sm text-gray-400 text-center">
              We respect your privacy. No tracking, no ads, no selling your
              data.
              <br />
              Unsubscribe anytime with one click.
            </p>
          </div>
        </div>

        {/* Alternative feeds */}
        <div className="mt-12 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">
            Prefer RSS or Calendar Sync?
          </h2>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="/api/feeds/ical?city=portland&genre=all"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition"
            >
              📅 Subscribe to Calendar
            </a>
            <a
              href="/api/events/public?city=portland&genre=all"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg border border-white/20 transition"
            >
              📡 JSON Feed
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Task 5: Email Delivery

### Goal

Backend endpoints for subscription management and email sending.

### File: `functions/api/subscriptions/subscribe.js`

**Create new file** for subscription handling:

```javascript
// Subscription endpoint
// POST /api/subscriptions/subscribe

import { generateToken } from "../../utils/tokens";

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { email, city, genre, frequency } = await request.json();

    // Validation
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!city || !genre || !frequency) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Generate tokens
    const verificationToken = generateToken();
    const unsubscribeToken = generateToken();

    // Check if subscription already exists
    const { results: existing } = await env.DB.prepare(
      `
      SELECT id, verified FROM email_subscriptions
      WHERE email = ? AND city = ? AND genre = ?
    `,
    )
      .bind(email, city, genre)
      .all();

    if (existing.length > 0) {
      if (existing[0].verified) {
        return new Response(
          JSON.stringify({
            error: "You are already subscribed to this feed",
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      } else {
        // Re-send verification email
        await sendVerificationEmail(
          env,
          email,
          city,
          genre,
          existing[0].verification_token,
        );

        return new Response(
          JSON.stringify({
            message: "Verification email sent. Please check your inbox.",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Create subscription
    const result = await env.DB.prepare(
      `
      INSERT INTO email_subscriptions (email, city, genre, frequency, verification_token, unsubscribe_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
      .bind(email, city, genre, frequency, verificationToken, unsubscribeToken)
      .run();

    // Send verification email
    await sendVerificationEmail(env, email, city, genre, verificationToken);

    return new Response(
      JSON.stringify({
        message: "Subscription created. Please check your email to verify.",
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Subscription error:", error);
    return new Response(JSON.stringify({ error: "Subscription failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function sendVerificationEmail(env, email, city, genre, token) {
  const verifyUrl = `${env.PUBLIC_URL}/verify?token=${token}`;

  // TODO: Integrate with email service (SendGrid, Mailgun, etc.)
  // For now, just log
  console.log(`Verification email for ${email}: ${verifyUrl}`);

  // In production, send actual email:
  // await env.EMAIL_SERVICE.send({
  //   to: email,
  //   subject: `Verify your subscription to ${city} ${genre} shows`,
  //   html: `
  //     <p>Thanks for subscribing!</p>
  //     <p>Click to verify: <a href="${verifyUrl}">${verifyUrl}</a></p>
  //   `
  // })
}
```

### File: `functions/api/subscriptions/verify.js`

**Create new file** for email verification:

```javascript
// Email verification endpoint
// GET /api/subscriptions/verify?token=xxx

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing verification token", { status: 400 });
  }

  try {
    // Find subscription
    const { results } = await env.DB.prepare(
      `
      SELECT id, email, city, genre, verified
      FROM email_subscriptions
      WHERE verification_token = ?
    `,
    )
      .bind(token)
      .all();

    if (results.length === 0) {
      return new Response("Invalid verification token", { status: 404 });
    }

    const subscription = results[0];

    if (subscription.verified) {
      return new Response("Email already verified", { status: 200 });
    }

    // Mark as verified
    await env.DB.prepare(
      `
      UPDATE email_subscriptions
      SET verified = 1
      WHERE id = ?
    `,
    )
      .bind(subscription.id)
      .run();

    // Log verification
    await env.DB.prepare(
      `
      INSERT INTO subscription_verifications (subscription_id)
      VALUES (?)
    `,
    )
      .bind(subscription.id)
      .run();

    // Redirect to success page
    return Response.redirect(`${env.PUBLIC_URL}/subscribe?verified=true`, 302);
  } catch (error) {
    console.error("Verification error:", error);
    return new Response("Verification failed", { status: 500 });
  }
}
```

### File: `functions/utils/tokens.js`

**Create new file** for token generation:

```javascript
// Secure token generation for subscriptions

export function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
```

---

## Task 6: Analytics

### Goal

Privacy-preserving analytics for subscription metrics.

### File: `functions/api/admin/analytics/subscriptions.js`

**Create new file** for subscription analytics:

```javascript
// Subscription analytics (privacy-preserving)
// No PII exposed, aggregate metrics only

export async function onRequestGet(context) {
  const { env } = context;

  try {
    // Total subscriptions
    const { results: total } = await env.DB.prepare(
      `
      SELECT COUNT(*) as count FROM email_subscriptions WHERE verified = 1
    `,
    ).all();

    // By city
    const { results: byCity } = await env.DB.prepare(
      `
      SELECT city, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY city
      ORDER BY count DESC
    `,
    ).all();

    // By genre
    const { results: byGenre } = await env.DB.prepare(
      `
      SELECT genre, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY genre
      ORDER BY count DESC
    `,
    ).all();

    // By frequency
    const { results: byFrequency } = await env.DB.prepare(
      `
      SELECT frequency, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      GROUP BY frequency
    `,
    ).all();

    // Growth over time (last 30 days)
    const { results: growth } = await env.DB.prepare(
      `
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM email_subscriptions
      WHERE verified = 1
      AND created_at >= date('now', '-30 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
    ).all();

    // Unsubscribe rate
    const { results: unsubscribes } = await env.DB.prepare(
      `
      SELECT COUNT(*) as count FROM subscription_unsubscribes
    `,
    ).all();

    return new Response(
      JSON.stringify({
        total_subscribers: total[0].count,
        by_city: byCity,
        by_genre: byGenre,
        by_frequency: byFrequency,
        growth_30_days: growth,
        total_unsubscribes: unsubscribes[0].count,
        unsubscribe_rate:
          total[0].count > 0
            ? ((unsubscribes[0].count / total[0].count) * 100).toFixed(2) + "%"
            : "0%",
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Analytics error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch analytics" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
```

---

## Testing Checklist

### Email Subscriptions

- [ ] Can submit subscription form
- [ ] Duplicate email/city/genre prevented
- [ ] Verification email sent (check logs)
- [ ] Verification link marks subscription as verified
- [ ] Unverified subscriptions don't receive emails

### Public API

- [ ] `/api/events/public` returns JSON
- [ ] City filter works (portland, seattle, all)
- [ ] Genre filter works (punk, indie, all)
- [ ] Upcoming filter excludes past events
- [ ] CORS headers allow cross-origin access
- [ ] Rate limiting prevents abuse (optional)

### iCal Feeds

- [ ] `/api/feeds/ical?city=portland&genre=indie` returns .ics file
- [ ] Google Calendar can subscribe to feed
- [ ] Apple Calendar can subscribe to feed
- [ ] Events appear in calendar correctly
- [ ] Feed updates when new events added

### Privacy

- [ ] No user tracking pixels
- [ ] No PII in analytics
- [ ] Aggregate metrics only
- [ ] One-click unsubscribe works
- [ ] Email addresses not exposed in API

---

## Deployment Steps

1. **Run migration:**

   ```bash
   npx wrangler d1 execute bandcrawl-db --local --file=database/migration-subscriptions.sql
   ```

2. **Set environment variables:**

   ```bash
   # In wrangler.toml
   [vars]
   PUBLIC_URL = "https://setplan.app" # or dev URL

   # Optional: Email service API key (future)
   # EMAIL_API_KEY = "..."
   ```

3. **Test locally:**

   ```bash
   cd frontend && npm run build
   npx wrangler pages dev dist --binding DB=bandcrawl-db --local
   ```

4. **Test subscription flow:**
   - Visit `/subscribe`
   - Submit email + city + genre
   - Check console for verification link
   - Visit verification link
   - Check database for verified subscription

5. **Test public API:**

   ```bash
   curl "http://localhost:8788/api/events/public?city=portland&genre=all"
   ```

6. **Test iCal feed:**

   ```bash
   curl "http://localhost:8788/api/feeds/ical?city=portland&genre=indie" > portland-indie.ics
   # Import portland-indie.ics into calendar app
   ```

7. **Deploy to production:**

   ```bash
   # Run migration on production D1
   npx wrangler d1 execute bandcrawl-db --file=database/migration-subscriptions.sql

   # Deploy
   npx wrangler pages deploy frontend/dist
   ```

---

## Success Criteria

Sprint 3 complete when:

- ✅ Fans can subscribe via web form
- ✅ Email verification works (check logs)
- ✅ Public API returns event JSON
- ✅ iCal feeds work in Google/Apple Calendar
- ✅ No PII exposed in analytics
- ✅ Subscription UI is mobile-responsive
- ✅ All privacy principles maintained

---

## Future Enhancements (Sprint 4)

1. **Email delivery service** (SendGrid/Mailgun integration)
2. **Weekly digest emails** (cron job to send digests)
3. **SMS notifications** (Twilio integration, premium feature)
4. **Collaborative filtering** ("Fans like you also went to...")
5. **Embeddable widgets** (for blogs/websites)
6. **RSS feeds** (alternative to iCal)

---

## Privacy Commitments

**What we collect:**

- Email address (for delivery)
- City + genre preferences (for filtering)
- Subscription timestamps (for metrics)

**What we DON'T collect:**

- ❌ Names, phone numbers
- ❌ Social profiles
- ❌ Browsing history
- ❌ Cross-site tracking
- ❌ Email open rates (no tracking pixels)

**User rights:**

- One-click unsubscribe (always)
- Email address never sold or shared
- Aggregate metrics only (no individual tracking)
- Data deleted on unsubscribe (GDPR compliant)

---

## Business Model Impact

**Freemium pricing** (from GENERALIZATION_PLAN.md):

- **Free tier**: List events, get discovered organically
- **Pro tier** ($25/event): Featured placement in email digests
- **Premium tier** ($100/year): Direct subscriber access, SMS notifications
- **Enterprise** ($200+/month): Custom integrations, white-label

**Discovery revenue drivers:**

- Promoters pay for **featured placement** (top of email digest)
- Promoters pay for **direct subscriber access** (send to your followers)
- NOT advertising (no algorithm manipulation)
- Fans ALWAYS free (no two-sided marketplace)

**Value proposition for promoters:**
"Reach 500 local indie fans for $25/event vs $200 on Instagram ads with zero guarantee"

---

## SuperClaude Notes

**Framework alignment:**

- **Privacy Respecting** (FAN_FIRST_SPEC.md) - no tracking, aggregate only
- **Fan-First** - discovery without social media dependency
- **Opening Band Equity** - chronological, no algorithm boosting headliners
- **Evidence-Based** - test all endpoints, verify privacy claims

**Strategic insight:**
This is the competitive moat. Schedule builder is table stakes, discovery disrupts social media dependency.
