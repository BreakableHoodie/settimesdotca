---
description: "Guidelines for writing Node.js and JavaScript code with Vitest testing"
applyTo: '**/*.js, **/*.mjs, **/*.cjs'
---

# Code Generation Guidelines

> **Scope: `e2e/` is exempt from the Vitest rules below.** That directory is
> the Playwright suite -- it runs against a real wrangler server and a seeded
> D1, which Vitest cannot provide. The `applyTo` glob above matches every
> `.js` file including `e2e/*.spec.js`, so without this note a reviewer
> correctly reads the rule as requiring Vitest there and files a finding on
> every E2E change. Playwright is the supported runner for `e2e/`; Vitest is
> the runner everywhere else.

## Coding standards
- Use JavaScript with ES2022 features and Node.js (20+) ESM modules
- Use Node.js built-in modules and avoid external dependencies where possible
- Ask the user if you require any additional dependencies before adding them
- Always use async/await for asynchronous code, and use 'node:util' promisify function to avoid callbacks
- Keep the code simple and maintainable
- Use descriptive variable and function names
- Do not add comments unless absolutely necessary, the code should be self-explanatory
- Never use `null`, always use `undefined` for optional values
- Prefer functions over classes

## Testing
- Use Vitest for testing
- Write tests for all new features and bug fixes
- Ensure tests cover edge cases and error handling
- NEVER change the original code to make it easier to test, instead, write tests that cover the original code as it is

## Documentation
- When adding new features or making significant changes, update the README.md file where necessary

## User interactions
- Ask questions if you are unsure about the implementation details, design choices, or need clarification on the requirements
- Always answer in the same language as the question, but use english for the generated content like code, comments or docs
