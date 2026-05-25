-- Migration: Multi-tier subscription pricing
-- Allows a single coupon_book group to have multiple Stripe Prices
-- (e.g. monthly + 6mo + annual) all backed by one Stripe Product.

-- 1. Drop the "exactly one active price per group" constraint.
--    With multi-tier, a subscription group can have many active prices.
DROP INDEX IF EXISTS "coupon_book_price_group_active_idx";

-- 2. Add tier metadata columns.
ALTER TABLE "coupon_book_price" ADD COLUMN IF NOT EXISTS "label" varchar(64);
ALTER TABLE "coupon_book_price" ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;
ALTER TABLE "coupon_book_price" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;
ALTER TABLE "coupon_book_price" ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'active' NOT NULL;

-- 3. Promote any pre-existing single active row to the group's default tier.
UPDATE "coupon_book_price"
   SET "is_default" = true,
       "status" = 'active'
 WHERE "is_active" = true
   AND "archived_at" IS NULL;

-- 4. Partial unique index: at most one default tier per group while active.
CREATE UNIQUE INDEX IF NOT EXISTS "coupon_book_price_group_default_idx"
  ON "coupon_book_price" ("group_id")
  WHERE "is_default" = true AND "status" = 'active';
