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
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
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
