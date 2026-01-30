// Admin API utility functions
// Handles all API calls to the admin endpoints

const API_BASE = '/api/admin'

// SECURITY: Session token is now stored in HTTPOnly cookie (not accessible to JavaScript)
// CSRF token is read from cookie (non-HttpOnly) for double-submit pattern

// Get CSRF token from cookie
// The server sets a non-HttpOnly csrf_token cookie that JavaScript can read
function getCSRFToken() {
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'csrf_token') {
      return value
    }
  }
  return null
}

// Create headers with CSRF token
// Session token is automatically sent via HTTPOnly cookie by browser
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  }

  // Add CSRF token to headers for state-changing requests
  // Read from cookie to survive page refreshes
  const csrfToken = getCSRFToken()
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  return headers
}

export function getAdminFormDataHeaders() {
  const headers = {}
  const csrfToken = getCSRFToken()
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }
  return headers
}

// Handle API responses
async function handleResponse(response) {
  const data = await response.json()

  if (!response.ok) {
    if (import.meta.env.DEV) {
      console.log('API Error Response:', response.status, data)
    }
    if (response.status === 401) {
      if (import.meta.env.DEV) {
        console.error('Dispatching auth:unauthorized event')
      }
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))

      // Fallback: If the app doesn't respond to the event within 1 second, force a redirect
      setTimeout(() => {
        if (window.location.pathname !== '/admin/login') {
          if (import.meta.env.DEV) {
            console.error('Force redirecting to login...')
          }
          window.location.href = '/admin/login'
        }
      }, 1000)
    }
    const error = new Error(data.message || data.error || 'API request failed')
    error.status = response.status
    error.details = data
    throw error
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

    // SECURITY: Session token and CSRF token are now in cookies
    // Store user data in localStorage for UI display
    if (data.user) {
      window.localStorage.setItem('userEmail', data.user.email)
      window.localStorage.setItem('userName', data.user.name || '')
      window.localStorage.setItem('userRole', data.user.role)
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

    if (data.mfaRequired) {
      return data
    }

    // SECURITY: Session token and CSRF token are now in cookies
    // Store user data in localStorage for UI display
    if (data.user) {
      window.localStorage.setItem('userEmail', data.user.email)
      window.localStorage.setItem('userName', data.user.name || '')
      window.localStorage.setItem('userRole', data.user.role)
    }

    return data
  },

  async verifyMfa(mfaToken, code) {
    const response = await fetch(`${API_BASE}/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mfaToken, code }),
    })
    const data = await handleResponse(response)

    if (data.user) {
      window.localStorage.setItem('userEmail', data.user.email)
      window.localStorage.setItem('userName', data.user.name || '')
      window.localStorage.setItem('userRole', data.user.role)
    }

    return data
  },

  async logout() {
    // Call logout endpoint to clear session cookie and CSRF cookie
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    }

    // Clear local data (cookies are cleared by server)
    window.localStorage.removeItem('userEmail')
    window.localStorage.removeItem('userName')
    window.localStorage.removeItem('userRole')
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

  async verifySession() {
    try {
      const response = await fetch(`${API_BASE}/me`, {
        headers: getHeaders(),
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        // Update local storage with fresh data
        if (data.user) {
          window.localStorage.setItem('userEmail', data.user.email)
          window.localStorage.setItem('userName', data.user.name || '')
          window.localStorage.setItem('userRole', data.user.role)
        }
        return data
      }
      return null
    } catch (error) {
      return null
    }
  },
}

export const mfaApi = {
  async status() {
    const response = await fetch(`${API_BASE}/mfa/status`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async setup() {
    const response = await fetch(`${API_BASE}/mfa/setup`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async enable(code) {
    const response = await fetch(`${API_BASE}/mfa/enable`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ code }),
    })
    return handleResponse(response)
  },

  async disable(code) {
    const response = await fetch(`${API_BASE}/mfa/disable`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ code }),
    })
    return handleResponse(response)
  },

  async regenerateBackupCodes(code) {
    const response = await fetch(`${API_BASE}/mfa/backup-codes`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ code }),
    })
    return handleResponse(response)
  },
}

// Events API
export const eventsApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/events`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    const data = await handleResponse(response)
    if (data?.events?.length) {
      data.events = data.events.map(event => {
        const isPublished = Number(event.is_published) === 1
        const normalizedStatus = event.status === 'archived' ? 'archived' : isPublished ? 'published' : 'draft'
        return {
          ...event,
          status: normalizedStatus,
        }
      })
    }
    return data
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

  async update(eventId, eventData) {
    const response = await fetch(`${API_BASE}/events/${eventId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(eventData),
    })
    return handleResponse(response)
  },

  async setPublishState(eventId, publish) {
    const response = await fetch(`${API_BASE}/events/${eventId}/publish`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ publish }),
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

  async archive(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}/archive`, {
      method: 'POST',
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

  async bulkDelete(bandIds) {
    const response = await fetch(`${API_BASE}/bands/bulk`, {
      method: 'DELETE',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ band_ids: bandIds }),
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

// Performers API
export const performersApi = {
  async list() {
    const response = await fetch(`${API_BASE}/performers`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async get(id) {
    const response = await fetch(`${API_BASE}/performers/${id}`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async create(data) {
    const response = await fetch(`${API_BASE}/performers`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  async update(id, data) {
    const response = await fetch(`${API_BASE}/performers/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  async delete(id) {
    const response = await fetch(`${API_BASE}/performers/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },
}

// Users API
export const usersApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/users`, {
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async create(data) {
    const response = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  async update(userId, data) {
    const response = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PATCH',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },

  async remove(userId) {
    const response = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: getHeaders(),
      credentials: 'include',
    })
    return handleResponse(response)
  },

  async resetPassword(userId, data) {
    const response = await fetch(`${API_BASE}/users/${userId}/reset-password`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify(data),
    })
    return handleResponse(response)
  },
}
