import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  js.configs.recommended,
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      '.wrangler/**',
      '**/*.min.js',
      'vite.config.js',
      'vitest.config.js',
      'tailwind.config.js',
      'postcss.config.js',
      'eslint.config.js',
      'lighthouserc.json',
      'public/**',
      'scripts/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        Date: 'readonly',
        Number: 'readonly',
        Array: 'readonly',
        AbortController: 'readonly',
        URL: 'readonly',
        vi: 'readonly',
        global: 'readonly',
        process: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        performance: 'readonly',
        PerformanceObserver: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React rules
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Not needed in React 17+
      'react/prop-types': 'off', // Using TypeScript types instead

      // React Hooks rules
      ...reactHooks.configs.recommended.rules,

      // Accessibility rules
      ...jsxA11y.configs.recommended.rules,

      // General rules
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      
      // Accessibility - temporarily relaxed during cleanup
      'jsx-a11y/label-has-associated-control': ['warn', {
        'labelComponents': [],
        'labelAttributes': ['htmlFor'],
        'controlComponents': [],
        'assert': 'both',
        'depth': 3,
      }],
    },
  },
  prettier, // Must be last to override other configs
]
