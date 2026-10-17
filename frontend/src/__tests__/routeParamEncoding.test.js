// --- Durable guard: route params must be encoded before they reach /api/ ----
//
// Client-side path traversal (CSPT). React Router DECODES `%2F` in a route
// param (measured: `/venue/..%2Fadmin%2Fusers` gives `id = "../admin/users"`),
// so interpolating a param into a fetch path unencoded lets a link choose the
// API path. VenuePage turned that into `fetch('/api/venues/../admin/users')`,
// which the browser normalises to `/api/admin/users`.
//
// Why it matters even though every such request is a GET: the session cookie
// is `SameSite=Strict`, so a cross-site link arrives WITHOUT it -- but the SPA's
// own follow-up fetch is same-origin and carries it. The traversal turns any
// link into a credentialed request to an endpoint of the attacker's choosing.
// Low impact today (no admin GET writes, and the attacker cannot read the
// response), but it is the same bug class as a server-side traversal and it
// costs one `encodeURIComponent` to close.
//
// Sweep 2026-10-12: EventRecapPage (slug), VenuePage (id, twice) and App.jsx
// (slug, via `eventParam`, into a query string) were unencoded; BandProfilePage,
// SharePreviewPage and EmbedPage already encoded theirs.
//
// The scan is NAME-based, like the after-midnight guard on the backend: it
// knows the names destructured from `useParams()` and one hop of
// `const x = <param> || ...` derivation. A param passed through a helper, or
// renamed twice, slips past it. Treat it as a backstop against the shape that
// actually happened, not as proof no other instance can exist.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentFile = fileURLToPath(import.meta.url)
const srcRoot = path.join(path.dirname(currentFile), '../')

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') continue
      files = files.concat(walk(full))
    } else if (entry.isFile() && /\.(jsx?|tsx?)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

// Names a file takes from the URL: `const { a, b: c } = useParams()`, plus one
// hop of `const x = a || 'default'`.
export function routeParamNames(source) {
  const names = new Set()
  for (const m of source.matchAll(/const\s*\{([^}]*)\}\s*=\s*useParams\(\)/g)) {
    for (const part of m[1].split(',')) {
      const local = part.split(':').pop().split('=')[0].trim()
      if (local) names.add(local)
    }
  }
  for (const m of source.matchAll(/const\s+(\w+)\s*=\s*(\w+)\s*(?:\|\||\?\?)/g)) {
    if (names.has(m[2])) names.add(m[1])
  }
  return names
}

// Bare `${name}` interpolations of a route param inside an `/api/` template.
export function unencodedApiInterpolations(source) {
  const names = routeParamNames(source)
  const hits = []
  for (const literal of source.matchAll(/`[^`]*`/g)) {
    if (!literal[0].includes('/api/')) continue
    for (const interp of literal[0].matchAll(/\$\{\s*(\w+)\s*\}/g)) {
      if (names.has(interp[1])) hits.push(interp[1])
    }
  }
  return hits
}

describe('route params are encoded before reaching an /api/ path', () => {
  it('the detector can actually fire, so the scan below is not vacuous', () => {
    const bad =
      "const { id } = useParams()\nconst e = id || 'x'\nfetch(`/api/venues/${id}`); fetch(`/api/s?event=${e}`)"
    expect(unencodedApiInterpolations(bad)).toEqual(['id', 'e'])
    const good = 'const { id } = useParams()\nfetch(`/api/venues/${encodeURIComponent(id)}`)'
    expect(unencodedApiInterpolations(good)).toEqual([])
  })

  it('the scan finds the route-param consumers it is meant to cover', () => {
    // If useParams() destructuring ever stops matching, every file would pass
    // with an empty name set. Pin a floor on what it sees.
    const withParams = walk(srcRoot).filter(f => routeParamNames(readFileSync(f, 'utf8')).size > 0)
    expect(withParams.length).toBeGreaterThanOrEqual(5)
  })

  it('no source file interpolates a raw route param into an /api/ path', () => {
    const offenders = []
    for (const absPath of walk(srcRoot)) {
      const hits = unencodedApiInterpolations(readFileSync(absPath, 'utf8'))
      if (hits.length) offenders.push(`${path.relative(srcRoot, absPath)}: ${hits.join(', ')}`)
    }
    expect(
      offenders,
      'Wrap route params in encodeURIComponent() before putting them in an /api/ path ' +
        '(client-side path traversal; see this file header).'
    ).toEqual([])
  })
})
