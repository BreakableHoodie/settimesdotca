import { useEffect, useRef, useState } from 'react'
import { eventsApi } from '../../utils/adminApi'
import { extractPaletteFromImage, readableThemeColours } from '../../utils/posterPalette'

// Poster-led event colours (#1248). The event page takes its palette from the
// edition's poster: a light variant, plus a dark one built from the poster's
// own ink for fans on a dark theme. Zero per-edition maintenance: a NEW poster
// in this form is read automatically and its colours go into the form, saved
// with the event. Colours someone picked by hand ("manual") are never replaced
// silently; they get a "Suggest from the poster" button instead.
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

export default function PosterPalette({ originalPosterUrl = '', posterUrl, value, onChange }) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  // The event's saved poster is not "new": opening an old edition and saving
  // it must not restyle it. Only a poster changed in this form is. The
  // baseline is the SAVED url, not the first render's: the form mounts empty
  // and fills from the event a render later.
  const seenPoster = useRef(originalPosterUrl)
  const request = useRef(0)
  const valueRef = useRef(value)
  useEffect(() => {
    valueRef.current = value
  }, [value])

  const suggest = async url => {
    const id = ++request.current
    setStatus('extracting')
    setError('')
    try {
      const blob = await eventsApi.getPosterBlob(url)
      const palette = await extractPaletteFromImage(blob)
      if (id !== request.current) return // a newer poster replaced this one
      if (!palette) throw new Error('The poster has no usable colours.')
      onChange(palette)
      setStatus('idle')
    } catch (err) {
      if (id !== request.current) return
      setStatus('error')
      setError(`Could not read colours from the poster: ${err.message}`)
    }
  }

  useEffect(() => {
    if (!posterUrl || posterUrl === seenPoster.current) return
    seenPoster.current = posterUrl
    if (valueRef.current?.source === 'manual') return
    suggest(posterUrl)
    // `suggest` is recreated each render; the poster URL is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterUrl])

  if (!posterUrl && !value) return null

  const readable = value ? readableThemeColours(value) : null
  const adjusted =
    readable &&
    VARIANTS.some(([variant]) =>
      Object.keys(ROLE_LABELS).some(role => readable[variant][role] !== value[variant][role].toLowerCase())
    )

  const setRole = (variant, role, colour) =>
    onChange({ ...value, source: 'manual', [variant]: { ...value[variant], [role]: colour } })

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
            {value ? 'Suggest again from the poster' : 'Suggest colours from the poster'}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-[44px] rounded px-3 text-sm text-white/80 underline hover:text-white"
          >
            Remove colours
          </button>
        )}
      </div>
    </fieldset>
  )
}
