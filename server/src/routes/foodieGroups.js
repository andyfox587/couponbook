// server/src/routes/foodieGroup.js
import express from 'express';
import { db } from '../db.js';
import { foodieGroup, purchase, user, foodieGroupMembership, couponBookPrice, coupon, event, billingModel } from '../schema.js';
import { eq, and, count, isNull, or, sql, desc, asc } from 'drizzle-orm';
import auth from '../middleware/auth.js';
import { resolveLocalUser, requireAdmin, canManageGroup } from '../authz/index.js';
import { stripe, getStripeMode } from '../config/stripe.js';
import { getValidatedStripeIds, prepareStripeIdFields, getStripeRecurringPriceId, getStripePriceId, getStripeProductId } from '../utils/stripeIdHelper.js';
import { resolveBaseUrl } from '../utils/appUrl.js';
import { getFoodieGroupRedemptionOverview, getGroupSubscriptionOverview } from '../redemptionAnalytics.js';
import { getFoodieGroupEventOverview, getEventSubmissionCounts } from '../eventAnalytics.js';

const router = express.Router();

console.log('📦  foodieGroup router loaded');

// ─── GET /api/v1/groups ───────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  console.log('📦  GET /api/v1/groups hit');
  try {
    const allGroups = await db.select().from(foodieGroup);
    console.log(`📦  returning ${allGroups.length} groups`);
    res.json(allGroups);
  } catch (err) {
    console.error('📦  error in GET /groups', err);
    next(err);
  }
});

// ─── GET /api/v1/groups/my/admin-memberships ─────────────────────
// Return foodie group admin memberships for the current user
router.get('/my/admin-memberships', auth(), async (req, res, next) => {
  console.log('📦  GET /api/v1/groups/my/admin-memberships');

  try {
    const sub = req.user && req.user.sub;
    if (!sub) {
      console.warn('📦  /groups/my/admin-memberships called without Cognito sub');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub));

    if (!dbUser) {
      console.warn('📦  No local user row for sub', sub);
      return res.status(403).json({ error: 'User not registered.' });
    }

    const rows = await db
      .select({
        groupId: foodieGroupMembership.groupId,
        name: foodieGroup.name,
      })
      .from(foodieGroupMembership)
      .innerJoin(
        foodieGroup,
        eq(foodieGroup.id, foodieGroupMembership.groupId)
      )
      .where(
        and(
          eq(foodieGroupMembership.userId, dbUser.id),
          eq(foodieGroupMembership.role, 'foodie_group_admin'),
          isNull(foodieGroupMembership.deletedAt)
        )
      );

    return res.json(rows);
  } catch (err) {
    console.error('📦  error in GET /groups/my/admin-memberships', err);
    next(err);
  }
});

// ─── GET /api/v1/groups/my/purchases ─────────────────────────────
// Return all coupon-book purchases for the currently logged-in user
router.get('/my/purchases', auth(), async (req, res, next) => {
  console.log('📦  GET /api/v1/groups/my-purchases');

  try {
    const sub = req.user && req.user.sub;
    if (!sub) {
      console.warn('📦  /groups/my-purchases called without Cognito sub');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1) Look up local user row by Cognito sub
    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub));

    if (!dbUser) {
      console.warn('📦  No local user row for sub', sub);
      return res.status(403).json({ error: 'User not registered.' });
    }

    // 2) Join purchases → foodieGroup for this user
    // Filter for paid status and non-expired purchases only
    const now = new Date().toISOString();
    const rows = await db
      .select({
        id:                  purchase.id,
        groupId:             purchase.groupId,
        status:              purchase.status,
        purchasedAt:         purchase.purchasedAt,
        expiresAt:           purchase.expiresAt,
        amountCents:         purchase.amountCents,
        currency:            purchase.currency,
        provider:            purchase.provider,
        groupName:           foodieGroup.name,
        // Subscription / billing fields needed by the Profile UI so it can
        // render status badges and expose the Stripe billing portal CTA.
        subscriptionStatus:  purchase.subscriptionStatus,
        currentPeriodStart:  purchase.currentPeriodStart,
        currentPeriodEnd:    purchase.currentPeriodEnd,
        cancelAtPeriodEnd:   purchase.cancelAtPeriodEnd,
        stripeCustomerId:    purchase.stripeCustomerId,
        giftedByUserId:      purchase.giftedByUserId,
      })
      .from(purchase)
      .innerJoin(foodieGroup, eq(foodieGroup.id, purchase.groupId))
      .where(
        and(
          eq(purchase.userId, dbUser.id),
          eq(purchase.status, 'paid'),
          or(
            isNull(purchase.expiresAt),
            sql`${purchase.expiresAt} > ${now}`
          )
        )
      );

    res.json(rows);
  } catch (err) {
    console.error('📦  error in GET /groups/my-purchases', err);
    next(err);
  }
});

// ─── GET /api/v1/groups/:groupId/admin/overview ───────────────────────
// Return group-scoped analytics for foodie group admins
router.get('/:groupId/admin/overview', auth(), resolveLocalUser, async (req, res, next) => {
  const { groupId } = req.params;
  console.log('📦  GET /api/v1/groups/:groupId/admin/overview', { groupId });

  try {
    // Authorization: must be foodie_group_admin for this group OR super_admin
    const canManage = await canManageGroup(req.dbUser, groupId);
    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to view this group\'s analytics' });
    }

    // Run all queries in parallel for performance
    const now = new Date().toISOString();
    const [
      purchasesPaidResult,
      couponsResult,
      revenueResult,
      publishedEventsResult,
      eventSubmissionCounts,
      subscriptionOverview,
    ] = await Promise.all([
      // Paid purchases count
      db.select({ count: count() })
        .from(purchase)
        .where(
          and(
            eq(purchase.groupId, groupId),
            eq(purchase.status, 'paid')
          )
        ),
      // Coupons count (non-deleted)
      db.select({ count: count() })
        .from(coupon)
        .where(
          and(
            eq(coupon.groupId, groupId),
            isNull(coupon.deletedAt),
            or(
              isNull(coupon.expiresAt),
              sql`${coupon.expiresAt} > ${now}`
            )
          )
        ),
      // Gross revenue
      db.select({ total: sql`COALESCE(SUM(${purchase.amountCents}), 0)` })
        .from(purchase)
        .where(
          and(
            eq(purchase.groupId, groupId),
            eq(purchase.status, 'paid')
          )
        ),
      // Published events count (non-deleted)
      db.select({ count: count() })
        .from(event)
        .where(
          and(
            eq(event.groupId, groupId),
            eq(event.status, 'published'),
            isNull(event.deletedAt),
          )
        ),
      // Event submission counts by state
      getEventSubmissionCounts(groupId),
      // Subscription metrics
      getGroupSubscriptionOverview(groupId),
    ]);

    // Recent purchases (last 10, with user email)
    const recentPurchases = await db
      .select({
        id: purchase.id,
        userEmail: user.email,
        amountCents: purchase.amountCents,
        status: purchase.status,
        createdAt: purchase.createdAt,
      })
      .from(purchase)
      .innerJoin(user, eq(user.id, purchase.userId))
      .where(eq(purchase.groupId, groupId))
      .orderBy(desc(purchase.createdAt))
      .limit(10);

    res.json({
      counts: {
        coupons: couponsResult[0]?.count ?? 0,
        events: {
          published: publishedEventsResult[0]?.count ?? 0,
        },
        eventSubmissions: eventSubmissionCounts,
        purchases: {
          paid: purchasesPaidResult[0]?.count ?? 0,
        },
      },
      revenue: {
        grossCents: Number(revenueResult[0]?.total ?? 0),
        currency: 'usd',
      },
      subscriptions: subscriptionOverview,
      recentPurchases,
    });
  } catch (err) {
    console.error('📦  error in GET /groups/:groupId/admin/overview', err);
    next(err);
  }
});

// ─── GET /api/v1/groups/:groupId/redemption-overview ─────────────────────
// Return lightweight redemption analytics for foodie group admins
router.get('/:groupId/redemption-overview', auth(), resolveLocalUser, async (req, res, next) => {
  const { groupId } = req.params;
  console.log('📦  GET /api/v1/groups/:groupId/redemption-overview', { groupId });

  try {
    const canManage = await canManageGroup(req.dbUser, groupId);
    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to view this group\'s analytics' });
    }

    const overview = await getFoodieGroupRedemptionOverview(groupId);
    res.json(overview);
  } catch (err) {
    console.error('📦  error in GET /groups/:groupId/redemption-overview', err);
    next(err);
  }
});

