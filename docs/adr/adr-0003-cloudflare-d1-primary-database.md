---
title: "ADR-0003: Use Cloudflare D1 as the Primary Database"
status: "Proposed"
date: "2026-04-02"
authors: "Platform Engineering, Application Engineering"
tags: ["architecture", "database", "cloudflare", "d1", "sqlite"]
supersedes: ""
superseded_by: ""
---

## Status

Proposed

## Context

SetTimes runs entirely on Cloudflare Pages and Cloudflare Workers. The primary data store therefore needs to fit an edge-hosted, serverless execution model where request startup cost, operational simplicity, and deployment ergonomics matter more than deep database feature breadth.

The application data model is relational. It stores events, venues, performances, users, trusted devices, audit records, and related administrative data that are naturally modeled with foreign keys and transactional SQL operations. At the same time, the workload is not dominated by high-volume concurrent writes. Read performance, low-latency access from Workers, and straightforward production operations are more important than advanced Postgres-specific capabilities.

Cloudflare D1 is natively integrated with Pages Functions and Workers through Wrangler bindings. That means the runtime can access the database as `env.DB` without managing connection pools, external credentials at the application layer, or database client startup overhead on cold requests. The repository already reflects this deployment model in `wrangler.toml` and the D1 setup and migration guidance under `docs/D1_SETUP.md`.

Alternative managed edge-accessible databases exist, but each introduces trade-offs that are not aligned with the current application profile. Turso would add another vendor and control plane. Neon Postgres would introduce cross-network latency from Workers to Postgres and would require the team to reason about connection management patterns that D1 avoids. PlanetScale would satisfy the relational model but imposes a higher cost profile than is justified for the current scale and workload.

## Decision

Use Cloudflare D1, backed by SQLite semantics, as the primary application database. Access it through Wrangler-provided `DB` bindings and raw SQL queries executed from Pages Functions and Workers.

This decision is driven by runtime alignment and operational simplicity. D1 is the most direct fit for an application already hosted fully on Cloudflare. It removes the need for connection pooling, avoids extra cold-start overhead from initializing third-party database clients, and keeps application and database deployment concerns within a single platform boundary.

The application will continue to use raw SQL via the D1 binding rather than introducing an ORM as the primary persistence abstraction. The existing schema and query patterns are already SQL-oriented, and raw SQL keeps query behavior explicit while avoiding another abstraction layer in a codebase that values predictable Workers execution and simple deployment mechanics.

## Consequences

### Positive

- **POS-001**: Database access stays natively integrated with the Cloudflare runtime, which simplifies deployment and reduces platform surface area.
- **POS-002**: The application avoids connection pooling and connection lifecycle management, which removes a common operational failure mode for serverless workloads.
- **POS-003**: Read-heavy relational workloads remain a good fit for SQLite-backed D1, especially for event discovery, admin lookups, and API reads.
- **POS-004**: Raw SQL keeps queries explicit and easy to inspect during reviews, migrations, and incident analysis.
- **POS-005**: Using the same platform for hosting, bindings, and database access minimizes cold-start friction and configuration complexity.

### Negative

- **NEG-001**: D1 does not provide full-text search capabilities comparable to a dedicated search engine or a more feature-rich relational database extension ecosystem.
- **NEG-002**: SQLite-backed write behavior means concurrent write throughput is more limited than a horizontally scaled Postgres or MySQL deployment.
- **NEG-003**: SQLite type affinity rules require discipline in schema design and query handling because type coercion behavior is looser than strongly typed Postgres columns.
- **NEG-004**: The system becomes more coupled to Cloudflare’s database platform, which raises migration cost if hosting requirements change later.
- **NEG-005**: Some advanced database features available in Postgres ecosystems, such as richer indexing extensions and more mature analytical capabilities, remain out of reach without supplementary systems.

## Alternatives Considered

### Turso

- **ALT-001**: **Description**: Use Turso as a distributed SQLite service while keeping the application on Cloudflare Pages and Workers.
- **ALT-002**: **Rejection Reason**: Turso would add a second infrastructure vendor and operational surface without solving a pressing capability gap for the current workload.

### Neon Postgres

- **ALT-003**: **Description**: Use Neon Postgres as the primary relational database for the application.
- **ALT-004**: **Rejection Reason**: Access from Workers would add network latency relative to D1 and reintroduce connection management and pooling concerns that are specifically undesirable in this runtime model.

### PlanetScale

- **ALT-005**: **Description**: Use PlanetScale as the primary relational database with MySQL-compatible semantics.
- **ALT-006**: **Rejection Reason**: PlanetScale would satisfy the relational model, but its cost profile is not justified for the current scale and the application does not require enough differentiated capability to offset that cost.

### Do Nothing

- **ALT-007**: **Description**: Delay standardizing on a primary database and continue treating persistence choices as provisional.
- **ALT-008**: **Rejection Reason**: This would keep deployment and schema decisions ambiguous, making migrations, operational guidance, and future feature work harder to reason about.

## Implementation Notes

- **IMP-001**: Continue binding the primary database as `DB` in `wrangler.toml` so Pages Functions and Workers can access D1 through the native Cloudflare runtime interface.
- **IMP-002**: Keep schema evolution in numbered SQL migrations and continue using explicit SQL statements instead of introducing an ORM-first persistence layer.
- **IMP-003**: Document SQLite-specific constraints, including datetime storage patterns and type affinity expectations, in database-facing implementation notes and reviews.
- **IMP-004**: Monitor read latency, write contention, and query hotspots so the team can detect when the workload begins to outgrow D1’s concurrency model.
- **IMP-005**: Re-evaluate search requirements separately if public discovery features or admin workflows begin to need true full-text indexing.

## References

- **REF-001**: Cloudflare configuration and D1 binding: `wrangler.toml`
- **REF-002**: D1 setup and operational guidance: `docs/D1_SETUP.md`
- **REF-003**: Project architecture summary: `README.md`
