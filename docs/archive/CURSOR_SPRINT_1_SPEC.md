# Sprint 1: Promoter Self-Service - Cursor Implementation Spec

**Goal**: Enable promoters to sign up, create events, and manage them independently.

**Timeline**: 2 weeks
**Deliverable**: Working self-service event creation with embed widgets

---

## 📋 Tasks Overview

1. [Create organizations & users tables](#task-1-database-schema)
2. [Replace password auth with user accounts](#task-2-user-authentication)
3. [Build promoter signup flow](#task-3-signup-flow)
4. [Build event creation wizard](#task-4-event-creation-wizard)
5. [Generate embed widget code](#task-5-embed-widgets)
6. [Basic metrics dashboard](#task-6-metrics-dashboard)

---

## Task 1: Database Schema

### File: `database/migration-multi-org.sql`

**Create new file** with this content:

```sql
-- Migration: Add multi-org support with user accounts
-- Run after: schema.sql

-- Organizations table (promoters, venues, production companies)
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- "Pink Lemonade Records"
  slug TEXT NOT NULL UNIQUE,             -- "pink-lemonade"
  email TEXT,                            -- Contact email
  website TEXT,                          -- Optional website
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Users table (replaces single-password auth)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- bcrypt hash
  org_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',    -- 'admin', 'editor', 'viewer'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT,

  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Add org_id to existing tables
ALTER TABLE events ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE venues ADD COLUMN org_id INTEGER REFERENCES organizations(id);
ALTER TABLE bands ADD COLUMN org_id INTEGER REFERENCES organizations(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
CREATE INDEX IF NOT EXISTS idx_venues_org ON venues(org_id);
CREATE INDEX IF NOT EXISTS idx_bands_org ON bands(org_id);

-- Seed initial organizations (Pink Lemonade, Fat Scheid)
INSERT INTO organizations (name, slug, email) VALUES
  ('Pink Lemonade Records', 'pink-lemonade', 'info@pinklemonaderecords.com'),
  ('Fat Scheid', 'fat-scheid', 'info@fatscheid.com');

-- Create default admin users (update with real emails)
-- Password: 'changeme123' (bcrypt hashed)
INSERT INTO users (email, password_hash, org_id, role) VALUES
  ('admin@pinklemonaderecords.com', '$2b$10$rKq7H3Ck9gJ5qW8sN6T5.eF3P4wQ7mR2jS9kL1nM0oT8pU6vZ4xYa', 1, 'admin'),
  ('admin@fatscheid.com', '$2b$10$rKq7H3Ck9gJ5qW8sN6T5.eF3P4wQ7mR2jS9kL1nM0oT8pU6vZ4xYa', 2, 'admin');
```

**Run migration:**

```bash
npx wrangler d1 execute bandcrawl-db --local --file=database/migration-multi-org.sql
```

**Testing:**

```bash
# Verify tables created
npx wrangler d1 execute bandcrawl-db --local --command="SELECT name FROM sqlite_master WHERE type='table'"

# Should see: organizations, users
```

---

## Task 2: User Authentication

### File: `functions/api/admin/auth/signup.js`

**Create new file** for user registration:

```javascript
import bcrypt from "bcryptjs";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const { email, password, orgName } = await request.json();

    // Validation
    if (!email || !password || !orgName) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Email, password, and organization name are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Invalid email format",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Password strength validation (min 8 chars)
    if (password.length < 8) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Password must be at least 8 characters",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Check if user already exists
    const existingUser = await DB.prepare(
      "SELECT id FROM users WHERE email = ?",
    )
      .bind(email)
      .first();

    if (existingUser) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "Email already registered",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Create organization slug from name
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check if slug already exists
    const existingOrg = await DB.prepare(
      "SELECT id FROM organizations WHERE slug = ?",
    )
      .bind(slug)
      .first();

    if (existingOrg) {
      return new Response(
        JSON.stringify({
          error: "Conflict",
          message: "Organization name already taken",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create organization
    const org = await DB.prepare(
      "INSERT INTO organizations (name, slug) VALUES (?, ?) RETURNING id",
    )
      .bind(orgName, slug)
      .first();

    // Create user
    const user = await DB.prepare(
      "INSERT INTO users (email, password_hash, org_id, role) VALUES (?, ?, ?, ?) RETURNING id, email",
    )
      .bind(email, passwordHash, org.id, "admin")
      .first();

    // Generate session token (simple UUID for now)
    const sessionToken = crypto.randomUUID();

    // Store session (you'll need a sessions table or use JWT)
    // For simplicity, return token and let client store in sessionStorage

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          orgId: org.id,
          orgName: orgName,
        },
        sessionToken,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Failed to create account",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
```

### File: `functions/api/admin/auth/login.js` (UPDATE)

**Replace existing** password-only auth with email/password:

```javascript
import bcrypt from "bcryptjs";

export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    const { email, password } = await request.json();

    // Validation
    if (!email || !password) {
      return new Response(
        JSON.stringify({
          error: "Validation error",
          message: "Email and password are required",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Rate limiting (check existing rate_limit table)
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    const rateLimit = await DB.prepare(
      "SELECT * FROM rate_limit WHERE ip_address = ?",
    )
      .bind(clientIP)
      .first();

    if (rateLimit?.lockout_until) {
      const lockoutTime = new Date(rateLimit.lockout_until);
      if (lockoutTime > new Date()) {
        return new Response(
          JSON.stringify({
            error: "Too many attempts",
            message: "Account temporarily locked. Try again later.",
          }),
          {
            status: 429,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    // Find user
    const user = await DB.prepare(
      `
      SELECT u.*, o.name as org_name, o.slug as org_slug
      FROM users u
      JOIN organizations o ON u.org_id = o.id
      WHERE u.email = ?
    `,
    )
      .bind(email)
      .first();

    if (!user) {
      // Increment failed attempts
      await DB.prepare(
        `
        INSERT INTO rate_limit (ip_address, failed_attempts, last_attempt)
        VALUES (?, 1, datetime('now'))
        ON CONFLICT(ip_address) DO UPDATE SET
          failed_attempts = failed_attempts + 1,
          last_attempt = datetime('now')
      `,
      )
        .bind(clientIP)
        .run();

      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      // Increment failed attempts
      await DB.prepare(
        `
        INSERT INTO rate_limit (ip_address, failed_attempts, last_attempt)
        VALUES (?, 1, datetime('now'))
        ON CONFLICT(ip_address) DO UPDATE SET
          failed_attempts = failed_attempts + 1,
          last_attempt = datetime('now'),
          lockout_until = CASE
            WHEN failed_attempts + 1 >= 5 THEN datetime('now', '+15 minutes')
            ELSE lockout_until
          END
      `,
      )
        .bind(clientIP)
        .run();

      return new Response(
        JSON.stringify({
          error: "Authentication failed",
          message: "Invalid email or password",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Reset rate limit on successful login
    await DB.prepare("DELETE FROM rate_limit WHERE ip_address = ?")
      .bind(clientIP)
      .run();

    // Update last login
    await DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?",
    )
      .bind(user.id)
      .run();

    // Generate session token
    const sessionToken = crypto.randomUUID();

    // Log successful login
    await DB.prepare(
      `
      INSERT INTO auth_audit (action, success, ip_address, user_agent)
      VALUES ('login', 1, ?, ?)
    `,
    )
      .bind(clientIP, request.headers.get("User-Agent"))
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          orgId: user.org_id,
          orgName: user.org_name,
          orgSlug: user.org_slug,
          role: user.role,
        },
        sessionToken,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({
        error: "Server error",
        message: "Login failed",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
```

### File: `frontend/src/utils/adminApi.js` (UPDATE)

**Update** to use email/password auth:

```javascript
// Replace existing authApi with:
export const authApi = {
  async signup(email, password, orgName) {
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, orgName }),
    });
    const data = await handleResponse(response);

    // Store session token
    if (data.sessionToken) {
      window.sessionStorage.setItem("sessionToken", data.sessionToken);
      window.sessionStorage.setItem("userEmail", data.user.email);
      window.sessionStorage.setItem("orgId", data.user.orgId);
      window.sessionStorage.setItem("orgName", data.user.orgName);
    }

    return data;
  },

  async login(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse(response);

    // Store session token
    if (data.sessionToken) {
      window.sessionStorage.setItem("sessionToken", data.sessionToken);
      window.sessionStorage.setItem("userEmail", data.user.email);
      window.sessionStorage.setItem("orgId", data.user.orgId);
      window.sessionStorage.setItem("orgName", data.user.orgName);
    }

    return data;
  },

  async logout() {
    window.sessionStorage.clear();
  },

  getCurrentUser() {
    const sessionToken = window.sessionStorage.getItem("sessionToken");
    if (!sessionToken) return null;

    return {
      email: window.sessionStorage.getItem("userEmail"),
      orgId: parseInt(window.sessionStorage.getItem("orgId")),
      orgName: window.sessionStorage.getItem("orgName"),
    };
  },
};

// Update getHeaders to use session token instead of admin password
function getHeaders() {
  const sessionToken = window.sessionStorage.getItem("sessionToken");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionToken || ""}`,
  };
}
```

---

## Task 3: Signup Flow

### File: `frontend/src/admin/SignupPage.jsx`

**Create new file:**

```jsx
import { useState } from "react";
import { authApi } from "../utils/adminApi";
import { useNavigate } from "react-router-dom";

export default function SignupPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    orgName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (!formData.orgName.trim()) {
      setError("Organization name is required");
      return;
    }

    setLoading(true);

    try {
      await authApi.signup(formData.email, formData.password, formData.orgName);
      // Redirect to admin panel on success
      navigate("/admin");
    } catch (err) {
      setError(err.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-band-navy flex items-center justify-center p-4">
      <div className="bg-band-purple rounded-lg shadow-lg p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
        <p className="text-gray-400 mb-6">Start managing your events</p>

        {error && (
          <div className="bg-red-900/30 border border-red-600 rounded p-3 mb-4">
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white mb-2 text-sm">
              Organization Name *
            </label>
            <input
              type="text"
              name="orgName"
              value={formData.orgName}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="Pink Lemonade Records"
              required
            />
          </div>

          <div>
            <label className="block text-white mb-2 text-sm">Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-white mb-2 text-sm">Password *</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              placeholder="Min. 8 characters"
              required
            />
          </div>

          <div>
            <label className="block text-white mb-2 text-sm">
              Confirm Password *
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors font-semibold"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-gray-400 text-sm mt-4 text-center">
          Already have an account?{" "}
          <a href="/admin/login" className="text-band-orange hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
```

### File: `frontend/src/admin/LoginPage.jsx`

**Update existing login** to use email/password:

```jsx
// Replace password-only input with email + password
// Update handleSubmit to call authApi.login(email, password)
// Add "Sign up" link at bottom
```

---

## Task 4: Event Creation Wizard

### File: `frontend/src/admin/EventWizard.jsx`

**Create new file** for 4-step wizard:

```jsx
import { useState } from "react";
import { eventsApi } from "../utils/adminApi";

const STEPS = ["basics", "venues", "bands", "publish"];

export default function EventWizard({ onComplete, onCancel }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [eventData, setEventData] = useState({
    name: "",
    date: "",
    slug: "",
    description: "",
    venues: [],
    bands: [],
  });

  const stepComponents = {
    basics: <BasicsStep eventData={eventData} onChange={setEventData} />,
    venues: <VenuesStep eventData={eventData} onChange={setEventData} />,
    bands: <BandsStep eventData={eventData} onChange={setEventData} />,
    publish: <PublishStep eventData={eventData} />,
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handlePublish = async () => {
    try {
      // Create event
      const event = await eventsApi.create({
        name: eventData.name,
        date: eventData.date,
        slug: eventData.slug,
        description: eventData.description,
      });

      // Create venues
      // Create bands
      // ...

      onComplete(event);
    } catch (error) {
      console.error("Failed to create event:", error);
    }
  };

  return (
    <div className="bg-band-purple rounded-lg p-6">
      {/* Progress indicator */}
      <div className="flex justify-between mb-8">
        {STEPS.map((step, idx) => (
          <div
            key={step}
            className={`flex-1 text-center ${
              idx === currentStep
                ? "text-band-orange font-bold"
                : idx < currentStep
                  ? "text-green-400"
                  : "text-gray-500"
            }`}
          >
            <div className="text-sm capitalize">{step}</div>
          </div>
        ))}
      </div>

      {/* Current step content */}
      <div className="mb-6">{stepComponents[STEPS[currentStep]]}</div>

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <button
          onClick={currentStep === 0 ? onCancel : handleBack}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          {currentStep === 0 ? "Cancel" : "Back"}
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handlePublish}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Publish Event
          </button>
        )}
      </div>
    </div>
  );
}

// Implement each step component...
// BasicsStep, VenuesStep, BandsStep, PublishStep
```

**Note for Cursor**: Create 4 separate step components in same file or split into files.

---

## Task 5: Embed Widgets

### File: `frontend/src/admin/EmbedCodeGenerator.jsx`

**Create component** that generates embeddable HTML:

```jsx
export default function EmbedCodeGenerator({ event }) {
  const embedCode = `
<iframe
  src="https://setplan.app/embed/${event.slug}"
  width="100%"
  height="600"
  frameborder="0"
  title="${event.name} Schedule"
></iframe>
  `.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    alert("Embed code copied!");
  };

  return (
    <div className="bg-band-purple rounded-lg p-4">
      <h3 className="text-white font-bold mb-2">Embed on Your Website</h3>
      <p className="text-gray-400 text-sm mb-4">
        Copy this code and paste it into your website's HTML
      </p>

      <pre className="bg-band-navy p-3 rounded text-sm text-white overflow-x-auto mb-4">
        {embedCode}
      </pre>

      <button
        onClick={handleCopy}
        className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600"
      >
        Copy Code
      </button>

      <div className="mt-4 p-3 bg-blue-900/30 border border-blue-600 rounded">
        <p className="text-blue-200 text-sm">
          <strong>Preview:</strong>{" "}
          <a
            href={`/embed/${event.slug}`}
            target="_blank"
            className="underline"
          >
            Open in new tab
          </a>
        </p>
      </div>
    </div>
  );
}
```

### File: `frontend/src/pages/EmbedPage.jsx`

**Create embed view** (minimal UI for iframe):

```jsx
import { useParams } from "react-router-dom";
import ScheduleView from "../components/ScheduleView";

export default function EmbedPage() {
  const { slug } = useParams();

  // Load event by slug
  // Render minimal schedule view (no header/footer)

  return (
    <div className="min-h-screen bg-band-navy p-2">
      <ScheduleView eventSlug={slug} embedded={true} />
    </div>
  );
}
```

---

## Task 6: Metrics Dashboard

### File: `functions/api/admin/events/[id]/metrics.js`

**Create endpoint** for privacy-preserving metrics:

```javascript
export async function onRequestGet(context) {
  const { request, env, params } = context;
  const { DB } = env;
  const eventId = params.id;

  try {
    // Verify user owns this event (check org_id)
    // ...

    // Get event metrics
    const metrics = await DB.prepare(
      `
      SELECT
        total_schedule_builds,
        unique_visitors,
        last_updated
      FROM event_metrics
      WHERE event_id = ?
    `,
    )
      .bind(eventId)
      .first();

    // Get most popular bands
    const popularBands = await DB.prepare(
      `
      SELECT
        band_id,
        COUNT(*) as schedule_count
      FROM schedule_builds
      WHERE event_id = ?
      GROUP BY band_id
      ORDER BY schedule_count DESC
      LIMIT 10
    `,
    )
      .bind(eventId)
      .all();

    return new Response(
      JSON.stringify({
        success: true,
        metrics: {
          totalScheduleBuilds: metrics?.total_schedule_builds || 0,
          uniqueVisitors: metrics?.unique_visitors || 0,
          lastUpdated: metrics?.last_updated,
          popularBands: popularBands.results || [],
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Metrics error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to load metrics",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
```

### File: `frontend/src/admin/MetricsDashboard.jsx`

**Create dashboard** showing key metrics:

```jsx
import { useState, useEffect } from "react";
import { eventsApi } from "../utils/adminApi";

export default function MetricsDashboard({ eventId }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, [eventId]);

  const loadMetrics = async () => {
    try {
      const data = await eventsApi.getMetrics(eventId);
      setMetrics(data.metrics);
    } catch (error) {
      console.error("Failed to load metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-white">Loading metrics...</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-bold text-white">Event Metrics</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Schedule Builds */}
        <div className="bg-band-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Schedule Builds</div>
          <div className="text-3xl font-bold text-white mt-2">
            {metrics.totalScheduleBuilds}
          </div>
        </div>

        {/* Unique Visitors */}
        <div className="bg-band-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Unique Visitors</div>
          <div className="text-3xl font-bold text-white mt-2">
            {metrics.uniqueVisitors}
          </div>
        </div>

        {/* Last Updated */}
        <div className="bg-band-purple rounded-lg p-4">
          <div className="text-gray-400 text-sm">Last Activity</div>
          <div className="text-lg text-white mt-2">
            {new Date(metrics.lastUpdated).toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Popular Bands */}
      <div className="bg-band-purple rounded-lg p-4">
        <h4 className="text-white font-semibold mb-3">Most Added Bands</h4>
        <div className="space-y-2">
          {metrics.popularBands.map((band, idx) => (
            <div key={band.band_id} className="flex justify-between text-sm">
              <span className="text-white">
                {idx + 1}. {band.band_name}
              </span>
              <span className="text-gray-400">
                {band.schedule_count} schedules
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Testing Checklist

### Database Migration

- [ ] Tables created successfully
- [ ] Indexes exist
- [ ] Seed data inserted (Pink Lemonade, Fat Scheid)
- [ ] Foreign keys working

### Authentication

- [ ] Signup creates org + user
- [ ] Login works with email/password
- [ ] Rate limiting prevents brute force
- [ ] Session token stored in sessionStorage
- [ ] Logout clears session

### Event Creation

- [ ] Wizard progresses through 4 steps
- [ ] Event created with org_id
- [ ] Venues assigned to event
- [ ] Bands assigned to event
- [ ] Public page accessible at `/events/{slug}`

### Embed Widget

- [ ] Code generator produces valid HTML
- [ ] Copy button works
- [ ] Embed page renders schedule
- [ ] No admin UI in embed view

### Metrics

- [ ] Dashboard loads metrics
- [ ] Schedule builds counted
- [ ] Popular bands ranked
- [ ] No PII exposed

---

## Deployment Steps

1. **Run migration:**

   ```bash
   npx wrangler d1 execute bandcrawl-db --local --file=database/migration-multi-org.sql
   ```

2. **Install bcrypt:**

   ```bash
   npm install bcryptjs
   ```

3. **Rebuild frontend:**

   ```bash
   cd frontend && npm run build
   ```

4. **Test locally:**

   ```bash
   npx wrangler pages dev frontend/dist --binding DB=bandcrawl-db --local
   ```

5. **Deploy to production:**

   ```bash
   # Run migration on production D1
   npx wrangler d1 execute bandcrawl-db --file=database/migration-multi-org.sql

   # Deploy
   npx wrangler pages deploy frontend/dist
   ```

---

## Success Criteria

Sprint 1 is complete when:

- ✅ Promoters can sign up and create account
- ✅ Promoters can log in with email/password
- ✅ Promoters can create events via wizard
- ✅ Events have public pages at `/events/{slug}`
- ✅ Embed code generator works
- ✅ Metrics dashboard shows basic stats
- ✅ All tests pass
