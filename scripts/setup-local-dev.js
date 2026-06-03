#!/usr/bin/env node
/**
 * setup-local-dev.js
 *
 * One-shot script for local-only testing of the new metrics endpoints.
 * Connects to a local Postgres (no SSL), applies all drizzle migrations in
 * order, then seeds a small dataset designed to produce easy-to-eyeball
 * values from GET /api/v1/groups/metrics.
 *
 * Usage:
 *   # 1. Spin up Postgres (one liner):
 *   #    docker run -d --name couponbook-pg -p 5432:5432 \
 *   #      -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=couponbook postgres:15
 *   #
 *   # 2. Run this script:
 *   #    DATABASE_URL=postgresql://postgres:devpass@localhost:5432/couponbook \
 *   #      node scripts/setup-local-dev.js
 *   #
 *   # 3. Start the dev server:
 *   #    DATABASE_URL=postgresql://postgres:devpass@localhost:5432/couponbook \
 *   #    METRICS_SERVICE_TOKEN=local-test-token \
 *   #      npm run dev
 *
 * Expected metrics after seeding:
 *   chapel-hill-carrboro: members=3, restaurants=3, coupons_active=5,
 *                         coupons_redeemed=6, gross_revenue_cents=3996
 *   western-nc:           members=2, restaurants=2, coupons_active=3,
 *                         coupons_redeemed=1, gross_revenue_cents=1998
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const drizzleDir = path.resolve(__dirname, '..', 'drizzle');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required. Example:');
  console.error('   DATABASE_URL=postgresql://postgres:devpass@localhost:5432/couponbook node scripts/setup-local-dev.js');
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

async function main() {
  console.log('🔌 Connecting to', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
  await client.connect();

  await wipeIfPresent();
  await applyMigrations();
  await seed();
  await summarize();

  await client.end();
  console.log('✅ Local dev DB ready');
  console.log('');
  console.log('Now start the dev server:');
  console.log(`  DATABASE_URL='${DATABASE_URL}' METRICS_SERVICE_TOKEN=local-test-token npm run dev`);
  console.log('');
  console.log('Then hit the endpoint:');
  console.log('  curl -s -H "X-Service-Token: local-test-token" http://localhost:3000/api/v1/groups/metrics | jq .');
}

async function wipeIfPresent() {
  // If the schema's already there from a prior run, drop everything cleanly.
  const { rows } = await client.query(`
    SELECT to_regclass('public.foodie_group') AS t
  `);
  if (!rows[0].t) {
    console.log('🧹 Fresh database (nothing to wipe)');
    return;
  }
  console.log('🧹 Wiping existing tables…');
  await client.query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    GRANT ALL ON SCHEMA public TO public;
  `);
}

async function applyMigrations() {
  const files = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
    // Migrations 0-4 use Drizzle's "--> statement-breakpoint" splitter.
    // Migrations 5+ use raw SQL separated by semicolons. The simplest robust
    // approach: try executing the whole file at once; pg supports multi-stmt.
    process.stdout.write(`  → ${file} … `);
    try {
      await client.query(sql);
      console.log('ok');
    } catch (e) {
      // If something fails (e.g. partial-index syntax PGLite skips), try
      // splitting and applying statements individually with best-effort.
      console.log('partial');
      const statements = sql
        .split(/-->\s*statement-breakpoint|;\s*$|;\s*\n/m)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !/^--/.test(s));
      for (const stmt of statements) {
        try {
          await client.query(stmt);
        } catch (innerErr) {
          // ignore — surfaces as a final-state issue if anything matters
        }
      }
    }
  }
}

async function seed() {
  console.log('🌱 Seeding sample data…');

  // --- Foodie groups ---------------------------------------------------------
  const groups = await client.query(
    `INSERT INTO foodie_group (slug, name, description, location)
     VALUES
       ('chapel-hill-carrboro', 'Chapel Hill Carrboro Foodies', 'Local food lovers', 'Chapel Hill, NC'),
       ('western-nc',           'Western North Carolina Foodies', 'Mountain eats',    'Asheville, NC')
     RETURNING id, slug`,
  );
  const groupBySlug = Object.fromEntries(groups.rows.map((g) => [g.slug, g.id]));

  // --- Merchant owner + 5 merchants (3 in chapel-hill, 2 in western) ---------
  const owner = (
    await client.query(
      `INSERT INTO "user" (cognito_sub, email, name, role)
       VALUES ('seed-merchant-owner', 'owner@example.com', 'Owner', 'merchant')
       RETURNING id`,
    )
  ).rows[0];

  const merchants = await client.query(
    `INSERT INTO merchant (name, owner_id)
     VALUES
       ('Pizza Place',      $1),
       ('Bagel Shop',       $1),
       ('Sushi Bar',        $1),
       ('Mountain Cafe',    $1),
       ('Blue Ridge Diner', $1)
     RETURNING id, name`,
    [owner.id],
  );
  const merchantByName = Object.fromEntries(
    merchants.rows.map((m) => [m.name, m.id]),
  );

  const future = new Date(Date.now() + 30 * 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();
  const validFrom = new Date(Date.now() - 7 * 86400000).toISOString();

  // --- Coupons (5 active in chapel-hill, 3 in western; 1 expired so we can
  //     prove the active filter works) ----------------------------------------
  const coupons = await client.query(
    `INSERT INTO coupon
       (group_id, merchant_id, title, coupon_type, discount_value, valid_from, expires_at, locked)
     VALUES
       -- chapel-hill (5 active across 3 merchants)
       ($1, $2, '10% Off Pizza',   'percent', 10, $7, $8, false),
       ($1, $2, 'Free Slice',      'free_item', 0, $7, $8, false),
       ($1, $3, 'BOGO Bagel',      'bogo',    0,  $7, $8, false),
       ($1, $4, '$5 Off Roll',     'amount',  5,  $7, $8, false),
       ($1, $4, 'Free Miso Soup',  'free_item', 0, $7, $8, false),
       -- chapel-hill expired (should NOT count toward coupons_active)
       ($1, $2, 'Expired Promo',   'percent', 15, $7, $9, false),
       -- western-nc (3 active across 2 merchants)
       ($5, $6, 'Mountain Mocha',  'amount',  3,  $7, $8, false),
       ($5, $6, 'Pastry Combo',    'amount',  4,  $7, $8, false),
       ($5, $10, '20% Off Brunch', 'percent', 20, $7, $8, false)
     RETURNING id, title, group_id`,
    [
      groupBySlug['chapel-hill-carrboro'],
      merchantByName['Pizza Place'],
      merchantByName['Bagel Shop'],
      merchantByName['Sushi Bar'],
      groupBySlug['western-nc'],
      merchantByName['Mountain Cafe'],
      validFrom,
      future,
      past,
      merchantByName['Blue Ridge Diner'],
    ],
  );
  const couponByTitle = Object.fromEntries(
    coupons.rows.map((c) => [c.title, c.id]),
  );

  // --- Customers -------------------------------------------------------------
  const customers = await client.query(
    `INSERT INTO "user" (cognito_sub, email, name, role)
     VALUES
       ('seed-cust-1', 'alice@example.com',   'Alice',   'customer'),
       ('seed-cust-2', 'bob@example.com',     'Bob',     'customer'),
       ('seed-cust-3', 'carol@example.com',   'Carol',   'customer'),
       ('seed-cust-4', 'dave@example.com',    'Dave',    'customer'),
       ('seed-cust-5', 'eve@example.com',     'Eve',     'customer')
     RETURNING id, email`,
  );
  const customerByEmail = Object.fromEntries(
    customers.rows.map((c) => [c.email, c.id]),
  );

  // --- Purchases -------------------------------------------------------------
  // chapel-hill: Alice buys twice (counts as 1 member, 2x revenue), Bob buys 1x, Carol buys 1x.
  // Plus a pending purchase by Dave that should NOT count toward members/revenue.
  // → members=3 (Alice, Bob, Carol), revenue=999*4=3996
  // western-nc: Dave buys 1x, Eve buys 1x → members=2, revenue=999*2=1998
  await client.query(
    `INSERT INTO purchase
       (user_id, group_id, provider, stripe_checkout_id, amount_cents, currency, status, purchased_at)
     VALUES
       ($1, $6, 'stripe', 'cs_test_alice_1', 999, 'usd', 'paid',    NOW()),
       ($1, $6, 'stripe', 'cs_test_alice_2', 999, 'usd', 'paid',    NOW()),
       ($2, $6, 'stripe', 'cs_test_bob',     999, 'usd', 'paid',    NOW()),
       ($3, $6, 'stripe', 'cs_test_carol',   999, 'usd', 'paid',    NOW()),
       ($4, $6, 'stripe', 'cs_test_dave_p',  999, 'usd', 'pending', NULL),
       ($4, $7, 'stripe', 'cs_test_dave_w',  999, 'usd', 'paid',    NOW()),
       ($5, $7, 'stripe', 'cs_test_eve_w',   999, 'usd', 'paid',    NOW())`,
    [
      customerByEmail['alice@example.com'],
      customerByEmail['bob@example.com'],
      customerByEmail['carol@example.com'],
      customerByEmail['dave@example.com'],
      customerByEmail['eve@example.com'],
      groupBySlug['chapel-hill-carrboro'],
      groupBySlug['western-nc'],
    ],
  );

  // --- Redemptions -----------------------------------------------------------
  // chapel-hill: 6 redemptions across 4 coupons
  // western-nc: 1 redemption
  await client.query(
    `INSERT INTO coupon_redemption (coupon_id, user_id)
     VALUES
       ($1, $7), ($1, $8),       -- 10% Off Pizza: Alice, Bob
       ($2, $9),                  -- Free Slice: Carol
       ($3, $7),                  -- BOGO Bagel: Alice
       ($4, $8),                  -- $5 Off Roll: Bob
       ($5, $9),                  -- Free Miso Soup: Carol
       ($6, $10)                  -- Mountain Mocha: Dave
     `,
    [
      couponByTitle['10% Off Pizza'],
      couponByTitle['Free Slice'],
      couponByTitle['BOGO Bagel'],
      couponByTitle['$5 Off Roll'],
      couponByTitle['Free Miso Soup'],
      couponByTitle['Mountain Mocha'],
      customerByEmail['alice@example.com'],
      customerByEmail['bob@example.com'],
      customerByEmail['carol@example.com'],
      customerByEmail['dave@example.com'],
    ],
  );
}

async function summarize() {
  const r = await client.query(`
    SELECT fg.slug,
           (SELECT COUNT(DISTINCT user_id) FROM purchase WHERE group_id=fg.id AND status='paid')       AS members,
           (SELECT COUNT(DISTINCT c.merchant_id) FROM coupon c JOIN merchant m ON m.id=c.merchant_id
             WHERE c.group_id=fg.id AND c.deleted_at IS NULL AND m.deleted_at IS NULL)                  AS restaurants,
           (SELECT COUNT(*) FROM coupon c JOIN merchant m ON m.id=c.merchant_id
             WHERE c.group_id=fg.id AND c.deleted_at IS NULL AND m.deleted_at IS NULL
               AND c.expires_at > NOW())                                                                AS coupons_active,
           (SELECT COUNT(*) FROM coupon_redemption cr JOIN coupon c ON c.id=cr.coupon_id
             JOIN merchant m ON m.id=c.merchant_id
             WHERE c.group_id=fg.id AND cr.deleted_at IS NULL
               AND c.deleted_at IS NULL AND m.deleted_at IS NULL)                                       AS coupons_redeemed,
           (SELECT COALESCE(SUM(amount_cents), 0) FROM purchase
             WHERE group_id=fg.id AND status='paid')                                                    AS gross_revenue_cents
      FROM foodie_group fg
     ORDER BY fg.slug
  `);
  console.log('📊 Expected metrics (verify against the endpoint):');
  console.table(r.rows);
}

main().catch((e) => {
  console.error('❌ Setup failed:', e);
  process.exit(1);
});
