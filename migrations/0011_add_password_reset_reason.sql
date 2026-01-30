-- Add reason column to password_reset_tokens for admin-initiated resets
ALTER TABLE password_reset_tokens
ADD COLUMN reason TEXT;
