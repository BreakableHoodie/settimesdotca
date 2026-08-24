import { useState } from 'react'
import { bandsApi } from '../../utils/adminApi'
import { parseBandRows } from '../utils/parseBandRows'

// Paste-to-import UI for a lineup. One band per line:
// name, start_time, end_time, venue, genre. Posts to the bulk-import endpoint,
// which validates all rows atomically and returns per-row errors on failure.
export default function BulkBandImport({ eventId, onImported }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState('')
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)

  const handleImport = async () => {
    setResult('')
    setErrors([])
    const bands = parseBandRows(text)
    if (bands.length === 0) {
      setErrors(['Add at least one band — one per line: name, start, end, venue, genre'])
      return
    }
    setBusy(true)
    try {
      const res = await bandsApi.bulkImport(eventId, bands)
      const n = res.imported ?? 0
      setResult(`Imported ${n} band${n === 1 ? '' : 's'}.`)
      setText('')
      if (onImported) onImported()
    } catch (err) {
      const rowErrors = err?.details?.errors
      setErrors(Array.isArray(rowErrors) && rowErrors.length ? rowErrors : [err?.message || 'Import failed'])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-bg-purple rounded-lg p-4 space-y-3">
      <h4 className="text-white font-semibold">Bulk import bands</h4>
      <p className="text-gray-400 text-sm">
        One band per line: <code>name, start, end, venue, genre</code>. Example:{' '}
        <code>The Reverbs, 20:00, 21:00, Main Hall, rock</code>. Venues must already exist.
      </p>
      <textarea
        aria-label="Bands to import"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={6}
        className="w-full rounded bg-black/30 text-white p-2 text-sm font-mono"
        placeholder="The Reverbs, 20:00, 21:00, Main Hall, rock"
      />
      <button
        type="button"
        onClick={handleImport}
        disabled={busy}
        className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-white disabled:opacity-50"
      >
        {busy ? 'Importing…' : 'Import bands'}
      </button>
      {result && <p className="text-green-400 text-sm">{result}</p>}
      {errors.length > 0 && (
        <ul className="text-red-400 text-sm list-disc pl-5 space-y-1">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
