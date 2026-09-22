-- Restart every live coupon's clock: same original lifespan, starting today.
-- Use when launch slips and early merchants' coupons are burning down unused.
-- Idempotent: lifespan is measured valid_from -> expires_at, and both reset.
-- Run:  psql "<prod conn>" -f scripts/restart-coupon-clocks.sql
-- (Excludes soft-deleted coupons and the Gourmet Delight test restaurant.)

BEGIN;

UPDATE coupon c SET
  valid_from = CURRENT_DATE::timestamp,
  expires_at = CURRENT_DATE::timestamp + (c.expires_at - c.valid_from),
  updated_at = now()
FROM merchant m
WHERE m.id = c.merchant_id
  AND c.deleted_at IS NULL
  AND m.name <> 'Gourmet Delight';

-- Pending submissions carry their dates inside JSON; refresh those too so a
-- later approval doesn't go live half-spent.
UPDATE coupon_submission SET
  submission_data = jsonb_set(jsonb_set(submission_data,
      '{valid_from}', to_jsonb(CURRENT_DATE::text)),
      '{expires_at}', to_jsonb((CURRENT_DATE
        + ((submission_data->>'expires_at')::date
         - (submission_data->>'valid_from')::date))::text)),
  updated_at = now()
WHERE deleted_at IS NULL AND state = 'pending';

COMMIT;
