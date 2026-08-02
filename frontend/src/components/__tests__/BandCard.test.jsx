import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import BandCard from '../BandCard'

const baseBand = {
  id: 'event-test-perf-1',
  name: 'Band Test',
  venue: 'Stage A',
}

const renderCard = props =>
  render(
    <MemoryRouter>
      <BandCard band={baseBand} onToggle={vi.fn()} {...props} />
    </MemoryRouter>
  )

describe('BandCard — genre chip', () => {
  it('renders the genre chip when band.genre is set', () => {
    renderCard({ band: { ...baseBand, genre: 'Punk' } })

    expect(screen.getByText('Punk')).toBeInTheDocument()
  })

  it('renders no chip when band.genre is absent', () => {
    const { container } = renderCard({ band: { ...baseBand, genre: undefined } })

    // Scoped to `span.rounded-full` — the toggle (add/remove) button is also
    // `rounded-full` but is a `<button>`, so this only matches a genre chip.
    expect(container.querySelector('span.rounded-full')).not.toBeInTheDocument()
  })

  it('renders no chip when band.genre is an empty string', () => {
    const { container } = renderCard({ band: { ...baseBand, genre: '' } })

    expect(container.querySelector('span.rounded-full')).not.toBeInTheDocument()
  })

  // Root-cause regression guard for the WCAG failure fixed in PR #720 (light-on-light
  // text over the amber gradient): the genre chip must switch to the dark-navy-on-navy-tint
  // pairing whenever the card is in its amber state (isSelected or isPlaying), the same way
  // every other child of this card already branches on `onAmber`. Using the normal-card
  // pairing (bg-surface/text-text-secondary) unchanged on the amber gradient would repeat
  // that exact bug.
  it('uses the amber-safe chip classes when isSelected is true', () => {
    renderCard({ band: { ...baseBand, genre: 'Punk' }, isSelected: true })

    const chip = screen.getByText('Punk')
    expect(chip.className).toMatch(/bg-bg-navy\/15/)
    expect(chip.className).toMatch(/text-bg-navy/)
    expect(chip.className).not.toMatch(/bg-surface/)
    expect(chip.className).not.toMatch(/text-text-secondary/)
  })

  it('uses the normal-card chip classes when not selected/playing', () => {
    renderCard({ band: { ...baseBand, genre: 'Punk' }, isSelected: false })

    const chip = screen.getByText('Punk')
    expect(chip.className).toMatch(/bg-surface/)
    expect(chip.className).toMatch(/text-text-secondary/)
    expect(chip.className).not.toMatch(/bg-bg-navy\/15/)
  })
})

describe('BandCard — click/keyboard toggle (pre-existing behaviour)', () => {
  it('is focusable via tabIndex=0 when clickable', () => {
    const { container } = renderCard({ clickable: true })
    expect(container.firstChild).toHaveAttribute('tabindex', '0')
  })

  it('calls onToggle with the band id on click', () => {
    const onToggle = vi.fn()
    const { container } = renderCard({ onToggle, clickable: true })

    fireEvent.click(container.firstChild)

    expect(onToggle).toHaveBeenCalledWith(baseBand.id)
  })

  it('calls onToggle on Enter key press', () => {
    const onToggle = vi.fn()
    const { container } = renderCard({ onToggle, clickable: true })

    fireEvent.keyDown(container.firstChild, { key: 'Enter' })

    expect(onToggle).toHaveBeenCalledWith(baseBand.id)
  })

  it('calls onToggle on Space key press', () => {
    const onToggle = vi.fn()
    const { container } = renderCard({ onToggle, clickable: true })

    fireEvent.keyDown(container.firstChild, { key: ' ' })

    expect(onToggle).toHaveBeenCalledWith(baseBand.id)
  })

  it('ignores other key presses', () => {
    const onToggle = vi.fn()
    const { container } = renderCard({ onToggle, clickable: true })

    fireEvent.keyDown(container.firstChild, { key: 'Tab' })

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('does not respond to click or keyboard when clickable is false', () => {
    const onToggle = vi.fn()
    const { container } = renderCard({ onToggle, clickable: false })

    expect(container.firstChild).not.toHaveAttribute('tabindex')
    fireEvent.click(container.firstChild)
    fireEvent.keyDown(container.firstChild, { key: 'Enter' })

    expect(onToggle).not.toHaveBeenCalled()
  })
})
