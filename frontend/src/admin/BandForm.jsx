import PropTypes from 'prop-types'
import PhotoUpload from './components/PhotoUpload'
import RichTextEditor from './components/RichTextEditor'
import { Input, Button, Tooltip } from '../components/ui'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons'
import { FIELD_LIMITS } from '../utils/validation'

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
  selectedProfile = null, // If provided, we are scheduling this specific existing artist
}) {
  // In global view, we're editing band profile, not event-specific performance details
  const requireSchedule = globalView ? false : Boolean(formData.event_id)
  
  const isSchedulingExisting = !globalView && selectedProfile != null
  
  const submitLabel = submitting
    ? 'Saving...'
    : mode === 'edit'
      ? globalView
        ? 'Update Artist'
        : 'Update Performance'
      : globalView
        ? 'Add Artist'
        : isSchedulingExisting 
          ? 'Add to Lineup' 
          : 'Create & Add Artist'

  return (
    <form onSubmit={onSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        
        {/* If scheduling existing artist, show summary instead of name input */}
        {isSchedulingExisting ? (
           <div className="sm:col-span-2 bg-white/5 border border-white/10 rounded-lg p-4 flex items-center gap-4 mb-2">
              {selectedProfile.photo_url ? (
                 <img src={selectedProfile.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
              ) : (
                 <div className="w-16 h-16 rounded-full bg-band-orange/20 flex items-center justify-center text-band-orange text-xl font-bold">
                    {selectedProfile.name.charAt(0)}
                 </div>
              )}
              <div>
                 <h3 className="text-xl font-bold text-white">{selectedProfile.name}</h3>
                 <div className="text-white/60 text-sm">
                    {[selectedProfile.origin, selectedProfile.genre].filter(Boolean).join(' • ')}
                 </div>
                 <div className="text-band-orange text-xs mt-1">Adding to lineup</div>
              </div>
           </div>
        ) : (
           <div className="sm:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="band-name" className="block text-text-primary text-sm font-medium">
                  Artist Name *
                </label>

            <Tooltip content="Full name of the band or artist as it should appear publicly">
              <FontAwesomeIcon icon={faCircleInfo} className="text-text-tertiary text-sm cursor-help" />
            </Tooltip>
          </div>
          <Input
            id="band-name"
            type="text"
            name="name"
            value={formData.name}
            onChange={onChange}
            required
            minLength={FIELD_LIMITS.bandName.min}
            maxLength={FIELD_LIMITS.bandName.max}
            placeholder="The Replacements"
            fullWidth
          />
          <span className="text-xs text-white/50 mt-1 block">
            {formData.name.length}/{FIELD_LIMITS.bandName.max}
          </span>
        </div>
        )}

        {(globalView || !isSchedulingExisting) && (
          <>
            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="band-origin" className="block text-text-primary text-sm font-medium">
                  Origin <span className="text-text-tertiary text-xs">(optional)</span>
                </label>
                <Tooltip content="Where the band/artist is from (city, region, country)">
                  <FontAwesomeIcon icon={faCircleInfo} className="text-text-tertiary text-sm cursor-help" />
                </Tooltip>
              </div>
              <Input
                id="band-origin"
                type="text"
                name="origin"
                value={formData.origin || ''}
                onChange={onChange}
                maxLength={FIELD_LIMITS.bandOrigin.max}
                placeholder="Toronto, ON"
                fullWidth
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="band-genre" className="block text-text-primary text-sm font-medium">
                  Genre <span className="text-text-tertiary text-xs">(optional)</span>
                </label>
                <Tooltip content="Musical genres, comma-separated (e.g., 'punk, indie rock')">
                  <FontAwesomeIcon icon={faCircleInfo} className="text-text-tertiary text-sm cursor-help" />
                </Tooltip>
              </div>
              <Input
                id="band-genre"
                type="text"
                name="genre"
                value={formData.genre || ''}
                onChange={onChange}
                maxLength={FIELD_LIMITS.bandGenre.max}
                placeholder="punk, indie rock, etc."
                fullWidth
              />
            </div>

            <div className="sm:col-span-2">
              <PhotoUpload
                currentPhoto={formData.photo_url}
                onPhotoChange={url => {
                  onChange({ target: { name: 'photo_url', value: url } })
                }}
                bandId={mode === 'edit' && formData.id ? formData.id : null}
                bandName={formData.name}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="band-description" className="block text-white mb-2 text-sm">
                Description <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <RichTextEditor
                value={formData.description || ''}
                onChange={value => {
                  onChange({ target: { name: 'description', value } })
                }}
                placeholder="Band bio, description, press quote..."
                minHeight={200}
              />
              <p className="text-white/60 text-xs mt-2">
                Short bio or description about the band. Supports markdown formatting.
              </p>
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
                className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
                className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
                className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
                className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
                className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
            maxLength={FIELD_LIMITS.bandUrl.max}
            className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
            maxLength={FIELD_LIMITS.socialHandle.max}
            className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
            maxLength={FIELD_LIMITS.bandUrl.max}
            className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
            maxLength={FIELD_LIMITS.bandUrl.max}
            className="w-full min-h-[44px] px-4 py-3 text-base rounded bg-band-navy text-white border border-gray-600 focus:border-band-orange focus:outline-none sm:text-sm"
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
        <Button type="submit" variant="primary" disabled={submitting} loading={submitting} fullWidth>
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} fullWidth>
          Cancel
        </Button>
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
  selectedProfile: PropTypes.object,
}

BandForm.defaultProps = {
  showEventIntro: false,
  conflicts: [],
}
