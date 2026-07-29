#!/usr/bin/env bash
#
# Clone production into a STAGING database on the same RDS instance.
#
# Staging is a full, working copy of the app's data so the new consumer UI can
# be exercised for real — real login, real redemption, real uploads — without
# any of it touching live customer records.
#
#   prod:    $DB_NAME            (untouched, read-only here)
#   staging: $STAGING_DB_NAME    (dropped and rebuilt every run)
#
# Safety properties:
#   * production is only ever READ (pg_dump), never written
#   * refuses to run if STAGING_DB_NAME matches the production DB name
#   * external customer emails are scrubbed after restore, so nothing in
#     staging can email a real member. Team addresses (@ivalu8.com /
#     @vivaspot.com) are preserved so you can still sign in as yourself.
#
# Usage (from repo root, with .env holding the prod DB creds):
#   ./scripts/clone-prod-to-staging.sh              # rebuild staging
#   ./scripts/clone-prod-to-staging.sh --keep-emails  # skip the scrub
#
set -euo pipefail

KEEP_EMAILS=0
[[ "${1:-}" == "--keep-emails" ]] && KEEP_EMAILS=1

# ---- config -----------------------------------------------------------------
set -a; source .env; set +a
STAGING_DB_NAME="${STAGING_DB_NAME:-vivaspot_staging}"
PORT="${DB_PORT:-5432}"
BASE="host=$DB_HOST port=$PORT user=$DB_USER sslmode=require"

if [[ "$STAGING_DB_NAME" == "$DB_NAME" ]]; then
  echo "❌ STAGING_DB_NAME ($STAGING_DB_NAME) is the production database. Refusing." >&2
  exit 1
fi

export PGPASSWORD="$DB_PASS"
DUMP="$(mktemp -t couponbook-prod-XXXX.sql)"
trap 'rm -f "$DUMP"' EXIT

echo "── Cloning production → staging ─────────────────────────────"
echo "   source (read-only): $DB_NAME"
echo "   target (rebuilt):   $STAGING_DB_NAME"
echo "   host:               $DB_HOST"
echo ""

# ---- 1. dump production (read-only) ----------------------------------------
# Plain SQL rather than custom format: the local pg_dump (18) emits GUCs that a
# PG16 server rejects (e.g. transaction_timeout), so we filter them out. Keep
# this filter in step with whatever client/server version gap exists.
echo "1/4  Dumping production…"
pg_dump "$BASE dbname=$DB_NAME" --format=plain --no-owner --no-acl \
  | grep -vE '^SET (transaction_timeout|idle_session_timeout) =' > "$DUMP"
echo "     dump size: $(du -h "$DUMP" | cut -f1)"

# ---- 2. recreate the staging database --------------------------------------
echo "2/4  Recreating $STAGING_DB_NAME…"
psql "$BASE dbname=postgres" -v ON_ERROR_STOP=1 -q <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = '$STAGING_DB_NAME' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $STAGING_DB_NAME;
CREATE DATABASE $STAGING_DB_NAME;
SQL

# ---- 3. restore ------------------------------------------------------------
echo "3/4  Restoring into $STAGING_DB_NAME…"
psql "$BASE dbname=$STAGING_DB_NAME" -v ON_ERROR_STOP=1 -q --single-transaction -f "$DUMP"

# ---- 4. scrub external emails ----------------------------------------------
if [[ "$KEEP_EMAILS" -eq 1 ]]; then
  echo "4/4  Skipping email scrub (--keep-emails)."
else
  echo "4/4  Scrubbing external customer emails…"
  psql "$BASE dbname=$STAGING_DB_NAME" -v ON_ERROR_STOP=1 -q <<'SQL'
-- Keep team addresses so the team can still sign in and be recognised.
UPDATE "user"
   SET email = 'member+' || left(id::text, 8) || '@staging.invalid'
 WHERE email NOT ILIKE '%@ivalu8.com'
   AND email NOT ILIKE '%@vivaspot.com';

UPDATE event_rsvp    SET guest_email = 'guest+' || left(id::text, 8) || '@staging.invalid'
 WHERE guest_email IS NOT NULL AND guest_email NOT ILIKE '%@ivalu8.com' AND guest_email NOT ILIKE '%@vivaspot.com';
UPDATE event_order   SET guest_email = 'guest+' || left(id::text, 8) || '@staging.invalid'
 WHERE guest_email IS NOT NULL AND guest_email NOT ILIKE '%@ivalu8.com' AND guest_email NOT ILIKE '%@vivaspot.com';
UPDATE event_credit  SET guest_email = 'guest+' || left(id::text, 8) || '@staging.invalid'
 WHERE guest_email IS NOT NULL AND guest_email NOT ILIKE '%@ivalu8.com' AND guest_email NOT ILIKE '%@vivaspot.com';
SQL
fi

# ---- report -----------------------------------------------------------------
echo ""
echo "── Result ───────────────────────────────────────────────────"
psql "$BASE dbname=$STAGING_DB_NAME" -tAc "
  select 'users            = ' || count(*) from \"user\"
  union all select 'merchants       = ' || count(*) from merchant
  union all select 'coupons         = ' || count(*) from coupon
  union all select 'real emails left= ' || count(*) from \"user\"
     where email not ilike '%@ivalu8.com' and email not ilike '%@vivaspot.com'
       and email not like '%@staging.invalid';"
echo ""
echo "✅ Staging ready. Point the staging deployment at DB_NAME=$STAGING_DB_NAME"
echo "   (same host/user/password as production — only the database name changes)."
