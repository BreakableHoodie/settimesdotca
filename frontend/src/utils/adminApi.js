// Admin API utility functions
// Handles all API calls to the admin endpoints

const API_BASE = '/api/admin'

// Get admin password from sessionStorage
function getAdminPassword() {
  return window.sessionStorage.getItem('adminPassword')
}

// Create headers with admin password
function getHeaders() {
  const password = getAdminPassword()
  return {
    'Content-Type': 'application/json',
    'X-Admin-Password': password || ''
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
  async login(password) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    return handleResponse(response)
  },

  async resetPassword(masterPassword) {
    const response = await fetch(`${API_BASE}/auth/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword })
    })
    return handleResponse(response)
  }
}

// Events API
export const eventsApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/events`, {
      headers: getHeaders()
    })
    return handleResponse(response)
  },

  async create(eventData) {
    const response = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(eventData)
    })
    return handleResponse(response)
  },

  async togglePublish(eventId) {
    const response = await fetch(`${API_BASE}/events/${eventId}/publish`, {
      method: 'PUT',
      headers: getHeaders()
    })
    return handleResponse(response)
  },

  async duplicate(eventId, newEventData) {
    const response = await fetch(`${API_BASE}/events/${eventId}/duplicate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(newEventData)
    })
    return handleResponse(response)
  }
}

// Venues API
export const venuesApi = {
  async getAll() {
    const response = await fetch(`${API_BASE}/venues`, {
      headers: getHeaders()
    })
    return handleResponse(response)
  },

  async create(venueData) {
    const response = await fetch(`${API_BASE}/venues`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(venueData)
    })
    return handleResponse(response)
  },

  async update(venueId, venueData) {
    const response = await fetch(`${API_BASE}/venues/${venueId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(venueData)
    })
    return handleResponse(response)
  },

  async delete(venueId) {
    const response = await fetch(`${API_BASE}/venues/${venueId}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    return handleResponse(response)
  }
}

// Bands API
export const bandsApi = {
  async getByEvent(eventId) {
    const response = await fetch(`${API_BASE}/bands?event_id=${eventId}`, {
      headers: getHeaders()
    })
    return handleResponse(response)
  },

  async create(bandData) {
    const response = await fetch(`${API_BASE}/bands`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(bandData)
    })
    return handleResponse(response)
  },

  async update(bandId, bandData) {
    const response = await fetch(`${API_BASE}/bands/${bandId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(bandData)
    })
    return handleResponse(response)
  },

  async delete(bandId) {
    const response = await fetch(`${API_BASE}/bands/${bandId}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    return handleResponse(response)
  }
}
