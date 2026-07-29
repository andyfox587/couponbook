#!/usr/bin/env node
/**
 * scripts/stripe-create-webhook.mjs
 *
 * Create a Stripe webhook endpoint for a given URL and print its signing
 * secret — i.e. the STRIPE_WEBHOOK_SECRET for that deployment.
 *
 * Signing secrets are per-endpoint, so every deployment (production, staging,
 * a preview you want to test purchases against) needs its own endpoint and its
 * own secret. This subscribes exactly the 14 events the app's handler
 * processes, so you don't have to tick them by hand in the dashboard.
 *
 * The key you pass decides the mode — sk_test_ makes a test endpoint,
 * sk_live_ makes a live one. It refuses to create a LIVE endpoint unless you
 * also pass --allow-live, so a stray key can't quietly wire up real money.
 *
 * Usage:
 *   STRIPE_KEY=sk_test_… node scripts/stripe-create-webhook.mjs \
 *     --url https://couponbook-staging.vercel.app
 *
 *   --url <base>     deployment base URL (the /api/v1/stripe/webhook path is appended)
 *   --list           just list existing endpoints for this key's mode
 *   --allow-live     required when the key is sk_live_
 *   --help
 */
import Stripe from 'stripe';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};

if (flag('help')) {
  console.log(`
Create a Stripe webhook endpoint and print its signing secret.

  STRIPE_KEY=sk_test_… node scripts/stripe-create-webhook.mjs --url https://your-staging-url

  --url <base>   deployment base URL (path /api/v1/stripe/webhook is appended)
  --list         list existing endpoints instead of creating one
  --allow-live   required if STRIPE_KEY is a live key
  --help
`);
  process.exit(0);
}

const WEBHOOK_PATH = '/api/v1/stripe/webhook';
const EVENTS = [
  'checkout.session.completed', 'checkout.session.expired',
  'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.payment_succeeded', 'invoice.payment_failed', 'invoice.upcoming',
  'payment_intent.succeeded', 'payment_intent.payment_failed',
  'charge.refunded', 'refund.failed',
  'charge.dispute.created', 'charge.dispute.updated', 'charge.dispute.closed',
];

function die(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const key = (process.env.STRIPE_KEY || '').trim();
if (!key) die('STRIPE_KEY is not set. Export your sk_test_ (or sk_live_) key and re-run.');
if (!/^sk_(test|live)_/.test(key)) die(`STRIPE_KEY must start with sk_test_ or sk_live_ (got "${key.slice(0, 8)}…").`);

const isLive = key.startsWith('sk_live_');
if (isLive && !flag('allow-live')) {
  die('That is a LIVE key. Re-run with --allow-live if you really mean to create a live endpoint.');
}

const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });

async function main() {
  const mode = isLive ? 'LIVE' : 'TEST';
  console.log(`\n=== Stripe webhook (${mode} mode) ===\n`);

  const existing = await stripe.webhookEndpoints.list({ limit: 100 });

  if (flag('list')) {
    if (!existing.data.length) console.log('  (no endpoints in this mode)');
    existing.data.forEach((e) => console.log(`  ${e.id}  ${e.status.padEnd(8)}  ${e.url}`));
    console.log('');
    process.exit(0);
  }

  const base = (opt('url', '') || '').replace(/\/+$/, '');
  if (!base) die('--url is required, e.g. --url https://couponbook-staging.vercel.app');
  if (!/^https:\/\//.test(base)) die('--url must be https.');
  const url = base + WEBHOOK_PATH;

  const dup = existing.data.find((e) => e.url === url);
  if (dup) {
    console.log(`⚠️  An endpoint for this URL already exists: ${dup.id} (status=${dup.status}).`);
    console.log(`   Stripe only reveals a signing secret at creation time, so this can't reprint it.`);
    console.log(`   Delete it in the dashboard and re-run to mint a fresh endpoint + secret.\n`);
    process.exit(0);
  }

  const ep = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTS,
    description: `Couponbook ${mode.toLowerCase()} — ${base}`,
  });

  console.log(`✅ Created ${mode} webhook ${ep.id}`);
  console.log(`   URL:    ${ep.url}`);
  console.log(`   Events: ${EVENTS.length}`);
  console.log(`\n🔑 STRIPE_WEBHOOK_SECRET — shown ONCE, copy it now:\n`);
  console.log(`      ${ep.secret}\n`);
  console.log(`   → Paste into that deployment's env vars. Do not commit it.\n`);
}

main().catch((e) => {
  console.error('\n❌ Fatal:', e?.message || e);
  process.exit(1);
});
