// Root ESLint configuration for backend (functions/) and scripts/
// Frontend has its own config at frontend/eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  // --- Global ignores ---
  {
    ignores: [
      "node_modules/**",
      "frontend/**",
      "docs/**",
      "database/**",
      "chatmodes/**",
      "instructions/**",
      "coverage/**",
      "dist/**",
      "public/**",
      ".wrangler/**",
    ],
  },

  // --- @eslint/js recommended base (no-undef, no-unused-vars, no-unreachable, …) ---
  js.configs.recommended,

  // --- Cloudflare Workers (functions/) ---
  {
    files: ["functions/**/*.js", "functions/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Full Cloudflare Workers / Service Worker runtime (fetch, Request, Response,
        // URL, URLSearchParams, crypto, caches, TextEncoder, btoa, …)
        ...globals.worker,
        // Node-style globals used in some CF contexts / wrangler shims
        process: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      // Unused vars: warn, allow _-prefixed args and caught errors
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // Allow == null / != null — the intentional "null or undefined" check idiom
      eqeqeq: ["error", "always", { null: "ignore" }],

      // CF Workers uses console.log for production worker logs — not a debug smell here
      "no-console": "off",

      // require-await: off — async-without-await is idiomatic in CF Workers for
      // functions that return Promises without needing to await anything internally
      "require-await": "off",

      "prefer-const": "warn",
      "no-var": "error",

      // Security: block dynamic code execution
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Code quality
      "no-throw-literal": "error",
      "no-async-promise-executor": "error",
    },
  },

  // --- Node.js scripts (scripts/) ---
  {
    files: ["scripts/**/*.js", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": "off",
      "require-await": "off",
      "prefer-const": "warn",
      "no-var": "error",
    },
  },

  // --- Test files: add Vitest + Node globals on top of the above ---
  {
    files: [
      "functions/**/__tests__/**/*.js",
      "functions/**/*.test.js",
      "scripts/**/*.test.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node, // provides `global`, `process`, etc. (used in mocks)
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },
  },

  // --- Prettier compatibility: disable formatting rules that conflict with prettier ---
  prettier,
];
