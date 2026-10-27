import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Every event is in Toronto, so a fan-facing instant built from a date and a
// time must be Toronto wall-clock time (#1398). `Date.parse(`${date}T${time}`)`
// and its relatives parse in the VIEWER's zone, which put a London fan's
// "Live Tonight", countdowns and ticket link five hours off. The helpers live
// in utils/festivalDays.js, the one file allowed to do this.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(__dirname, '..')

// Exempt by name, each with the reason, and each must still contain what it
// is exempted for (see the last test), so a stale entry cannot linger.
const EXEMPTIONS = {
  'pages/SharePreviewPage.jsx': 'sortKey orders stored festival dates and is never compared with now',
  'utils/routeIcs.js': 'ICS output declares TZID=America/Toronto; these strings are written, never parsed',
}

const PATTERNS = {
  // `${date}T${time}` anywhere: the classic viewer-local instant.
  dateTimeTemplate: {
    regex: /\$\{[^}\n]+\}T\$\{[^}\n]+\}/,
    bad: 'Date.parse(`${band.date}T${band.startTime}:00`)',
  },
  // The same, separated by a space, passed straight to the Date parser.
  dateSpaceTimeParse: {
    regex: /(?:new Date|Date\.parse)\(\s*`\$\{[^}\n]+\} \$\{[^}\n]+\}/,
    bad: 'new Date(`${date} ${time}`)',
  },
  // String concatenation of a date and a time.
  concatenatedT: {
    regex: /(?:\+\s*['"]T|['"]T\s*\+)/,
    bad: "new Date(eventDate + 'T' + doorsTime + ':00')",
  },
  // A fixed clock time appended to a date.
  fixedClockTime: {
    regex: /(?:new Date|Date\.parse)\([^\n]*(?:T00:00:00|T23:59:59)/,
    bad: "new Date(eventDate + 'T23:59:59')",
  },
  // Reading or setting the clock on an instant uses the viewer's clock.
  viewerClockField: {
    regex: /\.(?:get|set)(?:Hours|Minutes)\(/,
    bad: 'const currentHour = now.getHours()',
  },
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['admin', '__tests__', 'test'].includes(entry.name)) return []
      return sourceFiles(fullPath)
    }
    return /\.(js|jsx)$/.test(entry.name) ? [fullPath] : []
  })
}

const relativePath = file => path.relative(SRC, file).split(path.sep).join('/')
const matchedPatterns = source =>
  Object.entries(PATTERNS)
    .filter(([, { regex }]) => regex.test(source))
    .map(([name]) => name)

describe('Toronto clock source guard (#1398)', () => {
  it.each(Object.entries(PATTERNS))('%s still matches the construct it hunts', (_, { regex, bad }) => {
    expect(regex.test(bad)).toBe(true)
  })

  it('finds the source files it scans', () => {
    const scanned = sourceFiles(SRC).map(relativePath)
    expect(scanned).toContain('utils/bandUtils.js')
    expect(scanned).toContain('utils/liveLabel.js')
    expect(scanned.some(file => file.startsWith('admin/'))).toBe(false)
  })

  it('builds no fan-facing instant from a viewer-local date and time', () => {
    const violations = sourceFiles(SRC)
      .map(file => [relativePath(file), readFileSync(file, 'utf8')])
      .filter(([relative]) => relative !== 'utils/festivalDays.js' && !EXEMPTIONS[relative])
      .map(([relative, source]) => [relative, matchedPatterns(source)])
      .filter(([, matched]) => matched.length > 0)
    expect(violations).toEqual([])
  })

  it.each(Object.keys(EXEMPTIONS))('%s still needs its exemption', relative => {
    expect(matchedPatterns(readFileSync(path.join(SRC, relative), 'utf8'))).not.toEqual([])
  })
})
