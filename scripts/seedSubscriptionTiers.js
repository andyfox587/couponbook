#!/usr/bin/env node
/**
 * scripts/seedSubscriptionTiers.js
 *
 * One-shot backfill for the multi-tier subscription pricing migration (0019).
 *
 * For every subscription-billed foodie_group that currently has exactly one
 * active monthly tier, this script:
 *   1. Promotes that row to is_default=true and gives it a derived label.
 *   2. Inserts two additional rows in status='draft' as suggested 6-month
 *      and annual tiers at discounted prices. Drafts have NO Stripe Price
 *      attached — they only become real Stripe objects once an admin
 *      "publishes" them via the new PATCH /prices/:id endpoint.
 *
 * Usage:
 *   node scripts/seedSubscriptionTiers.js            # live run
 *   node scripts/seedSubscriptionTiers.js --dry-run  # preview only
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { and, eq } from 'drizzle-orm';
import * as schema from '../server/src/schema.js';

const isDryRun = process.argv.includes('--dry-run');

// Suggested discounts vs the monthly rate. These mirror common SaaS norms;
// admins review them as drafts before publishing.
const SIX_MONTH_DISCOUNT = 0.10;
const ANNUAL_DISCOUNT = 0.17;

function deriveMonthlyLabel(interval, count) {
  if (interval === 'month' && count === 1) return 'Monthly';
  if (interval === 'month' && count === 6) return '6 months';
  if (interval === 'month' && count === 12) return 'Annual';
  if (interval === 'year' && count === 1) return 'Annual';
  return 'Subscription';
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log(`\n🌱  Seeding subscription tiers ${isDryRun ? '(DRY RUN)' : ''}\n`);

  const groups = await db
    .select()
    .from(schema.foodieGroup)
    .where(eq(schema.foodieGroup.billingModel, 'subscription'));

  let promoted = 0;
  let draftsInserted = 0;

  for (const group of groups) {
    const activeRows = await db
      .select()
      .from(schema.couponBookPrice)
      .where(
        and(
          eq(schema.couponBookPrice.groupId, group.id),
          eq(schema.couponBookPrice.isActive, true)
        )
      );

    if (activeRows.length !== 1) {
      console.log(`  ↷ ${group.slug}: ${activeRows.length} active rows, skipping`);
      continue;
    }

    const row = activeRows[0];

    // Promote the existing row to default if not already.
    if (!row.isDefault || !row.label) {
      const label = deriveMonthlyLabel(row.billingInterval, row.billingIntervalCount);
      console.log(`  ✓ ${group.slug}: promote existing row → default "${label}"`);
      if (!isDryRun) {
        await db
          .update(schema.couponBookPrice)
          .set({
            isDefault: true,
            label,
            status: 'active',
            sortOrder: 0,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.couponBookPrice.id, row.id));
      }
      promoted++;
    }

    // Only seed extra drafts for monthly subscriptions (the others already
    // are the "long" cadence the suggestions would produce).
    const isMonthly =
      row.billingInterval === 'month' && row.billingIntervalCount === 1;
    if (!isMonthly) continue;

    const monthlyCents = row.amountCents;
    const suggestions = [
      {
        label: '6 months',
        amountCents: Math.round(monthlyCents * 6 * (1 - SIX_MONTH_DISCOUNT)),
        billingInterval: 'month',
        billingIntervalCount: 6,
        sortOrder: 1,
      },
      {
        label: 'Annual',
        amountCents: Math.round(monthlyCents * 12 * (1 - ANNUAL_DISCOUNT)),
        billingInterval: 'year',
        billingIntervalCount: 1,
        sortOrder: 2,
      },
    ];

    for (const s of suggestions) {
      // Skip if a tier with the same cadence already exists.
      const existing = await db
        .select({ id: schema.couponBookPrice.id })
        .from(schema.couponBookPrice)
        .where(
          and(
            eq(schema.couponBookPrice.groupId, group.id),
            eq(schema.couponBookPrice.billingInterval, s.billingInterval),
            eq(schema.couponBookPrice.billingIntervalCount, s.billingIntervalCount)
          )
        );
      if (existing.length > 0) {
        console.log(`    · ${group.slug}: skip ${s.label} (already exists)`);
        continue;
      }

      console.log(`    + ${group.slug}: draft ${s.label} @ ${(s.amountCents / 100).toFixed(2)} ${row.currency.toUpperCase()}`);
      if (!isDryRun) {
        await db.insert(schema.couponBookPrice).values({
          groupId: group.id,
          amountCents: s.amountCents,
          currency: row.currency,
          isActive: true,
          isDefault: false,
          label: s.label,
          sortOrder: s.sortOrder,
          status: 'draft',
          billingInterval: s.billingInterval,
          billingIntervalCount: s.billingIntervalCount,
          createdByUserId: row.createdByUserId,
        });
      }
      draftsInserted++;
    }
  }

  console.log(`\n✅  Done. Promoted ${promoted}, drafted ${draftsInserted}.\n`);
  await pool.end();
}

main().catch((err) => {
  console.error('seedSubscriptionTiers failed:', err);
  process.exit(1);
});
