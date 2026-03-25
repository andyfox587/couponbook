CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_visibility" AS ENUM('public', 'members_only', 'invite_only');--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(50) NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_rsvp" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "stripe_product_id_test" varchar(255);--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "stripe_price_id_test" varchar(255);--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "stripe_product_id_live" varchar(255);--> statement-breakpoint
ALTER TABLE "coupon_book_price" ADD COLUMN "stripe_price_id_live" varchar(255);--> statement-breakpoint
ALTER TABLE "coupon_submission" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "coupon_submission" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "slug" varchar(255);--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "member_access_token" varchar(255);--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "status" "event_status" DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "members_only_price_cents" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "is_free" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "visibility" "event_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "max_tickets_per_guest" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "invite_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "banner_image_url" varchar(500);--> statement-breakpoint
ALTER TABLE "event_rsvp" ADD COLUMN "waitlist_position" integer;--> statement-breakpoint
ALTER TABLE "event_rsvp" ADD COLUMN "guest_name" varchar(255);--> statement-breakpoint
ALTER TABLE "event_rsvp" ADD COLUMN "guest_email" varchar(255);--> statement-breakpoint
ALTER TABLE "event_submission" ADD COLUMN "rejection_message" text;--> statement-breakpoint
ALTER TABLE "event_submission" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "event_submission" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "anonymized_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "anonymized_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "anonymized_reason" text;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_anonymized_by_user_id_user_id_fk" FOREIGN KEY ("anonymized_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;