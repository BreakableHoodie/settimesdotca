/**
 * Admin API: Performers (Global Band/Performer Registry)
 *
 * GET    /api/admin/performers       - List all performers
 * GET    /api/admin/performers/:id   - Get single performer
 * POST   /api/admin/performers       - Create new performer
 * PUT    /api/admin/performers/:id   - Update performer
 * DELETE /api/admin/performers/:id   - Delete performer
 */

import { checkPermission, auditLog } from "./_middleware.js";
import {
  FIELD_LIMITS,
  validateLength,
  isValidEmail,
} from "../../utils/validation.js";
import { getClientIP } from "../../utils/request.js";

const ROLE_LEVELS = { admin: 3, editor: 2, viewer: 1 };

function sanitizeOptionalText(value, maxLength) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const lengthCheck = validateLength(text, { max: maxLength });
  if (!lengthCheck.valid) {
    throw new Error(lengthCheck.error || "Invalid field length");
  }
  return text;
}

function sanitizeOptionalHttpUrl(value, maxLength) {
  const text = sanitizeOptionalText(value, maxLength);
  if (!text) return null;
  if (!/^https?:\/\//i.test(text)) {
    throw new Error("URL must start with http:// or https://");
  }
  return text;
}

// Helper to normalize band name for uniqueness check
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseOrigin(origin) {
  if (!origin) return { city: null, region: null };
  const [city, region] = origin.split(",").map((part) => part.trim());
  return {
    city: city || null,
    region: region || null,
  };
}

// Helper to unpack social links
function unpackSocialLinks(performer) {
  if (!performer) return null;
  let social = {};
  try {
    social = JSON.parse(performer.social_links || "{}");
  } catch (_e) {
    social = {};
  }
  const origin =
    [performer.origin_city, performer.origin_region]
      .filter(Boolean)
      .join(", ") ||
    performer.origin ||
    "";
  return {
    ...performer,
    origin,
    url: social.website || "",
    instagram: social.instagram || "",
    bandcamp: social.bandcamp || "",
    facebook: social.facebook || "",
  };
}

function redactPerformerForRole(performer, role) {
  const level = ROLE_LEVELS[role] || 0;
  if (level >= ROLE_LEVELS.editor) {
    return performer;
  }
  return {
    ...performer,
    contact_email: null,
  };
}

