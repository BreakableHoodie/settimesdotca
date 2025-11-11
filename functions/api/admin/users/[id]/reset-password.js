// Admin-initiated password reset endpoint
// POST /api/admin/users/[id]/reset-password
// Body: { reason: string } (optional reason for audit log)
// Returns: { success: true, resetToken: string } or error

import { generateToken } from '../../../utils/tokens.js'

export async function onRequestPost(context) {
  const { request, env, params } = context
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

    const userId = params.id
    const { reason } = await request.json().catch(() => ({}))

    // Get target user
    const targetUser = await DB.prepare(`
      SELECT id, email, name, is_active
      FROM users
      WHERE id = ?
    `).bind(userId).first()

    if (!targetUser) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (targetUser.is_active === 0) {
      return new Response(JSON.stringify({ error: 'Cannot reset password for inactive user' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Generate reset token
    const resetToken = generateToken(32)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours

    // Invalidate any existing reset tokens for this user
    await DB.prepare(`
      UPDATE password_reset_tokens
      SET used = 1, used_at = datetime('now')
      WHERE user_id = ? AND used = 0
    `).bind(userId).run()

    // Create new reset token
    await DB.prepare(`
      INSERT INTO password_reset_tokens (user_id, token, created_by, expires_at, reason)
      VALUES (?, ?, ?, ?, ?)
    `).bind(userId, resetToken, session.id, expiresAt, reason || 'Admin-initiated reset').run()

    // Log the action
    await DB.prepare(`
      INSERT INTO auth_audit (action, success, ip_address, user_agent, details)
      VALUES ('admin_password_reset', 1, ?, ?, ?)
    `).bind(
      request.headers.get('CF-Connecting-IP') || 'unknown',
      request.headers.get('User-Agent') || 'unknown',
      JSON.stringify({
        admin_id: session.id,
        admin_email: session.email,
        target_user_id: userId,
        target_user_email: targetUser.email,
        reason: reason || 'Admin-initiated reset'
      })
    ).run()

    // TODO: Send email to user with reset link
    // const resetUrl = `${env.PUBLIC_URL}/reset-password?token=${resetToken}`
    // await sendEmail({
    //   to: targetUser.email,
    //   subject: 'Password Reset Request',
    //   html: `<p>Click here to reset your password (valid for 24 hours): <a href="${resetUrl}">${resetUrl}</a></p>`
    // })

    return new Response(JSON.stringify({
      success: true,
      message: `Password reset email would be sent to ${targetUser.email}`,
      expiresAt: expiresAt
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Admin password reset error:', error)
    return new Response(JSON.stringify({ error: 'Failed to initiate password reset' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
