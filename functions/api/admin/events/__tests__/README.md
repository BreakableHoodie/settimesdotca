Running admin events tests

These tests use an in-memory SQLite database (better-sqlite3) wrapped with a tiny adapter
to emulate Cloudflare D1's `.prepare(...).bind(...).first()/all()/run()` API.

How to run the focused tests (examples):

```bash
# Run the events admin tests only
npx vitest functions/api/admin/events/__tests__/events.test.js --run

# Run admin bands tests
npx vitest functions/api/admin/bands/__tests__/bands.test.js --run
```

Best practice: run single-file tests while iterating to keep feedback focused.
