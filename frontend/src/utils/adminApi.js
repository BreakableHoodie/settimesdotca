// Admin API utility functions
// Handles all API calls to the admin endpoints

const API_BASE = '/api/admin'

// SECURITY: Session token is now stored in HTTPOnly cookie (not accessible to JavaScript)
// CSRF token is stored in memory and sent with each request
let csrfToken = null

// Get CSRF token from memory
function getCSRFToken() {
  return csrfToken
}

// Set CSRF token in memory
function setCSRFToken(token) {
  csrfToken = token
}

// Create headers with CSRF token
// Session token is automatically sent via HTTPOnly cookie by browser
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }

  // Add CSRF token to headers for state-changing requests
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  return headers
}

// Handle API responses
async function handleResponse(response) {
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || 'API request failed')
  }

  return data
}

// Auth API
export const authApi = {
  async signup(email, password, name, inviteCode) {
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // IMPORTANT: Include cookies in request
      body: JSON.stringify({ email, password, name, inviteCode }),
    })
    const data = await handleResponse(response)

    // SECURITY: Session token is now in HTTPOnly cookie
    // Store CSRF token and user data in memory/localStorage
    if (data.csrfToken) {
      setCSRFToken(data.csrfToken)
      window.localStorage.setItem('userEmail', data.user.email)
      window.localStorage.setItem('userName', data.user.name || '')
      window.localStorage.setItem('userRole', data.user.role)
    }

    // COMPATIBILITY: Store sessionToken for legacy Authorization header usage
    // Some parts of the UI still use Authorization: Bearer <token>
    if (data.sessionToken) {
      window.sessionStorage.setItem('sessionToken', data.sessionToken)
    }

    return data
  },

  async login(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // IMPORTANT: Include cookies in request
      body: JSON.stringify({ email, password }),
    })
    const data = await handleResponse(response)

    // SECURITY: Session token is now in HTTPOnly cookie
    // Store CSRF token and user data in memory/localStorage
    if (data.csrfToken) {
      setCSRFToken(data.csrfToken)
      window.localStorage.setItem('userEmail', data.user.email)
      window.localStorage.setItem('userName', data.user.name || '')
      window.localStorage.setItem('userRole', data.user.role)
    }

    // COMPATIBILITY: Store sessionToken for legacy Authorization header usage
    // Some parts of the UI still use Authorization: Bearer <token>
    if (data.sessionToken) {
      window.sessionStorage.setItem('sessionToken', data.sessionToken)
    }

    return data
  },

  async logout() {
    // Call logout endpoint to clear session cookie
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getHeaders(),
      credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    }

    // Clear local data
    setCSRFToken(null)
    window.localStorage.removeItem('userEmail')
    window.localStorage.removeItem('userName')
    window.localStorage.removeItem('userRole')
    // COMPATIBILITY: Clear sessionToken from sessionStorage
    window.sessionStorage.removeItem('sessionToken')
  },

  getCurrentUser() {
    // Check if user data exists (session cookie is HTTPOnly, can't check directly)
    const userEmail = window.localStorage.getItem('userEmail')
    if (!userEmail) return null

    return {
      email: userEmail,
      name: window.localStorage.getItem('userName'),
      role: window.localStorage.getItem('userRole'),
    }
  },
}

// Events API
export const eventsApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/events`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async create(eventData) {
    const response = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(eventData),
    })
    return handleResponse(response)
  },

  async togglePublish(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}/publish`, {
      method: 'PUT',
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async duplicate(eventId, newEventData) {
    const response = await fetch(`${API_BASE}/events/${eventId}/duplicate`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(newEventData),
    })
    return handleResponse(response)
  },

  async delete(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}`, {
      method: 'DELETE',
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async getMetrics(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}/metrics`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },
}

// Venues API
export const venuesApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/venues`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async create(venueData) {
    const response = await fetch(`${API_BASE}/venues`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(venueData),
    })
    return handleResponse(response)
  },

  async update(venueId, venueData) {
    const response = await fetch(`${API_BASE}/venues/${venueId}`, {
      method: 'PUT',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(venueData),
    })
    return handleResponse(response)
  },

  async delete(venueId) {
    const response = await fetch(`${API_BASE}/venues/${venueId}`, {
      method: 'DELETE',
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },
}

// Bands API
export const bandsApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/bands`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async getByEvent(eventId) {
    const response = await fetch(`${API_BASE}/bands?event_id=${eventId}`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async create(bandData) {
    const response = await fetch(`${API_BASE}/bands`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(bandData),
    })
    return handleResponse(response)
  },

  async update(bandId, bandData) {
    const response = await fetch(`${API_BASE}/bands/${bandId}`, {
      method: 'PUT',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(bandData),
    })
    return handleResponse(response)
  },

  async delete(bandId) {
    const response = await fetch(`${API_BASE}/bands/${bandId}`, {
      method: 'DELETE',
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async getStats(bandName) {
    const response = await fetch(`${API_BASE}/bands/stats/${encodeURIComponent(bandName)}`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },
}
