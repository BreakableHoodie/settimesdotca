import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 10000,
    server: {
      deps: {
        inline: ["better-sqlite3"]
      }
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      // Ratchet re-measured 2026-08-20 (stmts 77.7 / branch 70.7 /
      // funcs 86.8 / lines 78.5). Thresholds are set to actuals minus a
      // margin for run-to-run variance. This blocks regressions without
      // being an aspiration — raise deliberately, never lower silently
      // (#478 item 9).
      //
      // The previous baseline (68/58/77/68, measured 2026-07-04) had drifted
      // ~10 points below actual, so it would have passed a ten-point
      // regression in silence. A ratchet only ratchets if it is re-measured
      // when coverage rises; treat re-measuring as part of adding tests.
      thresholds: {
        statements: 75,
        branches: 68,
        functions: 84,
        lines: 76,
      },
      exclude: [
        "node_modules/",
        "__tests__/",
        "mocks/",
        "*.config.js",
        "dist/",
        "frontend/",
        "backend/",
      ],
      include: ["functions/**/*.js"],
      reportsDirectory: "./coverage",
    },
    // `scripts/` is included so repo tooling (e.g. the streaming-link identity
    // audit) can be unit-tested. Coverage stays scoped to `functions/**` via
    // coverage.include above, so a script entering the test set does not move
    // the ratchet denominator.
    include: ["functions/**/__tests__/**/*.test.js", "scripts/**/__tests__/**/*.test.js"],
  },
});
