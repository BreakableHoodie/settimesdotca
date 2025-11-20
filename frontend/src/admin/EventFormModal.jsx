import { useState, useEffect } from 'react'
import EventStatusBadge from './components/EventStatusBadge'
import { Button } from '../components/ui'

/**
 * EventFormModal - Modal for creating and editing events
 *
 * Features:
 * - Create new event or edit existing event
 * - Auto-generate slug from name
 * - Date picker with validation (no past dates)
 * - Status selector (draft, published, archived)
 * - Form validation
 * - Shows creator info when editing
 *
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Callback when modal closes
 * @param {object} event - Event object for editing (null for create)
 * @param {function} onSave - Callback when event is saved
 */
export default function EventFormModal({ isOpen, onClose, event = null, onSave }) {
  const isEditing = !!event

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    date: '',
    status: 'draft',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  // Initialize form when event changes
  useEffect(() => {
    if (event) {
      setFormData({
        name: event.name || '',
        slug: event.slug || '',
        date: event.date || '',
        status: event.status || 'draft',
      })
      setSlugEdited(true) // Prevent auto-generation when editing
    } else {
      setFormData({
        name: '',
        slug: '',
        date: '',
        status: 'draft',
      })
      setSlugEdited(false)
    }
    setError('')
  }, [event, isOpen])

  // Auto-generate slug from name (only when creating)
  const handleNameChange = e => {
    const name = e.target.value
    setFormData(prev => ({
      ...prev,
      name,
      // Only auto-generate slug if user hasn't manually edited it
      slug:
        !slugEdited && !isEditing
          ? name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          : prev.slug,
    }))
  }

  const handleSlugChange = e => {
    const slug = e.target.value
    setFormData(prev => ({ ...prev, slug }))
    setSlugEdited(true) // Mark as manually edited
  }

  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const validateForm = () => {
    if (!formData.name || formData.name.trim().length < 3) {
      setError('Name must be at least 3 characters')
      return false
    }

    if (!formData.slug || !/^[a-z0-9-]+$/.test(formData.slug)) {
      setError('Slug must contain only lowercase letters, numbers, and hyphens')
      return false
    }

    if (!formData.date || !/^\d{4}-\d{2}-\d{2}$/.test(formData.date)) {
      setError('Date is required in YYYY-MM-DD format')
      return false
    }

    // Check date is not in past (only for new events)
    if (!isEditing) {
      const eventDate = new Date(formData.date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (eventDate < today) {
        setError('Date cannot be in the past')
        return false
      }
    }

    return true
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const token = sessionStorage.getItem('sessionToken')
      if (!token) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const url = isEditing ? `/api/admin/events/${event.id}` : '/api/admin/events'

      const method = isEditing ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.message || data.error || 'Failed to save event')
        setLoading(false)
        return
      }

      // Success!
      if (onSave) {
        onSave(data.event)
      }
      onClose()
    } catch (err) {
      console.error('Error saving event:', err)
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Get today's date in YYYY-MM-DD format for min attribute
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-band-purple rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-band-orange/30">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-band-orange">{isEditing ? 'Edit Event' : 'Create New Event'}</h2>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white text-2xl transition-colors"
              title="Close"
            >
              ×
            </button>
          </div>

          {/* Creator Info (when editing) */}
          {isEditing && event.created_at && (
            <div className="mb-4 p-3 bg-band-navy/30 rounded border border-band-orange/10 text-sm text-white/70">
              <div>Created: {new Date(event.created_at).toLocaleString()}</div>
              {event.updated_at && event.updated_at !== event.created_at && (
                <div>Last updated: {new Date(event.updated_at).toLocaleString()}</div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded text-red-200 text-sm">{error}</div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Event Name */}
            <div>
              <label htmlFor="event-name" className="block text-white mb-2 text-sm font-medium">
                Event Name *
              </label>
              <input
                id="event-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleNameChange}
                className="w-full px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                required
                placeholder="Long Weekend Band Crawl Vol. 6"
                minLength={3}
              />
              <p className="text-xs text-white/50 mt-1">Minimum 3 characters</p>
            </div>

            {/* Slug */}
            <div>
              <label htmlFor="event-slug" className="block text-white mb-2 text-sm font-medium">
                Slug * {isEditing && <span className="text-yellow-400">(cannot be changed)</span>}
              </label>
              <input
                id="event-slug"
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleSlugChange}
                className="w-full px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange font-mono text-sm"
                required
                placeholder="vol-6"
                pattern="[a-z0-9\-]+"
                title="Only lowercase letters, numbers, and hyphens"
                disabled={isEditing}
              />
              <p className="text-xs text-white/50 mt-1">
                URL-friendly identifier (lowercase, hyphens only)
                {isEditing && ' - Cannot be changed to avoid breaking links'}
              </p>
            </div>

            {/* Date */}
            <div>
              <label htmlFor="event-date" className="block text-white mb-2 text-sm font-medium">
                Event Date *
              </label>
              <input
                id="event-date"
                type="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                required
                min={!isEditing ? today : undefined}
              />
              {!isEditing && <p className="text-xs text-white/50 mt-1">Date cannot be in the past</p>}
            </div>

            {/* Status */}
            <div>
              <label htmlFor="event-status" className="block text-white mb-2 text-sm font-medium">
                Status
              </label>
              <select
                id="event-status"
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                className="w-full px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
              <div className="mt-2">
                <EventStatusBadge status={formData.status} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button type="submit" variant="primary" disabled={loading} loading={loading} fullWidth>
                {isEditing ? 'Update Event' : 'Create Event'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
