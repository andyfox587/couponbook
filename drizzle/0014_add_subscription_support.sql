-- Migration 0014: Add subscription support
-- Adds billing_model to foodie_group, admin_grant to purchase_provider,
-- recurring cadence columns to coupon_book_price, and subscription lifecycle
-- columns to purchase. All changes are additive and non-destructive.

-- 1) New enum: billing_model
DO $$ BEGIN
  CREATE TYPE billing_model AS ENUM ('one_time', 'subscription');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Add billing_model column to foodie_group (default one_time, preserves existing rows)
ALTER TABLE "foodie_group"
  ADD COLUMN IF NOT EXISTS "billing_model" billing_model NOT NULL DEFAULT 'one_time';

-- 3) Add admin_grant value to purchase_provider enum
DO $$ BEGIN
  ALTER TYPE purchase_provider ADD VALUE IF NOT EXISTS 'admin_grant';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 4) Add recurring cadence columns to coupon_book_price
ALTER TABLE "coupon_book_price"
  ADD COLUMN IF NOT EXISTS "billing_interval" varchar(10),
  ADD COLUMN IF NOT EXISTS "billing_interval_count" integer,
  ADD COLUMN IF NOT EXISTS "stripe_recurring_price_id_test" varchar(255),
  ADD COLUMN IF NOT EXISTS "stripe_recurring_price_id_live" varchar(255);

-- 5) Add subscription lifecycle columns to purchase
ALTER TABLE "purchase"
  ADD COLUMN IF NOT EXISTS "gifted_by_user_id" uuid REFERENCES "user"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "subscription_status" varchar(32),
  ADD COLUMN IF NOT EXISTS "current_period_start" timestamp,
  ADD COLUMN IF NOT EXISTS "current_period_end" timestamp,
  ADD COLUMN IF NOT EXISTS "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "renewal_reminder_sent_at" timestamp;

-- 6) Partial index: active subscriptions (for fast lookup)
CREATE INDEX IF NOT EXISTS "idx_purchase_subscription_active"
  ON "purchase" ("group_id", "user_id")
  WHERE "subscription_status" IS NOT NULL AND "status" = 'paid';

-- 7) Partial index: upcoming renewal reminders
CREATE INDEX IF NOT EXISTS "idx_purchase_renewal_reminder"
  ON "purchase" ("current_period_end")
  WHERE "subscription_status" = 'active'
    AND "cancel_at_period_end" = false
    AND "renewal_reminder_sent_at" IS NULL;
