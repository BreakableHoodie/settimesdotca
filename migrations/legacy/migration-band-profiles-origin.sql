-- Migration: Add origin column to band_profiles

ALTER TABLE band_profiles ADD COLUMN origin TEXT;