// ─── GET /api/v1/groups/:groupId/event-overview ─────────────────────
// Return lightweight event RSVP/attendance analytics for foodie group admins
router.get('/:groupId/event-overview', auth(), resolveLocalUser, async (req, res, next) => {
  const { groupId } = req.params;
  const days = Number(req.query.days) > 0 ? Number(req.query.days) : 30;
  console.log('📦  GET /api/v1/groups/:groupId/event-overview', { groupId });

  try {
    const canManage = await canManageGroup(req.dbUser, groupId);
    if (!canManage) {
      return res.status(403).json({ error: 'Not authorized to view this group\'s analytics' });
    }

    const overview = await getFoodieGroupEventOverview(groupId, days);
    res.json(overview);
  } catch (err) {
    console.error('📦  error in GET /groups/:groupId/event-overview', err);
    next(err);
  }
});

// ─── GET /api/v1/groups/:id ───────────────────────────────────────────
// :id can be either a UUID or a slug
router.get('/:id', async (req, res, next) => {
  try {
    const groupIdOrSlug = req.params.id;

    // Support both UUID and slug lookups
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrSlug);

    const [groupRow] = await db
      .select()
      .from(foodieGroup)
      .where(isUUID ? eq(foodieGroup.id, groupIdOrSlug) : eq(foodieGroup.slug, groupIdOrSlug));

      if (!groupRow) {
        return res.status(404).json({ error: 'Foodie group not found' });
      }

      const groupId = groupRow.id;
  
      // Get member count
      const [membershipAgg] = await db
        .select({
          memberCount: count(),
        })
        .from(foodieGroupMembership)
        .where(
          and(
            eq(foodieGroupMembership.groupId, groupId),
            isNull(foodieGroupMembership.deletedAt),
          ),
        );
  
      const totalMembers = membershipAgg?.memberCount ?? 0;  
      
      return res.json({
        ...groupRow,
        totalMembers,
      });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/groups/:id/price ─────────────────────────────────────
// Public endpoint to get the current price for a group's coupon book
// :id can be either a UUID or a slug
router.get('/:id/price', async (req, res, next) => {
  const groupIdOrSlug = req.params.id;
  console.log('📦  GET /api/v1/groups/:id/price', { groupIdOrSlug });

  try {
    // Support both UUID and slug lookups
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrSlug);

    const [groupRow] = await db
      .select()
      .from(foodieGroup)
      .where(isUUID ? eq(foodieGroup.id, groupIdOrSlug) : eq(foodieGroup.slug, groupIdOrSlug));

    if (!groupRow) {
      return res.status(404).json({ error: 'Foodie group not found' });
    }

    const groupId = groupRow.id;

    // Look up the *default* active tier for this group. After the multi-tier
    // migration (0019) a group can have many active prices, so /price now
    // returns whichever one the admin marked as default; falls back to the
    // lowest sort_order active row for groups that haven't been backfilled.
    const activePrice = await findDefaultActiveTier(groupId);

    if (!activePrice) {
      // No price configured - return fallback (Chapel Hill default: $9.99)
      return res.json({
        available: true,
        amountCents: 999,
        currency: 'usd',
        display: '$9.99',
        isDefault: true,
        billingModel: groupRow.billingModel || 'one_time',
        billingInterval: null,
        billingIntervalCount: null,
      });
    }

    const display = formatPrice(activePrice.amountCents, activePrice.currency);
    
    // Get environment-appropriate Stripe Price ID (may be absent on draft tiers)
    let priceId = null;
    try {
      ({ priceId } = getValidatedStripeIds(activePrice));
    } catch (stripeErr) {
      console.warn('📦  GET /price: could not resolve Stripe price id:', stripeErr.message);
    }
    
    return res.json({
      available: true,
      amountCents: activePrice.amountCents,
      currency: activePrice.currency,
      display,
      stripePriceId: priceId,
      isDefault: false,
      billingModel: groupRow.billingModel || 'one_time',
      billingInterval: activePrice.billingInterval || null,
      billingIntervalCount: activePrice.billingIntervalCount || null,
      stripeRecurringPriceId: getStripeRecurringPriceId(activePrice),
    });
  } catch (err) {
    console.error('📦  error in GET /groups/:id/price', err);
    next(err);
  }
});

// ─── PUT /api/v1/groups/:id/price ─────────────────────────────────────
// Admin endpoint to update coupon book pricing
// For subscription groups, also accepts billing_interval ('month'/'year') and
// billing_interval_count (1, 6, or 12) to create a recurring Stripe Price.
router.put('/:id/price', auth(), async (req, res, next) => {
  const groupIdOrSlug = req.params.id;
  const { amountCents, currency = 'usd', billing_interval, billing_interval_count, billing_model } = req.body;

  console.log('📦  PUT /api/v1/groups/:id/price', { groupIdOrSlug, amountCents, currency });

  try {
    const sub = req.user && req.user.sub;
    if (!sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1) Look up local user
    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub));

    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2) Resolve group by UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrSlug);

    const [groupRow] = await db
      .select()
      .from(foodieGroup)
      .where(isUUID ? eq(foodieGroup.id, groupIdOrSlug) : eq(foodieGroup.slug, groupIdOrSlug));

    if (!groupRow) {
      return res.status(404).json({ error: 'Foodie group not found' });
    }

    const groupId = groupRow.id;

    // 3) Authorization: must be foodie_group_admin for this group OR super_admin
    const isGroupAdmin = await checkFoodieGroupAdmin(dbUser.id, groupId);
    const isSuperAdmin = dbUser.role === 'super_admin';

    if (!isGroupAdmin && !isSuperAdmin) {
      return res.status(403).json({ error: 'Not authorized to manage pricing' });
    }

    // 4) Validate price amount (min $0.50 = 50 cents, max $999.99 = 99999 cents)
    if (!amountCents || typeof amountCents !== 'number') {
      return res.status(400).json({ error: 'amountCents is required and must be a number' });
    }
    if (amountCents < 50 || amountCents > 99999) {
      return res.status(400).json({ error: 'Price must be between $0.50 and $999.99' });
    }

    // 5) Get existing active price (if any) to reuse Stripe Product
    const [existingPrice] = await db
      .select()
      .from(couponBookPrice)
      .where(
        and(
          eq(couponBookPrice.groupId, groupId),
          eq(couponBookPrice.isActive, true)
        )
      );

    // 6) Get or create Stripe Product (use environment-appropriate ID)
    let stripeProductId;
    if (existingPrice) {
      const { productId } = getValidatedStripeIds(existingPrice);
      stripeProductId = productId;
    }

    // Self-heal: if the stored product ID doesn't exist in the current Stripe
    // account (e.g. after a sandbox→live cutover, or DB restored from another
    // env), drop it so the next branch creates a fresh product.
    if (stripeProductId) {
      try {
        await stripe.products.retrieve(stripeProductId);
      } catch (retrieveErr) {
        if (retrieveErr?.raw?.code === 'resource_missing' || retrieveErr?.code === 'resource_missing') {
          console.warn(
            `📦  Stored Stripe product "${stripeProductId}" not found in current Stripe account (mode=${getStripeMode()}). Creating a new one.`
          );
          stripeProductId = null;
        } else {
          throw retrieveErr;
        }
      }
    }

    if (!stripeProductId) {
      console.log('📦  Creating new Stripe Product for group', groupId);
      const product = await stripe.products.create({
        name: `${groupRow.name} Coupon Book`,
        description: `Access to exclusive coupons and events for ${groupRow.name}`,
        metadata: { groupId, groupSlug: groupRow.slug }
      });
      stripeProductId = product.id;
    }

    // 7) Resolve group billing model (needed to decide whether to create a recurring price)
    // Optionally update the group's billing_model if provided.
    if (billing_model && ['one_time', 'subscription'].includes(billing_model) && billing_model !== groupRow.billingModel) {
      await db
        .update(foodieGroup)
        .set({ billingModel: billing_model, updatedAt: new Date().toISOString() })
        .where(eq(foodieGroup.id, groupId));
      groupRow.billingModel = billing_model;
    }

    const isSubscriptionGroup = groupRow.billingModel === 'subscription';

    // 8) Validate subscription cadence if applicable
    const ALLOWED_INTERVAL_COUNTS = [1, 6, 12];
    let resolvedInterval = billing_interval || null;
    let resolvedIntervalCount = billing_interval_count ? Number(billing_interval_count) : null;

    if (isSubscriptionGroup) {
      if (!resolvedInterval || !['month', 'year'].includes(resolvedInterval)) {
        return res.status(400).json({ error: 'billing_interval must be "month" or "year" for subscription groups' });
      }
      if (!resolvedIntervalCount || !ALLOWED_INTERVAL_COUNTS.includes(resolvedIntervalCount)) {
        return res.status(400).json({ error: `billing_interval_count must be one of: ${ALLOWED_INTERVAL_COUNTS.join(', ')}` });
      }
    }

    // 9) Create new Stripe Price (prices are immutable in Stripe)
    console.log('📦  Creating new Stripe Price', { stripeProductId, amountCents, currency });
    const stripePrice = await stripe.prices.create({
      product: stripeProductId,
      unit_amount: amountCents,
      currency: currency.toLowerCase(),
      metadata: { groupId, groupSlug: groupRow.slug }
    });

    // 10) For subscription groups, also create a recurring Stripe Price
    let stripeRecurringPrice = null;
    if (isSubscriptionGroup && resolvedInterval) {
      console.log('📦  Creating recurring Stripe Price for subscription group', { stripeProductId, resolvedInterval, resolvedIntervalCount });
      stripeRecurringPrice = await stripe.prices.create({
        product: stripeProductId,
        unit_amount: amountCents,
        currency: currency.toLowerCase(),
        recurring: {
          interval: resolvedInterval,
          interval_count: resolvedIntervalCount,
        },
        metadata: { groupId, groupSlug: groupRow.slug, billing_interval: resolvedInterval, billing_interval_count: String(resolvedIntervalCount) }
      });
    }

    // 11) Database transaction: deactivate old price, insert new active price
    const now = new Date().toISOString();

    // Deactivate existing active price(s)
    if (existingPrice) {
      await db
        .update(couponBookPrice)
        .set({
          isActive: false,
          archivedAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(couponBookPrice.groupId, groupId),
            eq(couponBookPrice.isActive, true)
          )
        );
    }

    // Prepare Stripe ID fields (automatically detects test vs live)
    const stripeIdFields = prepareStripeIdFields(stripeProductId, stripePrice.id, stripeRecurringPrice?.id ?? null);

    // Insert new active price
    const [newPrice] = await db
      .insert(couponBookPrice)
      .values({
        groupId,
        amountCents,
        currency: currency.toLowerCase(),
        isActive: true,
        ...stripeIdFields,
        billingInterval: resolvedInterval,
        billingIntervalCount: resolvedIntervalCount,
        createdByUserId: dbUser.id,
      })
      .returning();

    console.log('📦  Price updated successfully', {
      priceId: newPrice.id,
      stripePriceId: stripePrice.id,
      stripeRecurringPriceId: stripeRecurringPrice?.id,
    });

    // 12) Return updated price
    return res.json({
      id: newPrice.id,
      amountCents,
      currency: currency.toLowerCase(),
      display: formatPrice(amountCents, currency),
      stripePriceId: stripePrice.id,
      stripeProductId,
      stripeRecurringPriceId: stripeRecurringPrice?.id ?? null,
      billingModel: groupRow.billingModel,
      billingInterval: resolvedInterval,
      billingIntervalCount: resolvedIntervalCount,
    });
  } catch (err) {
    console.error('📦  error in PUT /groups/:id/price', err);
    if (err?.type && typeof err.type === 'string' && err.type.startsWith('Stripe')) {
      return res.status(502).json({
        error: 'stripe_error',
        code: err.code || err.raw?.code || null,
        message: err.message || 'Stripe request failed',
      });
    }
    next(err);
  }
});

