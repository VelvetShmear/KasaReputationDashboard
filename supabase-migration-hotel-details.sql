-- Migration: Add google_url, state, num_keys, hotel_type columns to hotels table
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard → SQL Editor → New Query)

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS google_url text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS num_keys integer;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS hotel_type text;
