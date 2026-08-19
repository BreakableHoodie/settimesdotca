import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RouteDiffSection from '../RouteDiffSection'

const band = (over = {}) => ({
  id: 'b1',
  name: 'Openers',
  venue: 'Roost',
  startTime: '20:00',
  endTime: '20:45',
  ...over,
})

describe('RouteDiffSection', () => {
  it.each([
    ['an empty array', []],
    ['null', null],
    ['undefined', undefined],
  ])('renders nothing for %s', (_label, bands) => {
    const { container } = render(<RouteDiffSection title="Together" hint="You both have these" bands={bands} />)
    // A recipient with no route of their own has two empty categories; showing
    // their headers would explain nothing and imply something went missing.
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the title, the member count, and the hint', () => {
    render(<RouteDiffSection title="You’d add" hint="Only on their route" bands={[band(), band({ id: 'b2' })]} />)
    expect(screen.getByText('You’d add')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getByText('Only on their route')).toBeInTheDocument()
  })

  it('renders each set with its time and venue', () => {
    render(<RouteDiffSection title="Together" hint="h" bands={[band()]} />)
    expect(screen.getByText('Openers')).toBeInTheDocument()
    expect(screen.getByText(/8:00/)).toBeInTheDocument()
    expect(screen.getByText(/Roost/)).toBeInTheDocument()
  })

  it('strikes through a cancelled set and labels it', () => {
    // A shared route can carry a set cancelled after it was sent (#732). It must
    // stay visible and marked, not silently disappear from the comparison.
    render(<RouteDiffSection title="You’d add" hint="h" bands={[band({ is_cancelled: 1 })]} />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByText(/Openers/).className).toContain('line-through')
  })

  it('does not strike through a live set', () => {
    render(<RouteDiffSection title="You’d add" hint="h" bands={[band()]} />)
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
    expect(screen.getByText(/Openers/).className).not.toContain('line-through')
  })

  it('preserves the order it is given rather than re-sorting', () => {
    // The caller sorts on startMs so after-midnight sets land last; re-sorting
    // here on the raw clock time would undo that.
    render(
      <RouteDiffSection
        title="Together"
        hint="h"
        bands={[band({ id: 'late', name: 'Last Call', startTime: '01:00' }), band({ id: 'first', name: 'Openers' })]}
      />
    )
    const rows = screen.getAllByRole('listitem').map(li => li.textContent)
    expect(rows[0]).toContain('Last Call')
    expect(rows[1]).toContain('Openers')
  })
})
