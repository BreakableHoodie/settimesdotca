import { useRef } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ColumnFilter from '../ColumnFilter'
import { BLANK } from '../../utils/rosterColumns'

const GENRE_COLUMN = { key: 'genre', label: 'Genre' }
const FOLLOWER_COLUMN = { key: 'follower_count', label: 'Followers' }

// The panel is normally rendered as a sibling of its trigger button (owned by
// a separate FilterFunnel instance), not nested inside it -- so the outside
// mousedown check must exclude the trigger via a ref passed in from outside,
// not via a shared internal wrapper. This harness reproduces that shape.
function Harness({ column, counts, value, onChange, onClear, onClose }) {
  const triggerRef = useRef(null)
  return (
    <div>
      <button ref={triggerRef}>trigger</button>
      <ColumnFilter
        column={column}
        counts={counts}
        value={value}
        onChange={onChange}
        onClear={onClear}
        onClose={onClose}
        triggerRef={triggerRef}
      />
    </div>
  )
}

const setup = (overrides = {}) => {
  const onChange = vi.fn()
  const onClear = vi.fn()
  const onClose = vi.fn()
  const props = {
    column: GENRE_COLUMN,
    counts: new Map([
      ['punk', 12],
      ['indie rock', 8],
      [BLANK, 3],
    ]),
    value: [],
    onChange,
    onClear,
    onClose,
    ...overrides,
  }
  render(<Harness {...props} />)
  return { onChange, onClear, onClose }
}

describe('ColumnFilter', () => {
  it('renders each value with its count', () => {
    setup()
    expect(screen.getByLabelText('punk — 12')).toBeInTheDocument()
    expect(screen.getByLabelText('indie rock — 8')).toBeInTheDocument()
    expect(screen.getByLabelText('(Blanks) — 3')).toBeInTheDocument()
  })

  it('always sorts (Blanks) last', () => {
    setup()
    const rows = screen.getAllByRole('checkbox').map(c => c.getAttribute('aria-label'))
    // rows[0] is "(Select all)"; the final value row must be the blank sentinel.
    expect(rows[rows.length - 1]).toBe('(Blanks) — 3')
  })

  it('sorts the remaining values with localeCompare', () => {
    setup()
    const rows = screen.getAllByRole('checkbox').map(c => c.getAttribute('aria-label'))
    // 'indie rock' < 'punk' alphabetically.
    expect(rows.slice(1)).toEqual(['indie rock — 8', 'punk — 12', '(Blanks) — 3'])
  })

  it('narrows rows via the search box', () => {
    setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'indie' } })
    expect(screen.getByLabelText('indie rock — 8')).toBeInTheDocument()
    expect(screen.queryByLabelText('punk — 12')).toBeNull()
  })

  it('renders an empty-state row when the search matches nothing', () => {
    setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'zzz-no-match' } })
    expect(screen.queryByLabelText('punk — 12')).toBeNull()
    expect(screen.getByText(/no matching values/i)).toBeInTheDocument()
  })

  it('(Select all) checks every visible value and emits them all', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByLabelText('(Select all)'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual(expect.arrayContaining(['punk', 'indie rock', BLANK]))
    expect(onChange.mock.calls[0][0]).toHaveLength(3)
  })

  it('(Select all) toggles only the currently visible (search-filtered) values', () => {
    const { onChange } = setup({ value: ['indie rock'] })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'punk' } })
    fireEvent.click(screen.getByLabelText('(Select all)'))
    // 'indie rock' is checked but not visible under the 'punk' search, so it
    // must be left untouched; only the visible 'punk' row gets added.
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toEqual(expect.arrayContaining(['indie rock', 'punk']))
    expect(onChange.mock.calls[0][0]).toHaveLength(2)
  })

  it('is indeterminate when only some visible values are checked', () => {
    setup({ value: ['punk'] })
    expect(screen.getByLabelText('(Select all)').indeterminate).toBe(true)
  })

  it('is checked (not indeterminate) when every visible value is checked', () => {
    setup({ value: ['punk', 'indie rock', BLANK] })
    const selectAll = screen.getByLabelText('(Select all)')
    expect(selectAll.checked).toBe(true)
    expect(selectAll.indeterminate).toBe(false)
  })

  it('unchecking the only visible value via (Select all) calls onClear, not onChange([])', () => {
    const { onClear, onChange } = setup({ value: ['punk'] })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'punk' } })
    fireEvent.click(screen.getByLabelText('(Select all)'))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('checking a value emits the full next array', () => {
    const { onChange } = setup({ value: ['punk'] })
    fireEvent.click(screen.getByLabelText('indie rock — 8'))
    expect(onChange).toHaveBeenCalledWith(['punk', 'indie rock'])
  })

  it('unchecking the last checked value calls onClear, not onChange([])', () => {
    const { onClear, onChange } = setup({ value: ['punk'] })
    fireEvent.click(screen.getByLabelText('punk — 12'))
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('unchecking one of several checked values still calls onChange', () => {
    const { onChange, onClear } = setup({ value: ['punk', 'indie rock'] })
    fireEvent.click(screen.getByLabelText('punk — 12'))
    expect(onChange).toHaveBeenCalledWith(['indie rock'])
    expect(onClear).not.toHaveBeenCalled()
  })

  it('the footer Clear filter button calls onClear', () => {
    const { onClear } = setup({ value: ['punk'] })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('sorts follower_count numerically, not lexicographically', () => {
    setup({
      column: FOLLOWER_COLUMN,
      counts: new Map([
        ['10', 2],
        ['2', 5],
        ['1', 1],
      ]),
    })
    const rows = screen.getAllByRole('checkbox').map(c => c.getAttribute('aria-label'))
    expect(rows.slice(1)).toEqual(['1 — 1', '2 — 5', '10 — 2'])
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
