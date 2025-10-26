import { useState } from 'react'
import { eventsApi } from '../utils/adminApi'
import EmbedCodeGenerator from './EmbedCodeGenerator'
import MetricsDashboard from './MetricsDashboard'

/**
 * EventsTab - Manage events (create, duplicate, publish/unpublish)
 *
 * Features:
 * - List all events with name, date, slug, published status, band count
 * - Create new event form
 * - Duplicate event with new name/date/slug
 * - Toggle publish/unpublish status
 * - Mobile-responsive table/cards
 */
export default function EventsTab({ events, onEventsChange, showToast }) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [duplicatingEventId, setDuplicatingEventId] = useState(null)
  const [showEmbedCode, setShowEmbedCode] = useState(null)
  const [showMetrics, setShowMetrics] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    slug: '',
    is_published: false
  })
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setFormData({
      name: '',
      date: '',
      slug: '',
      is_published: false
    })
    setShowCreateForm(false)
    setDuplicatingEventId(null)
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await eventsApi.create(formData)
      showToast('Event created successfully!', 'success')
      resetForm()
      onEventsChange()
    } catch (err) {
      showToast('Failed to create event: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDuplicate = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      await eventsApi.duplicate(duplicatingEventId, {
        name: formData.name,
        date: formData.date,
        slug: formData.slug
      })
      showToast('Event duplicated successfully!', 'success')
      resetForm()
      onEventsChange()
    } catch (err) {
      showToast('Failed to duplicate event: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePublish = async (eventId, currentStatus) => {
    const action = currentStatus ? 'unpublish' : 'publish'
    if (!window.confirm(`Are you sure you want to ${action} this event?`)) {
      return
    }

    try {
      await eventsApi.togglePublish(eventId)
      showToast(`Event ${action}ed successfully!`, 'success')
      onEventsChange()
    } catch (err) {
      showToast(`Failed to ${action} event: ` + err.message, 'error')
    }
  }

  const handleDelete = async (eventId, eventName, bandCount) => {
    const confirmMessage = bandCount > 0 
      ? `Are you sure you want to delete "${eventName}"? This will remove the event but keep all ${bandCount} band(s) (they will become unassigned and can be moved to other events). This action cannot be undone.`
      : `Are you sure you want to delete "${eventName}"? This action cannot be undone.`

    if (!window.confirm(confirmMessage)) {
      return
    }

    try {
      const result = await eventsApi.delete(eventId)
      showToast(result.message || `Event "${eventName}" deleted successfully!`, 'success')
      onEventsChange()
    } catch (err) {
      showToast('Failed to delete event: ' + err.message, 'error')
    }
  }

  const startDuplicate = (event) => {
    setDuplicatingEventId(event.id)
    setFormData({
      name: `${event.name} (Copy)`,
      date: event.date,
      slug: `${event.slug}-copy`,
      is_published: false
    })
    setShowCreateForm(false)
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  // Auto-generate slug from name
  const handleNameChange = (e) => {
    const name = e.target.value
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    setFormData(prev => ({
      ...prev,
      name,
      slug: prev.slug || slug // Only auto-fill if slug is empty
    }))
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
        <h2 className='text-2xl font-bold text-white'>Events</h2>
        {!showCreateForm && !duplicatingEventId && (
          <button
            onClick={() => setShowCreateForm(true)}
            className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 transition-colors'
          >
            + Create New Event
          </button>
        )}
      </div>

      {/* Create/Duplicate Form */}
      {(showCreateForm || duplicatingEventId) && (
        <div className='bg-band-purple p-6 rounded-lg border border-band-orange/20'>
          <h3 className='text-lg font-bold text-band-orange mb-4'>
            {duplicatingEventId ? 'Duplicate Event' : 'Create New Event'}
          </h3>

          <form onSubmit={duplicatingEventId ? handleDuplicate : handleCreate}>
            <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4'>
              <div>
                <label htmlFor="event-name" className='block text-white mb-2 text-sm'>Event Name *</label>
                <input
                  id="event-name" type='text'
                  name='name'
                  value={formData.name}
                  onChange={handleNameChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  required
                  placeholder='Long Weekend Vol. 4'
                />
              </div>

              <div>
                <label htmlFor="event-date" className='block text-white mb-2 text-sm'>Date *</label>
                <input
                  type='date'
                  name='date'
                  value={formData.date}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none'
                  required
                />
              </div>

              <div>
                <label htmlFor="event-slug" className='block text-white mb-2 text-sm'>Slug *</label>
                <input
                  type='text'
                  name='slug'
                  value={formData.slug}
                  onChange={handleInputChange}
                  className='w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none font-mono text-sm'
                  required
                  placeholder='long-weekend-vol-4'
                  pattern='[a-z0-9\-]+'
                  title='Only lowercase letters, numbers, and hyphens'
                />
                <p className='text-xs text-white/50 mt-1'>
                  URL-friendly identifier (lowercase, hyphens only)
                </p>
              </div>

              {!duplicatingEventId && (
                <div className='flex items-center'>
                  <label className='flex items-center gap-2 text-white cursor-pointer'>
                    <input
                      type='checkbox'
                      name='is_published'
                      checked={formData.is_published}
                      onChange={handleInputChange}
                      className='w-4 h-4 rounded border-gray-600 text-band-orange focus:ring-band-orange'
                    />
                    <span>Publish immediately</span>
                  </label>
                </div>
              )}
            </div>

            <div className='flex gap-2'>
              <button
                type='submit'
                disabled={loading}
                className='px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors'
              >
                {loading ? 'Saving...' : duplicatingEventId ? 'Duplicate Event' : 'Create Event'}
              </button>
              <button
                type='button'
                onClick={resetForm}
                className='px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors'
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Events List */}
      <div className='bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden'>
        {events.length === 0 ? (
          <div className='p-8 text-center text-white/50'>
            No events yet. Create your first event to get started!
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className='hidden md:block overflow-x-auto'>
              <table className='w-full'>
                <thead className='bg-band-navy/50 border-b border-band-orange/20'>
                  <tr>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Name</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Date</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Slug</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Status</th>
                    <th className='px-4 py-3 text-left text-white font-semibold'>Bands</th>
                    <th className='px-4 py-3 text-right text-white font-semibold'>Actions</th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-band-orange/10'>
                  {events.map(event => (
                    <tr key={event.id} className='hover:bg-band-navy/30 transition-colors'>
                      <td className='px-4 py-3 text-white font-medium'>{event.name}</td>
                      <td className='px-4 py-3 text-white/70'>
                        {new Date(event.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </td>
                      <td className='px-4 py-3 text-band-orange font-mono text-sm'>
                        {event.slug}
                      </td>
                      <td className='px-4 py-3'>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            event.is_published
                              ? 'bg-green-900/50 text-green-300'
                              : 'bg-yellow-900/50 text-yellow-300'
                          }`}
                        >
                          {event.is_published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      <td className='px-4 py-3 text-white/70'>{event.band_count || 0}</td>
                      <td className='px-4 py-3'>
                        <div className='flex justify-end gap-2'>
                          <button
                            onClick={() => setShowMetrics(event)}
                            className='px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors'
                          >
                            Metrics
                          </button>
                          <button
                            onClick={() => setShowEmbedCode(event)}
                            className='px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors'
                          >
                            Embed
                          </button>
                          <button
                            onClick={() => handleTogglePublish(event.id, event.is_published)}
                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                              event.is_published
                                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                            }`}
                          >
                            {event.is_published ? 'Unpublish' : 'Publish'}
                          </button>
                          <button
                            onClick={() => startDuplicate(event)}
                            className='px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors'
                          >
                            Duplicate
                          </button>
                          <button
                            onClick={() => handleDelete(event.id, event.name, event.band_count || 0)}
                            className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors'
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className='md:hidden divide-y divide-band-orange/10'>
              {events.map(event => (
                <div key={event.id} className='p-4 space-y-3'>
                  <div className='flex items-start justify-between'>
                    <div>
                      <h3 className='text-white font-semibold'>{event.name}</h3>
                      <p className='text-white/70 text-sm'>
                        {new Date(event.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        event.is_published
                          ? 'bg-green-900/50 text-green-300'
                          : 'bg-yellow-900/50 text-yellow-300'
                      }`}
                    >
                      {event.is_published ? 'Published' : 'Draft'}
                    </span>
                  </div>

                  <div className='text-sm'>
                    <span className='text-white/50'>Slug: </span>
                    <span className='text-band-orange font-mono'>{event.slug}</span>
                  </div>

                  <div className='text-sm text-white/70'>
                    {event.band_count || 0} band{event.band_count !== 1 ? 's' : ''}
                  </div>

                  <div className='flex gap-2 pt-2'>
                    <button
                      onClick={() => setShowMetrics(event)}
                      className='flex-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-medium transition-colors'
                    >
                      Metrics
                    </button>
                    <button
                      onClick={() => setShowEmbedCode(event)}
                      className='flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors'
                    >
                      Embed
                    </button>
                    <button
                      onClick={() => handleTogglePublish(event.id, event.is_published)}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium transition-colors ${
                        event.is_published
                          ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      {event.is_published ? 'Unpublish' : 'Publish'}
                    </button>
                    <button
                      onClick={() => startDuplicate(event)}
                      className='flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors'
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => handleDelete(event.id, event.name, event.band_count || 0)}
                      className='flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors'
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Metrics Dashboard Modal */}
      {showMetrics && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50'>
          <div className='bg-band-purple rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto'>
            <div className='p-6'>
              <div className='flex justify-between items-center mb-4'>
                <h3 className='text-xl font-bold text-white'>Metrics for "{showMetrics.name}"</h3>
                <button
                  onClick={() => setShowMetrics(null)}
                  className='text-gray-400 hover:text-white text-2xl'
                >
                  ×
                </button>
              </div>
              <MetricsDashboard eventId={showMetrics.id} />
            </div>
          </div>
        </div>
      )}

      {/* Embed Code Generator Modal */}
      {showEmbedCode && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50'>
          <div className='bg-band-purple rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto'>
            <div className='p-6'>
              <div className='flex justify-between items-center mb-4'>
                <h3 className='text-xl font-bold text-white'>Embed Code for "{showEmbedCode.name}"</h3>
                <button
                  onClick={() => setShowEmbedCode(null)}
                  className='text-gray-400 hover:text-white text-2xl'
                >
                  ×
                </button>
              </div>
              <EmbedCodeGenerator event={showEmbedCode} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
