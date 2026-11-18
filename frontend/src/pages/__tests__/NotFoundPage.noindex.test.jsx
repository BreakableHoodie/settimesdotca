import { render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import NotFoundPage from '../NotFoundPage.jsx'
import { ThemeProvider } from '../../components/ThemeProvider.jsx'

// #1446: the not-found state must override main.jsx's single robots tag, not add a second one.
describe('NotFoundPage robots meta (#1446)', () => {
  it('sets noindex on the existing robots tag and restores it on unmount', () => {
    document.head.innerHTML = '<meta name="robots" content="index,follow">'
    const { unmount } = render(
      <ThemeProvider>
        <HelmetProvider>
          <MemoryRouter>
            <NotFoundPage />
          </MemoryRouter>
        </HelmetProvider>
      </ThemeProvider>
    )
    const tags = document.head.querySelectorAll("meta[name='robots']")
    expect(tags).toHaveLength(1)
    expect(tags[0].getAttribute('content')).toBe('noindex')
    unmount()
    expect(document.head.querySelector("meta[name='robots']").getAttribute('content')).toBe('index,follow')
  })
})
