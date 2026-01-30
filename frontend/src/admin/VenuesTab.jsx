import { useState, useEffect, useCallback } from 'react'
import { venuesApi } from '../utils/adminApi'
import { FIELD_LIMITS } from '../utils/validation'

/**
 * VenuesTab - Manage venues (create, edit, delete)
 *
 * Features:
 * - List all venues with name, address, band count
 * - Add new venue form
 * - Edit venue (inline edit)
 * - Delete venue (disabled if bands exist with tooltip)
 * - Mobile-responsive cards
 */
export default function VenuesTab({ showToast }) {
  const [venues, setVenues] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const loadVenues = useCallback(async () => {
    try {
      setLoading(true)
      const result = await venuesApi.getAll()
      setVenues(result.venues || [])
    } catch (err) {
      showToast('Failed to load venues: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadVenues()
  }, [loadVenues])

  const resetForm = () => {
    setFormData({ name: '', address: '' })
    setShowAddForm(false)
    setEditingId(null)
  }

  const handleAdd = async e => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await venuesApi.create(formData)
      showToast('Venue added successfully!', 'success')
      resetForm()
      loadVenues()
    } catch (err) {
      showToast('Failed to add venue: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async e => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await venuesApi.update(editingId, formData)
      showToast('Venue updated successfully!', 'success')
      resetForm()
      loadVenues()
    } catch (err) {
      showToast('Failed to update venue: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (venueId, venueName, bandCount) => {
    if (bandCount > 0) {
      showToast(`Cannot delete venue with ${bandCount} band(s). Remove bands first.`, 'error')
      return
    }

    if (!window.confirm(`Are you sure you want to delete "${venueName}"?`)) {
      return
    }

    try {
      await venuesApi.delete(venueId)
      showToast('Venue deleted successfully!', 'success')
      loadVenues()
    } catch (err) {
      showToast('Failed to delete venue: ' + err.message, 'error')
    }
  }

  const startEdit = venue => {
    setEditingId(venue.id)
    setFormData({
      name: venue.name,
      address: venue.address || '',
    })
    setShowAddForm(false)
  }

  const handleInputChange = e => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-band-orange text-lg">Loading venues...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Venues</h2>
          <p className="text-sm text-white/70 mt-1">Manage venues and locations for your events.</p>
        </div>
        {!showAddForm && !editingId && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 min-h-[44px] bg-band-orange text-white rounded hover:bg-orange-600 transition-colors"
          >
            + Add Venue
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {(showAddForm || editingId) && (
        <div className="bg-band-purple p-6 rounded-lg border border-band-orange/20">
          <h3 className="text-lg font-bold text-band-orange mb-4">{editingId ? 'Edit Venue' : 'Add New Venue'}</h3>

          <form onSubmit={editingId ? handleUpdate : handleAdd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="venue-name" className="block text-white mb-2 text-sm">
                  Venue Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  required
                  minLength={FIELD_LIMITS.venueName.min}
                  maxLength={FIELD_LIMITS.venueName.max}
                  placeholder="The Rock Bar"
                />
                <span className="text-xs text-white/50 mt-1">
                  {formData.name.length}/{FIELD_LIMITS.venueName.max}
                </span>
              </div>

              <div>
                <label htmlFor="venue-address" className="block text-white mb-2 text-sm">
                  Address
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 min-h-[44px] rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                  maxLength={FIELD_LIMITS.venueAddress.max}
                  placeholder="123 Main St"
                />
                <span className="text-xs text-white/50 mt-1">
                  {formData.address.length}/{FIELD_LIMITS.venueAddress.max}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 min-h-[44px] bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving...' : editingId ? 'Update Venue' : 'Add Venue'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 min-h-[44px] bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Venues List */}
      <div className="bg-band-purple rounded-lg border border-band-orange/20 overflow-hidden">
        {venues.length === 0 ? (
          <div className="p-8 text-center text-white/50">No venues yet. Add your first venue to get started!</div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-band-navy/50 border-b border-band-orange/20">
                  <tr>
                    <th className="px-4 py-3 text-left text-white font-semibold">Name</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Address</th>
                    <th className="px-4 py-3 text-left text-white font-semibold">Bands</th>
                    <th className="px-4 py-3 text-right text-white font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-band-orange/10">
                  {venues.map(venue => {
                    const hasBands = (venue.band_count || 0) > 0
                    return (
                      <tr key={venue.id} className="hover:bg-band-navy/30 transition-colors">
                        <td className="px-4 py-3 text-white font-medium">{venue.name}</td>
                        <td className="px-4 py-3 text-white/70">{venue.address || '-'}</td>
                        <td className="px-4 py-3 text-white/70">{venue.band_count || 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(venue)}
                              className="px-4 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                            >
                              Edit
                            </button>
                            <div className="relative group">
                              <button
                                onClick={() => handleDelete(venue.id, venue.name, venue.band_count)}
                                disabled={hasBands}
                                className="px-4 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                Delete
                              </button>
                              {hasBands && (
                                <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-48 p-2 bg-gray-900 text-white text-xs rounded shadow-lg z-10">
                                  Cannot delete: {venue.band_count} band(s) assigned to this venue
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-band-orange/10">
              {venues.map(venue => {
                const hasBands = (venue.band_count || 0) > 0
                return (
                  <div key={venue.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-white font-semibold">{venue.name}</h3>
                        <p className="text-white/70 text-sm">{venue.address || 'No address'}</p>
                      </div>
                      <div className="text-white/50 text-sm">
                        {venue.band_count || 0} band{venue.band_count !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => startEdit(venue)}
                        className="flex-1 px-3 py-2 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(venue.id, venue.name, venue.band_count)}
                        disabled={hasBands}
                        className="flex-1 px-3 py-2 min-h-[44px] bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={hasBands ? `Cannot delete: ${venue.band_count} band(s) assigned` : 'Delete venue'}
                      >
                        Delete
                      </button>
                    </div>

                    {hasBands && (
                      <p className="text-xs text-yellow-400">
                        Note: Cannot delete while {venue.band_count} band(s) are assigned to this venue
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
