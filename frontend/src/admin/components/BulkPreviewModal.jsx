import { createPortal } from 'react-dom'
import Modal from '../../components/ui/Modal'

function BulkPreviewModal({ previewData, isProcessing, onConfirm, onCancel }) {
  const { changes, conflicts } = previewData
  const hasConflicts = conflicts && conflicts.length > 0
  const hasExactConflicts = hasConflicts && conflicts.some(c => c.type === 'conflict')

  // The shared Modal already provides role="dialog", aria-modal, a focus trap,
  // focus restoration on close, Escape-to-close and a body scroll lock. This
  // component hand-rolled an overlay with none of it. Still portalled to body so
  // the fixed positioning cannot be broken by an ancestor's stacking context.
  return createPortal(
    <Modal
      isOpen
      onClose={isProcessing ? () => {} : onCancel}
      title="Preview Changes"
      size="md"
      closeOnBackdropClick={!isProcessing}
      showCloseButton={!isProcessing}
      footer={
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary" disabled={isProcessing}>
            Cancel
          </button>

          {hasExactConflicts ? (
            <button onClick={() => onConfirm(true)} className="btn-danger" disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Apply Anyway (Override Conflicts)'}
            </button>
          ) : (
            <button onClick={() => onConfirm(false)} className="btn-primary" disabled={isProcessing}>
              {isProcessing ? 'Processing...' : 'Apply Changes'}
            </button>
          )}
        </div>
      }
    >
      <div>
        <p className="text-gray-400 mb-4">Review what will change before applying</p>
        <div>
          <h4 className="text-white font-semibold mb-3">
            ✓ {changes.length} performance{changes.length !== 1 ? 's' : ''} will be updated
          </h4>
          <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
            {changes.map(change => (
              <div key={change.band_id} className="bg-gray-800 p-3 rounded">
                <div className="text-white font-medium">{change.band_name}</div>
                <div className="text-sm text-gray-400">
                  {change.to_venue && (
                    <span>
                      {change.from_venue ?? 'No venue'} → {change.to_venue}
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
            <div className="space-y-3 mb-6">
              {conflicts.filter(c => c.type === 'conflict').length > 0 && (
                <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                  <h4 className="text-red-400 font-semibold mb-3">⚠️ Exact time conflicts</h4>
                  <div className="space-y-2">
                    {conflicts
                      .filter(c => c.type === 'conflict')
                      .map((conflict, idx) => (
                        <div key={idx} className="text-sm text-red-300">
                          • {conflict.message}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {conflicts.filter(c => c.type === 'overlap').length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4">
                  <h4 className="text-yellow-400 font-semibold mb-3">⚠️ Time overlaps</h4>
                  <div className="space-y-2">
                    {conflicts
                      .filter(c => c.type === 'overlap')
                      .map((conflict, idx) => (
                        <div key={idx} className="text-sm text-yellow-300">
                          • {conflict.message}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              {conflicts.filter(c => c.type !== 'conflict' && c.type !== 'overlap').length > 0 && (
                <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
                  <h4 className="text-red-400 font-semibold mb-3">⚠️ Issues detected</h4>
                  <div className="space-y-2">
                    {conflicts
                      .filter(c => c.type !== 'conflict' && c.type !== 'overlap')
                      .map((conflict, idx) => (
                        <div key={idx} className="text-sm text-red-300">
                          • {conflict.message}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>,
    document.body
  )
}

export default BulkPreviewModal
