---
title: "ADR-0001: Use Web Crypto PBKDF2 for Password Hashing"
status: "Proposed"
date: "2026-04-02"
authors: "Platform Engineering, Application Engineering"
tags: ["architecture", "security", "authentication", "cloudflare-workers"]
supersedes: ""
superseded_by: ""
---

## Status

Proposed

## Context

SetTimes runs authentication logic inside Cloudflare Workers. That environment enforces strict CPU time limits, especially on the free plan, where requests are constrained to roughly 10 ms of metered CPU time, with higher but still bounded limits on paid plans.

Password hashing is part of the interactive login and account-management path, so the selected algorithm must be secure enough for production use while also completing reliably within the Workers execution model. In practice, pure-JavaScript implementations of modern password hashing libraries such as Argon2 and bcrypt execute inside the Worker CPU meter. Under free-plan limits, those implementations can trigger Cloudflare error 1102 before the request completes.

The platform does provide native Web Crypto primitives through `crypto.subtle`. PBKDF2-SHA256 via `crypto.subtle.deriveBits()` executes in native code rather than inside the JavaScript CPU budget. That creates a practical deployment constraint: the system needs a password hashing approach that is both acceptable from a security standpoint and operationally viable on all supported Cloudflare Workers plans.

The implementation target for this decision is the authentication utility layer centered on `functions/utils/auth.js`, which is responsible for the runtime authentication model used by the Workers API.

## Decision

Use Web Crypto PBKDF2 with SHA-256 and 100,000 iterations for password hashing in the Workers authentication layer.

The implementation will use `crypto.subtle.deriveBits()` with PBKDF2-SHA256 rather than a pure-JavaScript password hashing library. This decision is driven primarily by the Cloudflare Workers execution model: PBKDF2 through Web Crypto runs in native code outside the metered JavaScript CPU budget and avoids free-plan request failures caused by CPU-bound hashing implementations.

This is an explicitly pragmatic platform decision. Argon2 would be preferable in a less constrained runtime because of its memory-hard design, but the current hosting environment makes reliable execution a higher-order requirement. The chosen approach preserves deployability, avoids error 1102 failures, and still provides a standard, vetted password-based key derivation function with configurable work factor.

## Consequences

### Positive

- **POS-001**: Password hashing remains compatible with Cloudflare Workers CPU constraints and avoids free-plan request failures caused by pure-JavaScript hashing libraries.
- **POS-002**: The implementation depends only on native Web Crypto primitives already available in the runtime, which reduces dependency surface area and operational complexity.
- **POS-003**: The work factor remains configurable through the PBKDF2 iteration count, allowing future tuning if Cloudflare platform limits or performance budgets change.
- **POS-004**: Authentication behavior becomes predictable across free and paid Workers plans because the hashing step no longer depends on metered JavaScript execution time.

### Negative

- **NEG-001**: PBKDF2-SHA256 is not memory-hard, so it provides weaker resistance to GPU and ASIC cracking than Argon2 under equivalent attacker resources.
- **NEG-002**: The fixed iteration count of 100,000 is a compromise shaped by platform constraints rather than a purely security-optimized choice.
- **NEG-003**: Future migration to Argon2 or another stronger algorithm will require versioned hash storage and a rolling rehash strategy.
- **NEG-004**: Security reviewers may challenge the use of PBKDF2 in a modern system, so the rationale must remain documented and tied to verified platform limits.

## Alternatives Considered

### Argon2

- **ALT-001**: **Description**: Use an Argon2 password hashing implementation in the Workers runtime.
- **ALT-002**: **Rejection Reason**: Available Workers-compatible implementations execute in JavaScript and consume metered CPU time, which can trigger Cloudflare error 1102 under free-plan limits.

### bcrypt

- **ALT-003**: **Description**: Use bcrypt for password hashing in the Workers runtime.
- **ALT-004**: **Rejection Reason**: Workers-compatible bcrypt implementations are also CPU-bound in JavaScript and fail the same operational constraint as Argon2 in this environment.

### @noble/hashes

- **ALT-005**: **Description**: Use a pure-JavaScript key-derivation or hashing approach built from `@noble/hashes` primitives.
- **ALT-006**: **Rejection Reason**: The library would still execute inside the Worker CPU meter, so it does not solve the core platform limitation that causes hashing-related request failures.

### Do Nothing

- **ALT-007**: **Description**: Keep or introduce a stronger pure-JavaScript password hashing implementation and accept runtime failures on constrained plans.
- **ALT-008**: **Rejection Reason**: This would make authentication reliability dependent on plan tier and traffic characteristics, which is not acceptable for the production login path.

## Implementation Notes

- **IMP-001**: Implement password hashing and verification with `crypto.subtle.deriveBits()` using PBKDF2-SHA256 and 100,000 iterations in the authentication utility layer centered on `functions/utils/auth.js`.
- **IMP-002**: Store a per-password random salt and encode enough metadata with each hash to support future algorithm or iteration upgrades without forcing an immediate global password reset.
- **IMP-003**: Add a versioned hash format so the system can later support rehash-on-login if platform constraints loosen or a stronger algorithm becomes operationally feasible.
- **IMP-004**: Measure end-to-end login and password-reset performance in the Workers runtime to confirm the chosen iteration count stays within acceptable latency and CPU budgets.

## References

- **REF-001**: Authentication utility target: `functions/utils/auth.js`
- **REF-002**: Related security review: `docs/code-review/2026-04-02-security-review.md`
- **REF-003**: Cloudflare Workers platform constraint described in decision context: CPU time limits and error 1102 behavior for CPU-bound JavaScript work.
