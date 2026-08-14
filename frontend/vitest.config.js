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
      // Ratchet baseline re-measured 2026-07-05 (stmts 59.68 / branch 52.23 /
      // funcs 62.05 / lines 60.71) after adding util tests in #519. Thresholds
      // are set to actuals minus a margin for run-to-run variance. This blocks
      // regressions without being an aspiration — raise deliberately, never
      // lower silently (#478 item 9, ratcheted by #519).
      thresholds: {
        statements: 57,
        branches: 50,
        functions: 60,
        lines: 58,
      },
    },
  },
})
