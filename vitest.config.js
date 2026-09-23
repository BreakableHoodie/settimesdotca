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
      reporter: ["text", "json", "html", "json-summary"],
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
      // Raised 2026-09-09 from 75/68/84/76 by scripts/check-coverage-drift.mjs,
      // which now FAILS when actual outruns these by more than 3 points -- so
      // this block cannot silently decay a third time.
      // Re-baselined for @vitest/coverage-v8 5 (#1176), measured 2026-09-22 on
      // IDENTICAL source and tests. Read the denominators, not the percentages:
      // v5 instruments more of the same code, and every COVERED count went up.
      //
      //   metric      v4                    v5                    old  new
      //   statements  86.89% (5564/6403)    85.30% (5723/6709)     85   84
      //   branches    79.14% (3959/5002)    77.60% (4076/5252)     77   76
      //   functions   96.39%  (641/665)     91.52%  (680/743)      94   90
      //   lines       87.36% (5351/6125)    85.82% (5492/6399)     85   84
      //
      // Headroom is kept at the previous ~1.3-1.8 points, so the ratchet is as
      // strict as before. A lower number here is NOT a coverage regression.
      thresholds: {
        statements: 84,
        branches: 76,
        functions: 90,
        lines: 84,
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
    // workers-mcp-server/ holds the MCP Worker deployed against the PRODUCTION
    // database. Its read-only guard is the only thing bounding what a token
    // holder can do, so it is unit-tested here rather than left to a separate
    // runner nobody invokes.
    include: [
      "functions/**/__tests__/**/*.test.js",
      "scripts/**/__tests__/**/*.test.js",
      "workers-mcp-server/__tests__/**/*.test.js",
    ],
  },
});
