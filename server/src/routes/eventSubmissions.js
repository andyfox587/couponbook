// server/src/routes/eventSubmissions.js
import express from 'express';
import { db } from '../db.js';
import {
  eventSubmission,
  event,
  merchant,
  user,
  foodieGroupMembership,
} from '../schema.js';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import auth from '../middleware/auth.js';
import { resolveLocalUser, canManageMerchant, canManageGroup } from '../authz/index.js';
import { upload, handleMulterError, ALLOWED_MIME_TYPES, getExtensionFromMime, uploadFileToS3 } from '../lib/uploadHelper.js';

// Event image S3 config (falls back to merchant logo bucket if not set separately)
const REGION = (process.env.AWS_REGION || 'us-east-1').trim();
const EVENT_IMAGE_BUCKET = process.env.AWS_S3_EVENT_IMAGE_BUCKET || process.env.AWS_S3_MERCHANT_LOGO_BUCKET;
const EVENT_IMAGE_BASE_URL =
  process.env.AWS_S3_EVENT_IMAGE_BASE_URL ||
  (EVENT_IMAGE_BUCKET ? `https://${EVENT_IMAGE_BUCKET}.s3.${REGION}.amazonaws.com` : null);

const router = express.Router();
console.log('📅  eventSubmissions router loaded');

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────
// Validation & normalization
// ────────────────────────────────────────────────────────────────
function validateSubmissionData(data) {
  const errors = [];
  const required = ['name', 'description', 'start_datetime'];
  for (const field of required) {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      errors.push(`${field} is required`);
    }
  }
  if (data.start_datetime && isNaN(new Date(data.start_datetime).getTime())) {
    errors.push('start_datetime must be a valid date');
  }
  if (data.end_datetime && isNaN(new Date(data.end_datetime).getTime())) {
    errors.push('end_datetime must be a valid date');
  }
  if (data.capacity !== undefined && data.capacity !== null && data.capacity !== '') {
    if (isNaN(Number(data.capacity)) || Number(data.capacity) < 0) {
      errors.push('capacity must be a non-negative number');
    }
  }
  return errors;
}

function normalizeSubmissionData(data) {
  const n = { ...data };
  n.is_free = n.is_free !== undefined ? Boolean(n.is_free) : true;
  n.visibility = n.visibility || 'public';
  n.max_tickets_per_guest = Number(n.max_tickets_per_guest) || 1;
  n.capacity = n.capacity !== undefined && n.capacity !== null ? Number(n.capacity) : 0;
  if (n.price_cents !== undefined && n.price_cents !== null) {
    n.price_cents = Math.round(Number(n.price_cents));
  }
  if (n.members_only_price_cents !== undefined && n.members_only_price_cents !== null) {
    n.members_only_price_cents = Math.round(Number(n.members_only_price_cents));
  }
  return n;
}

