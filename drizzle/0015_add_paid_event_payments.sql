-- Migration 0015: Add paid event payment support.

DO $$ BEGIN
  CREATE TYPE event_order_status AS ENUM (
    'pending_email',
    'pending_payment',
    'paid',
    'payment_failed',
    'cancelled',
    'refunded',
    'partially_refunded',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_refund_status AS ENUM ('pending', 'succeeded', 'failed', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_token_purpose AS ENUM ('email_confirmation', 'cancellation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_payment_provider AS ENUM ('stripe');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "payment_event"
  ADD COLUMN IF NOT EXISTS "event_order_id" uuid;

CREATE TABLE IF NOT EXISTS "merchant_billing_profile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "merchant_id" uuid NOT NULL,
  "payout_destination_details" jsonb,
  "payout_destination_verified" boolean DEFAULT false NOT NULL,
  "stripe_customer_id" varchar(255),
  "backup_payment_method_id" varchar(255),
  "backup_payment_method_last4" varchar(4),
  "backup_charge_method_ready" boolean DEFAULT false NOT NULL,
  "paid_event_terms_accepted_at" timestamp,
  "paid_event_terms_version" varchar(64),
  "paid_events_enabled" boolean DEFAULT false NOT NULL,
  "dispute_recovery_enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "merchant_billing_profile_merchant_id_merchant_id_fk"
    FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE CASCADE,
  CONSTRAINT "merchant_billing_profile_merchant_id_unique" UNIQUE ("merchant_id")
);

CREATE TABLE IF NOT EXISTS "event_order" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "rsvp_id" uuid,
  "user_id" uuid,
  "group_id" uuid NOT NULL,
  "merchant_id" uuid NOT NULL,
  "provider" event_payment_provider DEFAULT 'stripe' NOT NULL,
  "quantity" integer NOT NULL,
  "guest_name" varchar(255),
  "guest_email" varchar(255),
  "email_confirmation_status" varchar(32) DEFAULT 'not_required' NOT NULL,
  "email_confirmed_at" timestamp,
  "amount_cents" integer NOT NULL,
  "refunded_amount_cents" integer DEFAULT 0 NOT NULL,
  "currency" varchar(10) DEFAULT 'usd' NOT NULL,
  "pricing_basis" varchar(64) NOT NULL,
  "status" event_order_status NOT NULL,
  "stripe_payment_intent_id" varchar(255),
  "stripe_charge_id" varchar(255),
  "stripe_customer_id" varchar(255),
  "refund_policy_version" varchar(64) NOT NULL,
  "refund_policy_acknowledged_at" timestamp,
  "cancellation_reason" text,
  "cancellation_requested_at" timestamp,
  "cancelled_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "event_order_event_id_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE,
  CONSTRAINT "event_order_rsvp_id_event_rsvp_id_fk"
    FOREIGN KEY ("rsvp_id") REFERENCES "event_rsvp"("id") ON DELETE SET NULL,
  CONSTRAINT "event_order_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "event_order_group_id_foodie_group_id_fk"
    FOREIGN KEY ("group_id") REFERENCES "foodie_group"("id"),
  CONSTRAINT "event_order_merchant_id_merchant_id_fk"
    FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id"),
  CONSTRAINT "event_order_stripe_payment_intent_unique" UNIQUE ("stripe_payment_intent_id")
);

DO $$ BEGIN
  ALTER TABLE "payment_event"
    ADD CONSTRAINT "payment_event_event_order_id_event_order_id_fk"
    FOREIGN KEY ("event_order_id") REFERENCES "event_order"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "event_refund" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_order_id" uuid NOT NULL,
  "event_rsvp_id" uuid,
  "event_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(10) DEFAULT 'usd' NOT NULL,
  "reason" varchar(64) NOT NULL,
  "policy_window" varchar(64) NOT NULL,
  "refund_policy_version" varchar(64) NOT NULL,
  "status" event_refund_status NOT NULL,
  "stripe_refund_id" varchar(255),
  "stripe_charge_id" varchar(255),
  "failure_reason" text,
  "requested_by_user_id" uuid,
  "requested_by_role" varchar(64),
  "metadata" jsonb,
  "processed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "event_refund_event_order_id_event_order_id_fk"
    FOREIGN KEY ("event_order_id") REFERENCES "event_order"("id") ON DELETE CASCADE,
  CONSTRAINT "event_refund_event_rsvp_id_event_rsvp_id_fk"
    FOREIGN KEY ("event_rsvp_id") REFERENCES "event_rsvp"("id") ON DELETE SET NULL,
  CONSTRAINT "event_refund_event_id_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE,
  CONSTRAINT "event_refund_requested_by_user_id_user_id_fk"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "event_refund_stripe_refund_id_unique" UNIQUE ("stripe_refund_id")
);

CREATE TABLE IF NOT EXISTS "event_guest_token" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_order_id" uuid,
  "event_rsvp_id" uuid,
  "event_id" uuid NOT NULL,
  "purpose" event_token_purpose NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "revoked_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "event_guest_token_event_order_id_event_order_id_fk"
    FOREIGN KEY ("event_order_id") REFERENCES "event_order"("id") ON DELETE CASCADE,
  CONSTRAINT "event_guest_token_event_rsvp_id_event_rsvp_id_fk"
    FOREIGN KEY ("event_rsvp_id") REFERENCES "event_rsvp"("id") ON DELETE CASCADE,
  CONSTRAINT "event_guest_token_event_id_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE,
  CONSTRAINT "event_guest_token_token_hash_unique" UNIQUE ("token_hash")
);

CREATE TABLE IF NOT EXISTS "event_dispute" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_order_id" uuid,
  "event_id" uuid NOT NULL,
  "merchant_id" uuid NOT NULL,
  "stripe_dispute_id" varchar(255) NOT NULL,
  "stripe_charge_id" varchar(255),
  "amount_cents" integer NOT NULL,
  "currency" varchar(10) DEFAULT 'usd' NOT NULL,
  "status" varchar(64) NOT NULL,
  "dispute_fee_cents" integer,
  "recovery_amount_cents" integer,
  "recovery_status" varchar(64),
  "merchant_recovery_payment_intent_id" varchar(255),
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "event_dispute_event_order_id_event_order_id_fk"
    FOREIGN KEY ("event_order_id") REFERENCES "event_order"("id") ON DELETE SET NULL,
  CONSTRAINT "event_dispute_event_id_event_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE,
  CONSTRAINT "event_dispute_merchant_id_merchant_id_fk"
    FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id"),
  CONSTRAINT "event_dispute_stripe_dispute_id_unique" UNIQUE ("stripe_dispute_id")
);

CREATE INDEX IF NOT EXISTS "idx_event_order_event_status"
  ON "event_order" ("event_id", "status");

CREATE INDEX IF NOT EXISTS "idx_event_order_rsvp"
  ON "event_order" ("rsvp_id");

CREATE INDEX IF NOT EXISTS "idx_event_refund_order"
  ON "event_refund" ("event_order_id");

CREATE INDEX IF NOT EXISTS "idx_event_guest_token_lookup"
  ON "event_guest_token" ("purpose", "token_hash");
