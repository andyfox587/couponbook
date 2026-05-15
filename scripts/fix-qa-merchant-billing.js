/**
 * Fix the merchantBillingProfile for the merchant tied to a specific event slug.
 *
 * Use this when a QA paid event was seeded but the merchant billing profile is
 * missing or incomplete, causing the RSVP flow to 409 with:
 *   "Merchant billing setup is required before paid event ticketing can be enabled"
 *
 * Usage:
 *   node scripts/fix-qa-merchant-billing.js --slug <event-slug>
 *   node scripts/fix-qa-merchant-billing.js --slug <event-slug> --dry-run
 *
 * Example:
 *   node scripts/fix-qa-merchant-billing.js \
 *     --slug the-latin-effect-rsvp-qa-paid-public-mp2q3un8-1-0rycfm
 */

import { db } from '../server/src/db.js';
import { event, merchant, merchantBillingProfile } from '../server/src/schema.js';
import { eq, isNull } from 'drizzle-orm';

const DRY = process.argv.includes('--dry-run');

const slugIdx = process.argv.indexOf('--slug');
const EVENT_SLUG = slugIdx !== -1 ? process.argv[slugIdx + 1] : null;

if (!EVENT_SLUG) {
  console.error('❌ --slug <event-slug> is required');
  process.exit(1);
}

function randomToken(len = 16) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(Math.random().toString(36)[2]);
  return out.join('');
}

async function main() {
  // 1. Find event by slug
  const [ev] = await db
    .select({ id: event.id, merchantId: event.merchantId, name: event.name, isFree: event.isFree })
    .from(event)
    .where(eq(event.slug, EVENT_SLUG))
    .limit(1);

  if (!ev) {
    console.error(`❌ No event found with slug: ${EVENT_SLUG}`);
    process.exit(1);
  }

  console.log('🎟️  Event found:', { id: ev.id, name: ev.name, isFree: ev.isFree });

  if (ev.isFree) {
    console.warn('⚠️  This event is marked isFree=true — billing profile not required for free events.');
  }

  if (!ev.merchantId) {
    console.error('❌ Event has no merchantId — cannot fix billing profile.');
    process.exit(1);
  }

  // 2. Find merchant
  const [m] = await db
    .select({ id: merchant.id, name: merchant.name })
    .from(merchant)
    .where(eq(merchant.id, ev.merchantId))
    .limit(1);

  if (!m) {
    console.error(`❌ Merchant not found for id: ${ev.merchantId}`);
    process.exit(1);
  }

  console.log('🏪 Merchant:', { id: m.id, name: m.name });

  // 3. Check existing billing profile
  const [profile] = await db
    .select()
    .from(merchantBillingProfile)
    .where(eq(merchantBillingProfile.merchantId, m.id))
    .limit(1);

  const alreadyReady =
    !!profile &&
    profile.paidEventsEnabled &&
    profile.payoutDestinationVerified &&
    profile.backupChargeMethodReady &&
    !!profile.paidEventTermsAcceptedAt;

  if (alreadyReady) {
    console.log('✅ Billing profile already fully configured — no changes needed.');
    process.exit(0);
  }

  if (DRY) {
    console.log('🔍 Dry run — would', profile ? 'UPDATE' : 'INSERT', 'billing profile with:');
    console.log({
      paidEventsEnabled: true,
      payoutDestinationVerified: true,
      backupChargeMethodReady: true,
      paidEventTermsAcceptedAt: '<now>',
      paidEventTermsVersion: 'paid-events-v1',
    });
    console.log('✅ Dry run complete. No rows written.');
    process.exit(0);
  }

  if (!profile) {
    console.log('🏦 No billing profile found — creating one...');
    await db.insert(merchantBillingProfile).values({
      merchantId: m.id,
      payoutDestinationDetails: { method: 'manual', label: 'QA Test Payout' },
      payoutDestinationVerified: true,
      stripeCustomerId: `cus_qa_${randomToken(16)}`,
      backupPaymentMethodId: `pm_qa_${randomToken(16)}`,
      backupPaymentMethodLast4: '4242',
      backupChargeMethodReady: true,
      paidEventTermsAcceptedAt: new Date().toISOString(),
      paidEventTermsVersion: 'paid-events-v1',
      paidEventsEnabled: true,
      disputeRecoveryEnabled: true,
    });
    console.log('✅ Billing profile created.');
  } else {
    console.log('🏦 Incomplete billing profile found — patching missing fields...');
    await db
      .update(merchantBillingProfile)
      .set({
        payoutDestinationVerified: true,
        backupChargeMethodReady: true,
        paidEventsEnabled: true,
        paidEventTermsAcceptedAt: profile.paidEventTermsAcceptedAt || new Date().toISOString(),
        paidEventTermsVersion: profile.paidEventTermsVersion || 'paid-events-v1',
      })
      .where(eq(merchantBillingProfile.merchantId, m.id));
    console.log('✅ Billing profile patched.');
  }

  console.log(`\n🎉 Done. Merchant "${m.name}" is now ready for paid event ticketing.`);
  console.log(`   Re-test the RSVP flow at: /e/${EVENT_SLUG}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