// ────────────────────────────────────────────────────────────────
// GET /  — group admin: pending submissions for their group
// ────────────────────────────────────────────────────────────────
router.get('/', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📅  GET /api/v1/event-submissions', req.query);
  try {
    let { groupId } = req.query;
    const dbUser = req.dbUser;

    if (!groupId) {
      if (dbUser.role === 'super_admin') {
        return res.status(400).json({ error: 'groupId is required for super admin users' });
      }
      const memberships = await db
        .select()
        .from(foodieGroupMembership)
        .where(eq(foodieGroupMembership.userId, dbUser.id));
      if (!memberships.length) {
        return res.status(403).json({ error: 'No foodie group membership found for this user' });
      }
      groupId = memberships[0].groupId;
    }

    const allowed = await canManageGroup(dbUser, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You are not an admin for this group' });
    }

    const subs = await db
      .select({
        id:             eventSubmission.id,
        groupId:        eventSubmission.groupId,
        merchantId:     eventSubmission.merchantId,
        merchantName:   merchant.name,
        // Owning user's account email — merchants carry no email of their own.
        merchantEmail:  user.email,
        state:          eventSubmission.state,
        submittedAt:    eventSubmission.submittedAt,
        updatedAt:      eventSubmission.updatedAt,
        reviewedAt:     eventSubmission.reviewedAt,
        submissionData: eventSubmission.submissionData,
        deletedAt:      eventSubmission.deletedAt,
      })
      .from(eventSubmission)
      .leftJoin(merchant, eq(merchant.id, eventSubmission.merchantId))
      .leftJoin(user, eq(user.id, merchant.ownerId))
      .where(
        and(
          eq(eventSubmission.state, 'pending'),
          eq(eventSubmission.groupId, groupId),
        ),
      );

    res.json(subs);
  } catch (err) {
    console.error('📅  error in GET /event-submissions', err);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// GET /by-merchant — merchant sees their own submissions
// ────────────────────────────────────────────────────────────────
router.get('/by-merchant', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📅  GET /api/v1/event-submissions/by-merchant');
  try {
    const dbUser = req.dbUser;
    const ownedMerchants = await db
      .select({ id: merchant.id, name: merchant.name })
      .from(merchant)
      .where(eq(merchant.ownerId, dbUser.id));

    if (!ownedMerchants.length) return res.json([]);

    const merchantIds = ownedMerchants.map((m) => m.id);
    const { state } = req.query;

    const baseWhere = [
      inArray(eventSubmission.merchantId, merchantIds),
      isNull(eventSubmission.deletedAt),
    ];
    const whereExpr = state
      ? and(...baseWhere, eq(eventSubmission.state, state))
      : and(...baseWhere);

    const rows = await db
      .select({
        id:               eventSubmission.id,
        merchantId:       eventSubmission.merchantId,
        groupId:          eventSubmission.groupId,
        state:            eventSubmission.state,
        submittedAt:      eventSubmission.submittedAt,
        updatedAt:        eventSubmission.updatedAt,
        reviewedAt:       eventSubmission.reviewedAt,
        submissionData:   eventSubmission.submissionData,
        rejectionMessage: eventSubmission.rejectionMessage,
        deletedAt:        eventSubmission.deletedAt,
        merchantName:     merchant.name,
      })
      .from(eventSubmission)
      .leftJoin(merchant, eq(eventSubmission.merchantId, merchant.id))
      .where(whereExpr)
      .orderBy(eventSubmission.submittedAt);

    return res.json(rows);
  } catch (err) {
    console.error('📅  error in GET /event-submissions/by-merchant', err);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// GET /by-group/:groupId
// ────────────────────────────────────────────────────────────────
router.get('/by-group/:groupId', auth(), resolveLocalUser, async (req, res, next) => {
  const { groupId } = req.params;
  try {
    const allowed = await canManageGroup(req.dbUser, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You are not an admin for this group' });
    }

    const rows = await db
      .select({
        id:               eventSubmission.id,
        merchantId:       eventSubmission.merchantId,
        groupId:          eventSubmission.groupId,
        state:            eventSubmission.state,
        submittedAt:      eventSubmission.submittedAt,
        updatedAt:        eventSubmission.updatedAt,
        reviewedAt:       eventSubmission.reviewedAt,
        submissionData:   eventSubmission.submissionData,
        rejectionMessage: eventSubmission.rejectionMessage,
        deletedAt:        eventSubmission.deletedAt,
        merchantName:     merchant.name,
      })
      .from(eventSubmission)
      .leftJoin(merchant, eq(eventSubmission.merchantId, merchant.id))
      .where(and(eq(eventSubmission.groupId, groupId), isNull(eventSubmission.deletedAt)))
      .orderBy(eventSubmission.submittedAt);

    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// POST /upload-cover — upload cover image, return URL (no DB write)
// POST /upload-banner — upload banner image, return URL (no DB write)
// Must be declared before GET /:id to avoid Express treating the
// path segment as an :id parameter match.
// ────────────────────────────────────────────────────────────────
async function handleEventImageUpload(req, res, field) {
  const { merchant_id } = req.body;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id is required' });
    }

    const allowed = await canManageMerchant(req.dbUser, merchant_id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this merchant' });
    }

    const { mimetype, buffer } = req.file;
    if (!ALLOWED_MIME_TYPES.includes(mimetype)) {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    const ext = getExtensionFromMime(mimetype);
    const randomSuffix = Math.random().toString(36).slice(2);
    const key = `events/submissions/${merchant_id}/${field}/${randomSuffix}.${ext}`;

    if (!EVENT_IMAGE_BUCKET || !EVENT_IMAGE_BASE_URL) {
      console.warn('📅  Event image bucket not configured – using dev fake URL');
      const fakeUrl = `/dev-event-image/${merchant_id}-${field}.${ext}`;
      return res.json({ [`${field}_image_url`]: fakeUrl });
    }

    const url = await uploadFileToS3({ bucket: EVENT_IMAGE_BUCKET, baseUrl: EVENT_IMAGE_BASE_URL, key, buffer, mimetype });
    return res.json({ [`${field}_image_url`]: url });
  } catch (err) {
    console.error(`📅  error in POST /event-submissions/upload-${field}`, err);
    return res.status(500).json({ error: err.message });
  }
}

router.post(
  '/upload-cover',
  auth(), resolveLocalUser,
  upload.single('file'), handleMulterError,
  (req, res) => handleEventImageUpload(req, res, 'cover'),
);

router.post(
  '/upload-banner',
  auth(), resolveLocalUser,
  upload.single('file'), handleMulterError,
  (req, res) => handleEventImageUpload(req, res, 'banner'),
);

// ────────────────────────────────────────────────────────────────
// GET /:id
// ────────────────────────────────────────────────────────────────
router.get('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const [sub] = await db
      .select()
      .from(eventSubmission)
      .where(eq(eventSubmission.id, req.params.id));
    if (!sub) return res.status(404).json({ message: 'Submission not found' });

    const dbUser = req.dbUser;
    if (dbUser.role === 'super_admin') return res.json(sub);
    const isOwner = await canManageMerchant(dbUser, sub.merchantId);
    if (isOwner) return res.json(sub);
    const isGAdmin = await canManageGroup(dbUser, sub.groupId);
    if (isGAdmin) return res.json(sub);

    res.status(403).json({ error: 'Forbidden' });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// POST / — create new event submission
// ────────────────────────────────────────────────────────────────
router.post('/', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📅  POST /api/v1/event-submissions', req.body);
  try {
    const { group_id, merchant_id, submission_data } = req.body;
    const dbUser = req.dbUser;

    if (!group_id) return res.status(400).json({ error: 'group_id is required' });
    if (!merchant_id) return res.status(400).json({ error: 'merchant_id is required' });
    if (!submission_data) return res.status(400).json({ error: 'submission_data is required' });

    const validationErrors = validateSubmissionData(submission_data);
    if (validationErrors.length) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    const allowed = await canManageMerchant(dbUser, merchant_id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this merchant' });
    }

    const normalizedData = normalizeSubmissionData(submission_data);

    const [newSub] = await db
      .insert(eventSubmission)
      .values({
        groupId:        group_id,
        merchantId:     merchant_id,
        state:          'pending',
        submissionData: normalizedData,
      })
      .returning();

    res.status(201).json(newSub);
  } catch (err) {
    console.error('📅  error in POST /event-submissions', err);
    return res.status(500).json({ error: err.message, detail: err.cause?.message });
  }
});

// ────────────────────────────────────────────────────────────────
// PATCH /:id — merchant edits their pending submission
// ────────────────────────────────────────────────────────────────
router.patch('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  const submissionId = req.params.id;
  const { submission_data } = req.body;
  const dbUser = req.dbUser;

  try {
    if (!submission_data) {
      return res.status(400).json({ error: 'submission_data is required' });
    }

    const validationErrors = validateSubmissionData(submission_data);
    if (validationErrors.length) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    const [existing] = await db
      .select()
      .from(eventSubmission)
      .where(eq(eventSubmission.id, submissionId));
    if (!existing) return res.status(404).json({ message: 'Submission not found' });

    if (existing.state !== 'pending') {
      return res.status(403).json({
        error: `Cannot edit a submission that has been ${existing.state}`,
      });
    }

    const allowed = await canManageMerchant(dbUser, existing.merchantId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this merchant' });
    }

    const normalizedData = normalizeSubmissionData(submission_data);

    const [updated] = await db
      .update(eventSubmission)
      .set({ submissionData: normalizedData, updatedAt: new Date().toISOString() })
      .where(eq(eventSubmission.id, submissionId))
      .returning();

    return res.json({
      id:               updated.id,
      merchantId:       updated.merchantId,
      groupId:          updated.groupId,
      state:            updated.state,
      submittedAt:      updated.submittedAt,
      updatedAt:        updated.updatedAt,
      submissionData:   updated.submissionData,
      rejectionMessage: updated.rejectionMessage,
    });
  } catch (err) {
    console.error(`❌ Error in PATCH /event-submissions/${submissionId}:`, err);
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// PUT /:id — group admin approves/rejects; approval creates live event
// ────────────────────────────────────────────────────────────────
router.put('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  const submissionId = req.params.id;
  const { state, rejection_message, message } = req.body;
  const rejMsg = rejection_message || message;
  const dbUser = req.dbUser;

  try {
    const [existing] = await db
      .select()
      .from(eventSubmission)
      .where(eq(eventSubmission.id, submissionId));
    if (!existing) return res.status(404).json({ message: 'Submission not found' });

    const groupId = existing.groupId;
    if (!groupId) return res.status(400).json({ error: 'Submission has no groupId' });

    const allowed = await canManageGroup(dbUser, groupId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You are not an admin for this group' });
    }

    if (existing.state !== 'pending') {
      return res.status(409).json({ error: `Submission is already ${existing.state}` });
    }

    const updateData = { state, reviewedAt: new Date().toISOString() };
    if (state === 'rejected' && rejMsg) {
      updateData.rejectionMessage = rejMsg;
    }

    const [updated] = await db
      .update(eventSubmission)
      .set(updateData)
      .where(eq(eventSubmission.id, submissionId))
      .returning();
    if (!updated) return res.status(404).json({ message: 'Submission not found' });

    if (state === 'approved') {
      const { submissionData, groupId: gId, merchantId } = updated;
      const baseName = submissionData.name || 'event';
      const slug = `${slugify(baseName)}-${Date.now().toString(36)}`;
      const memberAccessToken = generateToken();

      const eventPayload = {
        groupId:              gId,
        merchantId,
        name:                 submissionData.name,
        description:          submissionData.description || null,
        startDatetime:        new Date(submissionData.start_datetime),
        endDatetime:          submissionData.end_datetime ? new Date(submissionData.end_datetime) : null,
        location:             submissionData.location || null,
        capacity:             Number(submissionData.capacity) || 0,
        coverImageUrl:        submissionData.cover_image_url || null,
        bannerImageUrl:       submissionData.banner_image_url || null,
        isFree:               submissionData.is_free !== false,
        priceCents:           submissionData.price_cents ? Math.round(Number(submissionData.price_cents)) : null,
        membersOnlyPriceCents: submissionData.members_only_price_cents
          ? Math.round(Number(submissionData.members_only_price_cents))
          : null,
        visibility:           submissionData.visibility || 'public',
        maxTicketsPerGuest:   Number(submissionData.max_tickets_per_guest) || 1,
        inviteOnly:           Boolean(submissionData.invite_only),
        slug,
        memberAccessToken,
        status:               'published',
      };

      const [newEvent] = await db.insert(event).values(eventPayload).returning();
      console.log(`📅  created event ${newEvent.id} from submission ${submissionId}`);
      return res.json({ submission: updated, event: newEvent });
    }

    return res.json(updated);
  } catch (err) {
    console.error(`❌ Error in PUT /event-submissions/${submissionId}:`, err);
    next(err);
  }
});

export default router;
