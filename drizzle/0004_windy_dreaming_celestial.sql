CREATE TYPE "public"."billing_model" AS ENUM('one_time', 'subscription');--> statement-breakpoint
ALTER TYPE "public"."purchase_provider" ADD VALUE 'admin_grant';--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "billing_interval" varchar(10);--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "billing_interval_count" integer;--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "stripe_recurring_price_id_test" varchar(255);--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "stripe_recurring_price_id_live" varchar(255);--> statement-breakpoint
ALTER TABLE "foodie_group" ADD COLUMN "billing_model" "billing_model" DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase" ADD COLUMN "gifted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase" ADD COLUMN "subscription_status" varchar(32);--> statement-breakpoint
ALTER TABLE "purchase" ADD COLUMN "current_period_start" timestamp;--> statement-breakpoint
ALTER TABLE "purchase" ADD COLUMN "current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "purchase" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase" ADD COLUMN "renewal_reminder_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_gifted_by_user_id_user_id_fk" FOREIGN KEY ("gifted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;