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

    // Attach the real, authenticated user
    req.dbUser = user;

    // Super-admin "Act as" impersonation: when a super_admin sends the
    // X-Impersonate-User-Id header, resolve this request as that target user
    // (support tooling). Guardrails: super_admin only; target must exist, be
    // active, and NOT be a super_admin. The real actor stays on req.realUser.
    const impersonateId = req.headers['x-impersonate-user-id'];
    if (impersonateId && user.role === 'super_admin' && impersonateId !== user.id) {
      const [target] = await db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, impersonateId))
        .limit(1);
      if (!target || target.deletedAt) {
        return res.status(404).json({ message: 'Impersonation target not found or disabled' });
      }
      if (target.role === 'super_admin') {
        return res.status(403).json({ message: 'Cannot impersonate another super admin' });
      }
      req.realUser = user;
      req.dbUser = target;
      req.impersonating = true;
    }

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
 * Returns true if the user is a super admin, the owner of the merchant,
 * OR has an active merchant_membership row for this merchant.
 */
export async function canManageMerchant(dbUser, merchantId) {
  if (!dbUser || !merchantId) return false;
  if (dbUser.role === 'super_admin') return true;

  const [merchant] = await db
    .select({ ownerId: schema.merchant.ownerId })
    .from(schema.merchant)
    .where(eq(schema.merchant.id, merchantId))
    .limit(1);

  if (merchant?.ownerId === dbUser.id) return true;

  const [member] = await db
    .select({ id: schema.merchantMembership.id })
    .from(schema.merchantMembership)
    .where(
      and(
        eq(schema.merchantMembership.merchantId, merchantId),
        eq(schema.merchantMembership.userId, dbUser.id),
        isNull(schema.merchantMembership.deletedAt),
      )
    )
    .limit(1);

  return !!member;
}

/**
 * canManageCoupon:
 * Returns true if the user can manage the coupon's merchant.
 */
export async function canManageCoupon(dbUser, couponId) {
  if (!dbUser || !couponId) return false;
  if (dbUser.role === 'super_admin') return true;

  const [couponWithMerchant] = await db
    .select({ merchantId: schema.coupon.merchantId })
    .from(schema.coupon)
    .where(eq(schema.coupon.id, couponId))
    .limit(1);

  if (!couponWithMerchant?.merchantId) return false;
  return canManageMerchant(dbUser, couponWithMerchant.merchantId);
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
 * Returns true if the user can manage the event's merchant.
 * Use for write operations (attendee management, RSVP updates, etc.).
 */
export async function canManageEvent(dbUser, eventId) {
  if (!dbUser || !eventId) return false;
  if (dbUser.role === 'super_admin') return true;

  try {
    const [eventRow] = await db
      .select({ merchantId: schema.event.merchantId })
      .from(schema.event)
      .where(eq(schema.event.id, eventId))
      .limit(1);

    if (!eventRow?.merchantId) return false;
    return canManageMerchant(dbUser, eventRow.merchantId);
  } catch {
    return false;
  }
}

/**
 * canViewEventStats:
 * Returns true if the user is a super admin, can manage the event's merchant,
 * OR a foodie group admin for the group that hosts this event.
 * Use for read-only aggregate stats (no PII exposed).
 */
export async function canViewEventStats(dbUser, eventId) {
  if (!dbUser || !eventId) return false;
  if (dbUser.role === 'super_admin') return true;

  try {
    const [eventRow] = await db
      .select({ merchantId: schema.event.merchantId, groupId: schema.event.groupId })
      .from(schema.event)
      .where(eq(schema.event.id, eventId))
      .limit(1);

    if (!eventRow) return false;

    if (eventRow.merchantId) {
      const canManage = await canManageMerchant(dbUser, eventRow.merchantId);
      if (canManage) return true;
    }

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
 * Returns true if super admin OR can manage submission's merchant OR group admin.
 */
export async function canManageEventSubmission(dbUser, submission) {
  if (!dbUser || !submission) return false;
  if (dbUser.role === 'super_admin') return true;

  if (submission.merchantId) {
    const canManage = await canManageMerchant(dbUser, submission.merchantId);
    if (canManage) return true;
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
