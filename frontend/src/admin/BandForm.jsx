import PropTypes from 'prop-types'

export default function BandForm({
  events,
  venues,
  formData,
  submitting,
  mode,
  showEventIntro,
  onChange,
  onSubmit,
  onCancel,
  conflicts,
}) {
  const requireSchedule = Boolean(formData.event_id)
  const submitLabel = submitting ? 'Saving...' : mode === 'edit' ? 'Update Performance' : 'Add Performance'

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="sm:col-span-2">
          <label htmlFor="band-name" className="block text-white mb-2 text-sm">
            Band Name *
          </label>
          <input
            id="band-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={onChange}
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
            required
            placeholder="The Rockers"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="band-event" className="block text-white mb-2 text-sm">
            Event
          </label>
          <select
            id="band-event"
            name="event_id"
            value={formData.event_id}
            onChange={onChange}
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
          >
            <option value="">No event assigned yet</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
          <p className="text-white/60 text-xs mt-2">
            Leave this blank to keep the band available or move it between events later.
          </p>
        </div>

        {showEventIntro && (
          <div className="sm:col-span-2">
            <div className="bg-blue-900/20 border border-blue-600 rounded p-3 text-sm text-blue-100">
              You can create bands and venues independently from events. Assign them now or keep them available to attach later.
            </div>
          </div>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="band-venue" className="block text-white mb-2 text-sm">
            Venue <span className="text-gray-400 text-xs ml-2">(optional)</span>
          </label>
          <select
            id="band-venue"
            name="venue_id"
            value={formData.venue_id}
            onChange={onChange}
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
          >
            <option value="">No venue assigned yet</option>
            {venues.map(venue => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>

        {requireSchedule && (
          <>
            <div>
              <label htmlFor="band-start-time" className="block text-white mb-2 text-sm">
                Start Time
              </label>
              <input
                id="band-start-time"
                type="time"
                name="start_time"
                value={formData.start_time}
                onChange={onChange}
                className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                required={requireSchedule}
              />
            </div>

            <div>
              <label htmlFor="band-duration" className="block text-white mb-2 text-sm">
                Duration (minutes)
                <span className="text-gray-400 text-xs ml-2">or set end time below</span>
              </label>
              <input
                id="band-duration"
                type="number"
                name="duration"
                value={formData.duration}
                onChange={onChange}
                className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                placeholder="45"
                min="1"
              />
            </div>

            <div>
              <label htmlFor="band-end-time" className="block text-white mb-2 text-sm">
                End Time
                <span className="text-gray-400 text-xs ml-2">or set duration above</span>
              </label>
              <input
                id="band-end-time"
                type="time"
                name="end_time"
                value={formData.end_time}
                onChange={onChange}
                className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
                required={requireSchedule}
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="band-url" className="block text-white mb-2 text-sm">
            Website / Social Media <span className="text-gray-400 text-xs ml-2">(optional)</span>
          </label>
          <input
            id="band-url"
            type="url"
            name="url"
            value={formData.url}
            onChange={onChange}
            className="w-full px-3 py-2 rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none"
            placeholder="https://example.com"
          />
        </div>
      </div>

      {requireSchedule && conflicts.length > 0 && (
        <div className="bg-red-900/30 border border-red-600 rounded p-3 mb-4">
          <p className="text-red-200 text-sm font-semibold mb-1">Time Conflict Detected!</p>
          <p className="text-red-200 text-sm">This time overlaps with: {conflicts.join(', ')}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

BandForm.propTypes = {
  events: PropTypes.arrayOf(PropTypes.object).isRequired,
  venues: PropTypes.arrayOf(PropTypes.object).isRequired,
  formData: PropTypes.shape({
    name: PropTypes.string.isRequired,
    event_id: PropTypes.string.isRequired,
    venue_id: PropTypes.string.isRequired,
    start_time: PropTypes.string.isRequired,
    end_time: PropTypes.string.isRequired,
    duration: PropTypes.string.isRequired,
    url: PropTypes.string.isRequired,
  }).isRequired,
  submitting: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']).isRequired,
  showEventIntro: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  conflicts: PropTypes.arrayOf(PropTypes.string),
}

BandForm.defaultProps = {
  showEventIntro: false,
  conflicts: [],
}
