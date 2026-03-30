/**
 * Seed 1 dummy paid public event for manual QA.
 *
 * Creates a published event that is:
 * - non-members event (visibility: public)
 * - paid (isFree: false, priceCents set)
 * - purchasable ticket style (maxTicketsPerGuest > 1)
 *
 * Merchant/group are selected randomly from existing coupon records so the event
 * stays associated with realistic data already present in the DB.
 *
 * Usage:
 *   node scripts/seed-qa-paid-public-event.js
 *   node scripts/seed-qa-paid-public-event.js --dry-run
 */

import { db } from '../server/src/db.js';
import { coupon, event, merchant } from '../server/src/schema.js';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

const DRY = process.argv.includes('--dry-run');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function randomToken(len = 32) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(Math.random().toString(36)[2]);
  return out.join('');
}

function isoDaysFromNow(days, hourLocal = 19) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hourLocal, 0, 0, 0);
  return d.toISOString();
}

async function pickRandomMerchantGroupPair() {
  const pairs = await db
    .select({
      merchantId: coupon.merchantId,
      groupId: coupon.groupId,
    })
    .from(coupon)
    .where(and(isNull(coupon.deletedAt), isNotNull(coupon.merchantId), isNotNull(coupon.groupId)));

  if (!pairs.length) return null;
  return pairs[Math.floor(Math.random() * pairs.length)];
}

async function main() {
  const pair = await pickRandomMerchantGroupPair();
  if (!pair) {
    console.error('❌ No coupon-backed merchant/group pair found.');
    process.exit(1);
  }

  const [m] = await db
    .select({ id: merchant.id, name: merchant.name })
    .from(merchant)
    .where(and(eq(merchant.id, pair.merchantId), isNull(merchant.deletedAt)))
    .limit(1);

  if (!m) {
    console.error('❌ Selected merchant was missing or deleted. Try again.');
    process.exit(1);
  }

  const baseName = m.name || 'Merchant';
  const name = `${baseName} - Ticketed Public QA Event`.slice(0, 255);
  const slug = `${slugify(name)}-${Date.now().toString(36)}-${randomToken(6)}`;
  const startDatetime = isoDaysFromNow(12, 19);
  const endDatetime = isoDaysFromNow(12, 22);

  const payload = {
    groupId: pair.groupId,
    merchantId: pair.merchantId,
    name,
    description:
      '[QA dummy event] Public paid event for ticket purchase flow testing. Non-members should be able to view but must purchase to attend.',
    startDatetime,
    endDatetime,
    location: 'QA Venue - Downtown',
    capacity: 48,
    slug,
    memberAccessToken: randomToken(32),
    status: 'published',
    isFree: false,
    priceCents: 4200,
    membersOnlyPriceCents: null,
    visibility: 'public',
    maxTicketsPerGuest: 4,
    inviteOnly: false,
    coverImageUrl: null,
    bannerImageUrl: null,
  };

  console.log('🎯 Selected merchant/group:', {
    merchantId: pair.merchantId,
    merchantName: m.name,
    groupId: pair.groupId,
  });
  console.log('🗓️ Event payload preview:', {
    name: payload.name,
    slug: payload.slug,
    isFree: payload.isFree,
    priceCents: payload.priceCents,
    visibility: payload.visibility,
    startDatetime: payload.startDatetime,
  });

  if (DRY) {
    console.log('✅ Dry run complete. No rows written.');
    process.exit(0);
  }

  const [inserted] = await db.insert(event).values(payload).returning();
  console.log('✅ Inserted event:', { id: inserted.id, slug: inserted.slug });
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
