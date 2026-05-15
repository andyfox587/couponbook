#!/usr/bin/env node
/**
 * Hard-delete QA dummy events created by seed-qa-events.js / seed-qa-paid-public-event.js
 * (description starts with "[QA dummy event]").
 *
 * Removes dependent rows (same FK order as wipe-event-purchases.js), then deletes the event rows.
 *
 * Usage:
 *   node scripts/wipe-qa-events.js --slug <slug> [--dry-run]   # one event
 *   node scripts/wipe-qa-events.js --all [--dry-run]            # every QA dummy event in DB
 */

import 'dotenv/config';
import { pool } from '../server/src/db.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { dryRun: false, slug: null, all: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--slug') opts.slug = args[++i] || null;
    else if (a === '--all') opts.all = true;
  }
  return opts;
}

function usageAndExit(msg) {
  if (msg) console.error(`\n❌ ${msg}`);
  console.error('\nUsage:');
  console.error('  node scripts/wipe-qa-events.js --slug <event-slug> [--dry-run]');
  console.error('  node scripts/wipe-qa-events.js --all [--dry-run]');
  process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.slug && !opts.all) {
    usageAndExit('Pass --slug <slug> (one event) or --all (every `[QA dummy event]` row).');
  }
  if (opts.slug && opts.all) {
    usageAndExit('Use only one of --slug or --all.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let targetsRes;
    if (opts.slug) {
      targetsRes = await client.query(
        `SELECT id, slug, name FROM event
         WHERE slug = $1 AND description LIKE '[QA dummy event]%'
         ORDER BY created_at`,
        [opts.slug],
      );
      if (targetsRes.rows.length === 0) {
        console.error(`\n❌ No QA dummy event found with slug: ${opts.slug}`);
        await client.query('ROLLBACK');
        process.exit(1);
      }
    } else if (opts.all) {
      targetsRes = await client.query(
        `SELECT id, slug, name FROM event
         WHERE description LIKE '[QA dummy event]%'
         ORDER BY created_at`,
      );
    }

    const targets = targetsRes.rows;
    console.log(`\n🎯 QA dummy events to remove: ${targets.length}`);
    for (const t of targets) {
      console.log(`   • ${t.name} (${t.slug})`);
      console.log(`     id: ${t.id}`);
    }

    if (targets.length === 0) {
      console.log('\n✅ Nothing to delete.');
      await client.query('COMMIT');
      return;
    }

    const ids = targets.map((t) => t.id);

    const ordersRes = await client.query(
      `SELECT id FROM event_order WHERE event_id = ANY($1::uuid[])`,
      [ids],
    );
    const orderIds = ordersRes.rows.map((r) => r.id);

    const rsvpsRes = await client.query(
      `SELECT count(*)::int AS c FROM event_rsvp WHERE event_id = ANY($1::uuid[])`,
      [ids],
    );
    const rsvpCount = rsvpsRes.rows[0]?.c ?? 0;

    console.log(`\n   ↳ event_order rows: ${orderIds.length}`);
    console.log(`   ↳ event_rsvp rows:   ${rsvpCount}`);

    if (opts.dryRun) {
      console.log('\n🔍 DRY RUN: no changes made.');
      await client.query('ROLLBACK');
      return;
    }

    if (orderIds.length > 0) {
      await client.query(`DELETE FROM event_dispute WHERE event_order_id = ANY($1::uuid[])`, [orderIds]);
      await client.query(`DELETE FROM payment_event WHERE event_order_id = ANY($1::uuid[])`, [orderIds]);
      const delOrd = await client.query(
        `DELETE FROM event_order WHERE event_id = ANY($1::uuid[]) RETURNING id`,
        [ids],
      );
      console.log(`\n🗑️  Deleted event_order: ${delOrd.rowCount}`);
    }

    const delRsvp = await client.query(
      `DELETE FROM event_rsvp WHERE event_id = ANY($1::uuid[]) RETURNING id`,
      [ids],
    );
    console.log(`🗑️  Deleted event_rsvp: ${delRsvp.rowCount}`);

    const delEv = await client.query(
      `DELETE FROM event WHERE id = ANY($1::uuid[]) RETURNING id, slug`,
      [ids],
    );
    console.log(`🗑️  Deleted event: ${delEv.rowCount}`);

    await client.query('COMMIT');
    console.log('\n✅ QA dummy events removed.');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('\n❌ Error:', err?.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error('\n❌ Fatal:', err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
