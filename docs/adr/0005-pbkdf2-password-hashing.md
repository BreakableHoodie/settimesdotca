---
title: "ADR-0005: Use PBKDF2-SHA256 via Web Crypto API instead of bcrypt for password hashing"
status: "Accepted"
date: "2026-05-14"
authors: "Platform Engineering"
tags: ["architecture", "security", "authentication", "cloudflare-workers", "cryptography"]
supersedes: "adr-0001-web-crypto-pbkdf2.md"
superseded_by: ""
---

## Status

Accepted

> **Supersedes** [`adr-0001-web-crypto-pbkdf2.md`](./adr-0001-web-crypto-pbkdf2.md) — that record was "Proposed" and referenced the wrong implementation file (`functions/utils/auth.js`). The canonical implementation is `functions/utils/crypto.js`.

## Context

SetTimes runs all backend logic inside Cloudflare Workers V8 isolates. That runtime has two constraints directly relevant to password hashing:

**No native binary addons.** Workers isolates do not support Node.js native modules (`.node` files). bcrypt, Argon2, and scrypt all depend on native binaries to achieve production-safe work factors — pure-JavaScript implementations of these algorithms are too slow to be secure at practical iteration counts without exceeding Workers resource limits.

**CPU time metering.** Workers meter JavaScript execution time and enforce per-request CPU limits. Free-plan Workers are constrained to approximately 10 ms of metered CPU time; paid plans have higher but still bounded limits. A pure-JavaScript password hash at a secure work factor (e.g., bcrypt cost 12, Argon2 with 64 MiB memory) consumes enough CPU to trigger Cloudflare error 1102 ("Worker exceeded resource limits") on sensitive plan configurations.

The Web Crypto API (`crypto.subtle`) is available natively in the Workers runtime. `crypto.subtle.deriveBits()` with PBKDF2 executes in native V8 code **outside** the metered JavaScript CPU budget, making it the only practical path to a work-factored password hash in this environment.

The implementation lives in `functions/utils/crypto.js` and exports `hashPassword` and `verifyPassword`. A legacy hash format (`salt:hash` without algorithm prefix) exists in the database from pre-`pbkdf2$` code; `verifyPassword` handles it transparently for backward compatibility.

## Decision

Use PBKDF2-SHA256 via `crypto.subtle.deriveBits()` with 100,000 iterations for all new password hashes.

Hash storage format:

```
pbkdf2$<iterations>$<base64url-salt>$<base64url-hash>
```

Implementation constants in `functions/utils/crypto.js`:

| Constant             | Value    | Purpose                                                  |
| -------------------- | -------- | -------------------------------------------------------- |
| `SALT_LENGTH`        | 16 bytes | Per-password random salt from `crypto.getRandomValues()` |
| `DEFAULT_ITERATIONS` | 100,000  | Work factor for new hashes                               |
| `KEY_LENGTH`         | 32 bytes | Derived key length (256 bits)                            |

Comparison is performed with a constant-time `timingSafeEqual` function to prevent timing side-channels. The iteration count is embedded in the stored hash string so future iteration increases can be handled transparently via rehash-on-login without requiring a forced password reset.

No bcrypt or Argon2 dependency may be introduced in `functions/`. The `better-sqlite3` native module used in test helpers (Node.js environment only) must never be mistaken for a pattern to replicate in production Worker code.

## Consequences

### Positive

- **POS-001**: Password hashing completes reliably within Workers CPU limits on all plan tiers because `crypto.subtle` executes outside the metered JavaScript budget.
- **POS-002**: Zero additional runtime dependencies — the implementation relies exclusively on the Web Crypto API that is already available in the Workers global scope.
- **POS-003**: The iteration count is stored in the hash string, enabling transparent work-factor upgrades via rehash-on-login without a global password reset.
- **POS-004**: Timing-safe comparison (`timingSafeEqual`) is implemented inline, eliminating the risk of a timing side-channel in the verification path.
- **POS-005**: Legacy `salt:hash` format from pre-migration hashes is handled gracefully in `verifyPassword`, avoiding a forced migration event for existing users.

### Negative

