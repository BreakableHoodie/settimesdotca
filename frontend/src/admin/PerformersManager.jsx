import { useState, useEffect } from 'react'
import { performersApi } from '../utils/adminApi'

export default function PerformersManager() {
  const [performers, setPerformers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingPerformer, setEditingPerformer] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    genre: '',
    origin: '',
    description: '',
    url: '',
    photo_url: '',
    instagram: '',
    bandcamp: '',
    facebook: '',
  })

  // Load performers on mount
  useEffect(() => {
    loadPerformers()
  }, [])

  const loadPerformers = async () => {
    setLoading(true)
    try {
      const response = await performersApi.list()
      setPerformers(response.performers || [])
    } catch (error) {
      console.error('Failed to load performers:', error)
      alert('Failed to load performers')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)

    try {
      if (editingPerformer) {
        // Update existing performer
        await performersApi.update(editingPerformer.id, formData)
      } else {
        // Create new performer
        await performersApi.create(formData)
      }

      // Reload performers list
      await loadPerformers()

      // Reset form
      handleCancel()
    } catch (error) {
      console.error('Failed to save performer:', error)
      alert(`Failed to save performer: ${error.message || 'Please try again'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = performer => {
    setEditingPerformer(performer)
    setFormData({
      name: performer.name || '',
      genre: performer.genre || '',
      origin: performer.origin || '',
      description: performer.description || '',
      url: performer.url || '',
      photo_url: performer.photo_url || '',
      instagram: performer.instagram || '',
      bandcamp: performer.bandcamp || '',
      facebook: performer.facebook || '',
    })
    setShowForm(true)
  }

  const handleDelete = async performerId => {
    if (!confirm('Are you sure you want to delete this performer?')) return

    setLoading(true)
    try {
      await performersApi.delete(performerId)
      await loadPerformers()
    } catch (error) {
      console.error('Failed to delete performer:', error)
      alert(`Failed to delete performer: ${error.message || 'Please try again'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingPerformer(null)
    setFormData({
      name: '',
      genre: '',
      origin: '',
      description: '',
      url: '',
      photo_url: '',
      instagram: '',
      bandcamp: '',
      facebook: '',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white">Performers Registry</h2>
          <p className="text-gray-400 text-sm mt-1">
            Manage your global roster of performers that can be scheduled across multiple events
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 font-medium"
          >
            + Add Performer
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-band-purple rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4">
            {editingPerformer ? 'Edit Performer' : 'Add New Performer'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="performer-name" className="block text-white mb-2 text-sm">Name *</label>
              <input
                id="performer-name"
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                placeholder="Performer name"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="performer-genre" className="block text-white mb-2 text-sm">Genre</label>
                <input
                  id="performer-genre"
                  type="text"
                  value={formData.genre}
                  onChange={e => setFormData(prev => ({ ...prev, genre: e.target.value }))}
                  className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  placeholder="Rock, Jazz, etc."
                />
              </div>
              <div>
                <label htmlFor="performer-origin" className="block text-white mb-2 text-sm">Origin/City</label>
                <input
                  id="performer-origin"
                  type="text"
                  value={formData.origin}
                  onChange={e => setFormData(prev => ({ ...prev, origin: e.target.value }))}
                  className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  placeholder="Montreal, Toronto, etc."
                />
              </div>
            </div>

            <div>
              <label htmlFor="performer-description" className="block text-white mb-2 text-sm">Description</label>
              <textarea
                id="performer-description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                rows={3}
                placeholder="Brief description of the performer..."
              />
            </div>

            <div>
              <label htmlFor="performer-url" className="block text-white mb-2 text-sm">Website/Main URL</label>
              <input
                id="performer-url"
                type="url"
                value={formData.url}
                onChange={e => setFormData(prev => ({ ...prev, url: e.target.value }))}
                className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label htmlFor="performer-photo-url" className="block text-white mb-2 text-sm">Photo URL</label>
              <input
                id="performer-photo-url"
                type="url"
                value={formData.photo_url}
                onChange={e => setFormData(prev => ({ ...prev, photo_url: e.target.value }))}
                className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                placeholder="https://example.com/photo.jpg"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="performer-instagram" className="block text-white mb-2 text-sm">Instagram</label>
                <input
                  id="performer-instagram"
                  type="text"
                  value={formData.instagram}
                  onChange={e => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
                  className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  placeholder="@username"
                />
              </div>
              <div>
                <label htmlFor="performer-bandcamp" className="block text-white mb-2 text-sm">Bandcamp</label>
                <input
                  id="performer-bandcamp"
                  type="text"
                  value={formData.bandcamp}
                  onChange={e => setFormData(prev => ({ ...prev, bandcamp: e.target.value }))}
                  className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  placeholder="username.bandcamp.com"
                />
              </div>
              <div>
                <label htmlFor="performer-facebook" className="block text-white mb-2 text-sm">Facebook</label>
                <input
                  id="performer-facebook"
                  type="text"
                  value={formData.facebook}
                  onChange={e => setFormData(prev => ({ ...prev, facebook: e.target.value }))}
                  className="w-full px-4 py-3 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  placeholder="facebook.com/page"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 font-medium"
              >
                {loading ? 'Saving...' : editingPerformer ? 'Update Performer' : 'Add Performer'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={loading}
                className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Performers List */}
      <div className="space-y-3">
        {loading && !showForm ? (
          <div className="text-center text-gray-400 py-8">Loading performers...</div>
        ) : performers.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No performers in registry yet. Add your first performer above.
          </div>
        ) : (
          performers.map(performer => (
            <div key={performer.id} className="bg-band-purple rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-white font-bold text-lg">{performer.name}</h3>
                  <div className="flex gap-4 text-sm text-gray-400 mt-1">
                    {performer.genre && <span>{performer.genre}</span>}
                    {performer.origin && <span>{performer.origin}</span>}
                    {performer.performance_count > 0 && (
                      <span className="text-green-400">{performer.performance_count} performance(s)</span>
                    )}
                  </div>
                  {performer.description && <p className="text-gray-300 text-sm mt-2">{performer.description}</p>}
                  <div className="flex gap-3 mt-2">
                    {performer.url && (
                      <a
                        href={performer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-band-orange text-sm hover:underline"
                      >
                        Website
                      </a>
                    )}
                    {performer.instagram && (
                      <a
                        href={`https://instagram.com/${performer.instagram.replace('@', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-band-orange text-sm hover:underline"
                      >
                        Instagram
                      </a>
                    )}
                    {performer.bandcamp && (
                      <a
                        href={`https://${performer.bandcamp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-band-orange text-sm hover:underline"
                      >
                        Bandcamp
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleEdit(performer)}
                    className="min-h-[44px] px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(performer.id)}
                    disabled={performer.performance_count > 0}
                    className="min-h-[44px] px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    title={
                      performer.performance_count > 0
                        ? 'Cannot delete performer with existing performances'
                        : 'Delete performer'
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
