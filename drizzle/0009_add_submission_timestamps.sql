-- Migration: Add updated_at and reviewed_at timestamps to coupon_submission
-- updated_at tracks when merchants edit their pending submissions
-- reviewed_at tracks when a group admin or super admin makes an approval/rejection decision

ALTER TABLE "coupon_submission" ADD COLUMN IF NOT EXISTS "updated_at" timestamp;
ALTER TABLE "coupon_submission" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp;