// ─── /api/v1/groups/:id/prices  (multi-tier subscription pricing) ─────────
// These endpoints supersede the single-row /price endpoint for groups that
// expose multiple subscription cadences (monthly + 6mo + annual). The old
// /price endpoint is kept as a back-compat shim that operates on the default
// tier of the group.

// Cadences we allow admins to publish. Stripe enforces a small allow-list;
// keep this aligned with the constant used by the legacy PUT /price.
const ALLOWED_INTERVAL_COUNTS = [1, 6, 12];

// Tier status helpers — filter/sort in JS instead of SQL so read endpoints keep
// working during deploys where migration 0019 hasn't landed yet (pre-migration
// rows have no status/is_default/sort_order columns in the DB).
function tierStatus(row) {
  return row?.status ?? 'active';
}

function isPublishedTier(row) {
  return !!row?.isActive && tierStatus(row) === 'active';
}

function isDraftTier(row) {
  return !!row?.isActive && tierStatus(row) === 'draft';
}

function compareTiers(a, b) {
  const aDefault = a?.isDefault ? 1 : 0;
  const bDefault = b?.isDefault ? 1 : 0;
  if (aDefault !== bDefault) return bDefault - aDefault;
  const aSort = a?.sortOrder ?? 0;
  const bSort = b?.sortOrder ?? 0;
  if (aSort !== bSort) return aSort - bSort;
  return String(a?.createdAt ?? '').localeCompare(String(b?.createdAt ?? ''));
}

async function listTierRows(groupId, { includeDrafts = false } = {}) {
  const rows = await db
    .select()
    .from(couponBookPrice)
    .where(
      and(
        eq(couponBookPrice.groupId, groupId),
        eq(couponBookPrice.isActive, true)
      )
    );

  const filtered = rows.filter((row) => {
    const status = tierStatus(row);
    if (status === 'archived') return false;
    if (includeDrafts) return status === 'active' || status === 'draft';
    return status === 'active';
  });

  return filtered.sort(compareTiers);
}

// Helper: find the default active tier for a group, falling back to the
// lowest-sort-order active row when no row is explicitly flagged default.
async function findDefaultActiveTier(groupId) {
  const rows = await listTierRows(groupId);
  return rows.find((row) => row.isDefault) || rows[0] || null;
}

async function findTierById(groupId, priceId, { requireActive = true } = {}) {
  const [row] = await db
    .select()
    .from(couponBookPrice)
    .where(
      and(
        eq(couponBookPrice.id, priceId),
        eq(couponBookPrice.groupId, groupId)
      )
    );

  if (!row) return null;
  if (requireActive && !isPublishedTier(row)) return null;
  return row;
}

// Tier-column writes use raw SQL so they work when migration 0019 is on the DB
// but the deployed Drizzle schema object is stale (undefined column refs produce
// SQL like `where ... and = $3`).
async function clearDefaultTiers(dbOrTx, groupId, exceptPriceId = null) {
  const now = new Date().toISOString();
  if (exceptPriceId) {
    await dbOrTx.execute(sql`
      UPDATE coupon_book_price
         SET is_default = false, updated_at = ${now}
       WHERE group_id = ${groupId}
         AND is_default = true
         AND id <> ${exceptPriceId}
    `);
  } else {
    await dbOrTx.execute(sql`
      UPDATE coupon_book_price
         SET is_default = false, updated_at = ${now}
       WHERE group_id = ${groupId}
         AND is_default = true
    `);
  }
}

async function setTierMetadata(dbOrTx, priceId, {
  label = null,
  sortOrder = 0,
  isDefault = false,
  status = 'active',
  isActive = true,
  archivedAt = null,
}) {
  const now = new Date().toISOString();
  await dbOrTx.execute(sql`
    UPDATE coupon_book_price
       SET label = ${label},
           sort_order = ${sortOrder},
           is_default = ${isDefault},
           status = ${status},
           is_active = ${isActive},
           archived_at = ${archivedAt},
           updated_at = ${now}
     WHERE id = ${priceId}
  `);
}

async function reloadTier(dbOrTx, priceId) {
  const [row] = await dbOrTx
    .select()
    .from(couponBookPrice)
    .where(eq(couponBookPrice.id, priceId));
  return row || null;
}

// Helper: turn a tier DB row into the JSON shape returned to clients.
function serializeTier(tier) {
  return {
    id: tier.id,
    groupId: tier.groupId,
    label: tier.label,
    amountCents: tier.amountCents,
    currency: tier.currency,
    display: formatPrice(tier.amountCents, tier.currency),
    isDefault: !!tier.isDefault,
    sortOrder: tier.sortOrder,
    status: tier.status,
    billingInterval: tier.billingInterval || null,
    billingIntervalCount: tier.billingIntervalCount || null,
    stripePriceId: getStripePriceId(tier),
    stripeProductId: getStripeProductId(tier),
    stripeRecurringPriceId: getStripeRecurringPriceId(tier),
    createdAt: tier.createdAt,
    updatedAt: tier.updatedAt,
  };
}

