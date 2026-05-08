import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Combobox — free-text input with filtered suggestion dropdown.
 * Replaces native <datalist> for reliable cross-browser behaviour (Safari < 16 has broken datalist).
 *
 * Props mirror a plain <input> where possible so callers can swap in place.
 */
export default function Combobox({
  id,
  name,
  value = '',
  onChange,
  options = [],
  placeholder = '',
  maxLength,
  className = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const blurTimerRef = useRef(null)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    return () => clearTimeout(blurTimerRef.current)
  }, [])

  const filtered = options.filter(opt => !value || opt.toLowerCase().includes(value.toLowerCase())).slice(0, 12)

  const shouldShow = open && focused && filtered.length > 0

  // Close on outside click
  useEffect(() => {
    if (!shouldShow) return
    function handleDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleDown)
    return () => document.removeEventListener('mousedown', handleDown)
  }, [shouldShow])

  const pick = useCallback(
    opt => {
      onChange({ target: { name, value: opt } })
      setOpen(false)
      inputRef.current?.focus()
    },
    [name, onChange]
  )

  const handleKeyDown = e => {
    if (!shouldShow) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        setOpen(true)
        setActiveIndex(0)
        e.preventDefault()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
        e.preventDefault()
        break
      case 'ArrowUp':
        setActiveIndex(i => Math.max(i - 1, 0))
        e.preventDefault()
        break
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          pick(filtered[activeIndex])
          e.preventDefault()
        }
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  const baseClass = `w-full px-4 py-2.5 min-h-[44px] bg-white/5 border rounded-lg text-text-primary placeholder-text-tertiary transition-colors duration-base focus:outline-hidden focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-navy border-white/10 focus:border-primary-500 focus:ring-primary-500/50 disabled:opacity-50 disabled:cursor-not-allowed ${className}`

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={e => {
          onChange(e)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => {
          clearTimeout(blurTimerRef.current)
          setFocused(true)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onBlur={() => {
          setFocused(false)
          blurTimerRef.current = setTimeout(() => setOpen(false), 150)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={shouldShow}
        aria-haspopup="listbox"
        aria-controls={shouldShow ? `${id}-listbox` : undefined}
        aria-activedescendant={activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
        className={baseClass}
      />
      {shouldShow && (
        <ul
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-bg-navy shadow-lg max-h-52 overflow-y-auto"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={() => pick(opt)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`px-4 py-2 text-sm cursor-pointer select-none ${
                i === activeIndex ? 'bg-accent-500/20 text-accent-300' : 'text-text-primary hover:bg-white/5'
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
