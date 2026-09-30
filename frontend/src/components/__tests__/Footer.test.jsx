import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Footer from '../Footer.jsx'

// The in-page subscribe prompts only show before set times are posted or
// between seasons. Once an edition is live, the footer is the one place a fan
// can find the announcements signup.
describe('Footer', () => {
  it.each(['/', '/event/lwbc18', '/artists'])('links to the announcements signup on %s', path => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Footer />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: 'Get show announcements' })).toHaveAttribute('href', '/subscribe')
  })
})
