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

const OLD = 'https://band-photos.settimes.ca/event-posters/old.jpg'
const NEW = 'https://band-photos.settimes.ca/event-posters/new.jpg'
const variant = (ground, ink, accent, nowFill) => ({ ground, ink, accent, nowFill })
const paletteFor = (accent, source = 'poster', poster = OLD) => ({
  v: 1,
  source,
  poster,
  light: variant('#f7eef0', '#1a1819', accent, '#dce9f2'),
  dark: variant('#2a2629', '#f7eef0', '#d9a3c6', '#3b4c5a'),
})

// The form owns the state; this harness plays the form.
function Form({ original = OLD, initialPoster = OLD, initialValue = null, onValue = () => {}, onBusy = () => {} }) {
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
        onBusyChange={onBusy}
      />
    </>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  eventsApi.getPosterBlob.mockImplementation(async url => new globalThis.Blob([url]))
  extractPaletteFromImage.mockImplementation(async (blob, url) =>
    paletteFor((await blob.text()) === NEW ? '#924d7a' : '#555555', 'poster', url)
  )
  vi.spyOn(console, 'error').mockImplementation(() => {})
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
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(paletteFor('#924d7a', 'poster', NEW)))
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
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(paletteFor('#924d7a', 'poster', NEW)))
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
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(paletteFor('#924d7a', 'poster', NEW)))
    await act(async () => releaseOld())
    expect(onValue).toHaveBeenCalledTimes(1)
  })

  it('re-reads colours left from ANOTHER poster: an upload saved the poster but the form was closed', async () => {
    const onValue = vi.fn()
    render(
      <Form original={NEW} initialPoster={NEW} initialValue={paletteFor('#555555', 'poster', OLD)} onValue={onValue} />
    )
    await waitFor(() => expect(onValue).toHaveBeenCalledWith(paletteFor('#924d7a', 'poster', NEW)))
  })

  it('leaves hand-picked colours alone even when they came from another poster', async () => {
    const onValue = vi.fn()
    render(
      <Form original={NEW} initialPoster={NEW} initialValue={paletteFor('#123456', 'manual', OLD)} onValue={onValue} />
    )
    await act(async () => {})
    expect(eventsApi.getPosterBlob).not.toHaveBeenCalled()
  })

  it('tells the form it is busy while reading, so Save can wait', async () => {
    let release
    eventsApi.getPosterBlob.mockImplementation(
      () => new Promise(resolve => (release = () => resolve(new globalThis.Blob([NEW]))))
    )
    const onBusy = vi.fn()
    render(<Form onBusy={onBusy} />)
    fireEvent.click(screen.getByRole('button', { name: 'new poster' }))
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(true))
    await act(async () => release())
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false))
  })

  it('a failed re-read says the colours on screen are still the previous ones, and logs', async () => {
    eventsApi.getPosterBlob.mockRejectedValue(new Error('Poster not found'))
    render(<Form initialValue={paletteFor('#555555')} />)
    fireEvent.click(screen.getByRole('button', { name: 'new poster' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('still the previous ones')
    expect(console.error).toHaveBeenCalledWith(
      '[PosterPalette] could not read colours from the poster',
      expect.objectContaining({ url: NEW })
    )
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
    expect(next.poster).toBe(OLD)
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
