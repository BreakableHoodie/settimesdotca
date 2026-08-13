import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Durable guard for #804 — the create form must not offer `Published`.
 *
 * POST /api/admin/events rejects `status: "published"` outright, because a
 * just-created event has zero performances and would therefore always be a
 * silent empty-lineup publish, skipping the confirm that POST .../publish
 * shows. This asserts the UI can't build that rejected request in the first
 * place, so the two halves can't drift apart.
 *
 * Deliberately a SOURCE SCAN rather than a render test, following the
 * `bandFields.test.js` precedent. EventFormModal.jsx is ~700 lines and
 * otherwise untested; importing it to assert three `<option>` lines would drop
 * all of its uncovered lines into the coverage denominator and push the global
 * ratchet (statements 57 / branches 50 / functions 60 / lines 58 in
 * vitest.config.js) toward failing — the trap where adding a test makes CI red.
 * Reading the file as text costs nothing and cannot regress coverage.
 */
describe('EventFormModal status options — #804', () => {
  const currentFile = fileURLToPath(import.meta.url)
  // Resolved via node:path rather than `new URL(relative, import.meta.url)`,
  // matching bandFields.test.js.
  const modalPath = path.join(path.dirname(currentFile), '../EventFormModal.jsx')
  const source = readFileSync(modalPath, 'utf8')

  it('gates the Published option on isEditing so create cannot offer it', () => {
    // Strip block comments first: the explanatory comment above the option
    // mentions `Published`, and an unstripped scan would match that instead of
    // the JSX and pass no matter what the markup does.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '')

    const publishedOption = code.match(/.*<option value="published">.*/)
    expect(publishedOption, 'expected a published <option> to exist for the edit form').not.toBeNull()

    // The line must be conditional on isEditing. An unconditional
    // `<option value="published">` is the #804 regression.
    expect(
      publishedOption[0],
      'the Published option must be gated on isEditing — an unconditional one lets the create form build a request the server now rejects (#804)'
    ).toMatch(/isEditing\s*&&/)
  })

  it('still offers Archived on create for admins (historical back-fill must keep working)', () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '')
    const archivedOption = code.match(/.*<option value="archived">.*/)

    expect(archivedOption, 'expected an archived <option>').not.toBeNull()
    // HistoricalImportModal back-fills past editions as `archived`; #804 must
    // not have collaterally removed that path.
    expect(archivedOption[0]).toMatch(/!isEditing\s*&&\s*canCreateArchived/)
  })
})
