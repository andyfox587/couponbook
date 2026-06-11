-- Migration 0021: QR ticket codes for event RSVPs.
--
-- Each confirmed RSVP gets a random bearer code. The ticket QR encodes
--   <APP_PUBLIC_URL>/checkin/<eventId>?code=<ticket_code>
-- Door staff (merchant-authed) scan it to look up + check in the guest.
-- Stored in plaintext (unlike hashed guest tokens) so the ticket can be
-- re-displayed in the guest's profile at any time.

ALTER TABLE "event_rsvp"
  ADD COLUMN IF NOT EXISTS "ticket_code" varchar(32);

CREATE UNIQUE INDEX IF NOT EXISTS "event_rsvp_ticket_code_unique"
  ON "event_rsvp" ("ticket_code")
  WHERE "ticket_code" IS NOT NULL;
