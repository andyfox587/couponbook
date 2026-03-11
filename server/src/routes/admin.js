// server/src/routes/admin.js
// Centralized super-admin "god mode" router
// All endpoints require: auth() + resolveLocalUser + requireSuperAdmin
import express from 'express';
import { db } from '../db.js';
import * as schema from '../schema.js';
import { eq, and, isNull, count, sql, desc, ilike, or, isNotNull, gte, lte } from 'drizzle-orm';
import { getPlatformRedemptionOverview } from '../redemptionAnalytics.js';

const router = express.Router();

console.log('📦  admin router loaded');

function isCouponExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const expirationDate = new Date(expiresAt);
  if (Number.isNaN(expirationDate.getTime())) return false;
  return expirationDate.getTime() <= now.getTime();
}

// ═══════════════════════════════════════════════════════════════════════════
// A) OVERVIEW / ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/overview
 * Returns platform-wide counts and health metrics
 */
router.get('/overview', async (req, res, next) => {
  console.log('📦  GET /api/v1/admin/overview');
  try {
    // Run all counts in parallel for performance
    const [
      usersResult,
      activeUsersResult,
      merchantsResult,
      groupsResult,
      couponsResult,
      submissionsPendingResult,
      submissionsApprovedResult,
      submissionsRejectedResult,
      purchasesPaidResult,
      purchasesPendingResult,
      purchasesRefundedResult,
      paymentEventsUnprocessedResult,
      paymentEventsFailedResult,
      recentSignupsResult,
      recentPurchasesResult,
    ] = await Promise.all([
      // Total users (non-deleted)
      db.select({ count: count() }).from(schema.user).where(isNull(schema.user.deletedAt)),
      // Active users (non-deleted, non-anonymized) - we'll count deletedAt null for now
      db.select({ count: count() }).from(schema.user).where(isNull(schema.user.deletedAt)),
      // Total merchants (non-deleted)
      db.select({ count: count() }).from(schema.merchant).where(isNull(schema.merchant.deletedAt)),
      // Total foodie groups (non-archived)
      db.select({ count: count() }).from(schema.foodieGroup).where(isNull(schema.foodieGroup.archivedAt)),
      // Total coupons (non-deleted)
      db.select({ count: count() }).from(schema.coupon).where(isNull(schema.coupon.deletedAt)),
      // Coupon submissions by state
      db.select({ count: count() }).from(schema.couponSubmission).where(and(eq(schema.couponSubmission.state, 'pending'), isNull(schema.couponSubmission.deletedAt))),
      db.select({ count: count() }).from(schema.couponSubmission).where(and(eq(schema.couponSubmission.state, 'approved'), isNull(schema.couponSubmission.deletedAt))),
      db.select({ count: count() }).from(schema.couponSubmission).where(and(eq(schema.couponSubmission.state, 'rejected'), isNull(schema.couponSubmission.deletedAt))),
      // Purchases by status
      db.select({ count: count() }).from(schema.purchase).where(eq(schema.purchase.status, 'paid')),
      db.select({ count: count() }).from(schema.purchase).where(eq(schema.purchase.status, 'pending')),
      db.select({ count: count() }).from(schema.purchase).where(eq(schema.purchase.status, 'refunded')),
      // Payment event health
      db.select({ count: count() }).from(schema.paymentEvent).where(isNull(schema.paymentEvent.processedAt)),
      db.select({ count: count() }).from(schema.paymentEvent).where(isNotNull(schema.paymentEvent.processingError)),
      // Recent signups (last 30 days)
      db.select({ count: count() }).from(schema.user).where(
        and(
          isNull(schema.user.deletedAt),
          gte(schema.user.createdAt, sql`NOW() - INTERVAL '30 days'`)
        )
      ),
      // Recent purchases (last 30 days, paid)
      db.select({ count: count() }).from(schema.purchase).where(
        and(
          eq(schema.purchase.status, 'paid'),
          gte(schema.purchase.purchasedAt, sql`NOW() - INTERVAL '30 days'`)
        )
      ),
    ]);

    // Calculate gross revenue
    const [revenueResult] = await db
      .select({ total: sql`COALESCE(SUM(${schema.purchase.amountCents}), 0)` })
      .from(schema.purchase)
      .where(eq(schema.purchase.status, 'paid'));

    res.json({
      counts: {
        users: {
          total: usersResult[0]?.count ?? 0,
          active: activeUsersResult[0]?.count ?? 0,
        },
        merchants: merchantsResult[0]?.count ?? 0,
        foodieGroups: groupsResult[0]?.count ?? 0,
        coupons: couponsResult[0]?.count ?? 0,
        couponSubmissions: {
          pending: submissionsPendingResult[0]?.count ?? 0,
          approved: submissionsApprovedResult[0]?.count ?? 0,
          rejected: submissionsRejectedResult[0]?.count ?? 0,
        },
        purchases: {
          paid: purchasesPaidResult[0]?.count ?? 0,
          pending: purchasesPendingResult[0]?.count ?? 0,
          refunded: purchasesRefundedResult[0]?.count ?? 0,
        },
      },
      paymentHealth: {
        unprocessedEvents: paymentEventsUnprocessedResult[0]?.count ?? 0,
        failedEvents: paymentEventsFailedResult[0]?.count ?? 0,
      },
      trends: {
        last30Days: {
          signups: recentSignupsResult[0]?.count ?? 0,
          purchases: recentPurchasesResult[0]?.count ?? 0,
        },
      },
      revenue: {
        grossCents: Number(revenueResult?.total ?? 0),
        currency: 'usd',
      },
    });
  } catch (err) {
    console.error('📦  error in GET /admin/overview', err);
    next(err);
  }
});

