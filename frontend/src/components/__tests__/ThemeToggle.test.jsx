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

describe('ThemeToggle', () => {
  it('cycles the theme and persists the selected value', () => {
    renderThemeToggle()

    const button = screen.getByRole('button', {
      name: /current theme: midnight ember/i,
    })

    fireEvent.click(button)

    expect(document.documentElement.dataset.theme).toBe('arctic-night')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('arctic-night')
    expect(
      screen.getByRole('button', {
        name: /current theme: arctic night/i,
      })
    ).toBeInTheDocument()
  })

  it('uses a stored valid theme on first render', () => {
    window.localStorage.setItem(THEME_KEY, 'golden-hour')

    renderThemeToggle()

    expect(document.documentElement.dataset.theme).toBe('golden-hour')
    expect(
      screen.getByRole('button', {
        name: /current theme: golden hour/i,
      })
    ).toBeInTheDocument()
  })
})
