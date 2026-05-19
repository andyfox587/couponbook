-- Migration 0018: Add website_url to merchant.

ALTER TABLE "merchant"
  ADD COLUMN IF NOT EXISTS "website_url" varchar(500);
