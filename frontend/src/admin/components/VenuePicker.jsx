import { useState, useEffect } from 'react'
import { venuesApi } from '../../utils/adminApi'

/**
 * VenuePicker - Quick venue selector for adding venues to an event
 * Shows when in event context view
 */
export default function VenuePicker({ eventId: _eventId, existingVenueIds, onVenueAdded }) {
  const [allVenues, setAllVenues] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newVenue, setNewVenue] = useState({ name: '', address: '' })

  useEffect(() => {
    loadVenues()
  }, [])

  const loadVenues = async () => {
    setLoading(true)
    try {
      const response = await venuesApi.list()
      setAllVenues(response.venues || [])
    } catch (error) {
      console.error('Failed to load venues:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAddExisting = venueId => {
    const venue = allVenues.find(v => v.id === parseInt(venueId))
    if (venue) {
      onVenueAdded(venue)
    }
  }

  const handleCreateNew = async () => {
    if (!newVenue.name.trim()) return

    setLoading(true)
    try {
      const response = await venuesApi.create(newVenue)
      const createdVenue = response.venue

      // Add to event
      onVenueAdded(createdVenue)

      // Reset form
      setNewVenue({ name: '', address: '' })
      setShowCreateForm(false)

      // Reload venues list
      await loadVenues()
    } catch (error) {
      console.error('Failed to create venue:', error)
      alert(`Failed to create venue: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // Filter out venues already added to this event
  const availableVenues = allVenues.filter(v => !existingVenueIds.includes(v.id))

  return (
    <div className="bg-bg-purple rounded-lg p-4 space-y-4">
      <h3 className="text-white font-bold text-lg">Add Venue to Event</h3>

      {/* Select Existing Venue */}
      <div>
        <label htmlFor="venue-picker-select" className="block text-white mb-2 text-sm">
          Select Existing Venue
        </label>
        {loading ? (
          <div className="text-gray-400 text-sm">Loading venues...</div>
        ) : availableVenues.length > 0 ? (
          <select
            id="venue-picker-select"
            onChange={e => {
              if (e.target.value) {
                handleAddExisting(e.target.value)
                e.target.value = '' // Reset
              }
            }}
            className="w-full min-h-[44px] px-4 py-3 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none"
            defaultValue=""
          >
            <option value="">Choose a venue...</option>
            {availableVenues.map(venue => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
                {venue.address && ` - ${venue.address}`}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-gray-400 text-sm">All available venues have been added</div>
        )}
      </div>

      {/* Create New Venue */}
      <div className="border-t border-gray-600 pt-4">
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full min-h-[44px] px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm font-medium"
          >
            + Create New Venue
          </button>
        ) : (
          <div className="space-y-3">
            <h4 className="text-white font-medium text-sm">Create New Venue</h4>
            <input
              type="text"
              value={newVenue.name}
              onChange={e => setNewVenue(prev => ({ ...prev, name: e.target.value }))}
              className="w-full min-h-[44px] px-4 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none text-sm"
              placeholder="Venue name *"
            />
            <input
              type="text"
              value={newVenue.address}
              onChange={e => setNewVenue(prev => ({ ...prev, address: e.target.value }))}
              className="w-full min-h-[44px] px-4 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus:outline-none text-sm"
              placeholder="Address (optional)"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleCreateNew}
                disabled={!newVenue.name.trim() || loading}
                className="min-h-[44px] flex-1 px-4 py-2 bg-accent-500 text-white rounded hover:bg-accent-600 disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Creating...' : 'Create & Add'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setNewVenue({ name: '', address: '' })
                }}
                className="min-h-[44px] px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
