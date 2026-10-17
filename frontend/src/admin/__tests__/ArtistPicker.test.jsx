import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ArtistPicker from '../components/ArtistPicker'

// The roster arrives one row per performance, so one artist can appear several
// times; the picker must list each artist once and hand back the right rows.
const ARTISTS = [
  { id: 11, band_profile_id: 1, name: 'Arctic Ferns', origin_city: 'Kitchener', origin_region: 'ON', genre: 'punk' },
  { id: 12, band_profile_id: 1, name: 'Arctic Ferns', origin_city: 'Kitchener', origin_region: 'ON', genre: 'punk' },
  { id: 13, band_profile_id: 2, name: 'Basement Tapes', origin: 'Guelph' },
  { id: 14, band_profile_id: 3, name: 'Cold Harbour' },
]
const VENUES = [
  { id: 7, name: 'Room 47' },
  { id: 8, name: 'Roost' },
]

function renderPicker(props = {}) {
  const handlers = { onSelect: vi.fn(), onBulkSelect: vi.fn(), onCancel: vi.fn() }
  render(<ArtistPicker artists={ARTISTS} venues={VENUES} {...handlers} {...props} />)
  return handlers
}

const search = value => fireEvent.change(screen.getByPlaceholderText('Search for an artist...'), { target: { value } })

describe('ArtistPicker', () => {
  it('lists each artist once, with origin and genre', () => {
    renderPicker()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(screen.getByText('Kitchener, ON • punk')).toBeInTheDocument()
    expect(screen.getByText('Guelph')).toBeInTheDocument()
  })

  it('filters by name, case-insensitively', () => {
    renderPicker()
    search('HARB')
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(screen.getByLabelText('Select Cold Harbour')).toBeInTheDocument()
  })

  it('Select hands back that artist; the create paths hand back null and the typed name', () => {
    const { onSelect, onCancel } = renderPicker()
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[1])
    expect(onSelect).toHaveBeenLastCalledWith(ARTISTS[2])

    fireEvent.click(screen.getByRole('button', { name: '+ Create New Artist manually' }))
    expect(onSelect).toHaveBeenLastCalledWith(null)

    search('Nobody Here')
    fireEvent.click(screen.getByRole('button', { name: '+ Create "Nobody Here"' }))
    expect(onSelect).toHaveBeenLastCalledWith(null, 'Nobody Here')

    fireEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('bulk-adds the checked artists with the shared venue and times', () => {
    const { onBulkSelect } = renderPicker()
    fireEvent.click(screen.getByLabelText('Select Arctic Ferns'))
    fireEvent.click(screen.getByLabelText('Select Cold Harbour'))
    expect(screen.getByText(/2 acts selected/)).toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('Shared start time (optional)'), { target: { value: '20:00' } })
    fireEvent.change(screen.getByLabelText('Shared end time (optional)'), { target: { value: '20:45' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 acts to Lineup' }))

    expect(onBulkSelect).toHaveBeenCalledWith([ARTISTS[0], ARTISTS[3]], 8, '20:00', '20:45')
  })

  it('unchecking removes an artist, and unset fields are sent as null', () => {
    const { onBulkSelect } = renderPicker()
    fireEvent.click(screen.getByLabelText('Select Arctic Ferns'))
    fireEvent.click(screen.getByLabelText('Select Basement Tapes'))
    fireEvent.click(screen.getByLabelText('Select Arctic Ferns'))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 act to Lineup' }))

    expect(onBulkSelect).toHaveBeenCalledWith([ARTISTS[2]], null, null, null)
  })

  it('Clear selection empties the bulk bar and restores the manual-create link', () => {
    renderPicker()
    fireEvent.click(screen.getByLabelText('Select Arctic Ferns'))
    expect(screen.queryByRole('button', { name: '+ Create New Artist manually' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText(/selected/)).toBeNull()
    expect(screen.getByLabelText('Select Arctic Ferns')).not.toBeChecked()
    expect(screen.getByRole('button', { name: '+ Create New Artist manually' })).toBeInTheDocument()
  })
})
