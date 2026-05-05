#!/usr/bin/env node
/**
 * wipe-event-purchases.js
 *
 * Hard-deletes event RSVPs, ticket orders, and all related rows so you can re-test
 * the event purchase flow from scratch.
 *
 * Deleted (in safe FK order):
 *   event_dispute       – disputes linked to the matching orders
 *   payment_event       – Stripe webhook audit rows linked to the matching orders
 *   event_order         – ticket orders (cascades: event_refund, event_guest_token)
 *   event_rsvp          – RSVP rows for the matched user / event
 *
 * Scope (pick one or combine):
 *   --email <email>     Limit to a specific user (by email)
 *   --user-id <uuid>    Limit to a specific user (by id)
 *   --event-id <uuid>   Limit to a specific event (by id)
 *   --event-slug <slug> Limit to a specific event (by slug)
 *   --all               Wipe ALL event purchases for ALL users (dev/QA only)
 *
 * Options:
 *   --dry-run           Show what would be deleted without making changes
 *
 * Examples:
 *   node scripts/wipe-event-purchases.js --email me@example.com --dry-run
 *   node scripts/wipe-event-purchases.js --user-id 11111111-2222-3333-4444-555555555555
 *   node scripts/wipe-event-purchases.js --event-slug my-cool-event
 *   node scripts/wipe-event-purchases.js --all --dry-run
 *   node scripts/wipe-event-purchases.js --all
 */

import 'dotenv/config';
import { pool } from '../server/src/db.js';

function isUuid(s) {
  return typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    dryRun: false,
    all: false,
    email: null,
    userId: null,
    eventId: null,
    eventSlug: null,
  };

  const first = args.find((a) => a && !a.startsWith('--'));
  if (first) {
    if (isUuid(first)) opts.userId = first;
    else opts.email = first;
  }

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--all') opts.all = true;
    else if (a === '--email') opts.email = args[++i] || null;
    else if (a === '--user-id') opts.userId = args[++i] || null;
    else if (a === '--event-id') opts.eventId = args[++i] || null;
    else if (a === '--event-slug') opts.eventSlug = args[++i] || null;
  }

  return opts;
}

