---
title: "ADR-0002: Store Trusted Device Tokens in D1 Rather Than Using Signed JWTs"
status: "Proposed"
date: "2026-04-02"
authors: "Platform Engineering, Security Engineering"
tags: ["architecture", "security", "authentication", "mfa", "trusted-devices"]
supersedes: ""
superseded_by: ""
---

## Status

Proposed

## Context

The SetTimes admin authentication flow supports a remember-device feature that can bypass repeated MFA challenges for previously trusted devices. That feature creates a long-lived trust artifact, so the design must support targeted revocation when trust changes.

The operational requirements are explicit:

- individual trusted devices must be revocable on password change
- individual trusted devices must be revocable after suspicious activity
- individual trusted devices must be revocable at user request or administrative request
- trusted-device state should support auditability and lifecycle management

Signed JWTs are attractive because they avoid a database lookup, but they are stateless and do not support per-device revocation without introducing a separate blocklist or revocation registry. That would reintroduce state and complexity while also complicating expiration handling and operational cleanup.

The current implementation already models trusted devices as rows in D1 and stores expiry using SQLite-compatible datetime strings so the runtime can safely compare values with `datetime('now')`. The relevant implementation and schema artifacts are `functions/utils/trustedDevice.js` and `migrations/0030_trusted_devices.sql`.

## Decision

Store trusted device tokens as rows in the `trusted_devices` table in D1 rather than issuing signed JWTs.

Each trusted device will be represented by a database row containing the user reference, token material, device validation attributes, audit metadata, and an `expires_at` value stored in SQLite datetime text format. Validation will be performed by lookup on each authentication request rather than by self-contained token verification alone.

This design is chosen because revocation is a first-class requirement. Database-backed trusted-device records allow the system to revoke one device, all devices for a user, or expired devices deterministically without introducing a separate blocklist mechanism. Storing `expires_at` in SQLite datetime format also keeps database-side expiration checks safe and predictable when compared against `datetime('now')`.

## Consequences

### Positive

- **POS-001**: Individual trusted devices can be revoked directly by deleting or updating a single D1 row.
- **POS-002**: Global revocation on password reset, MFA reconfiguration, or suspicious activity is straightforward because all trusted-device state is centralized in one table.
- **POS-003**: The system gains an auditable per-device record including creation time, last use, IP address, and user agent metadata.
- **POS-004**: Expiration checks can be enforced server-side with a simple lookup against `expires_at > datetime('now')`, which avoids ambiguity about token validity.

### Negative

- **NEG-001**: Every trusted-device validation requires a D1 lookup, which adds latency and creates a dependency on database availability for this auth path.
- **NEG-002**: The feature is no longer stateless, so it requires schema management, cleanup, and retention handling.
- **NEG-003**: The system must protect the trusted-device table as sensitive authentication state because compromise of stored token material would weaken MFA trust guarantees.
- **NEG-004**: The implementation is operationally more complex than a simple signed token cookie because it includes lifecycle management, validation metadata, and cleanup paths.

## Alternatives Considered

### Signed JWTs

- **ALT-001**: **Description**: Issue signed JWTs to represent trusted devices and validate them locally without a database lookup.
- **ALT-002**: **Rejection Reason**: JWTs are stateless and cannot be revoked per device without adding a blocklist or equivalent revocation store, which reintroduces state and complexity while weakening the simplicity argument.

### Encrypted Cookies Only

- **ALT-003**: **Description**: Store trusted-device state exclusively in encrypted cookies without a server-side device record.
- **ALT-004**: **Rejection Reason**: This approach does not provide a per-device audit trail or a reliable server-side inventory of active trusted devices, which makes targeted revocation and forensic review materially weaker.

### Do Nothing

- **ALT-005**: **Description**: Avoid implementing a persistent remember-device feature and require MFA on every login.
- **ALT-006**: **Rejection Reason**: This would simplify security state management but does not meet the intended usability requirement for remembered devices in the admin authentication flow.

## Implementation Notes

- **IMP-001**: Keep trusted-device records in `trusted_devices` with `expires_at` stored in SQLite datetime text format so comparisons against `datetime('now')` remain lexicographically correct.
- **IMP-002**: Validate trusted-device cookies by lookup on every auth request in `functions/utils/trustedDevice.js` rather than by stateless signature verification alone.
- **IMP-003**: Preserve targeted revocation helpers for both single-device and all-device invalidation so password reset and account-recovery flows can remove trust state immediately.
- **IMP-004**: Continue to index token, user, and expiry columns as defined in `migrations/0030_trusted_devices.sql` so lookup and cleanup paths remain efficient.

## References

- **REF-001**: Trusted device implementation: `functions/utils/trustedDevice.js`
- **REF-002**: Trusted device schema migration: `migrations/0030_trusted_devices.sql`
- **REF-003**: Related security review context: `docs/code-review/2026-03-10-settimes-security-review.md`