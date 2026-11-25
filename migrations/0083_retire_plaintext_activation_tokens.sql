-- #1482: activation tokens are stored hashed, like invite codes (0071) and
-- password reset tokens (0074).
--
-- users.activation_token held the plaintext token, a bearer credential that
-- activates an account. From here it holds 'sha256:' || lowercase-hex SHA-256
-- of the token (functions/utils/tokens.js hashStoredToken), and activate.js
-- hashes what is submitted before looking it up.
--
-- Existing tokens are cleared rather than converted: SQLite cannot compute
-- SHA-256, and a token lives 24 hours. A pending invitee asks for a new link
-- (POST /api/auth/resend-activation). Production had none pending on
-- 2026-11-24.
UPDATE users
SET activation_token = NULL,
    activation_token_expires_at = NULL
WHERE activation_token IS NOT NULL
  AND activation_token NOT LIKE 'sha256:%';
