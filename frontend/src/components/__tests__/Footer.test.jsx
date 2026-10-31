import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Footer from '../Footer.jsx'

// settimes.ca no longer emails fans, so the footer must not offer a signup.
describe('Footer', () => {
  it.each(['/', '/event/lwbc18', '/artists'])('offers no email signup on %s', path => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Footer />
      </MemoryRouter>
    )
    expect(screen.queryByRole('link', { name: /announcements|subscribe/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Every edition' })).toHaveAttribute('href', '/history')
  })
})
