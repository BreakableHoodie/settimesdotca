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
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/', '*.config.js', 'dist/'],
      // Ratchet re-measured 2026-08-20 (stmts 65.22 / branch 58.84 /
      // funcs 67.44 / lines 65.82). Thresholds are set to actuals minus a
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
      thresholds: {
        statements: 63,
        branches: 56,
        functions: 65,
        lines: 63,
      },
    },
  },
})
