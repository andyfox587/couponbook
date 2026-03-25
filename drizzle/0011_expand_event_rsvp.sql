-- Migration: Expand event_rsvp for guest RSVPs and waitlist support
-- Makes userId nullable (guest RSVPs), adds waitlist_position, guest contact fields

ALTER TABLE "event_rsvp" ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "event_rsvp"
  ADD COLUMN IF NOT EXISTS "waitlist_position" INTEGER,
  ADD COLUMN IF NOT EXISTS "guest_name" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "guest_email" VARCHAR(255);
