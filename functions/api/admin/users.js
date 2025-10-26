// Get all users endpoint for admin panel
// GET /api/admin/users
// Returns: { users: Array } or error

export async function onRequestGet(context) {
  const { request, env } = context
  const { DB } = env

  try {
    // Get admin session from Authorization header
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const sessionToken = authHeader.substring(7)
    
    // Verify admin session
    const session = await DB.prepare(`
      SELECT u.id, u.email, u.role, u.name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now') AND u.is_active = 1
    `).bind(sessionToken).first()

    if (!session) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if admin has permission
    if (session.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Get all users (excluding password hashes)
    const { results: users } = await DB.prepare(`
      SELECT 
        id,
        email,
        name,
        role,
        is_active,
        created_at,
        last_login,
        updated_at
      FROM users
      ORDER BY created_at DESC
    `).all()

    return new Response(JSON.stringify({
      users: users.map(user => ({
        ...user,
        // Convert SQLite integers to booleans
        is_active: user.is_active === 1
      }))
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Get users error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
