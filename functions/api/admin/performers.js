/**
 * Admin API: Performers (Global Band/Performer Registry)
 * 
 * GET    /api/admin/performers       - List all performers
 * GET    /api/admin/performers/:id   - Get single performer
 * POST   /api/admin/performers       - Create new performer
 * PUT    /api/admin/performers/:id   - Update performer
 * DELETE /api/admin/performers/:id   - Delete performer
 */

import { checkPermission } from "./_middleware.js";

// Helper to normalize band name for uniqueness check
function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Helper to unpack social links
function unpackSocialLinks(performer) {
  if (!performer) return null;
  let social = {};
  try {
    social = JSON.parse(performer.social_links || '{}');
  } catch (_e) {
    social = {};
  }
  return {
    ...performer,
    url: social.website || '',
    instagram: social.instagram || '',
    bandcamp: social.bandcamp || '',
    facebook: social.facebook || ''
  };
}

// GET - List all performers
export async function onRequestGet(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()

  // RBAC: Require viewer role or higher
  const permCheck = await checkPermission(context, "viewer");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    // GET /api/admin/performers/:id - Get single performer
    if (id && id !== 'performers') {
      const performer = await DB.prepare(
        'SELECT * FROM band_profiles WHERE id = ?'
      ).bind(id).first()

      if (!performer) {
        return new Response(
          JSON.stringify({ error: 'Performer not found' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }

      // Get performance stats for this performer
      const stats = await DB.prepare(`
        SELECT 
          COUNT(*) as total_performances,
          COUNT(DISTINCT event_id) as total_events,
          COUNT(DISTINCT venue_id) as total_venues
        FROM performances 
        WHERE band_profile_id = ?
      `).bind(id).first()

      return new Response(
        JSON.stringify({ 
          success: true, 
          performer: { ...unpackSocialLinks(performer), stats }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // GET /api/admin/performers - List all performers
    const result = await DB.prepare(`
      SELECT 
        p.*,
        COUNT(perf.id) as performance_count
      FROM band_profiles p
      LEFT JOIN performances perf ON perf.band_profile_id = p.id
      GROUP BY p.id
      ORDER BY p.name ASC
    `).all()

    const performers = (result.results || []).map(unpackSocialLinks);

    return new Response(
      JSON.stringify({ success: true, performers }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to fetch performers:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch performers', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// POST - Create new performer
export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  try {
    const body = await request.json()
    const { 
      name, genre, origin, description, photo_url, url, 
      instagram, bandcamp, facebook 
    } = body

    // Validation
    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Performer name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const nameNormalized = normalizeName(name);

    // Check for duplicate name
    const existing = await DB.prepare(
      'SELECT id FROM band_profiles WHERE name_normalized = ?'
    ).bind(nameNormalized).first()

    if (existing) {
      return new Response(
        JSON.stringify({ 
          error: 'A performer with this name already exists',
          existing_id: existing.id
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Pack social links
    const socialLinks = JSON.stringify({
      website: url?.trim() || null,
      instagram: instagram?.trim() || null,
      bandcamp: bandcamp?.trim() || null,
      facebook: facebook?.trim() || null
    });

    // Create performer
    const result = await DB.prepare(`
      INSERT INTO band_profiles (
        name, name_normalized, genre, origin, description, photo_url, social_links
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(
      name.trim(),
      nameNormalized,
      genre?.trim() || null,
      origin?.trim() || null,
      description?.trim() || null,
      photo_url?.trim() || null,
      socialLinks
    ).first()

    return new Response(
      JSON.stringify({ success: true, performer: unpackSocialLinks(result) }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to create performer:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create performer', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// PUT - Update performer
export async function onRequestPut(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()

  // RBAC: Require editor role or higher
  const permCheck = await checkPermission(context, "editor");
  if (permCheck.error) {
    return permCheck.response;
  }

  if (!id || id === 'performers') {
    return new Response(
      JSON.stringify({ error: 'Performer ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body = await request.json()
    const { 
      name, genre, origin, description, photo_url, url: performerUrl, 
      instagram, bandcamp, facebook 
    } = body

    // Check performer exists
    const existing = await DB.prepare(
      'SELECT id FROM band_profiles WHERE id = ?'
    ).bind(id).first()

    if (!existing) {
      return new Response(
        JSON.stringify({ error: 'Performer not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validation
    if (name && !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Performer name cannot be empty' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check for duplicate name (if name is being changed)
    let nameNormalized = null;
    if (name) {
      nameNormalized = normalizeName(name);
      const duplicate = await DB.prepare(
        'SELECT id FROM band_profiles WHERE name_normalized = ? AND id != ?'
      ).bind(nameNormalized, id).first()

      if (duplicate) {
        return new Response(
          JSON.stringify({ error: 'A performer with this name already exists' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Pack social links
    const socialLinks = JSON.stringify({
      website: performerUrl?.trim() || null,
      instagram: instagram?.trim() || null,
      bandcamp: bandcamp?.trim() || null,
      facebook: facebook?.trim() || null
    });

    // Update performer
    const result = await DB.prepare(`
      UPDATE band_profiles
      SET 
        name = COALESCE(?, name),
        name_normalized = COALESCE(?, name_normalized),
        genre = ?,
        origin = ?,
        description = ?,
        photo_url = ?,
        social_links = ?,
        updated_at = datetime('now')
      WHERE id = ?
      RETURNING *
    `).bind(
      name?.trim() || null,
      nameNormalized,
      genre?.trim() || null,
      origin?.trim() || null,
      description?.trim() || null,
      photo_url?.trim() || null,
      socialLinks,
      id
    ).first()

    return new Response(
      JSON.stringify({ success: true, performer: unpackSocialLinks(result) }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to update performer:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to update performer', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

// DELETE - Delete performer
export async function onRequestDelete(context) {
  const { request, env } = context
  const { DB } = env
  const url = new URL(request.url)
  const id = url.pathname.split('/').pop()

  // RBAC: Require admin role
  const permCheck = await checkPermission(context, "admin");
  if (permCheck.error) {
    return permCheck.response;
  }

  if (!id || id === 'performers') {
    return new Response(
      JSON.stringify({ error: 'Performer ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Check if performer has any performances
    const performances = await DB.prepare(
      'SELECT COUNT(*) as count FROM performances WHERE band_profile_id = ?'
    ).bind(id).first()

    if (performances.count > 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Cannot delete performer with existing performances',
          performance_count: performances.count,
          suggestion: 'Remove or unlink all performances first'
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Delete performer
    await DB.prepare('DELETE FROM band_profiles WHERE id = ?').bind(id).run()

    return new Response(
      JSON.stringify({ success: true, message: 'Performer deleted' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Failed to delete performer:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to delete performer', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