function usageAndExit(message) {
  if (message) console.error(`\n❌ ${message}`);
  console.error('\nUsage:');
  console.error('  node scripts/wipe-event-purchases.js --email <email> [--event-id <uuid> | --event-slug <slug>] [--dry-run]');
  console.error('  node scripts/wipe-event-purchases.js --user-id <uuid> [--event-id <uuid> | --event-slug <slug>] [--dry-run]');
  console.error('  node scripts/wipe-event-purchases.js --event-slug <slug> [--dry-run]');
  console.error('  node scripts/wipe-event-purchases.js --all [--dry-run]');
  process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv);

  const hasScope = opts.all || opts.email || opts.userId || opts.eventId || opts.eventSlug;
  if (!hasScope) {
    usageAndExit('Provide at least one of: --email, --user-id, --event-id, --event-slug, or --all.');
  }
  if (opts.userId && !isUuid(opts.userId)) {
    usageAndExit('Invalid --user-id (expected UUID).');
  }
  if (opts.eventId && !isUuid(opts.eventId)) {
    usageAndExit('Invalid --event-id (expected UUID).');
  }
  if (opts.eventId && opts.eventSlug) {
    usageAndExit('Use only one of --event-id or --event-slug.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1) Resolve user (if scoped to one) ───────────────────────────────────
    let user = null;
    if (opts.userId || opts.email) {
      const res = opts.userId
        ? await client.query(`SELECT id, email, name FROM "user" WHERE id = $1`, [opts.userId])
        : await client.query(`SELECT id, email, name FROM "user" WHERE email = $1`, [opts.email]);

      if (res.rows.length === 0) {
        usageAndExit(`User not found (${opts.userId ?? opts.email}).`);
      }
      user = res.rows[0];
      console.log(`\n👤 User: ${user.name} <${user.email}>`);
      console.log(`   ID: ${user.id}`);
    }

    // ── 2) Resolve event (if scoped to one) ──────────────────────────────────
    let eventRow = null;
    if (opts.eventId || opts.eventSlug) {
      const res = opts.eventId
        ? await client.query(`SELECT id, slug, name FROM event WHERE id = $1`, [opts.eventId])
        : await client.query(`SELECT id, slug, name FROM event WHERE slug = $1`, [opts.eventSlug]);

      if (res.rows.length === 0) {
        usageAndExit(`Event not found (${opts.eventId ?? opts.eventSlug}).`);
      }
      eventRow = res.rows[0];
      console.log(`\n🎉 Event: ${eventRow.name} (${eventRow.slug})`);
      console.log(`   ID: ${eventRow.id}`);
    }

    if (opts.all) {
      console.log('\n⚠️  --all: targeting ALL event purchases across ALL users');
    }

    // ── 3) Build WHERE clauses ────────────────────────────────────────────────
    // For event_order / event_rsvp we need different WHERE clauses depending on scope.

    // Build parameterised WHERE for event_order
    const orderParams = [];
    const orderWhereParts = [];
    if (user) {
      orderParams.push(user.id);
      orderWhereParts.push(`user_id = $${orderParams.length}`);
    }
    if (eventRow) {
      orderParams.push(eventRow.id);
      orderWhereParts.push(`event_id = $${orderParams.length}`);
    }
    const orderWhere = orderWhereParts.length > 0
      ? 'WHERE ' + orderWhereParts.join(' AND ')
      : ''; // --all: no filter

    // Build parameterised WHERE for event_rsvp
    const rsvpParams = [];
    const rsvpWhereParts = [];
    if (user) {
      rsvpParams.push(user.id);
      rsvpWhereParts.push(`user_id = $${rsvpParams.length}`);
    }
    if (eventRow) {
      rsvpParams.push(eventRow.id);
      rsvpWhereParts.push(`event_id = $${rsvpParams.length}`);
    }
    const rsvpWhere = rsvpWhereParts.length > 0
      ? 'WHERE ' + rsvpWhereParts.join(' AND ')
      : '';

    // ── 4) Preview orders ─────────────────────────────────────────────────────
    const ordersRes = await client.query(
      `SELECT
         eo.id,
         eo.status,
         eo.quantity,
         eo.amount_cents,
         eo.currency,
         eo.stripe_payment_intent_id,
         eo.created_at,
         e.name  AS event_name,
         e.slug  AS event_slug,
         u.email AS user_email
       FROM event_order eo
       LEFT JOIN event e ON e.id = eo.event_id
       LEFT JOIN "user" u ON u.id = eo.user_id
       ${orderWhere}
       ORDER BY eo.created_at DESC`,
      orderParams
    );

    const orders = ordersRes.rows;
    const orderIds = orders.map((o) => o.id);

    console.log(`\n🎟️  event_order rows found: ${orders.length}`);
    if (orders.length > 0) {
      const byStatus = {};
      for (const o of orders) byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      console.log('   By status:', byStatus);
      console.log('\n   Most recent:');
      orders.slice(0, 5).forEach((o, idx) => {
        const amt = o.amount_cents != null ? (o.amount_cents / 100).toFixed(2) : '0.00';
        console.log(`   ${idx + 1}. ${o.event_name ?? '(unknown event)'} – ${o.user_email ?? '(guest)'}`);
        console.log(`      Order ID:  ${o.id}`);
        console.log(`      Status:    ${o.status}`);
        console.log(`      Qty:       ${o.quantity}  Amount: ${amt} ${String(o.currency || '').toUpperCase()}`);
        console.log(`      PI:        ${o.stripe_payment_intent_id ?? '—'}`);
        console.log(`      Created:   ${o.created_at}`);
      });
      if (orders.length > 5) console.log(`   … and ${orders.length - 5} more`);
    }

    // ── 5) Preview RSVPs ──────────────────────────────────────────────────────
    const rsvpsRes = await client.query(
      `SELECT
         er.id,
         er.status,
         er.attendees,
         er.created_at,
         e.name  AS event_name,
         e.slug  AS event_slug,
         u.email AS user_email
       FROM event_rsvp er
       LEFT JOIN event e ON e.id = er.event_id
       LEFT JOIN "user" u ON u.id = er.user_id
       ${rsvpWhere}
       ORDER BY er.created_at DESC`,
      rsvpParams
    );

    const rsvps = rsvpsRes.rows;
    console.log(`\n📋 event_rsvp rows found: ${rsvps.length}`);
    if (rsvps.length > 0) {
      const byStatus = {};
      for (const r of rsvps) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      console.log('   By status:', byStatus);
    }

    // ── 6) Preview dependents ─────────────────────────────────────────────────
    let disputeCount = 0;
    let paymentEventCount = 0;
    let refundCount = 0;
    let guestTokenCount = 0;

    if (orderIds.length > 0) {
      const dRes = await client.query(
        `SELECT count(*)::int AS c FROM event_dispute WHERE event_order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      disputeCount = dRes.rows[0]?.c ?? 0;

      const peRes = await client.query(
        `SELECT count(*)::int AS c FROM payment_event WHERE event_order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      paymentEventCount = peRes.rows[0]?.c ?? 0;

      const rfRes = await client.query(
        `SELECT count(*)::int AS c FROM event_refund WHERE event_order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      refundCount = rfRes.rows[0]?.c ?? 0;

      const gtRes = await client.query(
        `SELECT count(*)::int AS c FROM event_guest_token WHERE event_order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      guestTokenCount = gtRes.rows[0]?.c ?? 0;
    }

    // RSVPs not tied to any order may still have guest tokens
    const rsvpIds = rsvps.map((r) => r.id);
    if (rsvpIds.length > 0) {
      const gtRsvpRes = await client.query(
        `SELECT count(*)::int AS c FROM event_guest_token
         WHERE event_rsvp_id = ANY($1::uuid[])
           AND (event_order_id IS NULL OR NOT (event_order_id = ANY($2::uuid[])))`,
        [rsvpIds, orderIds.length > 0 ? orderIds : ['00000000-0000-0000-0000-000000000000']]
      );
      guestTokenCount += gtRsvpRes.rows[0]?.c ?? 0;
    }

    console.log(`\n   ↳ event_dispute rows:     ${disputeCount}`);
    console.log(`   ↳ payment_event rows:     ${paymentEventCount}`);
    console.log(`   ↳ event_refund rows:      ${refundCount}  (cascade from order)`);
    console.log(`   ↳ event_guest_token rows: ${guestTokenCount}  (cascade from order/rsvp)`);

    if (opts.dryRun) {
      console.log('\n🔍 DRY RUN: no changes made.');
      await client.query('ROLLBACK');
      return;
    }

    // ── 7) Delete disputes ────────────────────────────────────────────────────
    if (orderIds.length > 0) {
      const delDisputes = await client.query(
        `DELETE FROM event_dispute WHERE event_order_id = ANY($1::uuid[]) RETURNING id`,
        [orderIds]
      );
      console.log(`\n🗑️  Deleted event_dispute: ${delDisputes.rowCount}`);

      // ── 8) Delete payment_event rows linked to these orders ─────────────────
      const delPe = await client.query(
        `DELETE FROM payment_event WHERE event_order_id = ANY($1::uuid[]) RETURNING id`,
        [orderIds]
      );
      console.log(`🗑️  Deleted payment_event: ${delPe.rowCount}`);

      // ── 9) Delete orders (cascades event_refund + event_guest_token) ─────────
      const delOrders = await client.query(
        `DELETE FROM event_order ${orderWhere} RETURNING id`,
        orderParams
      );
      console.log(`🗑️  Deleted event_order: ${delOrders.rowCount}  (+ cascaded refunds & guest tokens)`);
    } else {
      console.log('\n   No event_order rows to delete.');
    }

    // ── 10) Delete RSVPs ──────────────────────────────────────────────────────
    const delRsvps = await client.query(
      `DELETE FROM event_rsvp ${rsvpWhere} RETURNING id`,
      rsvpParams
    );
    console.log(`🗑️  Deleted event_rsvp: ${delRsvps.rowCount}`);

    await client.query('COMMIT');
    console.log('\n✅ Done. Event purchases wiped — ready to re-test the purchase flow.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('\n❌ Error wiping event purchases:', err?.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error('\n❌ Fatal error:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
