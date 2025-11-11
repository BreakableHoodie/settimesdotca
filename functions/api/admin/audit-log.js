// Audit log endpoint for admin panel
// GET /api/admin/audit-log
// Query params: ?user_id=1&limit=50&offset=0&action=user.created

import { checkPermission } from './_middleware.js'

// GET - Retrieve audit log entries (admin only)
export async function onRequestGet(context) {
  const { request, env } = context;
  const { DB } = env;

  try {
    // Check permission (admin only)
    const permCheck = await checkPermission(request, env, 'admin');
    if (permCheck.error) {
      return permCheck.response;
    }

    // Parse query parameters
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    const action = url.searchParams.get('action');
    const resourceType = url.searchParams.get('resource_type');
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    // Validate limit (prevent excessive queries)
    if (limit > 100) {
      return new Response(JSON.stringify({
        error: 'Bad request',
        message: 'Limit cannot exceed 100'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Build WHERE clause based on filters
    const conditions = [];
    const params = [];

    if (userId) {
      conditions.push('a.user_id = ?');
      params.push(parseInt(userId));
    }

    if (action) {
      conditions.push('a.action = ?');
      params.push(action);
    }

    if (resourceType) {
      conditions.push('a.resource_type = ?');
      params.push(resourceType);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM audit_log a
      ${whereClause}
    `;

    const countResult = await DB.prepare(countQuery).bind(...params).first();
    const total = countResult.total;

    // Get log entries with user information
    const logsQuery = `
      SELECT
        a.id,
        a.user_id,
        u.email as user_email,
        u.name as user_name,
        a.action,
        a.resource_type,
        a.resource_id,
        a.details,
        a.ip_address,
        a.created_at
      FROM audit_log a
      LEFT JOIN users u ON a.user_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const { results: logs } = await DB.prepare(logsQuery)
      .bind(...params, limit, offset)
      .all();

    // Parse JSON details field
    const parsedLogs = logs.map(log => ({
      id: log.id,
      userId: log.user_id,
      userEmail: log.user_email || 'Unknown',
      userName: log.user_name || 'Unknown',
      action: log.action,
      resourceType: log.resource_type,
      resourceId: log.resource_id,
      details: log.details ? JSON.parse(log.details) : null,
      ipAddress: log.ip_address,
      createdAt: log.created_at
    }));

    return new Response(JSON.stringify({
      logs: parsedLogs,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Get audit log error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch audit log' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
