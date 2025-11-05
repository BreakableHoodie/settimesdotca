import { hashPassword } from '../../../utils/crypto.js'

export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const { email, password, name, role } = await request.json()

    // Validation
    if (!email || !password) {
      return new Response(JSON.stringify({
        error: 'Validation error',
        message: 'Email and password are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({
        error: 'Validation error',
        message: 'Invalid email format'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Password strength validation (min 8 chars)
    if (password.length < 8) {
      return new Response(JSON.stringify({
        error: 'Validation error',
        message: 'Password must be at least 8 characters'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Role validation (default to 'editor', only 'admin' or 'editor' allowed)
    const userRole = role === 'admin' ? 'admin' : 'editor'

    // Check if user already exists
    const existingUser = await DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first()

    if (existingUser) {
      return new Response(JSON.stringify({
        error: 'Conflict',
        message: 'Email already registered'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const user = await DB.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?) RETURNING id, email, name, role'
    ).bind(email, passwordHash, name || null, userRole).first()

    // Generate session token
    const sessionToken = crypto.randomUUID()

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
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Signup error:', error)
    return new Response(JSON.stringify({
      error: 'Server error',
      message: 'Failed to create account'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
