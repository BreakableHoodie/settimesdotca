// Admin API utility functions
// Handles all API calls to the admin endpoints

const API_BASE = '/api/admin'

// Get session token from sessionStorage
function getSessionToken() {
  return window.sessionStorage.getItem('sessionToken')
}

// Create headers with session token
function getHeaders() {
  const sessionToken = getSessionToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${sessionToken || ''}`,
  }
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
  async signup(email, password, name) {
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role: 'admin' }),
    })
    const data = await handleResponse(response)

    // Store session token and user data
    if (data.sessionToken) {
      window.sessionStorage.setItem('sessionToken', data.sessionToken)
      window.sessionStorage.setItem('userEmail', data.user.email)
      window.sessionStorage.setItem('userName', data.user.name || '')
      window.sessionStorage.setItem('userRole', data.user.role)
    }

    return data
  },

  async login(email, password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await handleResponse(response)

    // Store session token and user data
    if (data.sessionToken) {
      window.sessionStorage.setItem('sessionToken', data.sessionToken)
      window.sessionStorage.setItem('userEmail', data.user.email)
      window.sessionStorage.setItem('userName', data.user.name || '')
      window.sessionStorage.setItem('userRole', data.user.role)
    }

    return data
  },

  async logout() {
    window.sessionStorage.clear()
  },

  getCurrentUser() {
    const sessionToken = window.sessionStorage.getItem('sessionToken')
    if (!sessionToken) return null

    return {
      email: window.sessionStorage.getItem('userEmail'),
      name: window.sessionStorage.getItem('userName'),
      role: window.sessionStorage.getItem('userRole'),
    }
  },
}

// Events API
export const eventsApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/events`, {
      headers: getHeaders(),
    })
    return handleResponse(response)
  },

  async create(eventData) {
    const response = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(eventData),
    })
    return handleResponse(response)
  },

  async togglePublish(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}/publish`, {
      method: 'PUT',
      headers: getHeaders(),
    })
    return handleResponse(response)
  },

  async duplicate(eventId, newEventData) {
    const response = await fetch(`${API_BASE}/events/${eventId}/duplicate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(newEventData),
    })
    return handleResponse(response)
  },

  async delete(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })
    return handleResponse(response)
  },

  async getMetrics(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}/metrics`, {
      headers: getHeaders(),
    })
    return handleResponse(response)
  },
}

// Venues API
export const venuesApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/venues`, {
      headers: getHeaders(),
    })
    return handleResponse(response)
  },

  async create(venueData) {
    const response = await fetch(`${API_BASE}/venues`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(venueData),
    })
    return handleResponse(response)
  },

  async update(venueId, venueData) {
    const response = await fetch(`${API_BASE}/venues/${venueId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(venueData),
    })
    return handleResponse(response)
  },

  async delete(venueId) {
    const response = await fetch(`${API_BASE}/venues/${venueId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })
    return handleResponse(response)
  },
}

// Bands API
export const bandsApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/bands`, {
      headers: getHeaders(),
    })
    return handleResponse(response)
  },

  async getByEvent(eventId) {
    const response = await fetch(`${API_BASE}/bands?event_id=${eventId}`, {
      headers: getHeaders(),
    })
    return handleResponse(response)
  },

  async create(bandData) {
    const response = await fetch(`${API_BASE}/bands`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(bandData),
    })
    return handleResponse(response)
  },

  async update(bandId, bandData) {
    const response = await fetch(`${API_BASE}/bands/${bandId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(bandData),
    })
    return handleResponse(response)
  },

  async delete(bandId) {
    const response = await fetch(`${API_BASE}/bands/${bandId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    })
    return handleResponse(response)
  },
}
