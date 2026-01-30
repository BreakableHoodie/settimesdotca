-- Add first/last name fields to users
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;

-- Backfill from name when available
UPDATE users
SET
  first_name = CASE
    WHEN first_name IS NULL AND name IS NOT NULL AND instr(trim(name), ' ') > 0
      THEN substr(trim(name), 1, instr(trim(name), ' ') - 1)
    WHEN first_name IS NULL AND name IS NOT NULL
      THEN trim(name)
    ELSE first_name
  END,
  last_name = CASE
    WHEN last_name IS NULL AND name IS NOT NULL AND instr(trim(name), ' ') > 0
      THEN trim(substr(trim(name), instr(trim(name), ' ') + 1))
    ELSE last_name
  END
WHERE name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);
