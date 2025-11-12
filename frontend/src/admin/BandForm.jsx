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
  globalView = false,
}) {
  // In global view, we're editing band profile, not event-specific performance details
  const requireSchedule = globalView ? false : Boolean(formData.event_id)
  const submitLabel = submitting
    ? 'Saving...'
    : mode === 'edit'
      ? globalView
        ? 'Update Band'
        : 'Update Performance'
      : globalView
        ? 'Add Band'
        : 'Add Performance'

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
            className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
            required
            placeholder="The Replacements"
          />
        </div>

        {globalView && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor="band-origin" className="block text-white mb-2 text-sm">
                Origin <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                id="band-origin"
                type="text"
                name="origin"
                value={formData.origin || ''}
                onChange={onChange}
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
                placeholder="Toronto, ON"
              />
              <p className="text-white/60 text-xs mt-2">Where the band/artist is from (city, region, etc.)</p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="band-genre" className="block text-white mb-2 text-sm">
                Genre <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                id="band-genre"
                type="text"
                name="genre"
                value={formData.genre || ''}
                onChange={onChange}
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
                placeholder="punk, indie rock, etc."
              />
              <p className="text-white/60 text-xs mt-2">Comma-separated list of genres</p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="band-photo-url" className="block text-white mb-2 text-sm">
                Photo URL <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <input
                id="band-photo-url"
                type="url"
                name="photo_url"
                value={formData.photo_url || ''}
                onChange={onChange}
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
                placeholder="https://example.com/band-photo.jpg"
              />
              <p className="text-white/60 text-xs mt-2">URL to the band&apos;s photo/image</p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="band-description" className="block text-white mb-2 text-sm">
                Description <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <textarea
                id="band-description"
                name="description"
                value={formData.description || ''}
                onChange={onChange}
                rows={4}
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
                placeholder="Band bio, description, press quote..."
              />
              <p className="text-white/60 text-xs mt-2">Short bio or description about the band</p>
            </div>
          </>
        )}

        {!globalView && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor="band-event" className="block text-white mb-2 text-sm">
                Event
              </label>
              <select
                id="band-event"
                name="event_id"
                value={formData.event_id}
                onChange={onChange}
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
                  You can create bands and venues independently from events. Assign them now or keep them available to
                  attach later.
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
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
              >
                <option value="">No venue assigned yet</option>
                {venues.map(venue => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

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
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
                className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
                required={requireSchedule}
              />
            </div>
          </>
        )}

        <div className="sm:col-span-2">
          <label htmlFor="band-website" className="block text-white mb-2 text-sm">
            Website <span className="text-gray-400 text-xs ml-2">(optional)</span>
          </label>
          <input
            id="band-website"
            type="url"
            name="website"
            value={formData.website || ''}
            onChange={onChange}
            className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
            placeholder="https://example.com"
          />
        </div>

        <div>
          <label htmlFor="band-instagram" className="block text-white mb-2 text-sm">
            Instagram <span className="text-gray-400 text-xs ml-2">(optional)</span>
          </label>
          <input
            id="band-instagram"
            type="text"
            name="instagram"
            value={formData.instagram || ''}
            onChange={onChange}
            className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
            placeholder="@bandhandle"
          />
        </div>

        <div>
          <label htmlFor="band-bandcamp" className="block text-white mb-2 text-sm">
            Bandcamp <span className="text-gray-400 text-xs ml-2">(optional)</span>
          </label>
          <input
            id="band-bandcamp"
            type="url"
            name="bandcamp"
            value={formData.bandcamp || ''}
            onChange={onChange}
            className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
            placeholder="https://bandcamp.com/bandname"
          />
        </div>

        <div>
          <label htmlFor="band-facebook" className="block text-white mb-2 text-sm">
            Facebook <span className="text-gray-400 text-xs ml-2">(optional)</span>
          </label>
          <input
            id="band-facebook"
            type="url"
            name="facebook"
            value={formData.facebook || ''}
            onChange={onChange}
            className="w-full px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
            placeholder="https://facebook.com/bandname"
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
          className="px-6 py-3 bg-band-orange text-white rounded hover:bg-orange-600 disabled:opacity-50 transition-colors min-h-[48px] flex-1 font-medium flex items-center justify-center"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors min-h-[44px] flex-1 font-medium flex items-center justify-center"
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
    event_id: PropTypes.string,
    venue_id: PropTypes.string,
    start_time: PropTypes.string,
    end_time: PropTypes.string,
    duration: PropTypes.string,
    url: PropTypes.string,
    origin: PropTypes.string,
    genre: PropTypes.string,
    photo_url: PropTypes.string,
    description: PropTypes.string,
    website: PropTypes.string,
    instagram: PropTypes.string,
    bandcamp: PropTypes.string,
    facebook: PropTypes.string,
  }).isRequired,
  submitting: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']).isRequired,
  showEventIntro: PropTypes.bool,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  conflicts: PropTypes.arrayOf(PropTypes.string),
  globalView: PropTypes.bool,
}

BandForm.defaultProps = {
  showEventIntro: false,
  conflicts: [],
}
