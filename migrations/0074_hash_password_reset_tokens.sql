-- #1354: password reset tokens are stored hashed, like invite codes (0071)
-- and API keys.
--
-- password_reset_tokens.token held the plaintext token, a bearer credential:
-- whoever reads it can set that account's password. From here the plaintext
-- exists only in the emailed link; `token` holds 'sha256:' || lowercase-hex
-- SHA-256 of it (functions/utils/tokens.js hashResetToken), and both readers
-- hash what is submitted before looking it up.
--
-- Every existing row is retired rather than converted: SQLite cannot compute
-- SHA-256, and reset tokens live two hours, so an outstanding link costs at
-- most one re-sent reset. `token` becomes 'retired:<id>' (still unique; it can
-- never equal a SHA-256 digest of anything) and the row is marked used, so it
-- can never be redeemed by either spelling.
UPDATE password_reset_tokens
SET token = 'retired:' || id,
    used = 1,
    used_at = COALESCE(used_at, datetime('now'))
WHERE token NOT LIKE 'sha256:%';
