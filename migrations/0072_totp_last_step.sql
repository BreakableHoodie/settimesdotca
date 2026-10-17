-- One accepted TOTP code per time step per user (#1333, RFC 6238 section 5.2).
--
-- totp_last_step is the TOTP time-step counter of the last code accepted for
-- this user. NULL means none yet. A code is accepted only when its matched step
-- is greater than this value, and the step is recorded with a conditional
-- UPDATE so two concurrent uses of one code cannot both win. Any path that
-- writes a NEW totp_secret (setup, disable, admin reset) sets it back to NULL.
ALTER TABLE users ADD COLUMN totp_last_step INTEGER;
