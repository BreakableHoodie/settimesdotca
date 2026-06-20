import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ThemeToggle from '../ThemeToggle.jsx'
import { THEME_KEY, ThemeProvider } from '../ThemeProvider.jsx'

function renderThemeToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  )
}

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: /activate to change/i }))
}

describe('ThemeToggle', () => {
  it('applies and persists the selected theme', () => {
    renderThemeToggle()
    openPicker()

    fireEvent.click(screen.getByRole('button', { name: /cool dark theme/i }))

    expect(document.documentElement.dataset.theme).toBe('arctic-night')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('arctic-night')
  })

  it('marks the stored theme as active on first render', () => {
    window.localStorage.setItem(THEME_KEY, 'daybreak')
    renderThemeToggle()

    expect(document.documentElement.dataset.theme).toBe('daybreak')

    openPicker()
    expect(screen.getByRole('button', { name: /warm light theme/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
