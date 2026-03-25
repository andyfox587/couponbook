-- Migration: Expand event table with submission-lifecycle fields
-- Adds status, slug, member_access_token, pricing, visibility, and capacity control

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('draft', 'published', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE event_visibility AS ENUM ('public', 'members_only', 'invite_only');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "event"
  ADD COLUMN IF NOT EXISTS "slug" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "member_access_token" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "status" event_status NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS "price_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "members_only_price_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_free" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "visibility" event_visibility NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS "max_tickets_per_guest" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "invite_only" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "banner_image_url" VARCHAR(500);

CREATE UNIQUE INDEX IF NOT EXISTS "event_slug_unique" ON "event"("slug") WHERE "slug" IS NOT NULL;
