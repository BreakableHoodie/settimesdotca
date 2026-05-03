import { useState, useRef, useEffect } from 'react'
import { eventsApi, bandsApi } from '../utils/adminApi'

/**
 * HistoricalImportModal - Two-step wizard to back-fill archived events with band lineups
 *
 * Step 1: Event name + date → creates event with status "archived"
 * Step 2: Paste band names (one per line) → sequentially creates band profiles
 *
 * @param {function} onClose - Close the modal
 * @param {function} onImported - Called when import completes successfully (parent refreshes)
 */
export default function HistoricalImportModal({ onClose, onImported }) {
  // --- Step 1 state ---
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [slug, setSlug] = useState('')

  // --- Step 2 state ---
  const [step, setStep] = useState(1)
  const [createdEvent, setCreatedEvent] = useState(null)
  const [bandList, setBandList] = useState('')

  // --- Shared state ---
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState([])
  const [progress, setProgress] = useState(null) // { done, total } or null

  // --- Refs ---
  const bandTextareaRef = useRef(null)

  // Focus the band textarea when advancing to step 2
  useEffect(() => {
    if (step === 2) {
      bandTextareaRef.current?.focus()
    }
  }, [step])

  // Close on Escape (unless submitting)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [submitting, onClose])

  // Auto-generate slug from name — aligned with EventFormModal logic
  const handleNameChange = e => {
    const val = e.target.value
    setName(val)
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    )
  }

  // --- Step 1 submit ---
  const handleStep1Submit = async e => {
    e.preventDefault()
    setErrors([])

    const trimmedName = name.trim()
    const trimmedDate = date.trim()

    if (!trimmedName) {
      setErrors(['Event name is required.'])
      return
    }
    if (!trimmedDate) {
      setErrors(['Event date is required.'])
      return
    }

    setSubmitting(true)
    try {
      const data = await eventsApi.create({
        name: trimmedName,
        date: trimmedDate,
        slug,
        status: 'archived',
        is_published: 0,
      })
      if (!data?.event?.id) {
        throw new Error('Server did not return a valid event. Please try again.')
      }
      setCreatedEvent(data.event)
      setStep(2)
    } catch (err) {
      setErrors([err.message || 'Failed to create event. Please try again.'])
    } finally {
      setSubmitting(false)
    }
  }

  // --- Step 2 submit ---
  async function handleStep2Submit(e) {
    e.preventDefault()

    const names = bandList
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)

    if (names.length === 0) return
    if (names.length > 200) {
      setErrors([`Too many bands (${names.length}). Maximum is 200 per import. Split into multiple imports.`])
      return
    }

    setSubmitting(true)
    setErrors([])
    setProgress({ done: 0, total: names.length })

    const failed = []

    try {
      for (let i = 0; i < names.length; i++) {
        try {
          await bandsApi.create({ eventId: createdEvent.id, name: names[i] })
        } catch (err) {
          failed.push(`${names[i]}: ${err.message || 'unknown error'}`)
        }
        setProgress({ done: i + 1, total: names.length })
      }

      if (failed.length > 0) {
        setErrors(failed)
      } else {
        onImported?.()
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="historical-import-title"
    >
      <div className="bg-bg-purple rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto border border-accent-500/30">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 id="historical-import-title" className="text-2xl font-bold text-accent-400">
                Import Historical Event
              </h2>
              <p className="text-white/50 text-sm mt-0.5">Step {step} of 2</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-white/50 hover:text-white text-2xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-purple rounded"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="mb-4 bg-red-900/30 text-red-300 rounded-lg p-3 text-sm" role="alert">
              {errors.length === 1 ? (
                errors[0]
              ) : (
                <>
                  <p>Import completed with {errors.length} failure{errors.length === 1 ? '' : 's'}. The following bands could not be added:</p>
                  <ul className="mt-2 list-disc list-inside space-y-0.5">
                    {errors.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="mb-4 text-white/70 text-sm" aria-live="polite">
              Importing… {progress.done} / {progress.total}
            </div>
          )}

          {/* Step 1: Event info */}
          {step === 1 && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div>
                <label htmlFor="him-name" className="block text-white mb-2 text-sm font-medium">
                  Event Name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="him-name"
                  type="text"
                  value={name}
                  onChange={handleNameChange}
                  required
                  disabled={submitting}
                  placeholder="e.g. Summerblast 2019"
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
                />
              </div>

              <div>
                <label htmlFor="him-date" className="block text-white mb-2 text-sm font-medium">
                  Event Date <span aria-hidden="true">*</span>
                </label>
                <input
                  id="him-date"
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full min-h-[44px] px-4 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50"
                />
              </div>

              {slug && (
                <p className="text-xs text-white/40">
                  Slug: <span className="font-mono">{slug}</span>
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-white/70 hover:text-white transition-colors disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-purple"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-purple"
                >
                  {submitting ? 'Creating…' : 'Next: Add Bands'}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Band list */}
          {step === 2 && (
            <form onSubmit={handleStep2Submit} className="space-y-4">
              <p className="text-white/70 text-sm">
                Event created: <span className="text-white font-medium">{createdEvent?.name}</span>
              </p>

              <div>
                <label htmlFor="him-bands" className="block text-white mb-2 text-sm font-medium">
                  Band Names
                </label>
                <textarea
                  id="him-bands"
                  ref={bandTextareaRef}
                  value={bandList}
                  onChange={e => setBandList(e.target.value)}
                  disabled={submitting}
                  rows={10}
                  placeholder={"The Strokes\nArctic Monkeys\nPhoenix"}
                  className="w-full px-4 py-2 rounded bg-bg-navy text-white border border-gray-600 focus:border-accent-500 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-50 font-mono text-sm resize-y"
                />
                <p className="text-xs text-white/50 mt-1">
                  Existing band profiles will be matched by name. New profiles will be created automatically.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg text-white/70 hover:text-white transition-colors disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-purple"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white rounded-lg transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-purple"
                >
                  {submitting ? `Importing… ${progress?.done ?? 0} / ${progress?.total ?? 0}` : 'Import Bands'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
