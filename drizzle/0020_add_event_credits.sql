-- Migration 0020: Event credits (refund policy v2).
--
-- Credits are issued in lieu of cash refunds per the April 2026 policy:
--   3-7 days before event: guest may choose a 100% credit instead of 50% cash
--   under 72 hours:        50% credit auto-issued (no cash refund)
-- Credits are valid 12 months, redeemable at the same merchant only,
-- non-transferable, no cash value.

DO $$ BEGIN
  CREATE TYPE event_credit_status AS ENUM ('active', 'redeemed', 'expired', 'void');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_credit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "guest_email" varchar(255),
  "merchant_id" uuid NOT NULL,
  "group_id" uuid,
  "source_event_order_id" uuid NOT NULL,
  "source_event_id" uuid,
  "amount_cents" integer NOT NULL,
  "currency" varchar(10) DEFAULT 'usd' NOT NULL,
  "status" event_credit_status DEFAULT 'active' NOT NULL,
  "policy_window" varchar(64),
  "refund_policy_version" varchar(64) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "redeemed_at" timestamp,
  "redeemed_event_order_id" uuid,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "event_credit_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "event_credit_merchant_id_merchant_id_fk"
    FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE CASCADE,
  CONSTRAINT "event_credit_group_id_foodie_group_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "foodie_group"("id") ON DELETE SET NULL,
  CONSTRAINT "event_credit_source_event_order_id_event_order_id_fk"
    FOREIGN KEY ("source_event_order_id") REFERENCES "event_order"("id") ON DELETE CASCADE,
  CONSTRAINT "event_credit_source_event_id_event_id_fk"
    FOREIGN KEY ("source_event_id") REFERENCES "event"("id") ON DELETE SET NULL,
  CONSTRAINT "event_credit_redeemed_event_order_id_event_order_id_fk"
    FOREIGN KEY ("redeemed_event_order_id") REFERENCES "event_order"("id") ON DELETE SET NULL,
  -- One credit per source order: cancelling an order can never mint twice.
  CONSTRAINT "event_credit_source_event_order_id_unique" UNIQUE ("source_event_order_id"),
  -- A credit must be claimable by someone: account, email, or both.
  CONSTRAINT "event_credit_owner_present_check" CHECK ("user_id" IS NOT NULL OR "guest_email" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "event_credit_user_id_idx" ON "event_credit" ("user_id");
CREATE INDEX IF NOT EXISTS "event_credit_guest_email_idx" ON "event_credit" ("guest_email");
CREATE INDEX IF NOT EXISTS "event_credit_merchant_id_status_idx" ON "event_credit" ("merchant_id", "status");