// GET - List all performers
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  // RBAC: Require viewer role or higher
  const permCheck = await checkPermission(context, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const role = permCheck.user?.role || "viewer";
    // GET /api/admin/performers/:id - Get single performer
    if (id && id !== "performers") {
      if (!/^\d+$/.test(id)) {
        return new Response(JSON.stringify({ error: "Invalid performer ID" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const performer = await DB.prepare(
        `SELECT id, name, name_normalized, genre, origin, origin_city, origin_region,
                contact_email, is_active, description, photo_url, social_links,
                total_page_views, total_social_clicks, created_at, updated_at
         FROM band_profiles WHERE id = ?`,
      )
        .bind(id)
        .first();

      if (!performer) {
        return new Response(JSON.stringify({ error: "Performer not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get performance stats for this performer
      const stats = await DB.prepare(
        `
        SELECT 
          COUNT(*) as total_performances,
          COUNT(DISTINCT event_id) as total_events,
          COUNT(DISTINCT venue_id) as total_venues
        FROM performances 
        WHERE band_profile_id = ?
      `,
      )
        .bind(id)
        .first();

      return new Response(
        JSON.stringify({
          success: true,
          performer: { ...redactPerformerForRole(unpackSocialLinks(performer), role), stats },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // GET /api/admin/performers - List all performers
    const result = await DB.prepare(
      `
      SELECT
        p.id,
        p.name,
        p.name_normalized,
        p.genre,
        p.origin,
        p.origin_city,
        p.origin_region,
        p.contact_email,
        p.is_active,
        p.description,
        p.photo_url,
        p.social_links,
        p.total_page_views,
        p.total_social_clicks,
        p.created_at,
        p.updated_at,
        COUNT(perf.id) as performance_count
      FROM band_profiles p
      LEFT JOIN performances perf ON perf.band_profile_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC
    `,
    ).all();

    const performers = (result.results || [])
      .map(unpackSocialLinks)
      .map((performer) => redactPerformerForRole(performer, role));

    return new Response(JSON.stringify({ success: true, performers }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Failed to fetch performers:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch performers" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// POST - Create new performer
export async function onRequestPost(context) {
  const { request, env } = context;
  const { DB } = env;
  const ipAddress = getClientIP(request);

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const currentUser = permCheck.user;
    const body = await request.json();
    const {
      name,
      genre,
      origin,
      origin_city,
      origin_region,
      contact_email,
      is_active,
      description,
      photo_url,
      url,
      instagram,
      bandcamp,
      facebook,
    } = body;

    // Validation
    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: "Performer name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const resolvedName = sanitizeOptionalText(name, FIELD_LIMITS.bandName.max);
    const nameNormalized = normalizeName(resolvedName);

    // Check for duplicate name
    const existing = await DB.prepare(
      "SELECT id FROM band_profiles WHERE name_normalized = ?",
    )
      .bind(nameNormalized)
      .first();

    if (existing) {
      return new Response(
        JSON.stringify({
          error: "A performer with this name already exists",
          existing_id: existing.id,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Pack social links
    if (!resolvedName) {
      return new Response(
        JSON.stringify({ error: "Performer name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const resolvedGenre = sanitizeOptionalText(genre, FIELD_LIMITS.bandGenre.max);
    const resolvedDescription = sanitizeOptionalText(description, FIELD_LIMITS.bandDescription.max);
    const resolvedPhotoUrl = sanitizeOptionalHttpUrl(photo_url, FIELD_LIMITS.bandUrl.max);
    const resolvedWebsite = sanitizeOptionalHttpUrl(url, FIELD_LIMITS.bandUrl.max);
    const resolvedBandcamp = sanitizeOptionalHttpUrl(bandcamp, FIELD_LIMITS.bandUrl.max);
    const resolvedFacebook = sanitizeOptionalHttpUrl(facebook, FIELD_LIMITS.bandUrl.max);
    const resolvedInstagram = sanitizeOptionalText(instagram, FIELD_LIMITS.socialHandle.max);
    const resolvedContactEmail = sanitizeOptionalText(contact_email, FIELD_LIMITS.bandContactEmail.max);
    if (resolvedContactEmail && !isValidEmail(resolvedContactEmail)) {
      return new Response(
        JSON.stringify({ error: "Contact email must be a valid email address" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const socialLinks = JSON.stringify({
      website: resolvedWebsite,
      instagram: resolvedInstagram,
      bandcamp: resolvedBandcamp,
      facebook: resolvedFacebook,
    });

    // Create performer
    const parsedOrigin = parseOrigin(origin?.trim());
    const resolvedOriginCity = origin_city?.trim() || parsedOrigin.city;
    const resolvedOriginRegion = origin_region?.trim() || parsedOrigin.region;
    const computedOrigin =
      origin?.trim() ||
      [resolvedOriginCity, resolvedOriginRegion].filter(Boolean).join(", ") ||
      null;
    const resolvedIsActive =
      is_active === undefined ? 1 : Number(is_active) === 1 ? 1 : 0;

    const result = await DB.prepare(
      `
      INSERT INTO band_profiles (
        name,
        name_normalized,
        genre,
        origin,
        origin_city,
        origin_region,
        contact_email,
        is_active,
        description,
        photo_url,
        social_links
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `,
    )
      .bind(
        resolvedName,
        nameNormalized,
        resolvedGenre,
        computedOrigin,
        resolvedOriginCity,
        resolvedOriginRegion,
        resolvedContactEmail,
        resolvedIsActive,
        resolvedDescription,
        resolvedPhotoUrl,
        socialLinks,
      )
      .first();

    await auditLog(
      env,
      currentUser.userId,
      "performer.created",
      "band_profile",
      result?.id,
      { name: resolvedName },
      ipAddress,
    );

    return new Response(
      JSON.stringify({ success: true, performer: unpackSocialLinks(result) }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Failed to create performer:", error);
    return new Response(
      JSON.stringify({ error: "Failed to create performer" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// PUT - Update performer
export async function onRequestPut(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();
  const ipAddress = getClientIP(request);

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  if (!id || id === "performers" || !/^\d+$/.test(id)) {
    return new Response(
      JSON.stringify({ error: "Valid performer ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const currentUser = permCheck.user;
    const body = await request.json();
    const {
      name,
      genre,
      origin,
      origin_city,
      origin_region,
      contact_email,
      is_active,
      description,
      photo_url,
      url: performerUrl,
      instagram,
      bandcamp,
      facebook,
    } = body;

    // Check performer exists
    const existing = await DB.prepare(
      "SELECT id FROM band_profiles WHERE id = ?",
    )
      .bind(id)
      .first();

    if (!existing) {
      return new Response(JSON.stringify({ error: "Performer not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validation
    if (name && !name.trim()) {
      return new Response(
        JSON.stringify({ error: "Performer name cannot be empty" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Check for duplicate name (if name is being changed)
    let nameNormalized = null;
    if (name) {
      const resolvedName = sanitizeOptionalText(name, FIELD_LIMITS.bandName.max);
      if (!resolvedName) {
        return new Response(
          JSON.stringify({ error: "Performer name cannot be empty" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      nameNormalized = normalizeName(resolvedName);
      const duplicate = await DB.prepare(
        "SELECT id FROM band_profiles WHERE name_normalized = ? AND id != ?",
      )
        .bind(nameNormalized, id)
        .first();

      if (duplicate) {
        return new Response(
          JSON.stringify({
            error: "A performer with this name already exists",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Pack social links
    const resolvedGenre = sanitizeOptionalText(genre, FIELD_LIMITS.bandGenre.max);
    const resolvedDescription = sanitizeOptionalText(description, FIELD_LIMITS.bandDescription.max);
    const resolvedPhotoUrl = sanitizeOptionalHttpUrl(photo_url, FIELD_LIMITS.bandUrl.max);
    const resolvedWebsite = sanitizeOptionalHttpUrl(performerUrl, FIELD_LIMITS.bandUrl.max);
    const resolvedBandcamp = sanitizeOptionalHttpUrl(bandcamp, FIELD_LIMITS.bandUrl.max);
    const resolvedFacebook = sanitizeOptionalHttpUrl(facebook, FIELD_LIMITS.bandUrl.max);
    const resolvedInstagram = sanitizeOptionalText(instagram, FIELD_LIMITS.socialHandle.max);
    const resolvedContactEmail = sanitizeOptionalText(contact_email, FIELD_LIMITS.bandContactEmail.max);
    if (resolvedContactEmail && !isValidEmail(resolvedContactEmail)) {
      return new Response(
        JSON.stringify({ error: "Contact email must be a valid email address" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const socialLinks = JSON.stringify({
      website: resolvedWebsite,
      instagram: resolvedInstagram,
      bandcamp: resolvedBandcamp,
      facebook: resolvedFacebook,
    });

    // Update performer
    const parsedOrigin = parseOrigin(origin?.trim());
    const resolvedOriginCity = origin_city?.trim() || parsedOrigin.city;
    const resolvedOriginRegion = origin_region?.trim() || parsedOrigin.region;
    const computedOrigin =
      origin?.trim() ||
      [resolvedOriginCity, resolvedOriginRegion].filter(Boolean).join(", ") ||
      null;
    const resolvedIsActive =
      is_active === undefined ? null : Number(is_active) === 1 ? 1 : 0;

    const result = await DB.prepare(
      `
      UPDATE band_profiles
      SET 
        name = COALESCE(?, name),
        name_normalized = COALESCE(?, name_normalized),
        genre = ?,
        origin = ?,
        origin_city = ?,
        origin_region = ?,
        contact_email = ?,
        is_active = COALESCE(?, is_active),
        description = ?,
        photo_url = ?,
        social_links = ?,
        updated_at = datetime('now')
      WHERE id = ?
      RETURNING *
    `,
    )
      .bind(
        name?.trim() || null,
        nameNormalized,
        resolvedGenre,
        computedOrigin,
        resolvedOriginCity,
        resolvedOriginRegion,
        resolvedContactEmail,
        resolvedIsActive,
        resolvedDescription,
        resolvedPhotoUrl,
        socialLinks,
        id,
      )
      .first();

    await auditLog(
      env,
      currentUser.userId,
      "performer.updated",
      "band_profile",
      id,
      { name: result?.name || name || null },
      ipAddress,
    );

    return new Response(
      JSON.stringify({ success: true, performer: unpackSocialLinks(result) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Failed to update performer:", error);
    return new Response(
      JSON.stringify({ error: "Failed to update performer" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

// DELETE - Delete performer
export async function onRequestDelete(context) {
  const { request, env } = context;
  const { DB } = env;
  const url = new URL(request.url);
  const id = url.pathname.split("/").pop();

  // RBAC: Require admin role
  const permCheck = await checkPermission(context, "admin");
    const currentUser = permCheck.user;
    const ipAddress = getClientIP(request);

  if (permCheck.error) {
    return permCheck.response;
  }

  if (!id || id === "performers" || !/^\d+$/.test(id)) {
    return new Response(
      JSON.stringify({ error: "Valid performer ID is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Check if performer has any performances
    const performances = await DB.prepare(
      "SELECT COUNT(*) as count FROM performances WHERE band_profile_id = ?",
    )
      .bind(id)
      .first();

    if (performances.count > 0) {
      return new Response(
        JSON.stringify({
          error: "Cannot delete performer with existing performances",
          performance_count: performances.count,
          suggestion: "Remove or unlink all performances first",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Delete performer
    await DB.prepare("DELETE FROM band_profiles WHERE id = ?").bind(id).run();

    await auditLog(
      env,
      currentUser.userId,
      "performer.deleted",
      "band_profile",
      id,
      null,
      ipAddress,
    );

    return new Response(
      JSON.stringify({ success: true, message: "Performer deleted" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Failed to delete performer:", error);
    return new Response(
      JSON.stringify({ error: "Failed to delete performer" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