// Helper: resolve group by UUID or slug → row (or null).
async function resolveGroup(idOrSlug) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug);
  const [row] = await db
    .select()
    .from(foodieGroup)
    .where(isUUID ? eq(foodieGroup.id, idOrSlug) : eq(foodieGroup.slug, idOrSlug));
  return row || null;
}

// Helper: authorize that the current Cognito sub can manage the given group.
// Returns { ok: true, dbUser } or { ok: false, status, error }.
async function authorizeGroupManager(req, groupId) {
  const sub = req.user && req.user.sub;
  if (!sub) return { ok: false, status: 401, error: 'Unauthorized' };
  const [dbUser] = await db.select().from(user).where(eq(user.cognitoSub, sub));
  if (!dbUser) return { ok: false, status: 404, error: 'User not found' };
  const isSuper = dbUser.role === 'super_admin';
  const isGroupAdmin = await checkFoodieGroupAdmin(dbUser.id, groupId);
  if (!isSuper && !isGroupAdmin) return { ok: false, status: 403, error: 'Not authorized to manage pricing' };
  return { ok: true, dbUser };
}

// Get-or-create the shared Stripe Product for a group. Mirrors the self-heal
// logic in PUT /price so tier creation reuses the same product row.
async function ensureStripeProductForGroup(groupRow, existingTierWithProduct) {
  let stripeProductId = null;
  if (existingTierWithProduct) {
    const { productId } = getValidatedStripeIds(existingTierWithProduct);
    stripeProductId = productId;
    if (stripeProductId) {
      try {
        await stripe.products.retrieve(stripeProductId);
      } catch (e) {
        if (e?.raw?.code === 'resource_missing' || e?.code === 'resource_missing') {
          stripeProductId = null;
        } else {
          throw e;
        }
      }
    }
  }
  if (!stripeProductId) {
    const product = await stripe.products.create({
      name: `${groupRow.name} Coupon Book`,
      description: `Access to exclusive coupons and events for ${groupRow.name}`,
      metadata: { groupId: groupRow.id, groupSlug: groupRow.slug },
    });
    stripeProductId = product.id;
  }
  return stripeProductId;
}

// Create the one-time + (optionally) recurring Stripe Prices for a tier.
// Returns { stripePrice, stripeRecurringPrice } where the recurring price is
// null for one-time groups.
async function createStripePricesForTier(groupRow, stripeProductId, { amountCents, currency, billingInterval, billingIntervalCount }) {
  const isSubscriptionGroup = groupRow.billingModel === 'subscription';
  const stripePrice = await stripe.prices.create({
    product: stripeProductId,
    unit_amount: amountCents,
    currency: currency.toLowerCase(),
    metadata: { groupId: groupRow.id, groupSlug: groupRow.slug },
  });
  let stripeRecurringPrice = null;
  if (isSubscriptionGroup && billingInterval) {
    stripeRecurringPrice = await stripe.prices.create({
      product: stripeProductId,
      unit_amount: amountCents,
      currency: currency.toLowerCase(),
      recurring: { interval: billingInterval, interval_count: billingIntervalCount },
      metadata: {
        groupId: groupRow.id,
        groupSlug: groupRow.slug,
        billing_interval: billingInterval,
        billing_interval_count: String(billingIntervalCount),
      },
    });
  }
  return { stripePrice, stripeRecurringPrice };
}

// Validate tier cadence input for a subscription group.
function validateCadence({ billingInterval, billingIntervalCount }) {
  if (!billingInterval || !['month', 'year'].includes(billingInterval)) {
    return 'billingInterval must be "month" or "year"';
  }
  const n = Number(billingIntervalCount);
  if (!n || !ALLOWED_INTERVAL_COUNTS.includes(n)) {
    return `billingIntervalCount must be one of: ${ALLOWED_INTERVAL_COUNTS.join(', ')}`;
  }
  return null;
}

// ─── GET /api/v1/groups/:id/prices ────────────────────────────────────────
// Public read. Returns all non-archived tiers, sorted, with computed savings
// vs the cheapest monthly tier so the user-facing plan picker can render
// "save 17%" badges without recomputing on the client.
router.get('/:id/prices', async (req, res, next) => {
  const idOrSlug = req.params.id;
  const includeDrafts = req.query.include === 'all' || req.query.includeDrafts === 'true';

  try {
    const groupRow = await resolveGroup(idOrSlug);
    if (!groupRow) return res.status(404).json({ error: 'Foodie group not found' });

    const rows = await listTierRows(groupRow.id, { includeDrafts });

    // Use the smallest "per-month equivalent" active tier as the baseline for
    // the savings comparison so badges work even if monthly isn't published.
    const activeRows = rows.filter((r) => isPublishedTier(r));
    const baseline = activeRows.reduce((min, r) => {
      const months =
        r.billingInterval === 'year'
          ? (r.billingIntervalCount || 1) * 12
          : (r.billingIntervalCount || 1);
      const perMonth = r.amountCents / Math.max(months, 1);
      if (!min || perMonth > min.perMonth) return { perMonth, row: r };
      return min;
    }, null);

    const tiers = rows.map((tier) => {
      const out = serializeTier(tier);
      if (baseline && isPublishedTier(tier)) {
        const months =
          tier.billingInterval === 'year'
            ? (tier.billingIntervalCount || 1) * 12
            : (tier.billingIntervalCount || 1);
        const perMonth = tier.amountCents / Math.max(months, 1);
        const savingsPct = baseline.perMonth > 0
          ? Math.max(0, Math.round((1 - perMonth / baseline.perMonth) * 100))
          : 0;
        out.savingsPct = savingsPct;
      } else {
        out.savingsPct = 0;
      }
      return out;
    });

    res.json({
      groupId: groupRow.id,
      billingModel: groupRow.billingModel || 'one_time',
      tiers,
    });
  } catch (err) {
    console.error('📦  error in GET /groups/:id/prices', err);
    next(err);
  }
});

