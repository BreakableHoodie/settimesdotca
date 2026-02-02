import { useState, useEffect } from 'react'
import EventStatusBadge from './components/EventStatusBadge'
import { Button } from '../components/ui'
import { eventsApi } from '../utils/adminApi'
import { FIELD_LIMITS } from '../utils/validation'

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
  const isPublished = event?.status === 'published' || Number(event?.is_published) === 1
  const canEditSlug = !isEditing || !isPublished

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    date: '',
    status: 'draft',
    description: '',
    city: '',
    ticket_url: '',
    social_website: '',
    social_instagram: '',
    social_facebook: '',
    social_x: '',
    social_tiktok: '',
    social_youtube: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)

  const parseSocialLinks = value => {
    if (!value) return {}
    if (typeof value === 'object') return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch (_error) {
        return {}
      }
    }
    return {}
  }

  const buildSocialLinksPayload = currentFormData => {
    const links = {
      website: currentFormData.social_website.trim(),
      instagram: currentFormData.social_instagram.trim(),
      facebook: currentFormData.social_facebook.trim(),
      x: currentFormData.social_x.trim(),
      tiktok: currentFormData.social_tiktok.trim(),
      youtube: currentFormData.social_youtube.trim(),
    }

    const cleaned = Object.fromEntries(Object.entries(links).filter(([, value]) => value))

    if (!Object.keys(cleaned).length) {
      return null
    }

    return JSON.stringify(cleaned)
  }

  // Initialize form when event changes
  useEffect(() => {
    if (event) {
      const socialLinks = parseSocialLinks(event.social_links)
      setFormData({
        name: event.name || '',
        slug: event.slug || '',
        date: event.date || '',
        status: event.status || 'draft',
        description: event.description || '',
        city: event.city || '',
        ticket_url: event.ticket_url || '',
        social_website: socialLinks.website || '',
        social_instagram: socialLinks.instagram || '',
        social_facebook: socialLinks.facebook || '',
        social_x: socialLinks.x || socialLinks.twitter || '',
        social_tiktok: socialLinks.tiktok || '',
        social_youtube: socialLinks.youtube || '',
      })
      setSlugEdited(true) // Prevent auto-generation when editing
    } else {
      setFormData({
        name: '',
        slug: '',
        date: '',
        status: 'draft',
        description: '',
        city: '',
        ticket_url: '',
        social_website: '',
        social_instagram: '',
        social_facebook: '',
        social_x: '',
        social_tiktok: '',
        social_youtube: '',
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
    const nameTrimmed = formData.name.trim()
    if (!nameTrimmed || nameTrimmed.length < FIELD_LIMITS.eventName.min) {
      setError(`Name must be at least ${FIELD_LIMITS.eventName.min} characters`)
      return false
    }
    if (nameTrimmed.length > FIELD_LIMITS.eventName.max) {
      setError(`Name must be no more than ${FIELD_LIMITS.eventName.max} characters`)
      return false
    }

    const slugTrimmed = formData.slug.trim()
    if (!slugTrimmed || !/^[a-z0-9-]+$/.test(slugTrimmed)) {
      setError('Slug must contain only lowercase letters, numbers, and hyphens')
      return false
    }
    if (slugTrimmed.length < FIELD_LIMITS.eventSlug.min) {
      setError(`Slug must be at least ${FIELD_LIMITS.eventSlug.min} characters`)
      return false
    }
    if (slugTrimmed.length > FIELD_LIMITS.eventSlug.max) {
      setError(`Slug must be no more than ${FIELD_LIMITS.eventSlug.max} characters`)
      return false
    }

    if (!formData.date || !/^\d{4}-\d{2}-\d{2}$/.test(formData.date)) {
      setError('Date is required in YYYY-MM-DD format')
      return false
    }

    // Check date is not in past (only for new events, unless status is archived)
    if (!isEditing && formData.status !== 'archived') {
      const eventDate = new Date(formData.date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (eventDate < today) {
        setError('Date cannot be in the past (use archived status for past events)')
        return false
      }
    }

    const cityTrimmed = formData.city.trim()
    if (cityTrimmed.length > FIELD_LIMITS.eventCity.max) {
      setError(`City must be no more than ${FIELD_LIMITS.eventCity.max} characters`)
      return false
    }

    const ticketTrimmed = formData.ticket_url.trim()
    if (ticketTrimmed && !/^https?:\/\//i.test(ticketTrimmed)) {
      setError('Ticket link must start with http:// or https://')
      return false
    }
    if (ticketTrimmed.length > FIELD_LIMITS.ticketLink.max) {
      setError(`Ticket link must be no more than ${FIELD_LIMITS.ticketLink.max} characters`)
      return false
    }

    const socialLinksPayload = buildSocialLinksPayload(formData)
    if (socialLinksPayload && socialLinksPayload.length > FIELD_LIMITS.eventSocialLinks.max) {
      setError(`Social links must be no more than ${FIELD_LIMITS.eventSocialLinks.max} characters`)
      return false
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
      const socialLinksPayload = buildSocialLinksPayload(formData)
      const payload = {
        name: formData.name,
        slug: formData.slug,
        date: formData.date,
        status: formData.status,
        description: formData.description,
        city: formData.city,
        ticket_url: formData.ticket_url,
        social_links: socialLinksPayload,
      }

      let data
      if (isEditing) {
        data = await eventsApi.update(event.id, payload)
      } else {
        data = await eventsApi.create(payload)
      }

      // Success!
      if (onSave) {
        onSave(data.event)
      }
      onClose()
    } catch (err) {
      console.error('Error saving event:', err)
      setError(err.message || 'Failed to save event. Please try again.')
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
                className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                required
                placeholder="Long Weekend Band Crawl Vol. 6"
                minLength={FIELD_LIMITS.eventName.min}
                maxLength={FIELD_LIMITS.eventName.max}
              />
              <p className="text-xs text-white/50 mt-1">
                {formData.name.length}/{FIELD_LIMITS.eventName.max} (min {FIELD_LIMITS.eventName.min})
              </p>
            </div>

            {/* Slug */}
            <div>
              <label htmlFor="event-slug" className="block text-white mb-2 text-sm font-medium">
                Slug * {isEditing && !canEditSlug && <span className="text-yellow-400">(unpublish to change)</span>}
              </label>
              <input
                id="event-slug"
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleSlugChange}
                className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange font-mono text-sm"
                required
                placeholder="vol-6"
                pattern="[a-z0-9\-]+"
                title="Only lowercase letters, numbers, and hyphens"
                minLength={FIELD_LIMITS.eventSlug.min}
                maxLength={FIELD_LIMITS.eventSlug.max}
                disabled={!canEditSlug}
              />
              <p className="text-xs text-white/50 mt-1">
                {formData.slug.length}/{FIELD_LIMITS.eventSlug.max} - URL-friendly (lowercase, hyphens only)
                {isEditing && !canEditSlug && ' - Unpublish first to avoid breaking links'}
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
                className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                required
                min={!isEditing && formData.status !== 'archived' ? today : undefined}
              />
              {!isEditing && (
                <p className="text-xs text-white/50 mt-1">
                  {formData.status === 'archived'
                    ? 'Past dates allowed for archived events'
                    : 'Date cannot be in the past'}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="event-description" className="block text-white mb-2 text-sm font-medium">
                Description <span className="text-white/50 text-xs">(optional)</span>
              </label>
              <textarea
                id="event-description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                className="w-full min-h-[120px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                rows={4}
                maxLength={FIELD_LIMITS.eventDescription.max}
                placeholder="Describe the event..."
              />
              <p className="text-xs text-white/50 mt-1">
                {formData.description.length}/{FIELD_LIMITS.eventDescription.max}
              </p>
            </div>

            {/* City */}
            <div>
              <label htmlFor="event-city" className="block text-white mb-2 text-sm font-medium">
                City <span className="text-white/50 text-xs">(optional)</span>
              </label>
              <input
                id="event-city"
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                maxLength={FIELD_LIMITS.eventCity.max}
                placeholder="Kitchener"
              />
              <p className="text-xs text-white/50 mt-1">
                {formData.city.length}/{FIELD_LIMITS.eventCity.max}
              </p>
            </div>

            {/* Ticket URL */}
            <div>
              <label htmlFor="event-ticket-url" className="block text-white mb-2 text-sm font-medium">
                Ticket Link <span className="text-white/50 text-xs">(optional)</span>
              </label>
              <input
                id="event-ticket-url"
                type="url"
                name="ticket_url"
                value={formData.ticket_url}
                onChange={handleInputChange}
                className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                maxLength={FIELD_LIMITS.ticketLink.max}
                placeholder="https://tickets.example.com"
              />
              <p className="text-xs text-white/50 mt-1">
                {formData.ticket_url.length}/{FIELD_LIMITS.ticketLink.max}
              </p>
            </div>

            {/* Social Links */}
            <fieldset>
              <legend className="block text-white mb-2 text-sm font-medium">
                Social Links <span className="text-white/50 text-xs">(optional)</span>
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  id="event-social-website"
                  type="url"
                  name="social_website"
                  value={formData.social_website}
                  onChange={handleInputChange}
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                  maxLength={FIELD_LIMITS.ticketLink.max}
                  placeholder="Website URL"
                />
                <input
                  id="event-social-instagram"
                  type="text"
                  name="social_instagram"
                  value={formData.social_instagram}
                  onChange={handleInputChange}
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                  maxLength={FIELD_LIMITS.ticketLink.max}
                  placeholder="Instagram (@handle or URL)"
                />
                <input
                  id="event-social-facebook"
                  type="url"
                  name="social_facebook"
                  value={formData.social_facebook}
                  onChange={handleInputChange}
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                  maxLength={FIELD_LIMITS.ticketLink.max}
                  placeholder="Facebook URL"
                />
                <input
                  id="event-social-x"
                  type="text"
                  name="social_x"
                  value={formData.social_x}
                  onChange={handleInputChange}
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                  maxLength={FIELD_LIMITS.ticketLink.max}
                  placeholder="X / Twitter (@handle or URL)"
                />
                <input
                  id="event-social-tiktok"
                  type="text"
                  name="social_tiktok"
                  value={formData.social_tiktok}
                  onChange={handleInputChange}
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                  maxLength={FIELD_LIMITS.ticketLink.max}
                  placeholder="TikTok (@handle or URL)"
                />
                <input
                  id="event-social-youtube"
                  type="url"
                  name="social_youtube"
                  value={formData.social_youtube}
                  onChange={handleInputChange}
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
                  maxLength={FIELD_LIMITS.ticketLink.max}
                  placeholder="YouTube URL"
                />
              </div>
              <p className="text-xs text-white/50 mt-2">
                Use full URLs or handles (e.g., @settimes). Leave blank to clear.
              </p>
            </fieldset>

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
                className="w-full min-h-[44px] px-4 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none focus:ring-1 focus:ring-band-orange"
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
            <div className="flex flex-col sm:flex-row gap-3 pt-4">
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
