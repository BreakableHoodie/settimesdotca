function BulkActionBar({
  count,
  action,
  params,
  venues,
  onActionChange,
  onParamsChange,
  onSubmit,
  onCancelAction,
  onCancelAll,
  isGlobalView,
  isLoading,
}) {
  const isActionReady = () => {
    if (action === 'move_venue') return Number.isFinite(params.venue_id)
    if (action === 'change_time') return Boolean(params.start_time)
    return false
  }

  return (
    <div className="sticky top-0 z-10 bg-linear-to-r from-blue-900 to-purple-900 p-3 mb-4 rounded-lg shadow-lg">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Selection count */}
        <div className="text-white font-semibold min-w-[120px]">
          {count} performance{count !== 1 ? 's' : ''} selected
        </div>

        {/* Action selector (Step 1) */}
        {!action && (
          <div className="flex gap-2 w-full md:w-auto">
            {!isGlobalView && (
              <select
                aria-label="Bulk action for the selected performances"
                className="bg-bg-navy text-white px-4 py-2 min-h-[44px] rounded-lg flex-1 md:w-auto"
                onChange={e => onActionChange(e.target.value)}
                value=""
              >
                <option value="">More actions...</option>
                <option value="move_venue">Move to venue</option>
                <option value="change_time">Change start time</option>
              </select>
            )}

            <button
              onClick={() => onActionChange('delete')}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 min-h-[44px] rounded-lg font-medium transition-colors"
            >
              Delete Selected
            </button>
          </div>
        )}

        {/* Action-specific forms (Step 2) */}
        {action === 'move_venue' && (
          <select
            aria-label="Venue to move the selected performances to"
            className="bg-bg-navy text-white px-4 py-2 min-h-[44px] rounded-lg w-full md:w-auto"
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
            aria-label="New start time for the selected performances"
            className="bg-bg-navy text-white px-4 py-2 min-h-[44px] rounded-lg w-full md:w-auto"
            value={params.start_time || ''}
            onChange={e => onParamsChange({ start_time: e.target.value })}
          />
        )}

        {action === 'delete' && (
          <div className="flex items-center gap-2 text-orange-300 bg-orange-900/20 px-3 py-2 rounded">
            <span>
              Warning: Permanently delete {count} performance{count !== 1 ? 's' : ''}?
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 md:ml-auto">
          {action ? (
            <>
              <button
                onClick={onCancelAction}
                className="btn-secondary flex-1 md:flex-none min-h-[44px]"
                disabled={isLoading}
              >
                Back
              </button>
              <button
                onClick={onSubmit}
                className={`flex-1 md:flex-none px-4 py-2 min-h-[44px] rounded-lg font-medium transition-colors ${
                  action === 'delete'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-accent-500 hover:bg-accent-600 text-bg-navy'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={(action !== 'delete' && !isActionReady()) || isLoading}
              >
                {isLoading ? 'Loading...' : action === 'delete' ? 'Confirm Delete' : 'Preview Changes'}
              </button>
            </>
          ) : (
            <button onClick={onCancelAll} className="btn-secondary flex-1 md:flex-none min-h-[44px]">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BulkActionBar
