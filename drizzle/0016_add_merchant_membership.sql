CREATE TABLE "merchant_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"added_by_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "merchant_membership_user_merchant_unique" UNIQUE("merchant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "merchant_membership" ADD CONSTRAINT "merchant_membership_merchant_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_membership" ADD CONSTRAINT "merchant_membership_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "merchant_membership" ADD CONSTRAINT "merchant_membership_added_by_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
