import { db } from '../db.js';
import * as schema from '../schema.js';
import { eq, and, or, isNull, sql } from 'drizzle-orm';

/**
 * resolveLocalUser:
 * Middleware that fetches the DB user by Cognito sub and attaches it to req.dbUser.
 * Requires the standard auth middleware to have already run.
 * 
 * Security: Blocks access for users with deletedAt set (disabled/removed users).
 */
export async function resolveLocalUser(req, res, next) {
  if (!req.user || !req.user.sub) {
    return res.status(401).json({ message: 'Unauthorized: No valid session' });
  }

  try {
    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.cognitoSub, req.user.sub))
      .limit(1);

    if (!user) {
      // Check if this sub was previously registered but is now disabled/anonymized
      // We check by email pattern to prevent re-creation of disabled accounts
      console.warn(`User with sub ${req.user.sub} not found in DB; creating on-the-fly`);
      
      const safeName =
        req.user.name ||
        (req.user.email ? req.user.email.split('@')[0] : 'user-' + req.user.sub.slice(0, 6));

      const safeEmail = req.user.email || `${req.user.sub}@unknown.local`;

      // Check if email exists but is deleted (prevent re-creation of disabled accounts)
      const [existingByEmail] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.email, safeEmail))
        .limit(1);
      
      if (existingByEmail && existingByEmail.deletedAt) {
        console.warn(`Blocked auto-creation: email ${safeEmail} belongs to a disabled account`);
        return res.status(403).json({ 
          message: 'Forbidden: This account has been disabled. Contact support if you believe this is an error.' 
        });
      }

      const [newUser] = await db
        .insert(schema.user)
        .values({
          cognitoSub: req.user.sub,
          email:      safeEmail,
          name:       safeName,
          role:       'customer',
        })
        .returning();
      
      req.dbUser = newUser;
      return next();
    }

    // Block disabled/deleted users from accessing protected endpoints
    if (user.deletedAt) {
      console.warn(`Blocked disabled user ${user.id} (deletedAt: ${user.deletedAt})`);
      return res.status(403).json({ 
        message: 'Forbidden: This account has been disabled. Contact support if you believe this is an error.' 
      });
    }

    // Attach full DB user record
    req.dbUser = user;
    next();
  } catch (err) {
    console.error('Failed to resolve local user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * requireSuperAdmin:
 * Middleware that ensures the dbUser has the 'super_admin' role.
 * (Renamed from requireAdmin for clarity - there is only one privileged platform role)
 */
export function requireSuperAdmin(req, res, next) {
  if (req.dbUser?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Forbidden: Super admin access required' });
  }
  next();
}

// Backwards compatibility alias (deprecated, use requireSuperAdmin)
export const requireAdmin = requireSuperAdmin;

/**
 * canManageMerchant:
 * Returns true if the user is a super admin OR the owner of the merchant.
 */
export async function canManageMerchant(dbUser, merchantId) {
  if (!dbUser || !merchantId) return false;
  if (dbUser.role === 'super_admin') return true;

  const [merchant] = await db
    .select({ ownerId: schema.merchant.ownerId })
    .from(schema.merchant)
    .where(eq(schema.merchant.id, merchantId))
    .limit(1);

  return merchant?.ownerId === dbUser.id;
}

/**
 * canManageCoupon:
 * Returns true if the user is a super admin OR the owner of the coupon's merchant.
 */
export async function canManageCoupon(dbUser, couponId) {
  if (!dbUser || !couponId) return false;
  if (dbUser.role === 'super_admin') return true;

  const [couponWithMerchant] = await db
    .select({ merchantOwnerId: schema.merchant.ownerId })
    .from(schema.coupon)
    .innerJoin(schema.merchant, eq(schema.coupon.merchantId, schema.merchant.id))
    .where(eq(schema.coupon.id, couponId))
    .limit(1);

  return couponWithMerchant?.merchantOwnerId === dbUser.id;
}

/**
 * canManageGroup:
 * Returns true if super admin OR has 'foodie_group_admin' role in that specific group.
 */
export async function canManageGroup(dbUser, groupId) {
  if (!dbUser || !groupId) return false;
  if (dbUser.role === 'super_admin') return true;

  const [membership] = await db
    .select({ role: schema.foodieGroupMembership.role })
    .from(schema.foodieGroupMembership)
    .where(
      and(
        eq(schema.foodieGroupMembership.userId, dbUser.id),
        eq(schema.foodieGroupMembership.groupId, groupId)
      )
    )
    .limit(1);

  return membership?.role === 'foodie_group_admin';
}

/**
 * canManageEvent:
 * Returns true if the user is a super admin OR the owner of the event's merchant.
 * Use for write operations (attendee management, RSVP updates, etc.).
 */
export async function canManageEvent(dbUser, eventId) {
  if (!dbUser || !eventId) return false;
  if (dbUser.role === 'super_admin') return true;

  try {
    const [eventWithMerchant] = await db
      .select({ merchantOwnerId: schema.merchant.ownerId })
      .from(schema.event)
      .innerJoin(schema.merchant, eq(schema.event.merchantId, schema.merchant.id))
      .where(eq(schema.event.id, eventId))
      .limit(1);

    return eventWithMerchant?.merchantOwnerId === dbUser.id;
  } catch {
    return false;
  }
}

/**
 * canViewEventStats:
 * Returns true if the user is a super admin, the owner of the event's merchant,
 * OR a foodie group admin for the group that hosts this event.
 * Use for read-only aggregate stats (no PII exposed).
 */
export async function canViewEventStats(dbUser, eventId) {
  if (!dbUser || !eventId) return false;
  if (dbUser.role === 'super_admin') return true;

  try {
    const [eventRow] = await db
      .select({ merchantOwnerId: schema.merchant.ownerId, groupId: schema.event.groupId })
      .from(schema.event)
      .innerJoin(schema.merchant, eq(schema.event.merchantId, schema.merchant.id))
      .where(eq(schema.event.id, eventId))
      .limit(1);

    if (!eventRow) return false;
    if (eventRow.merchantOwnerId === dbUser.id) return true;

    if (eventRow.groupId) {
      return canManageGroup(dbUser, eventRow.groupId);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * canManageEventSubmission:
 * Returns true if super admin OR merchant owner of the submission OR group admin.
 */
export async function canManageEventSubmission(dbUser, submission) {
  if (!dbUser || !submission) return false;
  if (dbUser.role === 'super_admin') return true;

  if (submission.merchantId) {
    const isOwner = await canManageMerchant(dbUser, submission.merchantId);
    if (isOwner) return true;
  }

  if (submission.groupId) {
    const isGAdmin = await canManageGroup(dbUser, submission.groupId);
    if (isGAdmin) return true;
  }

  return false;
}

/**
 * hasEntitlement:
 * Returns true if the user has access to the given group's locked coupons.
 * Rules:
 *   - super_admin always has access
 *   - paid purchase where expires_at IS NULL (perpetual / admin_grant) OR expires_at > now
 *   - subscription in past_due status gets a 3-day grace window after current_period_end
 *   - group admins always have access to their group
 */
export async function hasEntitlement(dbUser, groupId) {
  if (!dbUser || !groupId) return false;
  if (dbUser.role === 'super_admin') return true;

  const now = new Date().toISOString();
  const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // 1) Check for active purchase: paid + not expired, OR past_due within grace window
  const [activePurchase] = await db
    .select({ id: schema.purchase.id, subscriptionStatus: schema.purchase.subscriptionStatus, currentPeriodEnd: schema.purchase.currentPeriodEnd })
    .from(schema.purchase)
    .where(
      and(
        eq(schema.purchase.userId, dbUser.id),
        eq(schema.purchase.groupId, groupId),
        eq(schema.purchase.status, 'paid'),
        or(
          // Non-subscription or admin_grant: expires_at null or in future
          and(
            isNull(schema.purchase.subscriptionStatus),
            or(
              isNull(schema.purchase.expiresAt),
              sql`${schema.purchase.expiresAt} > ${now}`
            )
          ),
          // Active subscription: expires_at in future
          and(
            eq(schema.purchase.subscriptionStatus, 'active'),
            or(
              isNull(schema.purchase.expiresAt),
              sql`${schema.purchase.expiresAt} > ${now}`
            )
          ),
          // Past-due subscription: still within 3-day grace window
          and(
            eq(schema.purchase.subscriptionStatus, 'past_due'),
            sql`${schema.purchase.currentPeriodEnd} > ${graceCutoff}`
          )
        )
      )
    )
    .limit(1);

  if (activePurchase) return true;

  // 2) Check for group admin role in this group
  const isGAdmin = await canManageGroup(dbUser, groupId);
  if (isGAdmin) return true;

  return false;
}