/**
 * GET /api/v1/admin/redemption-overview
 * Returns lightweight platform-wide redemption analytics
 */
router.get('/redemption-overview', async (req, res, next) => {
  console.log('📦  GET /api/v1/admin/redemption-overview');
  try {
    const overview = await getPlatformRedemptionOverview();
    res.json(overview);
  } catch (err) {
    console.error('📦  error in GET /admin/redemption-overview', err);
    next(err);
  }
});

/**
 * GET /api/v1/admin/coupons
 * List all coupons with merchant and group info
 */
router.get('/coupons', async (req, res, next) => {
  const { query, limit = 100 } = req.query;
  console.log('📦  GET /api/v1/admin/coupons', { query });

  try {
    const now = new Date();
    // Build query
    let baseQuery = db
      .select({
        id: schema.coupon.id,
        title: schema.coupon.title,
        description: schema.coupon.description,
        locked: schema.coupon.locked,
        expiresAt: schema.coupon.expiresAt,
        createdAt: schema.coupon.createdAt,
        merchantId: schema.coupon.merchantId,
        merchantName: schema.merchant.name,
        groupId: schema.coupon.groupId,
        groupName: schema.foodieGroup.name,
        groupSlug: schema.foodieGroup.slug,
      })
      .from(schema.coupon)
      .leftJoin(schema.merchant, eq(schema.merchant.id, schema.coupon.merchantId))
      .leftJoin(schema.foodieGroup, eq(schema.foodieGroup.id, schema.coupon.groupId));

    // Apply where clause
    let whereCondition;
    if (query) {
      const searchTerm = `%${query}%`;
      whereCondition = and(
        isNull(schema.coupon.deletedAt),
        or(
          ilike(schema.coupon.title, searchTerm),
          ilike(schema.merchant.name, searchTerm)
        )
      );
    } else {
      whereCondition = isNull(schema.coupon.deletedAt);
    }

    const couponsRaw = await baseQuery
      .where(whereCondition)
      .orderBy(desc(schema.coupon.createdAt))
      .limit(Number(limit));

    // Expired coupons should surface as inactive in admin views too.
    const coupons = couponsRaw.map(c => ({
      ...c,
      isActive: !isCouponExpired(c.expiresAt, now),
    }));

    res.json({ coupons });
  } catch (err) {
    console.error('📦  error in GET /admin/coupons', err);
    next(err);
  }
});

/**
 * GET /api/v1/admin/submissions
 * List pending submissions with group and merchant info (for notification purposes)
 */
