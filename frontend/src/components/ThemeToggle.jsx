import { useState, useRef, useEffect } from 'react'
import { useTheme, VALID_THEMES } from './ThemeProvider.jsx'

// Functional descriptions for accessibility only — theme names are intentionally
// NOT surfaced in the UI. The swatches are the affordance.
const THEME_LABELS = {
  'midnight-ember': 'warm dark',
  'arctic-night': 'cool dark',
  daybreak: 'warm light',
  'silver-lining': 'cool light',
}

const SWATCH_CLASSES = {
  'midnight-ember': 'bg-orange-500',
  'arctic-night': 'bg-sky-400',
  daybreak: 'bg-amber-300',
  'silver-lining': 'bg-slate-300',
}

// Minimal theme picker: a single current-theme dot that expands to the four
// swatches on tap (a small popover). One small element in the header — especially
// on mobile — and direct pick when opened.
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKeyDown = e => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Colour theme: ${THEME_LABELS[theme] || theme}. Activate to change.`}
        title="Colour theme"
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
      >
        <span aria-hidden="true" className={`h-5 w-5 rounded-full ${SWATCH_CLASSES[theme]} ring-1 ring-white/40`} />
      </button>
      {open && (
        <div
          role="group"
          aria-label="Colour theme"
          className="absolute right-0 top-full z-50 mt-1 flex items-center gap-1 rounded-full border border-white/10 bg-bg-purple/95 px-1.5 py-1 shadow-lg backdrop-blur-xs"
        >
          {VALID_THEMES.map(name => {
            const isActive = name === theme
            const label = `${THEME_LABELS[name] || name} theme`
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setTheme(name)
                  setOpen(false)
                }}
                aria-pressed={isActive}
                aria-label={label}
                title={label}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
              >
                <span
                  aria-hidden="true"
                  className={`h-5 w-5 rounded-full ${SWATCH_CLASSES[name]} ${
                    isActive ? 'ring-2 ring-white ring-offset-1 ring-offset-bg-purple' : 'opacity-60'
                  }`}
                />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
