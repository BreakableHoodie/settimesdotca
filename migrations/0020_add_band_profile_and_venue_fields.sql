-- Add normalized origin, status, and contact info to band profiles
ALTER TABLE band_profiles ADD COLUMN origin_city TEXT;
ALTER TABLE band_profiles ADD COLUMN origin_region TEXT;
ALTER TABLE band_profiles ADD COLUMN contact_email TEXT;
ALTER TABLE band_profiles ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- Backfill origin parts from existing origin strings
UPDATE band_profiles
SET
  origin_city = CASE
    WHEN origin_city IS NULL AND origin IS NOT NULL AND instr(trim(origin), ',') > 0
      THEN trim(substr(trim(origin), 1, instr(trim(origin), ',') - 1))
    WHEN origin_city IS NULL AND origin IS NOT NULL
      THEN trim(origin)
    ELSE origin_city
  END,
  origin_region = CASE
    WHEN origin_region IS NULL AND origin IS NOT NULL AND instr(trim(origin), ',') > 0
      THEN trim(substr(trim(origin), instr(trim(origin), ',') + 1))
    ELSE origin_region
  END
WHERE origin IS NOT NULL AND (origin_city IS NULL OR origin_region IS NULL);

-- Add normalized address + contact info fields to venues
ALTER TABLE venues ADD COLUMN address_line1 TEXT;
ALTER TABLE venues ADD COLUMN address_line2 TEXT;
ALTER TABLE venues ADD COLUMN region TEXT;
ALTER TABLE venues ADD COLUMN postal_code TEXT;
ALTER TABLE venues ADD COLUMN country TEXT;
ALTER TABLE venues ADD COLUMN phone TEXT;
ALTER TABLE venues ADD COLUMN contact_email TEXT;

-- Backfill address_line1 from legacy address if present
UPDATE venues
SET address_line1 = CASE
  WHEN address_line1 IS NULL AND address IS NOT NULL THEN trim(address)
  ELSE address_line1
END
WHERE address IS NOT NULL AND address_line1 IS NULL;