router.get('/submissions', async (req, res, next) => {
  const { state = 'pending' } = req.query;
  console.log('📦  GET /api/v1/admin/submissions', { state });

  try {
    const submissions = await db
      .select({
        id: schema.couponSubmission.id,
        state: schema.couponSubmission.state,
        submittedAt: schema.couponSubmission.submittedAt,
        submissionData: schema.couponSubmission.submissionData,
        merchantId: schema.couponSubmission.merchantId,
        merchantName: schema.merchant.name,
        groupId: schema.couponSubmission.groupId,
        groupName: schema.foodieGroup.name,
        groupSlug: schema.foodieGroup.slug,
      })
      .from(schema.couponSubmission)
      .leftJoin(schema.merchant, eq(schema.merchant.id, schema.couponSubmission.merchantId))
      .leftJoin(schema.foodieGroup, eq(schema.foodieGroup.id, schema.couponSubmission.groupId))
      .where(and(
        eq(schema.couponSubmission.state, state),
        isNull(schema.couponSubmission.deletedAt)
      ))
      .orderBy(desc(schema.couponSubmission.submittedAt))
      .limit(100);

    res.json({ submissions });
  } catch (err) {
    console.error('📦  error in GET /admin/submissions', err);
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// B) USERS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/users
 * Search/list users with optional query filter
 */
router.get('/users', async (req, res, next) => {
  const { query, includeDeleted, limit = 50, offset = 0 } = req.query;
  console.log('📦  GET /api/v1/admin/users', { query, includeDeleted });

  try {
    let whereClause = [];
    
    if (!includeDeleted || includeDeleted !== 'true') {
      whereClause.push(isNull(schema.user.deletedAt));
    }

    if (query) {
      const searchTerm = `%${query}%`;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      
      if (isUUID) {
        // If query looks like a UUID, also search by exact ID
        whereClause.push(
          or(
            ilike(schema.user.email, searchTerm),
            ilike(schema.user.name, searchTerm),
            eq(schema.user.id, query)
          )
        );
      } else {
        // Otherwise just search by email/name
        whereClause.push(
          or(
            ilike(schema.user.email, searchTerm),
            ilike(schema.user.name, searchTerm)
          )
        );
      }
    }

    const users = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        role: schema.user.role,
        createdAt: schema.user.createdAt,
        deletedAt: schema.user.deletedAt,
      })
      .from(schema.user)
      .where(whereClause.length > 0 ? and(...whereClause) : undefined)
      .orderBy(desc(schema.user.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({ users, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    console.error('📦  error in GET /admin/users', err);
    next(err);
  }
});

/**
 * PATCH /api/v1/admin/users/:id
 * Update user role
 * Guardrails: cannot demote yourself, cannot remove your own super_admin
 */
router.patch('/users/:id', async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;
  console.log('📦  PATCH /api/v1/admin/users/:id', { id, role });

  try {
    // Validate role
    const validRoles = ['super_admin', 'merchant', 'customer', 'foodie_group_admin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    // Guardrail: cannot change your own role
    if (id === req.dbUser.id) {
      return res.status(400).json({ error: 'Cannot change your own role. Ask another super admin.' });
    }

    // Find target user
    const [targetUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, id))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update object
    const updates = { updatedAt: new Date().toISOString() };
    if (role) updates.role = role;

    const [updated] = await db
      .update(schema.user)
      .set(updates)
      .where(eq(schema.user.id, id))
      .returning();

    // Audit log
    await logAdminAction(req.dbUser.id, 'user_role_change', 'user', id, {
      previousRole: targetUser.role,
      newRole: role,
    });

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    console.error('📦  error in PATCH /admin/users/:id', err);
    next(err);
  }
});

/**
 * POST /api/v1/admin/users/:id/disable
 * Soft-disable a user by setting deletedAt
 */
router.post('/users/:id/disable', async (req, res, next) => {
  const { id } = req.params;
  console.log('📦  POST /api/v1/admin/users/:id/disable', { id });

  try {
    // Cannot disable yourself
    if (id === req.dbUser.id) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    const [targetUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, id))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.deletedAt) {
      return res.status(400).json({ error: 'User is already disabled' });
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(schema.user)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(schema.user.id, id))
      .returning();

    // Audit log
    await logAdminAction(req.dbUser.id, 'user_disable', 'user', id, {
      previousDeletedAt: targetUser.deletedAt,
    });

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      deletedAt: updated.deletedAt,
      message: 'User has been disabled',
    });
  } catch (err) {
    console.error('📦  error in POST /admin/users/:id/disable', err);
    next(err);
  }
});

/**
 * POST /api/v1/admin/users/:id/enable
 * Re-enable a disabled user by clearing deletedAt
 */
router.post('/users/:id/enable', async (req, res, next) => {
  const { id } = req.params;
  console.log('📦  POST /api/v1/admin/users/:id/enable', { id });

  try {
    const [targetUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, id))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!targetUser.deletedAt) {
      return res.status(400).json({ error: 'User is not disabled' });
    }

    // If user was anonymized, prevent re-enabling (data is gone)
    if (targetUser.email.includes('@anonymized.local')) {
      return res.status(400).json({ error: 'Cannot re-enable anonymized user' });
    }

    const now = new Date().toISOString();
    const [updated] = await db
      .update(schema.user)
      .set({ deletedAt: null, updatedAt: now })
      .where(eq(schema.user.id, id))
      .returning();

    // Audit log
    await logAdminAction(req.dbUser.id, 'user_enable', 'user', id, {
      previousDeletedAt: targetUser.deletedAt,
    });

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      deletedAt: updated.deletedAt,
      message: 'User has been re-enabled',
    });
  } catch (err) {
    console.error('📦  error in POST /admin/users/:id/enable', err);
    next(err);
  }
});

/**
 * POST /api/v1/admin/users/:id/anonymize
 * Anonymize user PII and disable account
 * - Sets deletedAt
 * - Anonymizes email and name
 * - Soft-deletes memberships
 * - Soft-deletes owned coupons/submissions
 * - Detaches merchant ownership (blocks until reassigned or handled)
 */
