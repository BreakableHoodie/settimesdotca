import { useTheme, VALID_THEMES } from './ThemeProvider.jsx'

const THEME_LABELS = {
  'midnight-ember': 'Midnight Ember',
  'arctic-night': 'Arctic Night',
  'golden-hour': 'Golden Hour',
  'silver-lining': 'Silver Lining',
}

const SWATCH_CLASSES = {
  'midnight-ember': 'bg-orange-500',
  'arctic-night': 'bg-sky-400',
  'golden-hour': 'bg-amber-300',
  'silver-lining': 'bg-slate-300',
}

export default function ThemeToggle() {
  const { theme, cycleTheme } = useTheme()
  const currentLabel = THEME_LABELS[theme] || 'Theme'

  return (
    <button
      type="button"
      onClick={cycleTheme}
      className="group inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm backdrop-blur-xs transition hover:border-accent-400/60 hover:bg-white/15 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-navy"
      aria-label={`Change colour theme. Current theme: ${currentLabel}`}
      title={`Theme: ${currentLabel}`}
    >
      <span className="flex items-center gap-1" aria-hidden="true">
        {VALID_THEMES.map(name => (
          <span
            key={name}
            className={`h-2.5 w-2.5 rounded-full ${SWATCH_CLASSES[name]} ${
              name === theme
                ? 'ring-2 ring-white ring-offset-1 ring-offset-bg-navy'
                : 'opacity-55 group-hover:opacity-80'
            }`}
          />
        ))}
      </span>
      <span className="hidden sm:inline">{currentLabel}</span>
      <span className="sm:hidden">Theme</span>
    </button>
  )
}
