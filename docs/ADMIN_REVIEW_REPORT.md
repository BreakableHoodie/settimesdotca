# Admin Console & Security Review Report

## Executive Summary

A comprehensive review of the Admin Console and Security infrastructure was conducted. Critical issues regarding schema mismatches (V1 vs V2) were identified and resolved. The backend API endpoints for Band and Performance management were rewritten to align with the new `band_profiles` and `performances` schema. Frontend API utilities were updated to support these changes. Legacy branding was removed from documentation.

## Key Findings & Resolutions

### 1. Schema Mismatch (Critical)

- **Issue:** The backend API endpoints `functions/api/admin/bands.js` and `functions/api/admin/performers.js` were querying legacy tables (`bands`, `performers`) that are no longer part of the V2 schema.
- **Resolution:**
  - Rewrote `functions/api/admin/performers.js` to interact with the `band_profiles` table.
  - Rewrote `functions/api/admin/bands.js` to interact with the `performances` table, joining with `band_profiles` and `venues` to provide the expected data structure.

### 2. Frontend/Backend Disconnect (Major)

- **Issue:** The frontend component `PerformersManager.jsx` relied on `performersApi` methods that were missing from the `frontend/src/utils/adminApi.js` utility file.
- **Resolution:** Added the missing `performersApi` object to `frontend/src/utils/adminApi.js`, enabling full CRUD operations for the Global Performer Registry.

### 3. Security & RBAC (Verified)

- **Status:** The `functions/api/admin/_middleware.js` correctly implements Role-Based Access Control (RBAC).
- **Mechanism:**
  - Session tokens are verified against the `sessions` table.
  - Role hierarchy (`admin` > `editor` > `viewer`) is enforced.
  - `bands.js` and `performers.js` correctly call `checkPermission` with appropriate levels (`viewer` for GET, `editor` for modifications).

### 4. Legacy Branding (Cleanup)

- **Issue:** Documentation contained outdated references to "Long Weekend Band Crawl".
- **Resolution:** Updated `README.md`, `docs/DATABASE.md`, `docs/admin/README.md`, and `docs/SESSION_MANAGEMENT.md` to use the platform name "SetTimes".

## Technical Debt & Recommendations

### 1. Frontend Payload Structure

- **Observation:** The `BandsTab.jsx` component sends a "mixed" payload containing both performance details (time, venue) and band profile details (name, genre).
- **Recommendation:** In a future sprint, refactor the UI to clearly separate "Select Band" (from registry) and "Edit Band Profile" (global change). The current backend implementation handles the mixed payload gracefully but implicitly updates the global profile, which might be a UX side effect.

### 2. Database Cleanup

- **Observation:** Legacy tables (`bands`, `performers`) might still exist in some environments if migrations weren't applied cleanly.
- **Recommendation:** Ensure `database/schema-final.sql` is the single source of truth and that fresh deployments use it.

### 3. Testing

- **Recommendation:** Perform end-to-end testing of the "Add Band" and "Manage Performers" flows in the Admin Console to verify the new API integration.

## Conclusion

The Admin Console backend is now fully aligned with the V2 database schema. Security controls are in place, and the codebase is cleaner and more consistent.
