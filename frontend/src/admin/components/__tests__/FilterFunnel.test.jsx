import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FilterFunnel from '../FilterFunnel'

describe('FilterFunnel', () => {
  it('renders a button labelled for the column', () => {
    render(<FilterFunnel label="Genre" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filter by Genre' })).toBeInTheDocument()
  })

  it('reflects the open state via aria-expanded', () => {
    render(<FilterFunnel label="Genre" open onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filter by Genre' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('defaults aria-expanded to false when closed', () => {
    render(<FilterFunnel label="Genre" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filter by Genre' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('sets aria-controls to the panel id', () => {
    render(<FilterFunnel label="Genre" panelId="genre-panel" onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filter by Genre' })).toHaveAttribute('aria-controls', 'genre-panel')
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<FilterFunnel label="Genre" onClick={onClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filter by Genre' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('uses a visually distinct, complete literal class string when active vs inactive', () => {
    const { rerender } = render(<FilterFunnel label="Genre" active={false} onClick={() => {}} />)
    const inactiveClass = screen.getByRole('button', { name: 'Filter by Genre' }).className
    rerender(<FilterFunnel label="Genre" active onClick={() => {}} />)
    const activeClass = screen.getByRole('button', { name: 'Filter by Genre' }).className
    expect(activeClass).not.toEqual(inactiveClass)
    expect(inactiveClass.length).toBeGreaterThan(0)
    expect(activeClass.length).toBeGreaterThan(0)
  })

  it('attaches the forwarded triggerRef to the button element', () => {
    const triggerRef = { current: null }
    render(<FilterFunnel label="Genre" onClick={() => {}} triggerRef={triggerRef} />)
    expect(triggerRef.current).toBe(screen.getByRole('button', { name: 'Filter by Genre' }))
  })
})
