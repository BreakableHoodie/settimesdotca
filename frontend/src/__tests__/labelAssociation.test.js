// --- Durable guard: no `<label htmlFor>` may point at an id that doesn't exist
//
// An orphaned `htmlFor` is the quietest accessibility bug in the codebase. The
// label renders, looks correct, and reads correctly to a sighted user — but
// clicking it focuses nothing, and a screen reader gets no accessible name for
// the control it was supposed to name.
//
// Two instances were live when this guard was written (#842):
//
//   VenuesTab.jsx   htmlFor="venue-name"       — the REQUIRED venue name field,
//                                                the only one of nine venue
//                                                inputs missing its id
//   BandForm.jsx    htmlFor="band-description" — pointed at <RichTextEditor>,
//                                                which takes no id at all
//
// Neither is caught by any lint rule we run, and that is not an oversight in
// our config — it is a limitation of static analysis:
//
//   * `jsx-a11y/control-has-associated-label` ignores `input`/`textarea` by
//     design (that is jsx-a11y's own recommended `ignoreElements`), because
//     labelling inputs is the other rule's job.
//   * `jsx-a11y/label-has-associated-control` only asserts that a `htmlFor`
//     attribute is PRESENT. It never resolves the target, so a label pointing
//     at a typo'd or deleted id passes it cleanly.
//
// CodeRabbit found the VenuesTab one because it happened to be in a diff.
// BandForm's was found only by sweeping the whole tree for the class — no
// diff-scoped reviewer could have seen it. That asymmetry is exactly why this
// is a test and not a checklist item.
//
// It is a source scan for the same reason as isPublishedGuard.test.js and
// bandFields.test.js: the defect is a string baked into JSX, and rendering the
// component proves nothing — an orphaned label renders perfectly happily.
//
// Deliberately literal-only: `htmlFor={foo}` and `id={bar}` are skipped, since
// resolving an expression needs the runtime this scan is avoiding. The class
// that has actually occurred is the literal one, twice.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// fileURLToPath, not `new URL(...).pathname` — under Vitest `import.meta.url`
// is not always a plain file:// URL, and .pathname silently resolved to "/src".
// Same idiom as isPublishedGuard.test.js.
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function jsxFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'node_modules') continue
      out.push(...jsxFiles(full))
    } else if (entry.name.endsWith('.jsx')) {
      out.push(full)
    }
  }
  return out
}

describe('label/control association', () => {
  it('has no <label htmlFor="..."> pointing at a missing id', () => {
    const orphans = []

    for (const file of jsxFiles(SRC)) {
      const src = readFileSync(file, 'utf8')

      // Literal attribute values only — `htmlFor={expr}` is out of scope.
      const targets = [...src.matchAll(/htmlFor="([^"{}]+)"/g)].map(m => m[1])
      if (targets.length === 0) continue

      const ids = new Set([...src.matchAll(/\bid="([^"{}]+)"/g)].map(m => m[1]))

      for (const target of targets) {
        if (!ids.has(target)) {
          orphans.push(`${path.relative(SRC, file)}: htmlFor="${target}" has no matching id`)
        }
      }
    }

    // A label whose control lives in another component cannot be verified by a
    // same-file scan. If that pattern ever becomes legitimate here, add the
    // pair to an explicit allowlist above rather than weakening the regexes —
    // the point of the guard is that adding an exemption is a visible decision.
    expect(orphans).toEqual([])
  })
})
