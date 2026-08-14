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

// #726 regression tests. The card container must never be a focusable
// interactive target: it wraps a real <button> (corner add/remove) and an <a>
// (profile link), so it cannot itself be a <button> (nested interactive
// content is invalid), and a role="button" would announce as a control while
// containing focusable children. The toggle is the distinct native <button>,
// and the container is a labelled <div role="group"> — never a click target.
// These assert the accessible NAME (what screen readers actually announce),
// not just a role's presence.
describe('BandCard — corner button is the toggle, container is a labelled group (#726)', () => {
  it('renders the toggle as a button with an accessible name', () => {
    renderCard({})

    expect(screen.getByRole('button', { name: 'Add Band Test to my route' })).toBeInTheDocument()
  })

  it('calls onToggle with the band id via the corner button', () => {
    const onToggle = vi.fn()
    renderCard({ onToggle })

    fireEvent.click(screen.getByRole('button', { name: 'Add Band Test to my route' }))

    expect(onToggle).toHaveBeenCalledWith(baseBand.id)
  })

  it('flips the button accessible name when selected', () => {
    renderCard({ isSelected: true })

    expect(screen.getByRole('button', { name: 'Remove Band Test from my route' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Band Test to my route' })).toBeNull()
  })

  it('hides the toggle button when showToggleButton is false', () => {
    renderCard({ showToggleButton: false })

    expect(screen.queryByRole('button', { name: /to my route/i })).toBeNull()
  })

  it('labels the container as a group with an accessible name', () => {
    const { container } = renderCard({})

    expect(container.firstChild).toHaveAttribute('role', 'group')
    expect(container.firstChild).toHaveAttribute('aria-label', 'Band Test at Stage A')
  })

  it('does not make the container focusable', () => {
    const { container } = renderCard({})

    expect(container.firstChild).not.toHaveAttribute('tabindex')
  })

  it('does not toggle when the container itself is clicked', () => {
    const onToggle = vi.fn()
    const { container } = renderCard({ onToggle })

    fireEvent.click(container.firstChild)

    expect(onToggle).not.toHaveBeenCalled()
  })
})
