// Password reset completion endpoint
// POST /api/auth/reset-password
// Body: { token: string, newPassword: string }
// Returns: { success: true } or error

import { hashPassword } from '../../utils/crypto.js'

export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const { token, newPassword } = await request.json()

    if (!token || !newPassword) {
      return new Response(JSON.stringify({ error: 'Token and new password are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters long' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Find valid reset token
    const resetToken = await DB.prepare(`
      SELECT prt.id, prt.user_id, prt.expires_at, prt.used,
             u.email, u.name, u.is_active
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = ? AND prt.used = 0
    `).bind(token).first()

    if (!resetToken) {
      return new Response(JSON.stringify({ error: 'Invalid or expired reset token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if token is expired
    if (new Date(resetToken.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Reset token has expired' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if user is active
    if (resetToken.is_active === 0) {
      return new Response(JSON.stringify({ error: 'User account is inactive' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword)

    // Update user password
    await DB.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(passwordHash, resetToken.user_id).run()

    // Mark reset token as used
    await DB.prepare(`
      UPDATE password_reset_tokens
      SET used = 1, used_at = datetime('now')
      WHERE id = ?
    `).bind(resetToken.id).run()

    // Invalidate all existing sessions for this user
    await DB.prepare(`
      DELETE FROM sessions
      WHERE user_id = ?
    `).bind(resetToken.user_id).run()

    // Log the password reset completion
    await DB.prepare(`
      INSERT INTO auth_audit (action, success, ip_address, user_agent, details)
      VALUES ('password_reset_completed', 1, ?, ?, ?)
    `).bind(
      request.headers.get('CF-Connecting-IP') || 'unknown',
      request.headers.get('User-Agent') || 'unknown',
      JSON.stringify({
        user_id: resetToken.user_id,
        user_email: resetToken.email,
        reset_token_id: resetToken.id
      })
    ).run()

    return new Response(JSON.stringify({
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Password reset completion error:', error)
    return new Response(JSON.stringify({ error: 'Failed to reset password' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
