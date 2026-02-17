-- Migration: Add Airbnb channel support
-- Run this in Supabase SQL Editor if you already have the database set up

-- 1. Add airbnb_url column to hotels table
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS airbnb_url text;

-- 2. Update the channel check constraint on review_snapshots
-- First drop the old constraint, then add the new one
ALTER TABLE review_snapshots DROP CONSTRAINT IF EXISTS review_snapshots_channel_check;
ALTER TABLE review_snapshots ADD CONSTRAINT review_snapshots_channel_check
  CHECK (channel IN ('google', 'tripadvisor', 'expedia', 'booking', 'airbnb'));
