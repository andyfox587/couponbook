/**
 * Seed 3 dummy published events for manual QA (Chapel Hill–area foodie group).
 *
 * Looks up the foodie group (name/slug matching "chapel" + "hill"), picks up to 3
 * merchants that already have coupons in that group, and inserts one event per merchant.
 *
 * Usage (from repo root, with DATABASE_URL or discrete DB_* envs set):
 *   node scripts/seed-qa-events.js
 *   node scripts/seed-qa-events.js --dry-run
 */

import { db } from '../server/src/db.js';
import { event, foodieGroup, coupon, merchant } from '../server/src/schema.js';
import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function generateToken() {
  return [...Array(32)].map(() => Math.random().toString(36)[2]).join('');
}

function isoDaysFromNow(days, hourLocal = 18) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hourLocal, 0, 0, 0);
  return d.toISOString();
}

const DRY = process.argv.includes('--dry-run');

const EVENT_BLUEPRINTS = [
  {
    titleSuffix: '— Tasting Night (QA)',
    description:
      '[QA dummy event] Join us for a chef-led tasting and pairing. RSVP to hold your spot.',
    daysFromNow: 14,
    capacity: 40,
    isFree: true,
    visibility: 'public',
    location: '123 W Franklin St, Chapel Hill, NC',
  },
  {
    titleSuffix: '— Supper Club (QA)',
    description:
      '[QA dummy event] A cozy members-style dinner — test members-only pricing and visibility in the app.',
    daysFromNow: 21,
    capacity: 24,
    isFree: false,
    priceCents: 4500,
    membersOnlyPriceCents: 3500,
    visibility: 'members_only',
    location: 'Courtyard seating — see event staff on arrival',
  },
  {
    titleSuffix: '— Brunch Preview (QA)',
    description:
      '[QA dummy event] Weekend brunch preview. Good for testing capacity bar and public RSVP.',
    daysFromNow: 10,
    capacity: 60,
    isFree: true,
    visibility: 'public',
    location: 'Eastgate Shopping Center, Chapel Hill, NC',
  },
];

async function findChapelHillGroup() {
  const rows = await db
    .select({
      id: foodieGroup.id,
      slug: foodieGroup.slug,
      name: foodieGroup.name,
    })
    .from(foodieGroup)
    .where(
      and(
        isNull(foodieGroup.archivedAt),
        or(
          sql`lower(${foodieGroup.name}) like '%chapel%hill%'`,
          ilike(foodieGroup.slug, '%chapel%hill%'),
          ilike(foodieGroup.slug, '%chapel-hill%'),
        ),
      ),
    );

  if (rows.length === 1) return rows[0];

  if (rows.length > 1) {
    const exact = rows.find(
      (r) =>
        /chapel.*hill/i.test(r.name || '') ||
        /chapel-hill/i.test(r.slug || ''),
    );
    return exact || rows[0];
  }

  const all = await db
    .select({ id: foodieGroup.id, slug: foodieGroup.slug, name: foodieGroup.name })
    .from(foodieGroup)
    .where(isNull(foodieGroup.archivedAt));

  const fallback = all.find((g) => /chapel/i.test(g.name || '') || /chapel/i.test(g.slug || ''));
  return fallback || null;
}

async function merchantIdsForGroup(groupId) {
  const rows = await db
    .select({ merchantId: coupon.merchantId })
    .from(coupon)
    .where(and(eq(coupon.groupId, groupId), isNull(coupon.deletedAt)));

  const seen = new Set();
  const ids = [];
  for (const r of rows) {
    if (!r.merchantId || seen.has(r.merchantId)) continue;
    seen.add(r.merchantId);
    ids.push(r.merchantId);
    if (ids.length >= 3) break;
  }
  return ids;
}

async function fallbackMerchants(limit) {
  const rows = await db
    .select({ id: merchant.id })
    .from(merchant)
    .where(isNull(merchant.deletedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

async function main() {
  const group = await findChapelHillGroup();
  if (!group) {
    console.error('❌ No foodie group found matching Chapel Hill. List groups in DB and set slug/name.');
    process.exit(1);
  }

  console.log('📍 Foodie group:', { id: group.id, slug: group.slug, name: group.name });

  let merchantIds = await merchantIdsForGroup(group.id);
  if (merchantIds.length < 3) {
    console.warn(
      `⚠️  Only ${merchantIds.length} merchant(s) with coupons in this group; filling from active merchants.`,
    );
    const extra = await fallbackMerchants(3);
    const merged = [...new Set([...merchantIds, ...extra])].slice(0, 3);
    merchantIds = merged;
  }

  if (merchantIds.length < 3) {
    console.error('❌ Need at least 3 merchants in the database (or coupons in this group).');
    process.exit(1);
  }

  const merchants = await db
    .select({ id: merchant.id, name: merchant.name })
    .from(merchant)
    .where(inArray(merchant.id, merchantIds));

  const byId = Object.fromEntries(merchants.map((m) => [m.id, m]));

  const created = [];

  for (let i = 0; i < 3; i++) {
    const mid = merchantIds[i];
    const m = byId[mid];
    const bp = EVENT_BLUEPRINTS[i];
    const baseName = (m?.name || 'Restaurant').slice(0, 120);
    const name = `${baseName} ${bp.titleSuffix}`.slice(0, 255);
    const slug = `${slugify(`${baseName}-${bp.titleSuffix}`)}-${Date.now().toString(36)}-${i}-${generateToken().slice(0, 6)}`;
    const memberAccessToken = generateToken();
    const start = isoDaysFromNow(bp.daysFromNow);
    const end = isoDaysFromNow(bp.daysFromNow, 21);

    const payload = {
      groupId: group.id,
      merchantId: mid,
      name,
      description: bp.description,
      startDatetime: start,
      endDatetime: end,
      location: bp.location,
      capacity: bp.capacity,
      slug,
      memberAccessToken,
      status: 'published',
      isFree: bp.isFree,
      priceCents: bp.isFree ? null : bp.priceCents ?? null,
      membersOnlyPriceCents: bp.membersOnlyPriceCents ?? null,
      visibility: bp.visibility,
      maxTicketsPerGuest: 2,
      inviteOnly: false,
      coverImageUrl: null,
      bannerImageUrl: null,
    };

    console.log('\n🗓️  Event', i + 1, {
      merchant: m?.name || mid,
      name,
      slug,
      start: start.slice(0, 16),
      visibility: payload.visibility,
    });

    if (DRY) {
      created.push({ dryRun: true, payload });
      continue;
    }

    const [row] = await db.insert(event).values(payload).returning();
    created.push(row);
    console.log('   ✅ inserted id:', row.id);
  }

  console.log('\n✅ Done.', DRY ? '(dry-run — no rows written)' : 'Open /events or /e/<slug> on your deployment.');
  if (!DRY && created.length) {
    console.log(
      '   Slugs:',
      created.map((c) => c.slug).filter(Boolean),
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
