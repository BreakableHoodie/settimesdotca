function BulkActionBar({ count, action, params, venues, onActionChange, onParamsChange, onSubmit, onCancel }) {
  const isActionReady = () => {
    if (action === 'move_venue') return params.venue_id != null
    if (action === 'change_time') return params.start_time != null
    if (action === 'delete') return true
    return false
  }

  return (
    <div className="sticky top-0 z-10 bg-gradient-to-r from-blue-900 to-purple-900 p-3 mb-4 rounded-lg shadow-lg">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Selection count */}
        <div className="text-white font-semibold">
          {count} band{count !== 1 ? 's' : ''} selected
        </div>

        {/* Action selector (Step 1) */}
        {!action && (
          <select
            className="bg-band-navy text-white px-4 py-2 rounded-lg w-full md:w-auto"
            onChange={e => onActionChange(e.target.value)}
            value=""
          >
            <option value="">Choose action...</option>
            <option value="move_venue">Move to venue</option>
            <option value="change_time">Change start time</option>
            <option value="delete">Delete bands</option>
          </select>
        )}

        {/* Action-specific forms (Step 2) */}
        {action === 'move_venue' && (
          <select
            className="bg-band-navy text-white px-4 py-2 rounded-lg w-full md:w-auto"
            value={params.venue_id || ''}
            onChange={e => onParamsChange({ venue_id: parseInt(e.target.value) })}
          >
            <option value="">Select venue...</option>
            {venues.map(venue => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        )}

        {action === 'change_time' && (
          <input
            type="time"
            className="bg-band-navy text-white px-4 py-2 rounded-lg w-full md:w-auto"
            value={params.start_time || ''}
            onChange={e => onParamsChange({ start_time: e.target.value })}
          />
        )}

        {action === 'delete' && <span className="text-orange-400">⚠️ This will permanently delete {count} bands</span>}

        {/* Action buttons */}
        <div className="flex gap-2 md:ml-auto">
          <button onClick={onCancel} className="btn-secondary flex-1 md:flex-none">
            Cancel
          </button>
          {action && (
            <button
              onClick={onSubmit}
              className={`flex-1 md:flex-none ${action === 'delete' ? 'btn-danger' : 'btn-primary'}`}
              disabled={!isActionReady()}
            >
              Preview Changes
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BulkActionBar
