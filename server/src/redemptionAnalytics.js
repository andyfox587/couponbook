import { db } from './db.js';
import { coupon, couponRedemption, event, foodieGroup, merchant, purchase, user } from './schema.js';
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm';

function buildCutoff(days = 30) {
  const safeDays = Number.isFinite(Number(days)) && Number(days) > 0 ? Number(days) : 30;
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
}

function toNumber(value) {
  return Number(value || 0);
}

export async function getMerchantRedemptionOverview(userId, days = 30) {
  const cutoff = buildCutoff(days);
  const baseFilters = and(
    eq(merchant.ownerId, userId),
    isNull(couponRedemption.deletedAt),
    isNull(coupon.deletedAt),
    isNull(merchant.deletedAt),
    gte(couponRedemption.redeemedAt, cutoff),
  );

  const [totalRows, topCouponRows] = await Promise.all([
    db
      .select({
        redemptionsLast30Days: sql`count(${couponRedemption.id})`.as('redemptions_last_30_days'),
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(baseFilters),
    db
      .select({
        couponId: coupon.id,
        couponTitle: coupon.title,
        redemptions: sql`count(${couponRedemption.id})`.as('redemptions'),
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(baseFilters)
      .groupBy(coupon.id, coupon.title)
      .orderBy(desc(sql`count(${couponRedemption.id})`), asc(coupon.title), asc(coupon.id))
      .limit(1),
  ]);

  const topCoupon = topCouponRows[0]
    ? {
        couponId: topCouponRows[0].couponId,
        couponTitle: topCouponRows[0].couponTitle,
        redemptions: toNumber(topCouponRows[0].redemptions),
      }
    : null;

  return {
    redemptionsLast30Days: toNumber(totalRows[0]?.redemptionsLast30Days),
    topCoupon,
  };
}

export async function getFoodieGroupRedemptionOverview(groupId, days = 30) {
  const cutoff = buildCutoff(days);
  const baseFilters = and(
    eq(coupon.groupId, groupId),
    isNull(couponRedemption.deletedAt),
    isNull(coupon.deletedAt),
    isNull(merchant.deletedAt),
    isNull(foodieGroup.archivedAt),
    gte(couponRedemption.redeemedAt, cutoff),
  );

  const [totalRows, topCouponRows] = await Promise.all([
    db
      .select({
        redemptionsLast30Days: sql`count(${couponRedemption.id})`.as('redemptions_last_30_days'),
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .innerJoin(foodieGroup, eq(foodieGroup.id, coupon.groupId))
      .where(baseFilters),
    db
      .select({
        couponId: coupon.id,
        couponTitle: coupon.title,
        submittedBy: merchant.name,
        submittedAt: coupon.createdAt,
        expiresAt: coupon.expiresAt,
        redemptions: sql`count(${couponRedemption.id})`.as('redemptions'),
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .innerJoin(foodieGroup, eq(foodieGroup.id, coupon.groupId))
      .where(baseFilters)
      .groupBy(coupon.id, coupon.title, merchant.name, coupon.createdAt, coupon.expiresAt)
      .orderBy(desc(sql`count(${couponRedemption.id})`), asc(coupon.title), asc(coupon.id))
      .limit(1),
  ]);

  const topCoupon = topCouponRows[0]
    ? {
        couponId: topCouponRows[0].couponId,
        couponTitle: topCouponRows[0].couponTitle,
        submittedBy: topCouponRows[0].submittedBy || null,
        submittedAt: topCouponRows[0].submittedAt || null,
        expiresAt: topCouponRows[0].expiresAt || null,
        redemptions: toNumber(topCouponRows[0].redemptions),
      }
    : null;

  return {
    redemptionsLast30Days: toNumber(totalRows[0]?.redemptionsLast30Days),
    topCoupon,
  };
}

async function loadGroupRow(groupIdOrSlug) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrSlug);
  const [row] = await db
    .select({ id: foodieGroup.id, slug: foodieGroup.slug, name: foodieGroup.name, archivedAt: foodieGroup.archivedAt })
    .from(foodieGroup)
    .where(isUuid ? eq(foodieGroup.id, groupIdOrSlug) : eq(foodieGroup.slug, groupIdOrSlug));
  return row || null;
}

export async function getFoodieGroupMetrics(groupIdOrSlug) {
  const groupRow = await loadGroupRow(groupIdOrSlug);
  if (!groupRow) return null;

  const groupId = groupRow.id;
  const now = new Date().toISOString();

  const [
    membersRows,
    restaurantsRows,
    couponsActiveRows,
    redeemedRows,
    revenueRows,
    eventsHeldRows,
  ] = await Promise.all([
    db
      .select({ value: sql`count(distinct ${purchase.userId})`.as('value') })
      .from(purchase)
      .where(and(eq(purchase.groupId, groupId), eq(purchase.status, 'paid'))),
    db
      .select({ value: sql`count(distinct ${coupon.merchantId})`.as('value') })
      .from(coupon)
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(and(eq(coupon.groupId, groupId), isNull(coupon.deletedAt), isNull(merchant.deletedAt))),
    db
      .select({ value: sql`count(${coupon.id})`.as('value') })
      .from(coupon)
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(and(
        eq(coupon.groupId, groupId),
        isNull(coupon.deletedAt),
        isNull(merchant.deletedAt),
        sql`${coupon.expiresAt} > ${now}`,
      )),
    db
      .select({ value: sql`count(${couponRedemption.id})`.as('value') })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(and(
        eq(coupon.groupId, groupId),
        isNull(couponRedemption.deletedAt),
        isNull(coupon.deletedAt),
        isNull(merchant.deletedAt),
      )),
    db
      .select({ value: sql`COALESCE(SUM(${purchase.amountCents}), 0)`.as('value') })
      .from(purchase)
      .where(and(eq(purchase.groupId, groupId), eq(purchase.status, 'paid'))),
    db
      .select({ value: sql`count(${event.id})`.as('value') })
      .from(event)
      .where(and(eq(event.groupId, groupId), isNull(event.deletedAt))),
  ]);

  return {
    groupId,
    slug: groupRow.slug,
    name: groupRow.name,
    members: toNumber(membersRows[0]?.value),
    restaurants: toNumber(restaurantsRows[0]?.value),
    coupons_active: toNumber(couponsActiveRows[0]?.value),
    coupons_redeemed: toNumber(redeemedRows[0]?.value),
    gross_revenue_cents: toNumber(revenueRows[0]?.value),
    events_held: toNumber(eventsHeldRows[0]?.value),
    events_revenue_cents: 0,
    as_of: now,
  };
}

export async function getAllFoodieGroupMetrics() {
  const now = new Date().toISOString();

  const groups = await db
    .select({ id: foodieGroup.id, slug: foodieGroup.slug, name: foodieGroup.name })
    .from(foodieGroup)
    .where(isNull(foodieGroup.archivedAt))
    .orderBy(asc(foodieGroup.name), asc(foodieGroup.id));

  if (groups.length === 0) return [];

  const [
    membersByGroup,
    restaurantsByGroup,
    couponsActiveByGroup,
    redeemedByGroup,
    revenueByGroup,
    eventsHeldByGroup,
  ] = await Promise.all([
    db
      .select({
        groupId: purchase.groupId,
        value: sql`count(distinct ${purchase.userId})`.as('value'),
      })
      .from(purchase)
      .where(eq(purchase.status, 'paid'))
      .groupBy(purchase.groupId),
    db
      .select({
        groupId: coupon.groupId,
        value: sql`count(distinct ${coupon.merchantId})`.as('value'),
      })
      .from(coupon)
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(and(isNull(coupon.deletedAt), isNull(merchant.deletedAt)))
      .groupBy(coupon.groupId),
    db
      .select({
        groupId: coupon.groupId,
        value: sql`count(${coupon.id})`.as('value'),
      })
      .from(coupon)
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(and(
        isNull(coupon.deletedAt),
        isNull(merchant.deletedAt),
        sql`${coupon.expiresAt} > ${now}`,
      ))
      .groupBy(coupon.groupId),
    db
      .select({
        groupId: coupon.groupId,
        value: sql`count(${couponRedemption.id})`.as('value'),
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(and(
        isNull(couponRedemption.deletedAt),
        isNull(coupon.deletedAt),
        isNull(merchant.deletedAt),
      ))
      .groupBy(coupon.groupId),
    db
      .select({
        groupId: purchase.groupId,
        value: sql`COALESCE(SUM(${purchase.amountCents}), 0)`.as('value'),
      })
      .from(purchase)
      .where(eq(purchase.status, 'paid'))
      .groupBy(purchase.groupId),
    db
      .select({
        groupId: event.groupId,
        value: sql`count(${event.id})`.as('value'),
      })
      .from(event)
      .where(isNull(event.deletedAt))
      .groupBy(event.groupId),
  ]);

  const toMap = (rows) => {
    const m = new Map();
    for (const row of rows) m.set(row.groupId, toNumber(row.value));
    return m;
  };

  const members = toMap(membersByGroup);
  const restaurants = toMap(restaurantsByGroup);
  const couponsActive = toMap(couponsActiveByGroup);
  const redeemed = toMap(redeemedByGroup);
  const revenue = toMap(revenueByGroup);
  const eventsHeld = toMap(eventsHeldByGroup);

  return groups.map((g) => ({
    groupId: g.id,
    slug: g.slug,
    name: g.name,
    members: members.get(g.id) ?? 0,
    restaurants: restaurants.get(g.id) ?? 0,
    coupons_active: couponsActive.get(g.id) ?? 0,
    coupons_redeemed: redeemed.get(g.id) ?? 0,
    gross_revenue_cents: revenue.get(g.id) ?? 0,
    events_held: eventsHeld.get(g.id) ?? 0,
    events_revenue_cents: 0,
    as_of: now,
  }));
}

export async function getPlatformRedemptionOverview(days = 30) {
  const cutoff = buildCutoff(days);
  const baseFilters = and(
    isNull(couponRedemption.deletedAt),
    isNull(coupon.deletedAt),
    isNull(merchant.deletedAt),
    isNull(foodieGroup.archivedAt),
    gte(couponRedemption.redeemedAt, cutoff),
  );

  const [totalRows, topGroupRows, recentRedemptionRows] = await Promise.all([
    db
      .select({
        redemptionsLast30Days: sql`count(${couponRedemption.id})`.as('redemptions_last_30_days'),
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .innerJoin(foodieGroup, eq(foodieGroup.id, coupon.groupId))
      .where(baseFilters),
    db
      .select({
        groupId: foodieGroup.id,
        groupName: foodieGroup.name,
        redemptions: sql`count(${couponRedemption.id})`.as('redemptions'),
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .innerJoin(foodieGroup, eq(foodieGroup.id, coupon.groupId))
      .where(baseFilters)
      .groupBy(foodieGroup.id, foodieGroup.name)
      .orderBy(desc(sql`count(${couponRedemption.id})`), asc(foodieGroup.name), asc(foodieGroup.id))
      .limit(1),
    db
      .select({
        redemptionId: couponRedemption.id,
        redeemedAt: couponRedemption.redeemedAt,
        couponId: coupon.id,
        couponTitle: coupon.title,
        merchantId: merchant.id,
        merchantName: merchant.name,
        groupId: foodieGroup.id,
        groupName: foodieGroup.name,
        customerEmail: user.email,
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .innerJoin(foodieGroup, eq(foodieGroup.id, coupon.groupId))
      .innerJoin(user, eq(user.id, couponRedemption.userId))
      .where(baseFilters)
      .orderBy(desc(couponRedemption.redeemedAt), asc(coupon.title), asc(couponRedemption.id))
      .limit(10),
  ]);

  const topGroup = topGroupRows[0]
    ? {
        groupId: topGroupRows[0].groupId,
        groupName: topGroupRows[0].groupName,
        redemptions: toNumber(topGroupRows[0].redemptions),
      }
    : null;

  return {
    redemptionsLast30Days: toNumber(totalRows[0]?.redemptionsLast30Days),
    topGroup,
    recentRedemptions: recentRedemptionRows.map((row) => ({
      redemptionId: row.redemptionId,
      redeemedAt: row.redeemedAt,
      couponId: row.couponId,
      couponTitle: row.couponTitle,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      groupId: row.groupId,
      groupName: row.groupName,
      customerEmail: row.customerEmail,
    })),
  };
}
