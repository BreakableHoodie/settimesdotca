// #1248 review: an upload that names its entity (edit mode) is saved to the
// database before the form is. If the parent's list is not refreshed, Cancel
// then reopen opens the form from stale data, and Save writes the stale photo
// or poster back: the upload is silently lost. Found live for event posters
// and band photos alike, so this guards the whole class at its call sites.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..')

function jsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' || entry.name === 'test' ? [] : jsxFiles(full)
    return entry.name.endsWith('.jsx') ? [full] : []
  })
}

// Each opening tag, attributes included (props may span lines). The tag ends
// at a `>` NOT preceded by `=`: an arrow-function prop (`onPhotoChange={url =>
// ...}`) contains `=>`, and stopping there hid every prop after it (a mutation
// of this guard survived until this was fixed). Literal patterns, one per tag,
// rather than a RegExp built from a name.
const TAG_PATTERNS = {
  PhotoUpload: /<PhotoUpload\b([\s\S]*?)(?<!=)\/?>/g,
  BandForm: /<BandForm\b([\s\S]*?)(?<!=)\/?>/g,
}

function openingTags(source, name) {
  return [...source.matchAll(TAG_PATTERNS[name])].map(m => m[1])
}

const FILES = jsxFiles(SRC).map(file => ({ file: file.slice(SRC.length + 1), source: readFileSync(file, 'utf8') }))

describe('uploads saved before the form refresh their parent (#1248)', () => {
  it('every <PhotoUpload> that can name an entity also passes onPersisted', () => {
    const offenders = FILES.flatMap(({ file, source }) =>
      openingTags(source, 'PhotoUpload')
        .filter(attrs => /\b(entityId|bandId)=/.test(attrs) && !/\bonPersisted=/.test(attrs))
        .map(() => file)
    )
    expect(offenders).toEqual([])
  })

  it('every <BandForm> is given onPhotoPersisted, so its list refreshes after an edit-mode upload', () => {
    const sites = FILES.flatMap(({ file, source }) => openingTags(source, 'BandForm').map(attrs => ({ file, attrs })))
    expect(sites.length).toBeGreaterThanOrEqual(2) // RosterTab and LineupTab: the scan must find them
    expect(sites.filter(({ attrs }) => !/\bonPhotoPersisted=/.test(attrs)).map(({ file }) => file)).toEqual([])
  })

  it("the scan's own pattern sees a whole tag across lines, past an arrow-function prop (self-check)", () => {
    const [attrs] = openingTags('<PhotoUpload\n  onPhotoChange={url => set(url)}\n  bandId={1}\n/>', 'PhotoUpload')
    expect(attrs).toMatch(/bandId=/)
  })
})
