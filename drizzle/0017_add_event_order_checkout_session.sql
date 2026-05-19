-- Migration 0017: Add stripe_checkout_session_id to event_order.

ALTER TABLE "event_order"
  ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "event_order_stripe_checkout_session_id_unique"
  ON "event_order" ("stripe_checkout_session_id")
  WHERE "stripe_checkout_session_id" IS NOT NULL;
