import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PosterPalette from '../PosterPalette'

vi.mock('../../../utils/adminApi', () => ({
  eventsApi: { getPosterBlob: vi.fn() },
}))
// The pixel maths has its own suite; here only the flow around it matters.
vi.mock('../../../utils/posterPalette', async importOriginal => ({
  ...(await importOriginal()),
  extractPaletteFromImage: vi.fn(),
}))

import { eventsApi } from '../../../utils/adminApi'
import { extractPaletteFromImage } from '../../../utils/posterPalette'

const variant = (ground, ink, accent, nowFill) => ({ ground, ink, accent, nowFill })
const paletteFor = (accent, source = 'poster') => ({
  v: 1,
  source,
  light: variant('#f7eef0', '#1a1819', accent, '#dce9f2'),
  dark: variant('#2a2629', '#f7eef0', '#d9a3c6', '#3b4c5a'),
})
const OLD = 'https://band-photos.settimes.ca/event-posters/old.jpg'
const NEW = 'https://band-photos.settimes.ca/event-posters/new.jpg'

// The form owns the state; this harness plays the form.
function Form({ original = OLD, initialPoster = OLD, initialValue = null, onValue = () => {} }) {
  const [poster, setPoster] = useState(initialPoster)
  const [value, setValue] = useState(initialValue)
  return (
    <>
      <button type="button" onClick={() => setPoster(NEW)}>
        new poster
      </button>
      <PosterPalette
        originalPosterUrl={original}
        posterUrl={poster}
        value={value}
        onChange={next => {
          setValue(next)
          onValue(next)
        }}
      />
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  eventsApi.getPosterBlob.mockImplementation(async url => new globalThis.Blob([url]))
  extractPaletteFromImage.mockImplementation(async blob =>
    paletteFor((await blob.text()) === NEW ? '#924d7a' : '#555555')
  )
})

describe('PosterPalette (#1248)', () => {
  it('opening an edition with its saved poster reads nothing and changes nothing', async () => {
    const onValue = vi.fn()
    render(<Form onValue={onValue} />)
    expect(screen.getByRole('button', { name: 'Suggest colours from the poster' })).toBeInTheDocument()
    await act(async () => {})
    expect(eventsApi.getPosterBlob).not.toHaveBeenCalled()
    expect(onValue).not.toHaveBeenCalled()
  })

  it('the form filling in a render after mount is not a "new" poster', async () => {
    // EventFormModal mounts with an empty form and loads the event a render later.
    function LateFill() {
      const [poster, setPoster] = useState('')
      return (
        <>
          <button type="button" onClick={() => setPoster(OLD)}>
            load
          </button>
          <PosterPalette originalPosterUrl={OLD} posterUrl={poster} value={null} onChange={() => {}} />
        </>
      )
    }
    render(<LateFill />)
    fireEvent.click(screen.getByRole('button', { name: 'load' }))
    await act(async () => {})
    expect(eventsApi.getPosterBlob).not.toHaveBeenCalled()
  })

  it('a new poster is read automatically and its colours go into the form', async () => {
    const onValue = vi.fn()
    render(<Form onValue={onValue} />)
    fireEvent.click(screen.getByRole('button', { name: 'new poster' }))
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(paletteFor('#924d7a')))
    expect(eventsApi.getPosterBlob).toHaveBeenCalledWith(NEW)
    expect(screen.getByTestId('palette-preview-light')).toBeInTheDocument()
    expect(screen.getByTestId('palette-preview-dark')).toBeInTheDocument()
  })

  it('never silently replaces colours picked by hand', async () => {
    const onValue = vi.fn()
    render(<Form initialValue={paletteFor('#123456', 'manual')} onValue={onValue} />)
    fireEvent.click(screen.getByRole('button', { name: 'new poster' }))
    await act(async () => {})
    expect(eventsApi.getPosterBlob).not.toHaveBeenCalled()
    expect(onValue).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest again from the poster' }))
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(paletteFor('#924d7a')))
  })

  it('a slower read of an earlier poster cannot overwrite the newer one', async () => {
    let releaseOld
    eventsApi.getPosterBlob.mockImplementation(url =>
      url === OLD
        ? new Promise(resolve => (releaseOld = () => resolve(new globalThis.Blob([OLD]))))
        : Promise.resolve(new globalThis.Blob([NEW]))
    )
    const onValue = vi.fn()
    render(<Form onValue={onValue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest colours from the poster' })) // reads OLD, slowly
    fireEvent.click(screen.getByRole('button', { name: 'new poster' })) // reads NEW
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(paletteFor('#924d7a')))
    await act(async () => releaseOld())
    expect(onValue).toHaveBeenCalledTimes(1)
  })

  it('an unreadable poster says so and leaves the colours alone', async () => {
    eventsApi.getPosterBlob.mockRejectedValue(new Error('Poster not found'))
    const onValue = vi.fn()
    render(<Form onValue={onValue} />)
    fireEvent.click(screen.getByRole('button', { name: 'new poster' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not read colours from the poster: Poster not found'
    )
    expect(onValue).not.toHaveBeenCalled()
  })

  it('a poster with no usable colours is an error, not an empty palette', async () => {
    extractPaletteFromImage.mockResolvedValue(null)
    const onValue = vi.fn()
    render(<Form onValue={onValue} />)
    fireEvent.click(screen.getByRole('button', { name: 'new poster' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no usable colours')
    expect(onValue).not.toHaveBeenCalled()
  })

  it('adjusting a swatch marks the palette as picked by hand', () => {
    const onValue = vi.fn()
    render(<Form initialValue={paletteFor('#924d7a')} onValue={onValue} />)
    fireEvent.change(screen.getByLabelText('Light: Accent'), { target: { value: '#aa0000' } })
    const next = onValue.mock.calls.at(-1)[0]
    expect(next.source).toBe('manual')
    expect(next.light.accent).toBe('#aa0000')
    expect(next.dark).toEqual(paletteFor('#924d7a').dark)
  })

  it('previews the readable version and says when it differs from what is stored', () => {
    render(<Form initialValue={paletteFor('#ffff00')} />)
    expect(screen.getByText(/darkened or lightened on the page/)).toBeInTheDocument()
    const accentLine = screen.getByTestId('palette-preview-light').querySelector('p')
    expect(accentLine).not.toHaveStyle({ color: '#ffff00' })
  })

  it('removing the colours hands back null, the house theme', () => {
    const onValue = vi.fn()
    render(<Form initialValue={paletteFor('#924d7a')} onValue={onValue} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove colours' }))
    expect(onValue).toHaveBeenCalledWith(null)
  })
})
