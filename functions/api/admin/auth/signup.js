import { hashPassword } from '../../../utils/crypto.js'

export async function onRequestPost(context) {
  const { request, env } = context
  const { DB } = env

  try {
    const { email, password, orgName } = await request.json()

    // Validation
    if (!email || !password || !orgName) {
      return new Response(JSON.stringify({
        error: 'Validation error',
        message: 'Email, password, and organization name are required'
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

    // Create organization slug from name
    const slug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    // Check if slug already exists
    const existingOrg = await DB.prepare(
      'SELECT id FROM organizations WHERE slug = ?'
    ).bind(slug).first()

    if (existingOrg) {
      return new Response(JSON.stringify({
        error: 'Conflict',
        message: 'Organization name already taken'
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create organization
    const org = await DB.prepare(
      'INSERT INTO organizations (name, slug) VALUES (?, ?) RETURNING id'
    ).bind(orgName, slug).first()

    // Create user
    const user = await DB.prepare(
      'INSERT INTO users (email, password_hash, org_id, role) VALUES (?, ?, ?, ?) RETURNING id, email'
    ).bind(email, passwordHash, org.id, 'admin').first()

    // Generate session token (simple UUID for now)
    const sessionToken = crypto.randomUUID()

    // Store session (you'll need a sessions table or use JWT)
    // For simplicity, return token and let client store in sessionStorage

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        orgId: org.id,
        orgName: orgName
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
