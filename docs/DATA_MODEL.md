# Data Model

This document describes the key tables and relationships in the PostgreSQL database, managed via Drizzle ORM.

## Entity Relationship Summary

The system revolves around **Coupons** and **Events** offered by **Merchants** within **Foodie Groups**. **Users** can redeem coupons, RSVP to events, and may have specialized roles. Both coupons and events follow a **submission → approval → creation** workflow.

## Key Tables

### `user`
- Stores user identity from Cognito.
- `cognito_sub`: Unique ID from Cognito.
- `role`: Global role (`super_admin`, `merchant`, `customer`, `foodie_group_admin`).

### `merchant`
- Businesses that offer coupons and host events.
- `owner_id`: FK to `user.id`. A merchant is owned by a specific user.

### `foodie_group`
- Communities or geographic areas where coupons and events are organized.
- Identified by a unique `slug`.

### `coupon`
- The actual coupon offers.
- `merchant_id`: FK to `merchant.id`.
- `group_id`: FK to `foodie_group.id`.
- `locked`: If true, requires a purchase or membership to redeem.

### `coupon_redemption`
- Tracks when a user uses a coupon.
- `coupon_id`: FK to `coupon.id`.
- `user_id`: FK to `user.id`.

### `coupon_submission`
- The pipeline for merchants to submit coupons for approval.
- `state`: `pending`, `approved`, or `rejected` (uses `submission_state` enum).
- `group_id`: FK to `foodie_group.id`.
- `merchant_id`: FK to `merchant.id`.
- `submission_data`: JSONB blob with all coupon details.
- `rejection_message`: Text reason when rejected.
- On approval, a `coupon` row is created from `submission_data`.

### `event`
- Live events hosted by merchants within a group. Created automatically when an `event_submission` is approved.
- `group_id`: FK to `foodie_group.id`.
- `merchant_id`: FK to `merchant.id`.
- `status`: `event_status` enum — controls visibility and RSVP acceptance.
- `visibility`: `event_visibility` enum — controls who can see and access the event.
- `slug`: Unique URL-friendly identifier, generated on creation.
- `member_access_token`: Opaque token for member-only URL access. When passed as `?member_token=`, reveals member pricing.
- `capacity`: Max attendees (0 = unlimited).
- `price_cents`, `members_only_price_cents`: Integer cents. `is_free` is true when no charge.
- `max_tickets_per_guest`: Limits tickets per RSVP (default 1).
- `invite_only`: If true, public RSVPs are blocked.
- `cover_image_url`, `banner_image_url`: Event imagery.
- Standard `created_at`, `updated_at`, `deleted_at` (soft delete).

### `event_rsvp`
- Tracks RSVPs for events. Supports both authenticated users and anonymous guests.
- `event_id`: FK to `event.id` (cascade delete).
- `user_id`: FK to `user.id` (nullable — null for guest RSVPs).
- `status`: `attendance_status` enum.
- `attendees`: Number of tickets in this RSVP.
- `waitlist_position`: 1-based position when waitlisted; null when confirmed.
- `guest_name`, `guest_email`: Contact info for guest (non-authenticated) RSVPs.
- When a confirmed RSVP is cancelled, the earliest waitlisted RSVP is auto-promoted.

### `event_submission`
- The pipeline for merchants to submit event proposals for approval. Mirrors `coupon_submission`.
- `state`: `pending`, `approved`, or `rejected` (uses `submission_state` enum).
- `group_id`: FK to `foodie_group.id`.
- `merchant_id`: FK to `merchant.id`.
- `submission_data`: JSONB blob with all event details (name, description, dates, pricing, etc.).
- `rejection_message`: Text reason when rejected.
- `reviewed_at`: Timestamp of admin decision.
- On approval, an `event` row is created from `submission_data` with status `published`, a generated slug, and a member access token.

### `foodie_group_membership`
- Associates users with groups and defines their role within that group.
- `role`: Role specific to this group (e.g., `foodie_group_admin`).

### `purchase`
- Tracks Stripe payments for "locked" coupon access.
- `user_id`, `group_id`: Associates a purchase with a user and a specific group.

## Enums
- `role`: `super_admin`, `merchant`, `customer`, `foodie_group_admin`
- `submission_state`: `pending`, `approved`, `rejected`
- `coupon_type`: `percent`, `amount`, `bogo`, `free_item`
- `purchase_status`: `created`, `pending`, `paid`, `expired`, `refunded`
- `event_status`: `draft`, `published`, `cancelled`
- `event_visibility`: `public`, `members_only`, `invite_only`
- `attendance_status`: `going`, `waitlist`, `cancelled`
