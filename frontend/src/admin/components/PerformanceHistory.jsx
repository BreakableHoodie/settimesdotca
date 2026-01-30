import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTimes, faCalendar, faMapMarkerAlt, faClock, faMusic } from '@fortawesome/free-solid-svg-icons'
import { bandsApi } from '../../utils/adminApi'
import { formatTimeRange } from '../../utils/timeFormat'

/**
 * PerformanceHistory Component
 *
 * Displays a band's performance history including:
 * - Band profile (photo, description, genre, origin, social links)
 * - Statistics (total shows, unique venues, unique events)
 * - Chronological list of performances with event and venue details
 *
 * @param {Object} props
 * @param {string} props.bandName - Name of the band to fetch history for
 * @param {Function} props.onClose - Callback to close the modal
 */
export default function PerformanceHistory({ bandName, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true)
        setError(null)
        const result = await bandsApi.getStats(bandName)
        setData(result)
      } catch (err) {
        console.error('Error fetching performance history:', err)
        setError(err.message || 'Failed to load performance history')
      } finally {
        setLoading(false)
      }
    }

    if (bandName) {
      fetchHistory()
    }
  }, [bandName])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-band-navy rounded-lg p-8 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto">
          <div className="text-center text-white">
            <FontAwesomeIcon icon={faMusic} spin className="text-4xl mb-4" />
            <p>Loading performance history...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-band-navy rounded-lg p-8 max-w-4xl w-full mx-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Error</h2>
            <button onClick={onClose} className="text-white hover:text-band-orange transition" aria-label="Close">
              <FontAwesomeIcon icon={faTimes} className="text-2xl" />
            </button>
          </div>
          <div className="bg-red-900/30 border border-red-600 rounded p-4">
            <p className="text-red-200">{error}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { profile, stats, performances } = data

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-band-navy rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <FontAwesomeIcon icon={faMusic} className="text-band-orange" />
            Performance History
          </h2>
          <button onClick={onClose} className="text-white hover:text-band-orange transition" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="text-2xl" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {/* Band Profile */}
          <div className="bg-band-dark rounded-lg p-6 mb-6">
            <div className="flex gap-6 items-start">
              {profile.photo_url && (
                <img
                  src={profile.photo_url}
                  alt={profile.name}
                  loading="lazy"
                  className="w-32 h-32 object-cover rounded-lg"
                />
              )}
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2">{profile.name}</h3>
                {profile.origin && (
                  <p className="text-white/60 mb-2">
                    <FontAwesomeIcon icon={faMapMarkerAlt} className="mr-2" />
                    {profile.origin}
                  </p>
                )}
                {profile.genre && <p className="text-white/80 mb-3">{profile.genre}</p>}
                {profile.description && <p className="text-white/70 text-sm leading-relaxed">{profile.description}</p>}
              </div>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-band-dark rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-band-orange mb-1">{stats.totalShows}</div>
              <div className="text-white/60 text-sm">Total Shows</div>
            </div>
            <div className="bg-band-dark rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-band-orange mb-1">{stats.uniqueVenues}</div>
              <div className="text-white/60 text-sm">Unique Venues</div>
            </div>
            <div className="bg-band-dark rounded-lg p-4 text-center">
              <div className="text-3xl font-bold text-band-orange mb-1">{stats.uniqueEvents}</div>
              <div className="text-white/60 text-sm">Unique Events</div>
            </div>
          </div>

          {/* Performance List */}
          <div>
            <h4 className="text-xl font-bold text-white mb-4">All Performances</h4>
            <div className="space-y-3">
              {performances.map(performance => (
                <div key={performance.id} className="bg-band-dark rounded-lg p-4 hover:bg-band-dark/80 transition">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      {performance.event ? (
                        <>
                          <div className="text-white font-semibold mb-2">
                            <FontAwesomeIcon icon={faCalendar} className="mr-2 text-band-orange" />
                            {performance.event.name}
                          </div>
                          <div className="text-white/60 text-sm mb-1">
                            {new Date(performance.event.date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </div>
                          {performance.event.location && (
                            <div className="text-white/50 text-sm">
                              <FontAwesomeIcon icon={faMapMarkerAlt} className="mr-2" />
                              {performance.event.location}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-white/40 italic">No event assigned</div>
                      )}
                      {performance.venue && (
                        <div className="text-white/70 text-sm mt-2">
                          Venue: {performance.venue.name}
                          {performance.venue.address && ` - ${performance.venue.address}`}
                        </div>
                      )}
                    </div>
                    {performance.startTime && performance.endTime && (
                      <div className="text-white/60 text-sm whitespace-nowrap">
                        <FontAwesomeIcon icon={faClock} className="mr-2" />
                        {formatTimeRange(performance.startTime, performance.endTime)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {performances.length === 0 && <div className="text-center text-white/50 py-8">No performances found</div>}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

PerformanceHistory.propTypes = {
  bandName: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
}