- **NEG-001**: PBKDF2-SHA256 is not memory-hard. Under equivalent attacker resources, it provides weaker resistance to GPU or ASIC cracking than Argon2id, which is the OWASP-preferred algorithm for a non-constrained runtime.
- **NEG-002**: The 100,000 iteration count is a platform-constrained compromise, not a security-optimized choice. OWASP recommends Argon2id with 19 MiB memory and 2 iterations as the primary recommendation.
- **NEG-003**: If the deployment platform ever moves to a standard Node.js runtime, this decision should be revisited — the Workers constraint that necessitated it no longer applies.
- **NEG-004**: `LEGACY_ITERATIONS` is currently defined at the same value as `DEFAULT_ITERATIONS` (100,000), so legacy hashes are indistinguishable by iteration count from new hashes. The legacy format is identified only by the absence of the `pbkdf2$` prefix.

## Alternatives Considered

##### bcrypt

- **ALT-001**: **Description**: Use bcrypt for password hashing (e.g., via the `bcryptjs` pure-JavaScript library or a native Node.js module).
- **ALT-002**: **Rejection Reason**: Native bcrypt binaries are not supported in Workers isolates. Pure-JavaScript bcrypt at a secure cost factor (≥12) executes inside the metered CPU budget and triggers error 1102 on constrained plan tiers. This makes the authentication path unreliable in production.

##### Argon2id

- **ALT-003**: **Description**: Use Argon2id, the OWASP-recommended algorithm for password hashing.
- **ALT-004**: **Rejection Reason**: Argon2 requires a native binary and is also memory-hard by design. Workers enforce per-request memory limits. Both the binary constraint and the memory-hardness property make Argon2 impractical in the current runtime. If the platform changes, Argon2id should be evaluated as the primary migration target.

##### scrypt

- **ALT-005**: **Description**: Use scrypt via Node.js `crypto.scrypt` or a compatible library.
- **ALT-006**: **Rejection Reason**: Same native binary constraint as bcrypt and Argon2. The Workers runtime does not expose `crypto.scrypt` — only the Web Crypto API subset.

##### SHA-256 without key stretching

- **ALT-007**: **Description**: Hash passwords with a single pass of SHA-256 (with or without a static salt).
- **ALT-008**: **Rejection Reason**: SHA-256 is a fast hash with no work factor. It is unacceptable for password storage under any threat model — a leaked database would be crackable with commodity hardware in seconds.

## Implementation Notes

- **IMP-001**: All password hashing and verification must go through `functions/utils/crypto.js`. Do not introduce a second implementation or inline `crypto.subtle.deriveBits()` calls elsewhere.
- **IMP-002**: Never introduce `bcrypt`, `argon2`, `scrypt`, or any native binary package as a dependency in `functions/`. These cannot load in the Workers runtime and will cause silent startup failures.
- **IMP-003**: `better-sqlite3` is used in test helpers under `Node.js` — this is acceptable in the test environment only. It must never appear in `functions/` production code.
- **IMP-004**: If the `DEFAULT_ITERATIONS` constant is increased in future, `LEGACY_ITERATIONS` must also be updated or versioned accordingly to preserve backward-compatible verification of older hashes.
- **IMP-005**: On a successful password verification for a legacy-format hash, consider triggering a rehash with `hashPassword()` and persisting the new `pbkdf2$` formatted hash to complete the migration transparently.
- **IMP-006**: On migration away from the Workers runtime, evaluate replacing this implementation with Argon2id (`argon2` npm package) using OWASP-recommended parameters: `type: argon2id`, `memoryCost: 65536` (64 MiB), `timeCost: 3`.

## References

- **REF-001**: `functions/utils/crypto.js` — canonical implementation (`hashPassword`, `verifyPassword`, `timingSafeEqual`).
- **REF-002**: `CLAUDE.md` — "PBKDF2, not bcrypt" section documents this invariant for AI assistants working in this codebase.
- **REF-003**: [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — recommends Argon2id as primary; PBKDF2-SHA256 at ≥600,000 iterations as FIPS-compliant fallback (our 100k reflects platform constraints, not a departure from intent).
- **REF-004**: [Cloudflare Workers Runtime APIs — Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) — documents `crypto.subtle` availability and its exclusion from the Workers CPU time meter.
- **REF-005**: [ADR-0003: Cloudflare D1 as Primary Database](./adr-0003-cloudflare-d1-primary-database.md) — background on the Cloudflare Workers hosting decision that creates this constraint.
