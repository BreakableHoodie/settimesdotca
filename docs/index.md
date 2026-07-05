# SetTimes Docs

SetTimes.ca is a multi-venue, multi-artist event platform for **Waterloo Region** (Kitchener-Waterloo, ON). It's a Cloudflare Pages application — React frontend, Cloudflare Pages Functions API, and a D1 (SQLite-compatible) database — built to run real music festivals: schedules, band profiles, venue maps, and an admin backend for the organizers running the show.

This site is generated from the Markdown in [`docs/`](https://github.com/BreakableHoodie/settimesdotca/tree/main/docs) in the main repository — if something here looks stale, the fix belongs there (use the "Edit this page" link in the header).

## Start here

**New to the project?**

- [Quick Start](QUICK_START.md) — clone, install, and get a local dev environment running in about 10 minutes
- [Contributing](CONTRIBUTING.md) — local development workflow and conventions

**Understanding how it's built:**

- [Backend Framework](BACKEND_FRAMEWORK.md) — Cloudflare Pages Functions structure and patterns
- [Database](DATABASE.md) — D1 schema, tables, and migration source of truth

**Working with the API:**

- [API Documentation](API_DOCUMENTATION.md) — REST API reference
- [Interactive OpenAPI Explorer](api-reference/openapi.md) — browse and try endpoints against the live spec

**Running or administering an event:**

- [Admin Handbook](ADMIN_HANDBOOK.md) — system administrator guide
- [User Guide](USER_GUIDE.md) — event organizer guide

Looking for something else? Use the search bar above, or browse the full navigation on the left — it covers architecture, operations, the design system, and the project's [Architecture Decision Records](adr/0004-sqlite-datetime-format.md).

The canonical, actively-maintained roadmap lives at [Roadmap](ROADMAP.md).
