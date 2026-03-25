-- Migration: Add review lifecycle columns to event_submission
-- Mirrors the coupon_submission columns for updated_at, reviewed_at, rejection_message

ALTER TABLE "event_submission"
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "rejection_message" TEXT;
