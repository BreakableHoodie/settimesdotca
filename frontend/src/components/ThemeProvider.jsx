import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export const THEME_KEY = 'settimes-theme'
export const VALID_THEMES = ['midnight-ember', 'arctic-night', 'golden-hour', 'silver-lining']
export const DEFAULT_THEME = 'midnight-ember'

const ThemeContext = createContext(null)

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (VALID_THEMES.includes(stored)) return stored
  } catch {
    // localStorage unavailable (SSR, private browsing restrictions)
  }
  return DEFAULT_THEME
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getStoredTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback(newTheme => {
    if (!VALID_THEMES.includes(newTheme)) return
    setThemeState(newTheme)
    try {
      localStorage.setItem(THEME_KEY, newTheme)
    } catch {
      // localStorage unavailable (SSR, private browsing restrictions)
    }
    applyTheme(newTheme)
  }, [])

  const cycleTheme = useCallback(() => {
    const idx = VALID_THEMES.indexOf(theme)
    const next = VALID_THEMES[(idx + 1) % VALID_THEMES.length]
    setTheme(next)
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, themes: VALID_THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

export function getThemeInitScript() {
  return `(function(){var t;try{t=localStorage.getItem('${THEME_KEY}')}catch{}if(!t||!['midnight-ember','arctic-night','golden-hour','silver-lining'].includes(t))t='${DEFAULT_THEME}';document.documentElement.dataset.theme=t})()`
}
