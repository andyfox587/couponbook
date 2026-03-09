// server/src/routes/couponSubmissions.js
import express from 'express';
import { db } from '../db.js';
import {
  couponSubmission,
  coupon,
  merchant,
  user,
  foodieGroupMembership,   // ⬅️ add this
} from '../schema.js';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import auth from '../middleware/auth.js';
import { resolveLocalUser, canManageMerchant, canManageGroup } from '../authz/index.js';

const router = express.Router();
console.log('📦  couponSubmissions router loaded');

// ────────────────────────────────────────────────────────────────
// GET all pending submissions for a specific group (dashboard)
// If groupId is not provided, infer it from foodie_group_membership
// for the current foodie_group_admin / super_admin.
// ────────────────────────────────────────────────────────────────
router.get('/', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  GET /api/v1/coupon-submissions hit', req.query);
  try {
    let { groupId } = req.query;
    const dbUser = req.dbUser;

    // If no groupId passed, infer from membership
    if (!groupId) {
      // Super admin shortcut
      if (dbUser.role === 'super_admin') {
        // For now, super admins must still pass groupId explicitly if they manage many groups.
        return res.status(400).json({ error: 'groupId is required for super admin users' });
      }

      // Find memberships for this user
      const memberships = await db
        .select()
        .from(foodieGroupMembership)
        .where(eq(foodieGroupMembership.userId, dbUser.id));

      if (!memberships.length) {
        return res.status(403).json({
          error: 'No foodie group membership found for this user',
        });
      }

      // For now, assume single-group admin; pick the first group
      const membership = memberships[0];
      groupId = membership.groupId;
      console.log('📦  inferred groupId from membership', groupId);
    }

    // 🔐 Ensure this user can admin this group
    const allowed = await canManageGroup(dbUser, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You are not an admin for this group' });
    }

    // Only pending for that group
    const subs = await db
      .select({
        id:             couponSubmission.id,
        groupId:        couponSubmission.groupId,
        merchantId:     couponSubmission.merchantId,
        merchantName:   merchant.name,
        state:          couponSubmission.state,
        submittedAt:    couponSubmission.submittedAt,
        updatedAt:      couponSubmission.updatedAt,
        reviewedAt:     couponSubmission.reviewedAt,
        submissionData: couponSubmission.submissionData,
        deletedAt:      couponSubmission.deletedAt,
      })
      .from(couponSubmission)
      .leftJoin(merchant, eq(merchant.id, couponSubmission.merchantId))
      .where(
        and(
          eq(couponSubmission.state, 'pending'),
          eq(couponSubmission.groupId, groupId),
        ),
      );

    console.log(`📦  returning ${subs.length} submissions`);
    res.json(subs);
  } catch (err) {
    console.error('📦  error in GET /coupon-submissions', err);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// NEW: GET /api/v1/coupon-submissions/by-merchant
// Returns all submissions for merchants owned by the authed user,
// optionally filtered by ?state=rejected / ?state=pending / etc.
// ────────────────────────────────────────────────────────────────
router.get('/by-merchant', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  GET /api/v1/coupon-submissions/by-merchant');
  try {
    const dbUser = req.dbUser;

    // 2) Find all merchants owned by this user
    const ownedMerchants = await db
      .select({
        id:   merchant.id,
        name: merchant.name,
      })
      .from(merchant)
      .where(eq(merchant.ownerId, dbUser.id));

    if (ownedMerchants.length === 0) {
      return res.json([]);
    }

    const merchantIds = ownedMerchants.map((m) => m.id);

    // Optional state filter (?state=rejected, ?state=pending, etc.)
    const { state } = req.query;

    const baseWhere = [
      inArray(couponSubmission.merchantId, merchantIds),
      isNull(couponSubmission.deletedAt), // ignore soft-deleted
    ];

    const whereExpr = state
      ? and(...baseWhere, eq(couponSubmission.state, state))
      : and(...baseWhere);

    // 3) Load submissions + join merchant name
    const rows = await db
      .select({
        id:              couponSubmission.id,
        merchantId:       couponSubmission.merchantId,
        groupId:          couponSubmission.groupId,
        state:            couponSubmission.state,
        submittedAt:      couponSubmission.submittedAt,
        updatedAt:        couponSubmission.updatedAt,
        reviewedAt:       couponSubmission.reviewedAt,
        submissionData:   couponSubmission.submissionData,
        rejectionMessage: couponSubmission.rejectionMessage,
        deletedAt:        couponSubmission.deletedAt,
        merchantName:     merchant.name,
      })
      .from(couponSubmission)
      .leftJoin(
        merchant,
        eq(couponSubmission.merchantId, merchant.id),
      )
      .where(whereExpr)
      .orderBy(couponSubmission.submittedAt);

    return res.json(rows);
  } catch (err) {
    console.error('📦  error in GET /coupon-submissions/by-merchant', err);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// GET a single submission by ID
// ────────────────────────────────────────────────────────────────
router.get('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  GET /api/v1/coupon-submissions/' + req.params.id);
  try {
    const [sub] = await db
      .select()
      .from(couponSubmission)
      .where(eq(couponSubmission.id, req.params.id));
    if (!sub) {
      console.log('📦  submission not found');
      return res.status(404).json({ message: 'Submission not found' });
    }

    // 🔐 authorize: super admin OR merchant-owner OR group-admin
    const dbUser = req.dbUser;

    // Admin sees all
    if (dbUser.role === 'super_admin') {
      return res.json(sub);
    }

    // Merchant owner can read their own submission
    const isOwner = await canManageMerchant(dbUser, sub.merchantId);
    if (isOwner) {
      return res.json(sub);
    }

    // Foodie group admin can read submissions for their group
    const isGAdmin = await canManageGroup(dbUser, sub.groupId);
    if (isGAdmin) {
      return res.json(sub);
    }

    res.status(403).json({ error: 'Forbidden: You do not have access to this submission' });
  } catch (err) {
    console.error('📦  error in GET /coupon-submissions/:id', err);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// Validation helpers for submission_data
// ────────────────────────────────────────────────────────────────
const VALID_COUPON_TYPES = ['percent', 'amount', 'bogo', 'free_item'];

function validateSubmissionData(data) {
  const errors = [];

  // Required fields
  const requiredFields = ['title', 'description', 'coupon_type', 'valid_from', 'expires_at'];
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      errors.push(`${field} is required`);
    }
  }

  // Validate coupon_type enum
  if (data.coupon_type && !VALID_COUPON_TYPES.includes(data.coupon_type)) {
    errors.push(`coupon_type must be one of: ${VALID_COUPON_TYPES.join(', ')}`);
  }

  // Validate dates
  if (data.valid_from) {
    const validFrom = new Date(data.valid_from);
    if (isNaN(validFrom.getTime())) {
      errors.push('valid_from must be a valid date');
    }
  }
  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at);
    if (isNaN(expiresAt.getTime())) {
      errors.push('expires_at must be a valid date');
    }
  }

  // Validate discount_value is required for percent/amount
  if (data.coupon_type === 'percent' || data.coupon_type === 'amount') {
    if (data.discount_value === undefined || data.discount_value === null || data.discount_value === '') {
      errors.push('discount_value is required for percent/amount coupon types');
    } else if (typeof data.discount_value !== 'number' && isNaN(Number(data.discount_value))) {
      errors.push('discount_value must be a number');
    }
  }

  return errors;
}

function normalizeSubmissionData(data) {
  const normalized = { ...data };

  // Default discount_value to 0 for bogo/free_item
  if (normalized.coupon_type === 'bogo' || normalized.coupon_type === 'free_item') {
    if (normalized.discount_value === undefined || normalized.discount_value === null || normalized.discount_value === '') {
      normalized.discount_value = 0;
    }
  }

  // Coerce discount_value to number
  if (normalized.discount_value !== undefined && normalized.discount_value !== null) {
    normalized.discount_value = Number(normalized.discount_value);
  }

  // Normalize locked to true if omitted
  if (normalized.locked === undefined || normalized.locked === null) {
    normalized.locked = true;
  }

  return normalized;
}

// ────────────────────────────────────────────────────────────────
// POST new submission
// ────────────────────────────────────────────────────────────────
router.post('/', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  POST /api/v1/coupon-submissions', req.body);
  try {
    const { group_id, merchant_id, submission_data } = req.body;
    const dbUser = req.dbUser;

    if (!group_id) {
      return res.status(400).json({ error: 'group_id is required' });
    }
    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id is required' });
    }
    if (!submission_data) {
      return res.status(400).json({ error: 'submission_data is required' });
    }

    // Validate submission_data fields
    const validationErrors = validateSubmissionData(submission_data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationErrors 
      });
    }

    // Normalize submission_data (defaults for discount_value, locked, etc.)
    const normalizedData = normalizeSubmissionData(submission_data);

    // Verify merchant exists and enforce ownership (super admin bypass)
    const allowed = await canManageMerchant(dbUser, merchant_id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this merchant' });
    }

    const [newSub] = await db
      .insert(couponSubmission)
      .values({
        groupId:        group_id,
        merchantId:     merchant_id,
        state:          'pending',
        submissionData: normalizedData,
      })
      .returning();
    res.status(201).json(newSub);
  } catch (err) {
    console.error('📦  error in POST /coupon-submissions', err);
    return res
      .status(500)
      .json({ error: err.message, detail: err.cause?.message });
  }
});

