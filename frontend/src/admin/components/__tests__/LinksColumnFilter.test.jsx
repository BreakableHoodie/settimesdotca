import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import LinksColumnFilter from '../LinksColumnFilter'
import { NO_LINKS_KEY } from '../../utils/bandFields'

const COUNTS = {
  website: 179,
  instagram: 94,
  bandcamp: 79,
  facebook: 140,
  youtube: 187,
  spotify: 154,
  apple_music: 173,
  linktree: 198,
  [NO_LINKS_KEY]: 49,
}

function Harness({ value, counts, onChange, onClear, onClose }) {
  const triggerRef = useRef(null)
  return (
    <div>
      <button ref={triggerRef}>trigger</button>
      <LinksColumnFilter
        value={value}
        counts={counts}
        onChange={onChange}
        onClear={onClear}
        onClose={onClose}
        triggerRef={triggerRef}
      />
    </div>
  )
}

const setup = (value = { mode: 'missing', keys: [], noLinks: false }) => {
  const onChange = vi.fn()
  const onClear = vi.fn()
  const onClose = vi.fn()
  render(<Harness value={value} counts={COUNTS} onChange={onChange} onClear={onClear} onClose={onClose} />)
  return { onChange, onClear, onClose }
}

describe('LinksColumnFilter', () => {
  it('renders a missing-count beside every platform', () => {
    setup()
    expect(screen.getByLabelText('Instagram — 94 missing')).toBeInTheDocument()
    expect(screen.getByLabelText('Spotify — 154 missing')).toBeInTheDocument()
  })

  it('lists platforms in LINK_FIELDS registry order, not by count', () => {
    setup()
    const boxes = screen
      .getAllByRole('checkbox')
      .map(b => b.getAttribute('name'))
      .filter(Boolean)
    expect(boxes.slice(0, 3)).toEqual(['website', 'instagram', 'bandcamp'])
  })

  it('toggling a platform checkbox emits the checked key, preserving mode/noLinks', () => {
    const { onChange } = setup({ mode: 'missing', keys: [], noLinks: true })
    fireEvent.click(screen.getByLabelText('Instagram — 94 missing'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: ['instagram'], noLinks: true })
  })

  it('removes an already-checked key on second toggle', () => {
    const { onChange } = setup({ mode: 'missing', keys: ['instagram'], noLinks: false })
    fireEvent.click(screen.getByLabelText('Instagram — 94 missing'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: [], noLinks: false })
  })

  it('switching mode preserves already-checked keys', () => {
    const { onChange } = setup({ mode: 'missing', keys: ['spotify'], noLinks: false })
    fireEvent.click(screen.getByLabelText('Has'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'has', keys: ['spotify'], noLinks: false })
  })

  it('rephrases the aria-label in has-mode instead of misreporting the missing count', () => {
    setup({ mode: 'has', keys: [], noLinks: false })
    expect(screen.getByLabelText('Instagram — filter to artists with Instagram (94 missing)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Instagram — 94 missing')).toBeNull()
  })

  it('toggling the no-links-at-all preset emits noLinks', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText('No links at all — 49 artists'))
    expect(onChange).toHaveBeenCalledWith({ mode: 'missing', keys: [], noLinks: true })
  })

  it('Clear filter calls onClear', () => {
    const { onClear } = setup({ mode: 'has', keys: ['spotify'], noLinks: true })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and returns focus to the trigger', () => {
    const { onClose } = setup()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'trigger' })).toHaveFocus()
  })

  it('closes on an outside mousedown', () => {
    const { onClose } = setup()
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the mousedown lands on the external trigger button', () => {
    const { onClose } = setup()
    fireEvent.mouseDown(screen.getByRole('button', { name: 'trigger' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
