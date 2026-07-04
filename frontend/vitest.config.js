import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

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
      // Ratchet baseline measured 2026-07-04 (stmts 57.45 / branch 50.29 /
      // funcs 60.85 / lines 58.44). Thresholds are set to actuals minus a
      // margin for run-to-run variance. This blocks regressions without
      // being an aspiration — raise deliberately, never lower silently
      // (#478 item 9).
      thresholds: {
        statements: 55,
        branches: 48,
        functions: 58,
        lines: 56,
      },
    },
  },
})
