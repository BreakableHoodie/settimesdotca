import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Pin the test timezone. Several suites assert DST behaviour (#770), and DST
// does not exist in UTC — under a UTC runner those fixtures pass against the
// broken implementation as readily as the fixed one, which is worse than no
// test at all. America/Toronto is the zone the product actually runs in.
process.env.TZ = 'America/Toronto'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      // Every source file counts, loaded by a test or not (#1493): the default
      // denominator is only test-loaded files, which hid ~14 untested files.
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'node_modules/',
        'src/test/',
        'src/main.jsx',
        'src/**/__tests__/**',
        'src/**/*.{test,spec}.{js,jsx}',
        '*.config.js',
        'dist/',
      ],
      // Ratchet re-measured 2026-08-30 (stmts 71.21 / branch 65.80 /
      // funcs 72.85 / lines 71.81), after App.jsx gained a real suite and went
      // 44.59 -> 83.37. Thresholds are set to actuals minus a
      // margin for run-to-run variance. This blocks regressions without
      // being an aspiration — raise deliberately, never lower silently
      // (#478 item 9, ratcheted by #519).
      //
      // The previous baseline (57/50/60/58, measured 2026-07-05) had drifted
      // ~7 points below actual, so it would have passed a seven-point
      // regression in silence. Re-measure whenever coverage rises.
      //
      // Watch the denominator here: frontend coverage counts only files a test
      // loads, so a new test that imports a large untested component can drop
      // the global percentage while strictly adding coverage. Prefer extracting
      // and testing a small unit over importing a 1,000-line tab component.
      // Raised 2026-09-09 from 66/60/68/66 by scripts/check-coverage-drift.mjs,
      // which now FAILS when actual outruns these by more than 3 points.
      // vitest 5 (#1176), measured 2026-09-22: the frontend scored HIGHER under
      // v5 (v4 72.39/67.36/73.87/73.13 -> v5 72.71/67.57/74.08/73.47 for
      // statements/branches/functions/lines), so these stay as they were.
      // Re-based 2026-11-25 (#1493) when `include` made the denominator every
      // source file: 76.39/71.62/77.01/77.19 (test-loaded files only) became
      // 72.86/69.03/73.82/73.45 (stmts/branches/funcs/lines). Same code, honest
      // number; the floors below are those, floored to the integer.
      thresholds: {
        statements: 72,
        branches: 69,
        functions: 73,
        lines: 73,
      },
    },
  },
})