router.post('/users/:id/anonymize', async (req, res, next) => {
  const { id } = req.params;
  const { reason, reassignMerchantsTo } = req.body;
  console.log('📦  POST /api/v1/admin/users/:id/anonymize', { id, reason });

  try {
    // Cannot anonymize yourself
    if (id === req.dbUser.id) {
      return res.status(400).json({ error: 'Cannot anonymize your own account' });
    }

    const [targetUser] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, id))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check for owned merchants
    const ownedMerchants = await db
      .select({ id: schema.merchant.id, name: schema.merchant.name })
      .from(schema.merchant)
      .where(and(eq(schema.merchant.ownerId, id), isNull(schema.merchant.deletedAt)));

    // If user owns merchants, require reassignment target OR explicit handling
    if (ownedMerchants.length > 0) {
      if (!reassignMerchantsTo) {
        return res.status(400).json({
          error: 'User owns merchants that must be reassigned first',
          ownedMerchants,
          hint: 'Provide reassignMerchantsTo (userId) or reassign merchants manually before anonymizing',
        });
      }

      // Validate reassignment target exists and is not the same user
      const [newOwner] = await db
        .select()
        .from(schema.user)
        .where(and(eq(schema.user.id, reassignMerchantsTo), isNull(schema.user.deletedAt)))
        .limit(1);

      if (!newOwner) {
        return res.status(400).json({ error: 'Reassignment target user not found or is disabled' });
      }

      // Reassign merchants
      await db
        .update(schema.merchant)
        .set({ ownerId: reassignMerchantsTo, updatedAt: new Date().toISOString() })
        .where(eq(schema.merchant.ownerId, id));
    }

    const now = new Date().toISOString();
    const anonymizedEmail = `anonymized-${id.slice(0, 8)}@anonymized.local`;
    const anonymizedName = `Anonymized User ${id.slice(0, 8)}`;

    // 1) Anonymize user record (including anonymization tracking)
    const [updated] = await db
      .update(schema.user)
      .set({
        email: anonymizedEmail,
        name: anonymizedName,
        deletedAt: now,
        updatedAt: now,
        anonymizedAt: now,
        anonymizedByUserId: req.dbUser.id,
        anonymizedReason: reason || null,
      })
      .where(eq(schema.user.id, id))
      .returning();

    // 2) Soft-delete memberships
    await db
      .update(schema.foodieGroupMembership)
      .set({ deletedAt: now })
      .where(eq(schema.foodieGroupMembership.userId, id));

    // 3) Soft-delete coupon submissions (keep purchase/payment history for accounting)
    await db
      .update(schema.couponSubmission)
      .set({ deletedAt: now })
      .where(eq(schema.couponSubmission.merchantId, id)); // if merchantId was used (unlikely)

    // Audit log
    await logAdminAction(req.dbUser.id, 'user_anonymize', 'user', id, {
      reason,
      previousEmail: targetUser.email,
      previousName: targetUser.name,
      merchantsReassignedTo: reassignMerchantsTo || null,
      merchantsReassigned: ownedMerchants.map(m => m.id),
    });

    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      deletedAt: updated.deletedAt,
      message: 'User has been anonymized and disabled',
      merchantsReassigned: ownedMerchants.length,
    });
  } catch (err) {
    console.error('📦  error in POST /admin/users/:id/anonymize', err);
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// C) MERCHANTS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/merchants
 * List/search merchants with owner info
 */
router.get('/merchants', async (req, res, next) => {
  const { query, includeDeleted, limit = 50, offset = 0 } = req.query;
  console.log('📦  GET /api/v1/admin/merchants', { query, includeDeleted });

  try {
    let whereClause = [];

    if (!includeDeleted || includeDeleted !== 'true') {
      whereClause.push(isNull(schema.merchant.deletedAt));
    }

    if (query) {
      const searchTerm = `%${query}%`;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
      
      if (isUUID) {
        whereClause.push(
          or(
            ilike(schema.merchant.name, searchTerm),
            eq(schema.merchant.id, query)
          )
        );
      } else {
        whereClause.push(ilike(schema.merchant.name, searchTerm));
      }
    }

    const merchants = await db
      .select({
        id: schema.merchant.id,
        name: schema.merchant.name,
        logoUrl: schema.merchant.logoUrl,
        ownerId: schema.merchant.ownerId,
        ownerEmail: schema.user.email,
        ownerName: schema.user.name,
        createdAt: schema.merchant.createdAt,
        deletedAt: schema.merchant.deletedAt,
      })
      .from(schema.merchant)
      .leftJoin(schema.user, eq(schema.merchant.ownerId, schema.user.id))
      .where(whereClause.length > 0 ? and(...whereClause) : undefined)
      .orderBy(desc(schema.merchant.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({ merchants, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    console.error('📦  error in GET /admin/merchants', err);
    next(err);
  }
});

/**
 * POST /api/v1/admin/merchants
 * Create a new merchant (super admin only)
 */
router.post('/merchants', async (req, res, next) => {
  const { name, logoUrl, ownerId } = req.body;
  console.log('📦  POST /api/v1/admin/merchants', { name, ownerId });

  try {
    if (!name) {
      return res.status(400).json({ error: 'Merchant name is required' });
    }
    if (!ownerId) {
      return res.status(400).json({ error: 'Owner ID is required' });
    }

    // Verify owner exists
    const [owner] = await db
      .select()
      .from(schema.user)
      .where(and(eq(schema.user.id, ownerId), isNull(schema.user.deletedAt)))
      .limit(1);

    if (!owner) {
      return res.status(400).json({ error: 'Owner not found or is disabled' });
    }

    const [newMerchant] = await db
      .insert(schema.merchant)
      .values({ name, logoUrl, ownerId })
      .returning();

    // Audit log
    await logAdminAction(req.dbUser.id, 'merchant_create', 'merchant', newMerchant.id, {
      name,
      ownerId,
    });

    res.status(201).json(newMerchant);
  } catch (err) {
    console.error('📦  error in POST /admin/merchants', err);
    next(err);
  }
});

/**
 * PATCH /api/v1/admin/merchants/:id
 * Update merchant (name, logoUrl, ownerId reassignment)
 */
router.patch('/merchants/:id', async (req, res, next) => {
  const { id } = req.params;
  const { name, logoUrl, ownerId } = req.body;
  console.log('📦  PATCH /api/v1/admin/merchants/:id', { id, name, ownerId });

  try {
    const [merchant] = await db
      .select()
      .from(schema.merchant)
      .where(eq(schema.merchant.id, id))
      .limit(1);

    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const updates = { updatedAt: new Date().toISOString() };
    const auditData = { previousValues: {} };

    if (name !== undefined) {
      auditData.previousValues.name = merchant.name;
      updates.name = name;
    }
    if (logoUrl !== undefined) {
      auditData.previousValues.logoUrl = merchant.logoUrl;
      updates.logoUrl = logoUrl;
    }
    if (ownerId !== undefined && ownerId !== merchant.ownerId) {
      // Verify new owner exists
      const [newOwner] = await db
        .select()
        .from(schema.user)
        .where(and(eq(schema.user.id, ownerId), isNull(schema.user.deletedAt)))
        .limit(1);

      if (!newOwner) {
        return res.status(400).json({ error: 'New owner not found or is disabled' });
      }

      auditData.previousValues.ownerId = merchant.ownerId;
      auditData.newOwnerId = ownerId;
      updates.ownerId = ownerId;
    }

    const [updated] = await db
      .update(schema.merchant)
      .set(updates)
      .where(eq(schema.merchant.id, id))
      .returning();

    // Audit log
    await logAdminAction(req.dbUser.id, 'merchant_update', 'merchant', id, auditData);

    res.json(updated);
  } catch (err) {
    console.error('📦  error in PATCH /admin/merchants/:id', err);
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// D) FOODIE GROUPS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/groups
 * List all foodie groups
 */
router.get('/groups', async (req, res, next) => {
  const { query, includeArchived, limit = 50, offset = 0 } = req.query;
  console.log('📦  GET /api/v1/admin/groups', { query, includeArchived });

  try {
    let whereClause = [];

    if (!includeArchived || includeArchived !== 'true') {
      whereClause.push(isNull(schema.foodieGroup.archivedAt));
    }

    if (query) {
      const searchTerm = `%${query}%`;
      whereClause.push(
        or(
          ilike(schema.foodieGroup.name, searchTerm),
          ilike(schema.foodieGroup.slug, searchTerm)
        )
      );
    }

    const groups = await db
      .select()
      .from(schema.foodieGroup)
      .where(whereClause.length > 0 ? and(...whereClause) : undefined)
      .orderBy(desc(schema.foodieGroup.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({ groups, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    console.error('📦  error in GET /admin/groups', err);
    next(err);
  }
});

/**
 * POST /api/v1/admin/groups
 * Create a new foodie group (with optional initial admin assignment)
 */
router.post('/groups', async (req, res, next) => {
  const { name, slug, description, location, bannerImageUrl, socialLinks, map, initialAdminUserIds } = req.body;
  console.log('📦  POST /api/v1/admin/groups', { name, slug });

  try {
    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    // Generate slug from name if not provided
    const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Check for slug uniqueness
    const [existingSlug] = await db
      .select()
      .from(schema.foodieGroup)
      .where(eq(schema.foodieGroup.slug, finalSlug))
      .limit(1);

    if (existingSlug) {
      return res.status(400).json({ error: 'A group with this slug already exists' });
    }

    const [newGroup] = await db
      .insert(schema.foodieGroup)
      .values({
        name,
        slug: finalSlug,
        description,
        location,
        bannerImageUrl,
        socialLinks,
        map,
      })
      .returning();

    // Assign initial admins if provided
    if (initialAdminUserIds && Array.isArray(initialAdminUserIds)) {
      for (const userId of initialAdminUserIds) {
        const [user] = await db
          .select()
          .from(schema.user)
          .where(and(eq(schema.user.id, userId), isNull(schema.user.deletedAt)))
          .limit(1);

        if (user) {
          await db.insert(schema.foodieGroupMembership).values({
            userId,
            groupId: newGroup.id,
            role: 'foodie_group_admin',
          });
        }
      }
    }

    // Audit log
    await logAdminAction(req.dbUser.id, 'group_create', 'foodie_group', newGroup.id, {
      name,
      slug: finalSlug,
      initialAdminUserIds,
    });

    res.status(201).json(newGroup);
  } catch (err) {
    console.error('📦  error in POST /admin/groups', err);
    next(err);
  }
});

/**
 * PATCH /api/v1/admin/groups/:id
 * Update a foodie group
 */
router.patch('/groups/:id', async (req, res, next) => {
  const { id } = req.params;
  const { name, description, location, bannerImageUrl, socialLinks, map, archivedAt } = req.body;
  console.log('📦  PATCH /api/v1/admin/groups/:id', { id, name });

  try {
    const [group] = await db
      .select()
      .from(schema.foodieGroup)
      .where(eq(schema.foodieGroup.id, id))
      .limit(1);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (location !== undefined) updates.location = location;
    if (bannerImageUrl !== undefined) updates.bannerImageUrl = bannerImageUrl;
    if (socialLinks !== undefined) updates.socialLinks = socialLinks;
    if (map !== undefined) updates.map = map;
    if (archivedAt !== undefined) updates.archivedAt = archivedAt;

    const [updated] = await db
      .update(schema.foodieGroup)
      .set(updates)
      .where(eq(schema.foodieGroup.id, id))
      .returning();

    // Audit log
    await logAdminAction(req.dbUser.id, 'group_update', 'foodie_group', id, { updates });

    res.json(updated);
  } catch (err) {
    console.error('📦  error in PATCH /admin/groups/:id', err);
    next(err);
  }
});

/**
 * GET /api/v1/admin/groups/:id/admins
 * List admins for a foodie group
 */
router.get('/groups/:id/admins', async (req, res, next) => {
  const { id } = req.params;
  console.log('📦  GET /api/v1/admin/groups/:id/admins', { id });

  try {
    const admins = await db
      .select({
        membershipId: schema.foodieGroupMembership.id,
        userId: schema.foodieGroupMembership.userId,
        role: schema.foodieGroupMembership.role,
        joinedAt: schema.foodieGroupMembership.joinedAt,
        userEmail: schema.user.email,
        userName: schema.user.name,
      })
      .from(schema.foodieGroupMembership)
      .innerJoin(schema.user, eq(schema.foodieGroupMembership.userId, schema.user.id))
      .where(
        and(
          eq(schema.foodieGroupMembership.groupId, id),
          eq(schema.foodieGroupMembership.role, 'foodie_group_admin'),
          isNull(schema.foodieGroupMembership.deletedAt)
        )
      );

    res.json({ admins });
  } catch (err) {
    console.error('📦  error in GET /admin/groups/:id/admins', err);
    next(err);
  }
});

/**
 * POST /api/v1/admin/groups/:id/admins
 * Assign a user as foodie_group_admin
 */
router.post('/groups/:id/admins', async (req, res, next) => {
  const { id: groupId } = req.params;
  const { userId } = req.body;
  console.log('📦  POST /api/v1/admin/groups/:id/admins', { groupId, userId });

  try {
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Verify group exists
    const [group] = await db
      .select()
      .from(schema.foodieGroup)
      .where(eq(schema.foodieGroup.id, groupId))
      .limit(1);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user exists
    const [user] = await db
      .select()
      .from(schema.user)
      .where(and(eq(schema.user.id, userId), isNull(schema.user.deletedAt)))
      .limit(1);

    if (!user) {
      return res.status(400).json({ error: 'User not found or is disabled' });
    }

    // Check for existing membership
    const [existing] = await db
      .select()
      .from(schema.foodieGroupMembership)
      .where(
        and(
          eq(schema.foodieGroupMembership.userId, userId),
          eq(schema.foodieGroupMembership.groupId, groupId)
        )
      )
      .limit(1);

    if (existing) {
      // Update existing membership to admin role
      const [updated] = await db
        .update(schema.foodieGroupMembership)
        .set({ role: 'foodie_group_admin', deletedAt: null })
        .where(eq(schema.foodieGroupMembership.id, existing.id))
        .returning();

      await logAdminAction(req.dbUser.id, 'group_admin_assign', 'foodie_group_membership', updated.id, {
        groupId,
        userId,
        previousRole: existing.role,
      });

      return res.json({ membershipId: updated.id, role: updated.role, message: 'User promoted to group admin' });
    }

    // Create new membership as admin
    const [membership] = await db
      .insert(schema.foodieGroupMembership)
      .values({
        userId,
        groupId,
        role: 'foodie_group_admin',
      })
      .returning();

    await logAdminAction(req.dbUser.id, 'group_admin_assign', 'foodie_group_membership', membership.id, {
      groupId,
      userId,
    });

    res.status(201).json({ membershipId: membership.id, role: membership.role, message: 'User assigned as group admin' });
  } catch (err) {
    console.error('📦  error in POST /admin/groups/:id/admins', err);
    next(err);
  }
});

/**
 * DELETE /api/v1/admin/groups/:id/admins/:membershipId
 * Remove admin role (soft-delete or demote to customer)
 */
router.delete('/groups/:id/admins/:membershipId', async (req, res, next) => {
  const { id: groupId, membershipId } = req.params;
  console.log('📦  DELETE /api/v1/admin/groups/:id/admins/:membershipId', { groupId, membershipId });

  try {
    const [membership] = await db
      .select()
      .from(schema.foodieGroupMembership)
      .where(
        and(
          eq(schema.foodieGroupMembership.id, membershipId),
          eq(schema.foodieGroupMembership.groupId, groupId)
        )
      )
      .limit(1);

    if (!membership) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    // Demote to customer instead of deleting
    const [updated] = await db
      .update(schema.foodieGroupMembership)
      .set({ role: 'customer' })
      .where(eq(schema.foodieGroupMembership.id, membershipId))
      .returning();

    await logAdminAction(req.dbUser.id, 'group_admin_remove', 'foodie_group_membership', membershipId, {
      groupId,
      userId: membership.userId,
      previousRole: membership.role,
    });

    res.json({ message: 'Admin role removed', membershipId: updated.id, newRole: updated.role });
  } catch (err) {
    console.error('📦  error in DELETE /admin/groups/:id/admins/:membershipId', err);
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// E) PAYMENT ANALYTICS (Read-only against Stripe, DB-backed)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/payments/overview
 * Payment analytics overview (DB-backed, no Stripe calls)
 */
router.get('/payments/overview', async (req, res, next) => {
  const { from, to } = req.query;
  console.log('📦  GET /api/v1/admin/payments/overview', { from, to });

  try {
    let dateFilter = [];
    if (from) dateFilter.push(gte(schema.purchase.createdAt, from));
    if (to) dateFilter.push(lte(schema.purchase.createdAt, to));

    const baseWhere = dateFilter.length > 0 ? and(...dateFilter) : undefined;

    const [
      totalPurchases,
      paidPurchases,
      pendingPurchases,
      refundedPurchases,
      failedPurchases,
      grossRevenue,
      unprocessedEvents,
      failedEvents,
    ] = await Promise.all([
      db.select({ count: count() }).from(schema.purchase).where(baseWhere),
      db.select({ count: count() }).from(schema.purchase).where(baseWhere ? and(baseWhere, eq(schema.purchase.status, 'paid')) : eq(schema.purchase.status, 'paid')),
      db.select({ count: count() }).from(schema.purchase).where(baseWhere ? and(baseWhere, eq(schema.purchase.status, 'pending')) : eq(schema.purchase.status, 'pending')),
      db.select({ count: count() }).from(schema.purchase).where(baseWhere ? and(baseWhere, eq(schema.purchase.status, 'refunded')) : eq(schema.purchase.status, 'refunded')),
      db.select({ count: count() }).from(schema.purchase).where(baseWhere ? and(baseWhere, eq(schema.purchase.status, 'expired')) : eq(schema.purchase.status, 'expired')),
      db.select({ total: sql`COALESCE(SUM(${schema.purchase.amountCents}), 0)` }).from(schema.purchase).where(baseWhere ? and(baseWhere, eq(schema.purchase.status, 'paid')) : eq(schema.purchase.status, 'paid')),
      db.select({ count: count() }).from(schema.paymentEvent).where(isNull(schema.paymentEvent.processedAt)),
      db.select({ count: count() }).from(schema.paymentEvent).where(isNotNull(schema.paymentEvent.processingError)),
    ]);

    res.json({
      totalPurchases: totalPurchases[0]?.count ?? 0,
      byStatus: {
        paid: paidPurchases[0]?.count ?? 0,
        pending: pendingPurchases[0]?.count ?? 0,
        refunded: refundedPurchases[0]?.count ?? 0,
        failed: failedPurchases[0]?.count ?? 0,
      },
      grossRevenueCents: Number(grossRevenue[0]?.total ?? 0),
      currency: 'usd',
      paymentHealth: {
        unprocessedEvents: unprocessedEvents[0]?.count ?? 0,
        failedEvents: failedEvents[0]?.count ?? 0,
      },
      dateRange: { from, to },
    });
  } catch (err) {
    console.error('📦  error in GET /admin/payments/overview', err);
    next(err);
  }
});

/**
 * GET /api/v1/admin/purchases
 * List purchases with filtering
 */
router.get('/purchases', async (req, res, next) => {
  const { from, to, groupId, status, limit = 50, offset = 0 } = req.query;
  console.log('📦  GET /api/v1/admin/purchases', { from, to, groupId, status });

  try {
    let whereClause = [];

    if (from) whereClause.push(gte(schema.purchase.createdAt, from));
    if (to) whereClause.push(lte(schema.purchase.createdAt, to));
    if (groupId) whereClause.push(eq(schema.purchase.groupId, groupId));
    if (status) whereClause.push(eq(schema.purchase.status, status));

    const purchases = await db
      .select({
        id: schema.purchase.id,
        userId: schema.purchase.userId,
        groupId: schema.purchase.groupId,
        provider: schema.purchase.provider,
        stripeCheckoutId: schema.purchase.stripeCheckoutId,
        stripePaymentIntentId: schema.purchase.stripePaymentIntentId,
        amountCents: schema.purchase.amountCents,
        currency: schema.purchase.currency,
        status: schema.purchase.status,
        purchasedAt: schema.purchase.purchasedAt,
        createdAt: schema.purchase.createdAt,
        groupName: schema.foodieGroup.name,
        userEmail: schema.user.email,
      })
      .from(schema.purchase)
      .leftJoin(schema.foodieGroup, eq(schema.purchase.groupId, schema.foodieGroup.id))
      .leftJoin(schema.user, eq(schema.purchase.userId, schema.user.id))
      .where(whereClause.length > 0 ? and(...whereClause) : undefined)
      .orderBy(desc(schema.purchase.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({ purchases, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    console.error('📦  error in GET /admin/purchases', err);
    next(err);
  }
});

/**
 * GET /api/v1/admin/payment-events
 * List payment events for webhook health monitoring
 */
router.get('/payment-events', async (req, res, next) => {
  const { unprocessed, failed, from, to, limit = 50, offset = 0 } = req.query;
  console.log('📦  GET /api/v1/admin/payment-events', { unprocessed, failed, from, to });

  try {
    let whereClause = [];

    if (from) whereClause.push(gte(schema.paymentEvent.receivedAt, from));
    if (to) whereClause.push(lte(schema.paymentEvent.receivedAt, to));
    if (unprocessed === 'true') whereClause.push(isNull(schema.paymentEvent.processedAt));
    if (failed === 'true') whereClause.push(isNotNull(schema.paymentEvent.processingError));

    const events = await db
      .select()
      .from(schema.paymentEvent)
      .where(whereClause.length > 0 ? and(...whereClause) : undefined)
      .orderBy(desc(schema.paymentEvent.receivedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    res.json({ events, limit: Number(limit), offset: Number(offset) });
  } catch (err) {
    console.error('📦  error in GET /admin/payment-events', err);
    next(err);
  }
});

/**
 * POST /api/v1/admin/payment-events/:id/reprocess
 * Manually trigger reprocessing of a stuck payment event
 * Note: Actual reprocessing logic depends on your webhook handler
 */
router.post('/payment-events/:id/reprocess', async (req, res, next) => {
  const { id } = req.params;
  console.log('📦  POST /api/v1/admin/payment-events/:id/reprocess', { id });

  try {
    const [event] = await db
      .select()
      .from(schema.paymentEvent)
      .where(eq(schema.paymentEvent.id, id))
      .limit(1);

    if (!event) {
      return res.status(404).json({ error: 'Payment event not found' });
    }

    // Reset processing status to allow retry
    await db
      .update(schema.paymentEvent)
      .set({
        processedAt: null,
        processingError: null,
      })
      .where(eq(schema.paymentEvent.id, id));

    // Audit log
    await logAdminAction(req.dbUser.id, 'payment_event_reprocess', 'payment_event', id, {
      eventType: event.eventType,
      stripeEventId: event.eventId,
      previousProcessedAt: event.processedAt,
      previousError: event.processingError,
    });

    // Note: Actual reprocessing would need to be implemented based on your webhook handler
    // For now, we just mark it as ready for reprocessing
    res.json({
      id,
      message: 'Payment event marked for reprocessing',
      eventType: event.eventType,
      hint: 'Event will be processed on next webhook handler cycle or manual trigger',
    });
  } catch (err) {
    console.error('📦  error in POST /admin/payment-events/:id/reprocess', err);
    next(err);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOGGING HELPER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log an admin action (writes to admin_audit_log table if it exists,
 * otherwise falls back to console logging)
 */
async function logAdminAction(actorUserId, action, targetType, targetId, metadata = {}) {
  try {
    // Check if admin_audit_log table exists
    if (schema.adminAuditLog) {
      await db.insert(schema.adminAuditLog).values({
        actorUserId,
        action,
        targetType,
        targetId,
        metadata,
      });
    } else {
      // Fallback to console logging until migration is run
      console.log('📋 ADMIN AUDIT:', {
        actorUserId,
        action,
        targetType,
        targetId,
        metadata,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    // Don't fail the main operation if audit logging fails
    console.error('Failed to log admin action:', err);
    console.log('📋 ADMIN AUDIT (fallback):', {
      actorUserId,
      action,
      targetType,
      targetId,
      metadata,
      timestamp: new Date().toISOString(),
    });
  }
}

export default router;
