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
      // Ratchet baseline measured 2026-07-04 (stmts 70.1 / branch 60.5 /
      // funcs 79.7 / lines 70.8). Thresholds are set to actuals minus a
      // margin for run-to-run variance. This blocks regressions without
      // being an aspiration — raise deliberately, never lower silently
      // (#478 item 9).
      thresholds: {
        statements: 68,
        branches: 58,
        functions: 77,
        lines: 68,
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
    include: ["functions/**/__tests__/**/*.test.js"],
  },
});