// ─── POST /api/v1/groups/:id/prices ───────────────────────────────────────
// Admin endpoint to add a new pricing tier. Drafts skip Stripe entirely;
// active tiers create one-time (and recurring for subscription groups) Prices
// on the group's shared Stripe Product.
router.post('/:id/prices', auth(), async (req, res, next) => {
  const idOrSlug = req.params.id;
  const {
    label,
    amountCents,
    currency = 'usd',
    billingInterval = null,
    billingIntervalCount = null,
    status = 'draft',
    isDefault = false,
    sortOrder = 0,
  } = req.body || {};

  try {
    const groupRow = await resolveGroup(idOrSlug);
    if (!groupRow) return res.status(404).json({ error: 'Foodie group not found' });

    const authz = await authorizeGroupManager(req, groupRow.id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    if (!amountCents || typeof amountCents !== 'number' || amountCents < 50 || amountCents > 99999) {
      return res.status(400).json({ error: 'amountCents must be a number between 50 and 99999' });
    }
    if (!['draft', 'active'].includes(status)) {
      return res.status(400).json({ error: 'status must be "draft" or "active"' });
    }

    const isSubscriptionGroup = groupRow.billingModel === 'subscription';
    if (isSubscriptionGroup) {
      const cadenceErr = validateCadence({ billingInterval, billingIntervalCount });
      if (cadenceErr) return res.status(400).json({ error: cadenceErr });
    }

    // Stripe Prices are only created for tiers that ship to users now. Drafts
    // are admin-curated suggestions (e.g. seeded by scripts/seedSubscriptionTiers.js)
    // and remain Stripe-less until they're published via PATCH.
    let stripeIdFields = {};
    if (status === 'active') {
      const [anyTierWithProduct] = await db
        .select()
        .from(couponBookPrice)
        .where(
          and(
            eq(couponBookPrice.groupId, groupRow.id),
            sql`(${couponBookPrice.stripeProductId} IS NOT NULL OR ${couponBookPrice.stripeProductIdTest} IS NOT NULL OR ${couponBookPrice.stripeProductIdLive} IS NOT NULL)`
          )
        )
        .limit(1);

      const stripeProductId = await ensureStripeProductForGroup(groupRow, anyTierWithProduct || null);
      const { stripePrice, stripeRecurringPrice } = await createStripePricesForTier(
        groupRow,
        stripeProductId,
        { amountCents, currency, billingInterval, billingIntervalCount }
      );
      stripeIdFields = prepareStripeIdFields(stripeProductId, stripePrice.id, stripeRecurringPrice?.id ?? null);
    }

    const inserted = await db.transaction(async (tx) => {
      if (isDefault && status === 'active') {
        await clearDefaultTiers(tx, groupRow.id);
      }

      const [row] = await tx
        .insert(couponBookPrice)
        .values({
          groupId: groupRow.id,
          amountCents,
          currency: currency.toLowerCase(),
          isActive: true,
          billingInterval: billingInterval || null,
          billingIntervalCount: billingIntervalCount ? Number(billingIntervalCount) : null,
          createdByUserId: authz.dbUser.id,
          ...stripeIdFields,
        })
        .returning();

      await setTierMetadata(tx, row.id, {
        label: label || null,
        sortOrder: Number(sortOrder) || 0,
        isDefault: !!isDefault && status === 'active',
        status,
        isActive: true,
      });

      return reloadTier(tx, row.id);
    });

    res.status(201).json(serializeTier(inserted));
  } catch (err) {
    console.error('📦  error in POST /groups/:id/prices', err);
    if (err?.type && typeof err.type === 'string' && err.type.startsWith('Stripe')) {
      return res.status(502).json({ error: 'stripe_error', message: err.message });
    }
    next(err);
  }
});

// ─── PATCH /api/v1/groups/:id/prices/:priceId ─────────────────────────────
// Admin endpoint to update a tier's label / sort / default / status. Amount
// changes are not allowed (Stripe Prices are immutable); the admin must
// archive the tier and create a new one instead.
router.patch('/:id/prices/:priceId', auth(), async (req, res, next) => {
  const idOrSlug = req.params.id;
  const priceId = req.params.priceId;
  const { label, sortOrder, isDefault, status } = req.body || {};

  try {
    const groupRow = await resolveGroup(idOrSlug);
    if (!groupRow) return res.status(404).json({ error: 'Foodie group not found' });

    const authz = await authorizeGroupManager(req, groupRow.id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const [existing] = await db
      .select()
      .from(couponBookPrice)
      .where(and(eq(couponBookPrice.id, priceId), eq(couponBookPrice.groupId, groupRow.id)));
    if (!existing) return res.status(404).json({ error: 'Price tier not found for this group' });

    if (status && !['draft', 'active', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'status must be draft, active, or archived' });
    }

    // Draft → active transition needs to lazily create the Stripe Prices that
    // the seeding script intentionally skipped.
    let stripeIdFields = {};
    const becomingActive = status === 'active' && existing.status === 'draft';
    if (becomingActive && !existing.stripePriceId && !existing.stripePriceIdTest && !existing.stripePriceIdLive) {
      const isSubscriptionGroup = groupRow.billingModel === 'subscription';
      if (isSubscriptionGroup) {
        const cadenceErr = validateCadence({
          billingInterval: existing.billingInterval,
          billingIntervalCount: existing.billingIntervalCount,
        });
        if (cadenceErr) return res.status(400).json({ error: cadenceErr });
      }
      const [anyTierWithProduct] = await db
        .select()
        .from(couponBookPrice)
        .where(
          and(
            eq(couponBookPrice.groupId, groupRow.id),
            sql`(${couponBookPrice.stripeProductId} IS NOT NULL OR ${couponBookPrice.stripeProductIdTest} IS NOT NULL OR ${couponBookPrice.stripeProductIdLive} IS NOT NULL)`
          )
        )
        .limit(1);
      const stripeProductId = await ensureStripeProductForGroup(groupRow, anyTierWithProduct || null);
      const { stripePrice, stripeRecurringPrice } = await createStripePricesForTier(
        groupRow,
        stripeProductId,
        {
          amountCents: existing.amountCents,
          currency: existing.currency,
          billingInterval: existing.billingInterval,
          billingIntervalCount: existing.billingIntervalCount,
        }
      );
      stripeIdFields = prepareStripeIdFields(stripeProductId, stripePrice.id, stripeRecurringPrice?.id ?? null);
    }

    const updated = await db.transaction(async (tx) => {
      if (isDefault === true) {
        await clearDefaultTiers(tx, groupRow.id, priceId);
      }

      const nextLabel = label !== undefined ? label : (existing.label ?? null);
      const nextSortOrder = sortOrder !== undefined ? Number(sortOrder) || 0 : (existing.sortOrder ?? 0);
      const nextIsDefault = isDefault !== undefined ? !!isDefault : !!existing.isDefault;
      const nextStatus = status !== undefined ? status : (existing.status ?? 'active');
      const nextIsActive = status !== undefined ? status !== 'archived' : existing.isActive !== false;
      const nextArchivedAt = status === 'archived'
        ? new Date().toISOString()
        : (status !== undefined && status !== 'archived' ? null : (existing.archivedAt ?? null));

      if (Object.keys(stripeIdFields).length > 0) {
        await tx
          .update(couponBookPrice)
          .set({ ...stripeIdFields, updatedAt: new Date().toISOString() })
          .where(eq(couponBookPrice.id, priceId));
      }

      await setTierMetadata(tx, priceId, {
        label: nextLabel,
        sortOrder: nextSortOrder,
        isDefault: nextIsDefault,
        status: nextStatus,
        isActive: nextIsActive,
        archivedAt: nextArchivedAt,
      });

      return reloadTier(tx, priceId);
    });

    res.json(serializeTier(updated));
  } catch (err) {
    console.error('📦  error in PATCH /groups/:id/prices/:priceId', err);
    if (err?.type && typeof err.type === 'string' && err.type.startsWith('Stripe')) {
      return res.status(502).json({ error: 'stripe_error', message: err.message });
    }
    next(err);
  }
});

// ─── DELETE /api/v1/groups/:id/prices/:priceId ────────────────────────────
// Soft-archives the tier (status='archived'). Existing Stripe subscriptions
// on this Price keep renewing — Stripe doesn't cancel them when a Price is
// hidden. This only stops new users from picking this tier.
router.delete('/:id/prices/:priceId', auth(), async (req, res, next) => {
  const idOrSlug = req.params.id;
  const priceId = req.params.priceId;
  try {
    const groupRow = await resolveGroup(idOrSlug);
    if (!groupRow) return res.status(404).json({ error: 'Foodie group not found' });

    const authz = await authorizeGroupManager(req, groupRow.id);
    if (!authz.ok) return res.status(authz.status).json({ error: authz.error });

    const [existing] = await db
      .select()
      .from(couponBookPrice)
      .where(and(eq(couponBookPrice.id, priceId), eq(couponBookPrice.groupId, groupRow.id)));
    if (!existing) return res.status(404).json({ error: 'Price tier not found for this group' });

    const now = new Date().toISOString();
    await setTierMetadata(db, priceId, {
      label: existing.label ?? null,
      sortOrder: existing.sortOrder ?? 0,
      isDefault: false,
      status: 'archived',
      isActive: false,
      archivedAt: now,
    });
    const updated = await reloadTier(db, priceId);
    if (!updated) return res.status(404).json({ error: 'Price tier not found for this group' });

    res.json(serializeTier(updated));
  } catch (err) {
    console.error('📦  error in DELETE /groups/:id/prices/:priceId', err);
    next(err);
  }
});

// Helper: Check if user is a foodie_group_admin for a specific group
async function checkFoodieGroupAdmin(userId, groupId) {
  const [membership] = await db
    .select()
    .from(foodieGroupMembership)
    .where(
      and(
        eq(foodieGroupMembership.userId, userId),
        eq(foodieGroupMembership.groupId, groupId),
        eq(foodieGroupMembership.role, 'foodie_group_admin'),
        isNull(foodieGroupMembership.deletedAt)
      )
    );
  return !!membership;
}

// ─── POST /api/v1/groups/:id/checkout ─────────────────────────────────
// Create a Stripe Checkout Session for purchasing the coupon book
// :id can be either a UUID or a slug
router.post('/:id/checkout', auth(), async (req, res, next) => {
  const groupIdOrSlug = req.params.id;
  const { couponBookPriceId: requestedPriceId = null } = req.body || {};
  console.log('📦  POST /api/v1/groups/:id/checkout', { groupIdOrSlug, requestedPriceId });

  try {
    const sub = req.user && req.user.sub;
    if (!sub) {
      console.warn('📦  /groups/:id/checkout called without Cognito sub');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 0) Resolve group ID from UUID or slug
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrSlug);

    const [resolvedGroup] = await db
      .select()
      .from(foodieGroup)
      .where(isUUID ? eq(foodieGroup.id, groupIdOrSlug) : eq(foodieGroup.slug, groupIdOrSlug));

    if (!resolvedGroup) {
      return res.status(404).json({ error: 'Foodie group not found' });
    }

    const groupId = resolvedGroup.id;

    // 1) Look up local user row by Cognito sub
    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub));

    if (!dbUser) {
      console.warn('📦  No local user row for sub', sub);
      return res.status(404).json({ error: 'User not found. Please complete registration.' });
    }

    // 2) Check if user already has an active/pending purchase for this group
    const existingPurchases = await db
      .select()
      .from(purchase)
      .where(
        and(
          eq(purchase.userId, dbUser.id),
          eq(purchase.groupId, groupId),
          or(
            eq(purchase.status, 'paid'),
            eq(purchase.status, 'pending')
          )
        )
      );

    if (existingPurchases.length > 0) {
      const existing = existingPurchases[0];
      if (existing.status === 'paid') {
        return res.status(400).json({ 
          error: 'You already own this coupon book.',
          hasAccess: true 
        });
      }
      // If pending, could return the existing checkout URL or create a new session
      // For simplicity, we'll create a new session (old one will expire)
    }

    // 3) Use the already-resolved group info
    const groupRow = resolvedGroup;

    // 4) Pick the tier the user is checking out on. When the client explicitly
    // selects a tier (multi-tier subscription groups send couponBookPriceId
    // from the plan picker), validate it belongs to this group and is active.
    // Otherwise fall back to the group's default tier (back-compat for the
    // existing single-button UX on one-time groups and legacy clients).
    let activePrice = null;
    if (requestedPriceId) {
      activePrice = await findTierById(groupId, requestedPriceId);
      if (!activePrice) {
        return res.status(400).json({ error: 'Selected price tier is not available for this group.' });
      }
    } else {
      activePrice = await findDefaultActiveTier(groupId);
    }

    // Determine price to use (active price or default)
    let amountCents = 999; // Default $9.99
    let currency = 'usd';
    let stripePriceId = null;
    let couponBookPriceId = null;
    let isSubscriptionGroup = false;
    let recurringPriceId = null;

    if (activePrice) {
      amountCents = activePrice.amountCents;
      currency = activePrice.currency;
      couponBookPriceId = activePrice.id;

      // Get environment-appropriate Stripe Price ID with validation
      const { priceId } = getValidatedStripeIds(activePrice);
      stripePriceId = priceId;

      // Check if the group uses subscription billing
      recurringPriceId = getStripeRecurringPriceId(activePrice);
    }

    // Determine if this group is subscription-billed
    isSubscriptionGroup = resolvedGroup.billingModel === 'subscription';

    // 5) Build success and cancel URLs
    const baseUrl = resolveBaseUrl(req);
    const successUrl = `${baseUrl}/checkout/success/${groupRow.slug}?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/foodie-group/${groupRow.slug}?cancelled=true`;

    // 6) Create Stripe Checkout Session — branch by billing model
    let session;

    if (isSubscriptionGroup && recurringPriceId) {
      // Subscription checkout
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{
          price: recurringPriceId,
          quantity: 1,
        }],
        client_reference_id: dbUser.id,
        customer_email: dbUser.email,
        metadata: {
          userId: dbUser.id,
          groupId: groupId,
          groupSlug: groupRow.slug,
          couponBookPriceId: couponBookPriceId,
          checkoutType: 'subscription',
          billingIntervalCount: activePrice?.billingIntervalCount ? String(activePrice.billingIntervalCount) : null,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else if (stripePriceId) {
      // One-time payment using existing Stripe Price
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price: stripePriceId,
          quantity: 1,
        }],
        client_reference_id: dbUser.id,
        customer_email: dbUser.email,
        metadata: {
          userId: dbUser.id,
          groupId: groupId,
          groupSlug: groupRow.slug,
          couponBookPriceId: couponBookPriceId,
          checkoutType: 'one_time',
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } else {
      // Create ad-hoc price (for groups without configured Stripe Price)
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: currency,
            product_data: {
              name: `${groupRow.name} Coupon Book`,
              description: `Access to exclusive coupons and events for ${groupRow.name}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        client_reference_id: dbUser.id,
        customer_email: dbUser.email,
        metadata: {
          userId: dbUser.id,
          groupId: groupId,
          groupSlug: groupRow.slug,
          checkoutType: 'one_time',
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    }

    // 7) Insert purchase row with status='pending'
    const priceSnapshot = {
      amountCents,
      currency,
      stripePriceId,
      couponBookPriceId,
      billingIntervalCount: activePrice?.billingIntervalCount ?? null,
    };

    await db.insert(purchase).values({
      userId: dbUser.id,
      groupId: groupId,
      provider: 'stripe',
      stripeCheckoutId: session.id,
      amountCents: amountCents,
      currency: currency,
      status: 'pending',
      priceSnapshot: priceSnapshot,
      metadata: {
        checkoutSessionUrl: session.url,
        createdVia: 'checkout-endpoint',
        checkoutType: isSubscriptionGroup ? 'subscription' : 'one_time',
      },
    });

    console.log('📦  Created Stripe checkout session', {
      sessionId: session.id,
      userId: dbUser.id,
      groupId: groupId,
    });

    // 8) Return checkout URL
    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('📦  error in POST /groups/:id/checkout', err);
    next(err);
  }
});

// Helper function to format price for display
function formatPrice(amountCents, currency = 'usd') {
  const amount = amountCents / 100;
  if (currency.toLowerCase() === 'usd') {
    return `$${amount.toFixed(2)}`;
  }
  return `${amount.toFixed(2)} ${currency.toUpperCase()}`;
}

// ─── POST /api/v1/groups ──────────────────────────────────────────────
// Secured: Only super_admin can create groups
router.post('/', auth(), resolveLocalUser, requireAdmin, async (req, res, next) => {
  console.log('📦  POST /api/v1/groups', req.body);
  try {
    const { name, description, slug } = req.body;

    // Generate slug from name if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const [newGroup] = await db
      .insert(foodieGroup)
      .values({
        name,
        description,
        slug: finalSlug,
      })
      .returning();

    res.status(201).json(newGroup);
  } catch (err) {
    console.error('📦  error in POST /groups', err);
    next(err);
  }
});

// ─── PUT /api/v1/groups/:id ───────────────────────────────────────────
// Secured: super_admin OR foodie_group_admin for this specific group
router.put('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  PUT /api/v1/groups/' + req.params.id, req.body);
  try {
    // Authorization check
    const allowed = await canManageGroup(req.dbUser, req.params.id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: Cannot manage this group' });
    }

    const updates = {};
    if (req.body.name        !== undefined) updates.name        = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;

    const [updated] = await db
      .update(foodieGroup)
      .set(updates)
      .where(eq(foodieGroup.id, req.params.id))
      .returning();

    if (!updated) {
      console.log('📦  group not found for update');
      return res.status(404).json({ message: 'Group not found' });
    }
    console.log('📦  updated group id:', updated.id);
    res.json(updated);
  } catch (err) {
    console.error('📦  error in PUT /groups/:id', err);
    next(err);
  }
});

// ─── DELETE /api/v1/groups/:id ────────────────────────────────────────
// Secured: Only super_admin can delete groups
router.delete('/:id', auth(), resolveLocalUser, requireAdmin, async (req, res, next) => {
  console.log('📦  DELETE /api/v1/groups/' + req.params.id);
  try {
    const result = await db
      .delete(foodieGroup)
      .where(eq(foodieGroup.id, req.params.id));

    if (!result.rowCount) {
      console.log('📦  group not found for delete');
      return res.status(404).json({ message: 'Group not found' });
    }
    console.log('📦  deleted group count:', result.rowCount);
    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('📦  error in DELETE /groups/:id', err);
    next(err);
  }
});

// GET /api/v1/groups/:id/access
// Returns { hasAccess: boolean } based on DB-backed purchases
// :id can be either a UUID or a slug
router.get('/:id/access', auth(), async (req, res, next) => {
  const groupIdOrSlug = req.params.id;
  console.log('📦  GET /api/v1/groups/:id/access', { groupIdOrSlug });

  try {
    const sub = req.user && req.user.sub;
    if (!sub) {
      console.warn('📦  /groups/:id/access called without Cognito sub');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1) Look up the group by UUID or slug to get the actual group ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrSlug);
    
    const [groupRow] = await db
      .select()
      .from(foodieGroup)
      .where(isUUID ? eq(foodieGroup.id, groupIdOrSlug) : eq(foodieGroup.slug, groupIdOrSlug));

    if (!groupRow) {
      console.warn('📦  Group not found for access check', { groupIdOrSlug });
      return res.status(404).json({ error: 'Foodie group not found' });
    }

    const groupId = groupRow.id;

    // 2) Look up local user row by Cognito sub
    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub));

    if (!dbUser) {
      console.warn('📦  No local user row for sub', sub);
      return res.json({ hasAccess: false });
    }

    // 3) Check for a paid purchase for this group (optimized: select only id, limit 1)
    // Includes: non-expired paid purchases + past_due subscriptions within 3-day grace window
    const now = new Date().toISOString();
    const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const [purchaseRow] = await db
      .select({ id: purchase.id })
      .from(purchase)
      .where(
        and(
          eq(purchase.userId, dbUser.id),
          eq(purchase.groupId, groupId),
          eq(purchase.status, 'paid'),
          or(
            // Non-subscription or admin_grant: expires_at null or in future
            and(
              isNull(purchase.subscriptionStatus),
              or(
                isNull(purchase.expiresAt),
                sql`${purchase.expiresAt} > ${now}`
              )
            ),
            // Active subscription: expires_at in future
            and(
              sql`${purchase.subscriptionStatus} = 'active'`,
              or(
                isNull(purchase.expiresAt),
                sql`${purchase.expiresAt} > ${now}`
              )
            ),
            // Past-due subscription: within 3-day grace window
            and(
              sql`${purchase.subscriptionStatus} = 'past_due'`,
              sql`${purchase.currentPeriodEnd} > ${graceCutoff}`
            )
          )
        )
      )
      .limit(1);

    const hasAccess = !!purchaseRow;

    // 4) If they have access, ensure membership row exists
    if (hasAccess) {
      try {
        await ensureFoodieGroupMembership(dbUser.id, groupId);
      } catch (e) {
        console.error('📦  Failed to ensure foodie group membership', {
          userId: dbUser.id,
          groupId,
          error: e,
        });
        // Do NOT fail the access check because of membership sync
      }
    }

    return res.json({ hasAccess });
  } catch (err) {
    console.error('📦  error in GET /groups/:id/access', err);
    next(err);
  }
});

// ─── POST /api/v1/groups/:id/promo-unlock ─────────────────────────────────
// Production-safe endpoint: validates a promo code from env vars and grants
// access by inserting a zero-dollar paid purchase row.
// Gated behind TRIAL_PROMO_ENABLED=true env var.
router.post('/:id/promo-unlock', auth(), async (req, res, next) => {
  if (process.env.TRIAL_PROMO_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  const groupId = req.params.id;
  const rawCode = (req.body && req.body.code) || '';
  const code = String(rawCode).trim().toUpperCase();
  const validCode = String(process.env.TRIAL_PROMO_CODE || '').trim().toUpperCase();

  if (!code || !validCode || code !== validCode) {
    console.warn('📦  /promo-unlock: invalid code attempt for group', groupId);
    return res.status(400).json({ error: 'Invalid promo code' });
  }

  console.log('📦  POST /api/v1/groups/:id/promo-unlock', { groupId });

  try {
    const sub = req.user && req.user.sub;
    if (!sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1) Look up local user row by Cognito sub
    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub));

    if (!dbUser) {
      console.warn('📦  /promo-unlock: no local user row for sub', sub);
      return res.status(404).json({ error: 'User not found' });
    }

    // 2) Check if user already has a valid paid purchase for this group
    const [existing] = await db
      .select()
      .from(purchase)
      .where(
        and(
          eq(purchase.userId, dbUser.id),
          eq(purchase.groupId, groupId),
          eq(purchase.status, 'paid')
        )
      );

    if (existing) {
      console.log('📦  /promo-unlock: user already has access, skipping insert', {
        userId: dbUser.id,
        groupId,
      });
      return res.json({ hasAccess: true, alreadyHadAccess: true });
    }

    // 3) Insert zero-dollar paid purchase row
    await db.insert(purchase).values({
      userId: dbUser.id,
      groupId,
      provider: 'test',
      stripeCheckoutId: null,
      stripeSubscriptionId: null,
      amountCents: 0,
      currency: 'usd',
      status: 'paid',
      purchasedAt: new Date().toISOString(),
      expiresAt: null,
      refundedAt: null,
      metadata: { source: 'trial-promo' },
    });

    console.log('📦  /promo-unlock: granted access via promo code', {
      userId: dbUser.id,
      groupId,
    });

    // 4) Ensure group membership exists
    await ensureFoodieGroupMembership(dbUser.id, groupId);

    return res.json({ hasAccess: true, created: true });
  } catch (err) {
    console.error('📦  error in POST /groups/:id/promo-unlock', err);
    next(err);
  }
});

// ─── POST /api/v1/groups/:id/test-purchase ────────────────────────────────
// Dev-only endpoint: uses TESTCODE to mark the current user as having
// "purchased" the coupon book for this Foodie Group.
// Returns { hasAccess: boolean }
// SECURITY: Hard-gated behind NODE_ENV !== 'production'
router.post('/:id/test-purchase', auth(), async (req, res, next) => {
  // Hard guard: prevent access in production
  if (process.env.NODE_ENV === 'production') {
    console.warn('📦  /test-purchase blocked in production');
    return res.status(403).json({ error: 'Test purchase endpoint not available in production' });
  }

  const groupId = req.params.id;
  const rawCode = (req.body && req.body.code) || '';
  const code = String(rawCode).trim().toUpperCase();

  console.log('📦  POST /api/v1/groups/:id/test-purchase', { groupId, code });

  try {
    const sub = req.user && req.user.sub;
    if (!sub) {
      console.warn('📦  /groups/:id/test-purchase called without Cognito sub');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 0) Validate test code
    const VALID_CODE = 'TESTCODE';
    if (code !== VALID_CODE) {
      console.warn('📦  invalid test code used for /test-purchase', { code });
      return res.status(400).json({ error: 'Invalid unlock code.' });
    }

    // 1) Look up local user row by Cognito sub
    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.cognitoSub, sub));

    if (!dbUser) {
      console.warn('📦  No local user row for sub', sub);
      return res.status(404).json({ error: 'User not found' });
    }

    // 2) Check if a purchase already exists
    const existing = await db
      .select()
      .from(purchase)
      .where(
        and(
          eq(purchase.userId, dbUser.id),
          eq(purchase.groupId, groupId),
          eq(purchase.status, 'paid')
        )
      );

    if (existing.length === 0) {
      // 3) Insert a dev/test purchase row
      await db.insert(purchase).values({
        userId: dbUser.id,
        groupId,
        provider: 'test',
        stripeCheckoutId: null,  // No Stripe ID for test purchases
        stripeSubscriptionId: null,
        amountCents: 0,
        currency: 'usd',
        status: 'paid',
        purchasedAt: new Date().toISOString(),
        expiresAt: null,
        refundedAt: null,
        metadata: { source: 'test-code', code: 'TESTCODE' },
      });

      console.log('📦  created test purchase for user/group', {
        userId: dbUser.id,
        groupId,
      });
    } else {
      console.log('📦  test purchase already exists, skipping insert', {
        userId: dbUser.id,
        groupId,
      });
    }

    // 4) Ensure membership exists as well
    await ensureFoodieGroupMembership(dbUser.id, groupId);

    // 5) Respond with hasAccess = true
    return res.json({ hasAccess: true });
  } catch (err) {
    console.error('📦  error in POST /groups/:id/test-purchase', err);
    next(err);
  }
});

// ─── POST /api/v1/groups/:id/gift ─────────────────────────────────────
// Initiate a gift purchase on behalf of a recipient.
//
// Multi-tier redesign: gifts now use Stripe's *one-time* payment mode
// against the tier's non-recurring Stripe Price, with an `expires_at`
// stamped on the recipient's purchase row based on the chosen cadence.
// The gifter is charged exactly once (no surprise renewals), and the
// recipient gets exactly N months of access — so monthly gifts are now
// allowed too. Subscription-mode gifting is gone.
router.post('/:id/gift', auth(), resolveLocalUser, async (req, res, next) => {
  const groupIdOrSlug = req.params.id;
  const { recipientEmail, couponBookPriceId: requestedPriceId = null } = req.body || {};
  console.log('📦  POST /api/v1/groups/:id/gift', { groupIdOrSlug, recipientEmail, requestedPriceId });

  try {
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const groupRow = await resolveGroup(groupIdOrSlug);
    if (!groupRow) return res.status(404).json({ error: 'Foodie group not found' });

    // Gift is only valid for subscription groups
    if (groupRow.billingModel !== 'subscription') {
      return res.status(400).json({ error: 'Gifts are only available for subscription groups' });
    }

    // Pick the tier the gifter chose (multi-tier UI) or fall back to default.
    let activePrice = null;
    if (requestedPriceId) {
      activePrice = await findTierById(groupRow.id, requestedPriceId);
      if (!activePrice) {
        return res.status(400).json({ error: 'Selected price tier is not available for this group.' });
      }
    } else {
      activePrice = await findDefaultActiveTier(groupRow.id);
    }

    if (!activePrice) {
      return res.status(400).json({ error: 'No active price configured for this group' });
    }

    // Gift uses the one-time Stripe Price (not the recurring one) so the
    // gifter is charged once and the subscription never auto-renews on
    // their card. Every tier created via /prices already has a one-time
    // price alongside its recurring price.
    const { priceId: oneTimeStripePriceId } = getValidatedStripeIds(activePrice);
    if (!oneTimeStripePriceId) {
      return res.status(400).json({ error: 'No Stripe price configured for this tier yet. The admin needs to publish it.' });
    }

    // Resolve recipient user
    const [recipientUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, recipientEmail.toLowerCase().trim()))
      .limit(1);

    if (!recipientUser) {
      return res.status(404).json({ error: 'Recipient not found. They must have a VivaSpot account.' });
    }

    if (recipientUser.id === req.dbUser.id) {
      return res.status(400).json({ error: 'You cannot gift to yourself' });
    }

    // Check recipient does not already have active access
    const now = new Date().toISOString();
    const [existingAccess] = await db
      .select({ id: purchase.id })
      .from(purchase)
      .where(
        and(
          eq(purchase.userId, recipientUser.id),
          eq(purchase.groupId, groupRow.id),
          eq(purchase.status, 'paid'),
          or(
            isNull(purchase.expiresAt),
            sql`${purchase.expiresAt} > ${now}`
          )
        )
      )
      .limit(1);

    if (existingAccess) {
      return res.status(400).json({ error: 'Recipient already has active access to this group' });
    }

    // Compute access window: N months from now. Treats the tier cadence as
    // a fixed-length gift, not a renewing subscription.
    const intervalMonths =
      activePrice.billingInterval === 'year'
        ? (activePrice.billingIntervalCount || 1) * 12
        : (activePrice.billingIntervalCount || 1);
    const expiresAtDate = new Date();
    expiresAtDate.setMonth(expiresAtDate.getMonth() + intervalMonths);
    const expiresAtIso = expiresAtDate.toISOString();

    const baseUrl = resolveBaseUrl(req);
    const successUrl = `${baseUrl}/checkout/success/${groupRow.slug}?session_id={CHECKOUT_SESSION_ID}&gift=true`;
    const cancelUrl = `${baseUrl}/foodie-group/${groupRow.slug}?cancelled=true`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: oneTimeStripePriceId, quantity: 1 }],
      client_reference_id: req.dbUser.id,
      customer_email: req.dbUser.email,
      metadata: {
        userId: recipientUser.id,
        giftedByUserId: req.dbUser.id,
        groupId: groupRow.id,
        groupSlug: groupRow.slug,
        couponBookPriceId: activePrice.id,
        checkoutType: 'gift',
        billingInterval: activePrice.billingInterval || '',
        billingIntervalCount: activePrice.billingIntervalCount ? String(activePrice.billingIntervalCount) : '',
        expiresAtIso,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    // Insert pending gift purchase for recipient with the precomputed
    // expiresAt; webhook flips status to paid and preserves expiresAt.
    await db.insert(purchase).values({
      userId: recipientUser.id,
      groupId: groupRow.id,
      provider: 'stripe',
      stripeCheckoutId: session.id,
      amountCents: activePrice.amountCents,
      currency: activePrice.currency,
      status: 'pending',
      giftedByUserId: req.dbUser.id,
      expiresAt: expiresAtIso,
      priceSnapshot: {
        amountCents: activePrice.amountCents,
        currency: activePrice.currency,
        couponBookPriceId: activePrice.id,
        billingInterval: activePrice.billingInterval,
        billingIntervalCount: activePrice.billingIntervalCount,
      },
      metadata: {
        checkoutSessionUrl: session.url,
        createdVia: 'gift-endpoint',
        giftedByEmail: req.dbUser.email,
        recipientEmail,
        expiresAtIso,
      },
    });

    console.log('📦  Gift checkout session created', {
      sessionId: session.id,
      giftedBy: req.dbUser.id,
      recipient: recipientUser.id,
      groupId: groupRow.id,
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
      recipientEmail,
    });
  } catch (err) {
    console.error('📦  error in POST /groups/:id/gift', err);
    next(err);
  }
});

// ─── POST /api/v1/groups/:id/billing-portal ───────────────────────────
// Returns a Stripe Customer Portal session URL for the authenticated user,
// scoped to their active subscription purchase in this group. Allows the user
// to update payment method, cancel, or view invoice history in Stripe's UI.
router.post('/:id/billing-portal', auth(), resolveLocalUser, async (req, res, next) => {
  const groupIdOrSlug = req.params.id;
  console.log('📦  POST /api/v1/groups/:id/billing-portal', { groupIdOrSlug });

  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupIdOrSlug);
    const [groupRow] = await db
      .select()
      .from(foodieGroup)
      .where(isUUID ? eq(foodieGroup.id, groupIdOrSlug) : eq(foodieGroup.slug, groupIdOrSlug));

    if (!groupRow) {
      return res.status(404).json({ error: 'Foodie group not found' });
    }

    // Find the most recent purchase for this user+group that has a Stripe customer id.
    // Prefer subscription purchases; fall back to any purchase with a customer id for
    // users whose subscription is canceled but still want to see invoice history.
    const [subscriptionPurchase] = await db
      .select({
        id: purchase.id,
        stripeCustomerId: purchase.stripeCustomerId,
        stripeSubscriptionId: purchase.stripeSubscriptionId,
      })
      .from(purchase)
      .where(
        and(
          eq(purchase.userId, req.dbUser.id),
          eq(purchase.groupId, groupRow.id),
          sql`${purchase.stripeCustomerId} IS NOT NULL`
        )
      )
      .orderBy(desc(purchase.createdAt))
      .limit(1);

    if (!subscriptionPurchase || !subscriptionPurchase.stripeCustomerId) {
      return res.status(404).json({
        error: 'No active subscription found for this group',
      });
    }

    const baseUrl = resolveBaseUrl(req);
    const returnUrl = `${baseUrl}/foodie-group/${groupRow.slug}`;

    const session = await stripe.billingPortal.sessions.create({
      customer: subscriptionPurchase.stripeCustomerId,
      return_url: returnUrl,
    });

    return res.json({ portalUrl: session.url });
  } catch (err) {
    console.error('📦  error in POST /groups/:id/billing-portal', err);
    next(err);
  }
});

async function ensureFoodieGroupMembership(userId, groupId) {
  // Check if membership already exists
  const [existing] = await db
    .select()
    .from(foodieGroupMembership)
    .where(
      and(
        eq(foodieGroupMembership.userId, userId),
        eq(foodieGroupMembership.groupId, groupId)
      )
    );

  // If membership exists:
  // - Do nothing (we don't want to overwrite a group admin's role,
  //   or downgrade foodie_group_admin → customer)
  if (existing) {
    // Optional: if you ever use soft delete via deletedAt, you can “restore” it here:
    // if (existing.deletedAt) {
    //   await db.update(foodieGroupMembership)
    //     .set({ deletedAt: null, joinedAt: new Date().toISOString() })
    //     .where(eq(foodieGroupMembership.id, existing.id));
    // }
    return;
  }

  // Otherwise, insert a new membership as a normal customer
  await db.insert(foodieGroupMembership).values({
    userId,
    groupId,
    role: 'customer',          // customers become “members” by purchase
    joinedAt: new Date().toISOString(),
  });

}
export default router;
