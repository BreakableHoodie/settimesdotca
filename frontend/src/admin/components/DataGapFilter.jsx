import { useEffect, useId, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { ChevronDown } from 'lucide-react'
import { EMPTY_GAP_FILTER, LINK_FIELDS, NO_LINKS_KEY, PROFILE_FIELDS } from '../utils/bandFields'

const CONTROL_CLASS =
  'min-h-[44px] px-3 py-2 rounded bg-bg-navy text-white border border-white/10 focus:border-accent-500 focus:outline-hidden'

const ROW_CLASS =
  'flex items-center justify-between gap-3 px-3 py-2 min-h-[44px] cursor-pointer hover:bg-white/5 rounded'

// The visible count is ALWAYS a missing-count, by design (it's measured
// against the search/status-filtered roster regardless of mode -- see the
// gapCounts comment in RosterTab.jsx). In `has` mode, checking the box
// selects artists that HAVE the field, which the plain
// "${label} — ${count} missing" label would misreport to a screen reader as
// selecting the artists lacking it. The `has`-mode phrasing spells out what
// the checkbox actually does and keeps the (still-missing) count as
// parenthetical context rather than pretending it's a "has" count.
function GapCheckbox({ field, counts, checked, onToggle, mode }) {
  const count = counts[field.key] ?? 0
  const ariaLabel =
    mode === 'has'
      ? `${field.label} — filter to artists with ${field.label} (${count} missing)`
      : `${field.label} — ${count} missing`
  return (
    <label className={ROW_CLASS}>
      <span className="flex items-center gap-3">
        <input
          type="checkbox"
          name={field.key}
          className="h-5 w-5 cursor-pointer"
          checked={checked}
          onChange={() => onToggle(field.key)}
          aria-label={ariaLabel}
        />
        <span className="text-white text-sm">{field.label}</span>
      </span>
      <span className="text-xs text-white/50 tabular-nums">{count}</span>
    </label>
  )
}

GapCheckbox.propTypes = {
  field: PropTypes.shape({ key: PropTypes.string, label: PropTypes.string }).isRequired,
  counts: PropTypes.object.isRequired,
  checked: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(['missing', 'has']).isRequired,
}

export default function DataGapFilter({ value, counts, onChange }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const panelId = useId()

  const activeCount = value.keys.length + (value.noLinks ? 1 : 0)

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = event => {
      if (!containerRef.current?.contains(event.target)) setOpen(false)
    }
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const toggleKey = key => {
    const keys = value.keys.includes(key) ? value.keys.filter(k => k !== key) : [...value.keys, key]
    onChange({ ...value, keys })
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`${CONTROL_CLASS} flex items-center gap-2`}
      >
        <span>Data gaps</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-accent-500 text-bg-navy text-xs font-semibold h-5 min-w-5 px-1">
            {activeCount}
          </span>
        )}
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-accent-500/30 bg-bg-purple p-2 shadow-xl max-h-[70vh] overflow-y-auto"
        >
          <fieldset className="flex gap-4 px-3 py-2">
            <legend className="sr-only">Match artists that are</legend>
            {['missing', 'has'].map(mode => (
              <label key={mode} className="flex items-center gap-2 text-sm text-white cursor-pointer">
                <input
                  type="radio"
                  name="gap-mode"
                  className="h-4 w-4 cursor-pointer"
                  checked={value.mode === mode}
                  onChange={() => onChange({ ...value, mode })}
                  aria-label={mode === 'missing' ? 'Missing' : 'Has'}
                />
                <span>{mode === 'missing' ? 'Missing' : 'Has'}</span>
              </label>
            ))}
          </fieldset>

          <p className="px-3 pb-2 text-xs text-white/50">
            Matches artists {value.mode === 'missing' ? 'missing' : 'with'} <strong>any</strong> of the checked fields.
          </p>

          <p className="px-3 pb-2 text-xs text-white/50">Counts show how many artists are missing each field.</p>

          <div className="border-t border-white/10 pt-1">
            {LINK_FIELDS.map(field => (
              <GapCheckbox
                key={field.key}
                field={field}
                counts={counts}
                checked={value.keys.includes(field.key)}
                onToggle={toggleKey}
                mode={value.mode}
              />
            ))}
          </div>

          <div className="border-t border-white/10 pt-1">
            {PROFILE_FIELDS.map(field => (
              <GapCheckbox
                key={field.key}
                field={field}
                counts={counts}
                checked={value.keys.includes(field.key)}
                onToggle={toggleKey}
                mode={value.mode}
              />
            ))}
          </div>

          <div className="border-t border-white/10 pt-1">
            <label className={ROW_CLASS}>
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name={NO_LINKS_KEY}
                  className="h-5 w-5 cursor-pointer"
                  checked={value.noLinks}
                  onChange={() => onChange({ ...value, noLinks: !value.noLinks })}
                  aria-label={`No links at all — ${counts[NO_LINKS_KEY] ?? 0} artists`}
                />
                <span className="text-white text-sm">No links at all</span>
              </span>
              <span className="text-xs text-white/50 tabular-nums">{counts[NO_LINKS_KEY] ?? 0}</span>
            </label>
            <button
              type="button"
              onClick={() => onChange(EMPTY_GAP_FILTER)}
              className="w-full text-left px-3 py-2 min-h-[44px] text-sm text-accent-400 hover:bg-white/5 rounded"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

DataGapFilter.propTypes = {
  value: PropTypes.shape({
    mode: PropTypes.oneOf(['missing', 'has']).isRequired,
    keys: PropTypes.arrayOf(PropTypes.string).isRequired,
    noLinks: PropTypes.bool.isRequired,
  }).isRequired,
  counts: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
}
