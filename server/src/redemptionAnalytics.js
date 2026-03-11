import { db } from './db.js';
import { coupon, couponRedemption, foodieGroup, merchant, user } from './schema.js';
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
