import { useEffect, useRef, useState } from 'react'
import { eventsApi } from '../../utils/adminApi'
import { extractPaletteFromImage, readableThemeColours } from '../../utils/posterPalette'

// Poster-led event colours (#1248). The event page takes its palette from the
// edition's poster: a light variant, plus a dark one built from the poster's
// own ink for fans on a dark theme. Zero per-edition maintenance: a palette
// records the poster it was read from, and the form reads the poster whenever
// the event has one and no colours from it: a poster changed here, one saved
// earlier whose colours never were (an upload saves the poster at once, the
// colours save with the form), or an edition from before palettes existed.
// Colours someone picked by hand ("manual") are never replaced silently; they
// get a "Suggest again" button instead.
const ROLE_LABELS = { ground: 'Background', ink: 'Text', accent: 'Accent', nowFill: 'On now' }
const VARIANTS = [
  ['light', 'Light'],
  ['dark', 'Dark'],
]

function Preview({ colours, label }) {
  return (
    <div
      className="rounded border border-white/20 p-3 text-sm"
      style={{ background: colours.ground, color: colours.ink }}
      data-testid={`palette-preview-${label.toLowerCase()}`}
    >
      <p className="font-bold" style={{ color: colours.accent }}>
        {label}
      </p>
      <p style={{ color: colours.accent }}>8:00 PM</p>
      <p>Band name, Prohibition</p>
      <p className="mt-1 px-1" style={{ background: colours.nowFill }}>
        On now, until 9:00 PM
      </p>
    </div>
  )
}

export default function PosterPalette({ posterUrl, value, onChange, onBusyChange, autoSuggest = true }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const request = useRef(0)
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // The form holds Save while colours are being read: saving mid-read would
  // store the new poster with the old colours, and the late result would land
  // in a form that no longer exists.
  useEffect(() => {
    onBusyChange?.(status === 'extracting')
  }, [status, onBusyChange])

  const suggest = async url => {
    const id = ++request.current
    // A choice made while this read runs (adjusting a swatch, removing the
    // colours) changes the value; the choice wins (CodeRabbit, #1361).
    const startedFrom = valueRef.current
    setStatus('extracting')
    setError('')
    try {
      const blob = await eventsApi.getPosterBlob(url)
      const palette = await extractPaletteFromImage(blob, url)
      if (id !== request.current) return // a newer poster replaced this one
      if (valueRef.current !== startedFrom) return // the admin chose meanwhile
      if (!palette) throw new Error('The poster has no usable colours.')
      onChange(palette)
      setStatus('idle')
    } catch (err) {
      if (id !== request.current || valueRef.current !== startedFrom) return
      console.error('[PosterPalette] could not read colours from the poster', { url, err })
      const kept = valueRef.current
        ? ' The colours below are still the previous ones: suggest again, adjust them, or remove them.'
        : ''
      setStatus('error')
      setError(`Could not read colours from the poster: ${err.message}.${kept}`)
    }
  }

  useEffect(() => {
    // `autoSuggest` is off when the stored value is one this version cannot
    // read: it shows as "no colours", and reading would replace it unasked.
    if (!posterUrl || !autoSuggest) return // the form mounts empty and fills a render later
    const current = valueRef.current
    // A choice ("manual" colours, or "none", the house theme) is never undone
    // by a read, whatever the poster.
    if (current?.source === 'manual' || current?.source === 'none' || current?.poster === posterUrl) return
    suggest(posterUrl)
    // `suggest` is recreated each render; the poster and the palette's own
    // poster and source are the only triggers. A failed read changes none of
    // them, so it is not retried in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterUrl, value?.poster, value?.source, autoSuggest])

  // A read still in flight when the form closes must not land afterwards.
  useEffect(
    () => () => {
      request.current += 1
    },
    []
  )

  // A choice the admin makes ends any read in flight from the user's point of
  // view; `suggest` sees the changed value and discards its late result.
  const choose = next => {
    setStatus('idle')
    setError('')
    onChange(next)
  }

  const setRole = (variant, role, colour) =>
    choose({ ...value, source: 'manual', [variant]: { ...value[variant], [role]: colour } })

  if (!posterUrl && !value) return null

  const readable = value ? readableThemeColours(value) : null
  const adjusted =
    readable &&
    VARIANTS.some(([variant]) =>
      Object.keys(ROLE_LABELS).some(role => readable[variant][role] !== value[variant][role].toLowerCase())
    )

  return (
    <fieldset className="mt-3 rounded border border-white/10 p-3">
      <legend className="px-1 text-sm font-medium text-white">Event page colours</legend>
      <p className="mb-2 text-xs text-white/60">
        Taken from the poster. Fans on a dark theme see the dark version. With no colours, the page uses the site&apos;s
        own theme.
      </p>

      {status === 'extracting' && (
        <p role="status" className="text-sm text-white/80">
          Reading colours from the poster…
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      {value?.source === 'none' && <p className="text-sm text-white/80">This event uses the site&apos;s own theme.</p>}

      {readable && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {VARIANTS.map(([variant, label]) => (
              <Preview key={variant} colours={readable[variant]} label={label} />
            ))}
          </div>
          {adjusted && (
            <p className="mt-2 text-xs text-white/60">
              Some colours are darkened or lightened on the page so the text stays readable.
            </p>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-white/80">Adjust colours</summary>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {VARIANTS.map(([variant, label]) =>
                Object.entries(ROLE_LABELS).map(([role, roleLabel]) => (
                  <label key={`${variant}-${role}`} className="flex items-center gap-2 text-xs text-white/80">
                    <input
                      type="color"
                      value={value[variant][role].toLowerCase()}
                      onChange={event => setRole(variant, role, event.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-white/20 bg-transparent"
                    />
                    {`${label}: ${roleLabel}`}
                  </label>
                ))
              )}
            </div>
          </details>
        </>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {posterUrl && (
          <button
            type="button"
            disabled={status === 'extracting'}
            onClick={() => suggest(posterUrl)}
            className="min-h-[44px] rounded bg-white/10 px-3 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            {readable ? 'Suggest again from the poster' : 'Suggest colours from the poster'}
          </button>
        )}
        {readable && (
          <button
            type="button"
            // With a poster, the house theme is stored as a CHOICE for it, or the
            // next render would read the poster and put colours straight back.
            onClick={() => choose(posterUrl ? { v: 1, source: 'none', poster: posterUrl } : null)}
            className="min-h-[44px] rounded px-3 text-sm text-white/80 underline hover:text-white"
          >
            Remove colours
          </button>
        )}
      </div>
    </fieldset>
  )
}
