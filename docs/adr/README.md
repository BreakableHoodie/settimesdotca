# Architecture Decision Records

This directory holds settimes.ca's Architecture Decision Records (ADRs) — short documents capturing a significant technical decision, its context, and its consequences. ADRs are **historical**: once written they are not rewritten, only superseded by a later ADR.

## Numbering

ADRs form a single sequence, `ADR-0001` … `ADR-NNNN`. Each record's `title:` number matches its filename number.

> **Note on filenames:** the first three records use an `adr-000N-…` prefix; records from 0004 on use the plainer `000N-…` form. Both are valid historical filenames — do **not** rename them (other docs and the docs-site nav reference them by path). New ADRs should use `NNNN-kebab-title.md` (no `adr-` prefix), continuing from `0009`.

## Index

| ADR                                                  | Title                                                                     | Status                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| [0001](./adr-0001-web-crypto-pbkdf2.md)              | Use Web Crypto PBKDF2 for password hashing                                | Superseded by [0005](./0005-pbkdf2-password-hashing.md) |
| [0002](./adr-0002-trusted-device-storage.md)         | Store trusted-device tokens in D1 rather than signed JWTs                 | Proposed                                                |
| [0003](./adr-0003-cloudflare-d1-primary-database.md) | Use Cloudflare D1 as the primary database                                 | Proposed                                                |
| [0004](./0004-sqlite-datetime-format.md)             | Normalize datetime values to space-separated SQLite format before storage | Accepted                                                |
| [0005](./0005-pbkdf2-password-hashing.md)            | Use PBKDF2-SHA256 via Web Crypto instead of bcrypt for password hashing   | Accepted                                                |
| [0006](./0006-d1-batch-atomicity.md)                 | Use `DB.batch()` for atomic multi-statement mutations; no BEGIN/COMMIT    | Accepted                                                |
| [0007](./0007-after-midnight-sort-threshold.md)      | Offset band sort times by +24h for performances starting before 6 AM      | Accepted                                                |
| [0008](./0008-coderabbit-review-configuration.md)    | Encode repository invariants as CodeRabbit path instructions              | Accepted                                                |

ADR-0001 and ADR-0005 both cover PBKDF2 password hashing: 0001 is the original record, superseded by the fuller 0005 (which points at the canonical implementation, `functions/utils/crypto.js`).

## Writing a new ADR

Copy the shape of an existing record: frontmatter (`title`, `status`, `date`), then **Context → Decision → Consequences**. Start `status: "Proposed"`, move to `"Accepted"` when adopted, and mark a record `"Superseded"` with a link forward rather than editing its decision after the fact.
