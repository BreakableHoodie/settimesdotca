function BulkPreviewModal({ previewData, isProcessing, onConfirm, onCancel }) {
  const { changes, conflicts } = previewData
  const hasConflicts = conflicts && conflicts.length > 0

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-navy rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">Preview Changes</h3>
          <p className="text-gray-400 mt-1">Review what will change before applying</p>
        </div>

        {/* Changes list */}
        <div className="p-6">
          <h4 className="text-white font-semibold mb-3">✓ {changes.length} bands will be updated</h4>
          <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
            {changes.map(change => (
              <div key={change.band_id} className="bg-gray-800 p-3 rounded">
                <div className="text-white font-medium">{change.band_name}</div>
                <div className="text-sm text-gray-400">
                  {change.from_venue && change.to_venue && (
                    <span>
                      {change.from_venue} → {change.to_venue}
                    </span>
                  )}
                  {change.from_time && change.to_time && (
                    <span>
                      {change.from_time} → {change.to_time}
                    </span>
                  )}
                  {change.action === 'delete' && <span className="text-red-400">Will be deleted</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Conflicts section */}
          {hasConflicts && (
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 mb-6">
              <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                ⚠️ {conflicts.length} conflict
                {conflicts.length !== 1 ? 's' : ''} detected
              </h4>
              <div className="space-y-2">
                {conflicts.map((conflict, idx) => (
                  <div key={idx} className="text-sm text-red-300">
                    • {conflict.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-700 flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary" disabled={isProcessing}>
            Cancel
          </button>

          {hasConflicts ? (
            <button onClick={() => onConfirm(true)} className="btn-danger" disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Apply Anyway (Override Conflicts)'}
            </button>
          ) : (
            <button onClick={() => onConfirm(false)} className="btn-primary" disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Apply Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default BulkPreviewModal