// ────────────────────────────────────────────────────────────────
// PATCH /:id — merchant edits their own pending submission
// Only the owning merchant (or super admin) can use this,
// and only while the submission is still in 'pending' state.
// ────────────────────────────────────────────────────────────────
router.patch('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  const submissionId = req.params.id;
  const { submission_data } = req.body;
  const dbUser = req.dbUser;

  console.log(`📦  PATCH /api/v1/coupon-submissions/${submissionId}`);

  try {
    if (!submission_data) {
      return res.status(400).json({ error: 'submission_data is required' });
    }

    const validationErrors = validateSubmissionData(submission_data);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    const normalizedData = normalizeSubmissionData(submission_data);

    const [existing] = await db
      .select()
      .from(couponSubmission)
      .where(eq(couponSubmission.id, submissionId));

    if (!existing) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    if (existing.state !== 'pending') {
      return res.status(403).json({
        error: `Cannot edit a submission that has been ${existing.state}`,
      });
    }

    const allowed = await canManageMerchant(dbUser, existing.merchantId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this merchant' });
    }

    const [updated] = await db
      .update(couponSubmission)
      .set({
        submissionData: normalizedData,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(couponSubmission.id, submissionId))
      .returning();

    return res.json({
      id: updated.id,
      merchantId: updated.merchantId,
      groupId: updated.groupId,
      state: updated.state,
      submittedAt: updated.submittedAt,
      updatedAt: updated.updatedAt,
      submissionData: updated.submissionData,
      rejectionMessage: updated.rejectionMessage,
    });
  } catch (err) {
    console.error(`❌ Error in PATCH /coupon-submissions/${submissionId}:`, err);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// PUT update submission (approve/reject → may create coupon)
// Only foodie_group_admin for that group (or super admin) can do this.
// ────────────────────────────────────────────────────────────────
router.put('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  const submissionId = req.params.id;
  const { state, message } = req.body;
  const dbUser = req.dbUser;

  console.log(`📦  PUT /api/v1/coupon-submissions/${submissionId}`, {
    state,
    message,
  });

  try {
    // Load submission first so we know its groupId
    const [existing] = await db
      .select()
      .from(couponSubmission)
      .where(eq(couponSubmission.id, submissionId));

    if (!existing) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    const groupId = existing.groupId;
    if (!groupId) {
      console.warn('📦  submission has no groupId', submissionId);
      return res.status(400).json({ error: 'Submission has no groupId' });
    }

    // 🔐 Check group admin rights for this group
    const allowed = await canManageGroup(dbUser, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You are not an admin for this group' });
    }

    // Proceed with update
    const updateData = { state, reviewedAt: new Date().toISOString() };
    if (state === 'rejected' && message) {
      updateData.rejectionMessage = message;
    }

    const [updated] = await db
      .update(couponSubmission)
      .set(updateData)
      .where(eq(couponSubmission.id, submissionId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    console.log(`📦  submission ${submissionId} updated to "${state}"`);

    if (state === 'approved') {
      const { submissionData, groupId, merchantId } = updated;

      const couponPayload = {
        groupId,
        merchantId,
        title:         submissionData.title,
        description:   submissionData.description,
        couponType:    submissionData.coupon_type,
        discountValue: submissionData.discount_value ?? 0,
        validFrom:     new Date(submissionData.valid_from),
        expiresAt:     new Date(submissionData.expires_at),
        qrCodeUrl:     submissionData.qr_code_url || null,
        locked:        submissionData.locked ?? true,
        cuisineType:   submissionData.cuisine_type || null,
      };

      const [newCoupon] = await db
        .insert(coupon)
        .values(couponPayload)
        .returning();

      console.log(
        `📦  created coupon ${newCoupon.id} from submission ${submissionId}`,
      );
      return res.json(newCoupon);
    }

    if (state === 'rejected') {
      return res.json(updated);
    }

    return res.json(updated);
  } catch (err) {
    console.error(`❌ Error in PUT /coupon-submissions/${submissionId}:`, err);
    next(err);
  }
});


export default router;
