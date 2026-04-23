#!/usr/bin/env node
/**
 * scripts/migrate-existing-purchases.js
 *
 * One-time migration: backfill expires_at on existing paid stripe/test purchases
 * that currently have expires_at IS NULL. These rows predate the subscription model
 * and should be treated as one-time lifetime purchases, but to be safe we stamp them
 * with a grace window rather than perpetual access.
 *
 * Usage:
 *   node scripts/migrate-existing-purchases.js           # live run
 *   node scripts/migrate-existing-purchases.js --dry-run # preview only
 *
 * Env vars:
 *   DATABASE_URL          - required
 *   ACCESS_MIGRATION_GRACE_DAYS - how many days from now to set expires_at (default: 365)
 *
 * Safety rules:
 *   - Only targets status='paid' rows
 *   - Only targets provider IN ('stripe', 'test')
 *   - Skips provider='admin_grant' (those are perpetual by design)
 *   - Skips rows that already have expires_at set
 *   - Skips rows that already have subscriptionStatus set (already subscription-aware)
 *   - Stamps metadata.migrated_at and metadata.migration_script for audit trail
 */

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { and, eq, isNull, inArray, sql } from 'drizzle-orm';
import * as schema from '../server/src/schema.js';

const isDryRun = process.argv.includes('--dry-run');
const GRACE_DAYS = Number(process.env.ACCESS_MIGRATION_GRACE_DAYS) || 365;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const db = drizzle(client, { schema });

  console.log(`\n=== migrate-existing-purchases.js ===`);
  console.log(`Mode:       ${isDryRun ? 'DRY RUN (no changes written)' : 'LIVE'}`);
  console.log(`Grace days: ${GRACE_DAYS}`);
  console.log(`Cutoff:     expires_at will be set to now + ${GRACE_DAYS} days`);
  console.log('');

  // Find rows to migrate
  const targets = await db
    .select({
      id: schema.purchase.id,
      userId: schema.purchase.userId,
      groupId: schema.purchase.groupId,
      provider: schema.purchase.provider,
      purchasedAt: schema.purchase.purchasedAt,
      metadata: schema.purchase.metadata,
    })
    .from(schema.purchase)
    .where(
      and(
        eq(schema.purchase.status, 'paid'),
        isNull(schema.purchase.expiresAt),
        isNull(schema.purchase.subscriptionStatus),
        inArray(schema.purchase.provider, ['stripe', 'test'])
      )
    );

  console.log(`Found ${targets.length} purchase row(s) to migrate.`);

  if (targets.length === 0) {
    console.log('Nothing to do. Exiting.');
    await client.end();
    return;
  }

  // Preview first 10
  console.log('\nSample rows (first 10):');
  targets.slice(0, 10).forEach((row, i) => {
    console.log(`  [${i + 1}] id=${row.id}  provider=${row.provider}  purchasedAt=${row.purchasedAt}`);
  });
  if (targets.length > 10) {
    console.log(`  ... and ${targets.length - 10} more`);
  }

  if (isDryRun) {
    console.log('\nDRY RUN: no changes written. Re-run without --dry-run to apply.');
    await client.end();
    return;
  }

  const expiresAt = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const migratedAt = new Date().toISOString();
  let successCount = 0;
  let errorCount = 0;

  for (const row of targets) {
    try {
      const existingMeta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      await db
        .update(schema.purchase)
        .set({
          expiresAt,
          updatedAt: migratedAt,
          metadata: {
            ...existingMeta,
            migrated_at: migratedAt,
            migration_script: 'migrate-existing-purchases',
            migration_grace_days: GRACE_DAYS,
          },
        })
        .where(eq(schema.purchase.id, row.id));
      successCount++;
    } catch (err) {
      console.error(`  ERROR updating purchase ${row.id}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\nMigration complete: ${successCount} updated, ${errorCount} errors.`);
  console.log(`expires_at set to: ${expiresAt}`);

  await client.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
