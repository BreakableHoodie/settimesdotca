import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DataGapFilter from '../DataGapFilter'
import { EMPTY_GAP_FILTER, NO_LINKS_KEY } from '../../utils/bandFields'

const COUNTS = {
  website: 179,
  instagram: 94,
  bandcamp: 79,
  facebook: 140,
  youtube: 187,
  spotify: 154,
  apple_music: 173,
  linktree: 198,
  photo_url: 196,
  genre: 98,
  origin: 68,
  description: 160,
  [NO_LINKS_KEY]: 49,
}

const setup = (value = EMPTY_GAP_FILTER) => {
  const onChange = vi.fn()
  render(<DataGapFilter value={value} counts={COUNTS} onChange={onChange} />)
  return { onChange }
}

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /data gaps/i }))

describe('DataGapFilter', () => {
  it('starts closed and opens on click', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /data gaps/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows a missing-count beside every field', () => {
    setup()
    openPanel()
    expect(screen.getByLabelText('Instagram — 94 missing')).toBeInTheDocument()
    expect(screen.getByLabelText('Photo — 196 missing')).toBeInTheDocument()
  })

  it('rephrases the aria-label in "has" mode so it describes what the checkbox selects, not a raw missing-count', () => {
    // The visible count is always a missing-count by design (unchanged here).
    // But in "has" mode the checkbox selects artists that HAVE the field, so
    // the plain "Instagram — 94 missing" label from "missing" mode would
    // read backwards to a screen reader user.
    setup({ mode: 'has', keys: [], noLinks: false })
    openPanel()
    expect(screen.getByLabelText('Instagram — filter to artists with Instagram (94 missing)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Instagram — 94 missing')).toBeNull()
  })

  it('emits the checked key on toggle', () => {
    const { onChange } = setup()
    openPanel()
    fireEvent.click(screen.getByLabelText('Instagram — 94 missing'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: ['instagram'], noLinks: false })
  })

  it('removes an already-checked key on second toggle', () => {
    const { onChange } = setup({ mode: 'missing', keys: ['instagram'], noLinks: false })
    openPanel()
    fireEvent.click(screen.getByLabelText('Instagram — 94 missing'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: [], noLinks: false })
  })

  it('switches mode without losing the checked keys', () => {
    const { onChange } = setup({ mode: 'missing', keys: ['spotify'], noLinks: false })
    openPanel()
    fireEvent.click(screen.getByLabelText('Has'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'has', keys: ['spotify'], noLinks: false })
  })

  it('toggles the no-links preset', () => {
    const { onChange } = setup()
    openPanel()
    fireEvent.click(screen.getByLabelText('No links at all — 49 artists'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: [], noLinks: true })
  })

  it('clear all resets to the empty filter', () => {
    const { onChange } = setup({ mode: 'has', keys: ['spotify'], noLinks: true })
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onChange).toHaveBeenCalledWith(EMPTY_GAP_FILTER)
  })

  it('badges the trigger with the number of active filters', () => {
    setup({ mode: 'missing', keys: ['spotify', 'instagram'], noLinks: true })
    expect(screen.getByRole('button', { name: /data gaps/i })).toHaveTextContent('3')
  })

  it('closes on Escape and returns focus to the trigger', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /data gaps/i })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('closes on an outside click', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /data gaps/i })
    fireEvent.click(trigger)
    fireEvent.mouseDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('lists link fields in registry order, not by count', () => {
    setup()
    openPanel()
    const boxes = screen.getAllByRole('checkbox').map(b => b.getAttribute('name'))
    expect(boxes.slice(0, 3)).toEqual(['website', 'instagram', 'bandcamp'])
  })
})
