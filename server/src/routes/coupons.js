// server/src/routes/coupons.js
import express from 'express';
import { db } from '../db.js';
import { coupon, merchant, foodieGroup, couponRedemption, user } from '../schema.js';
import { eq, and, inArray, sql, isNull, ilike, or, asc, desc } from 'drizzle-orm';
import auth from '../middleware/auth.js'; // auth() verifies Cognito token and sets req.user
import { resolveLocalUser, canManageMerchant, canManageCoupon, hasEntitlement } from '../authz/index.js';

const router = express.Router();

console.log('📦  coupons router loaded');

const DEFAULT_REDEMPTION_LIMIT = 100;
const MAX_REDEMPTION_LIMIT = 500;

function parseIntegerParam(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeSortDirection(value) {
  return String(value || '').toLowerCase() === 'asc' ? 'asc' : 'desc';
}

function buildMerchantRedemptionWhereClause(dbUser, query = {}) {
  const filters = [
    eq(merchant.ownerId, dbUser.id),
    isNull(couponRedemption.deletedAt),
    isNull(coupon.deletedAt),
    isNull(merchant.deletedAt),
    isNull(user.deletedAt),
  ];

  if (query.merchantId) {
    filters.push(eq(merchant.id, query.merchantId));
  }

  if (query.couponId) {
    filters.push(eq(coupon.id, query.couponId));
  }

  if (query.search) {
    const searchTerm = `%${query.search}%`;
    filters.push(
      or(
        ilike(user.email, searchTerm),
        ilike(user.name, searchTerm),
      )
    );
  }

  return and(...filters);
}

function escapeCsvCell(value) {
  if (value == null) {
    return '';
  }

  const stringValue = Array.isArray(value)
    ? value.join('|')
    : String(value);

  return `"${stringValue.replace(/"/g, '""')}"`;
}

function rowsToCsv(headers, rows) {
  const headerRow = headers.map((header) => escapeCsvCell(header.label)).join(',');
  const dataRows = rows.map((row) =>
    headers.map((header) => escapeCsvCell(row[header.key])).join(',')
  );

  return [headerRow, ...dataRows].join('\n');
}

async function getMerchantRedemptionRows(dbUser, query = {}) {
  return db
    .select({
      merchantId: merchant.id,
      merchantName: merchant.name,
      couponId: coupon.id,
      couponTitle: coupon.title,
      redemptionId: couponRedemption.id,
      customerId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      redeemedAt: couponRedemption.redeemedAt,
    })
    .from(couponRedemption)
    .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
    .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
    .innerJoin(user, eq(user.id, couponRedemption.userId))
    .where(buildMerchantRedemptionWhereClause(dbUser, query))
    .orderBy(desc(couponRedemption.redeemedAt), asc(user.email), asc(couponRedemption.id));
}

// GET all coupons
router.get('/', async (req, res) => {
  try {
    const { groupId } = req.query;

    let couponsQuery = db
      .select({
        id:                coupon.id,
        title:             coupon.title,
        description:       coupon.description,
        coupon_type:       coupon.couponType,
        discount_value:    coupon.discountValue,
        valid_from:        coupon.validFrom,
        expires_at:        coupon.expiresAt,
        qr_code_url:       coupon.qrCodeUrl,
        locked:            coupon.locked,
        cuisine_type:      coupon.cuisineType,
        merchant_id:       coupon.merchantId,
        merchant_name:     merchant.name,
        merchant_logo:     merchant.logoUrl,
        foodie_group_id:   coupon.groupId,
        foodie_group_name: foodieGroup.name,
      })
      .from(coupon)
      .leftJoin(merchant, eq(merchant.id, coupon.merchantId))
      .leftJoin(foodieGroup, eq(foodieGroup.id, coupon.groupId));

    if (groupId) {
      couponsQuery = couponsQuery.where(and(eq(coupon.groupId, groupId), isNull(coupon.deletedAt)));
    } else {
      couponsQuery = couponsQuery.where(isNull(coupon.deletedAt));
    }

    const allCoupons = await couponsQuery;
    const couponIds = allCoupons.map((c) => c.id);

    let redemptionCounts = new Map();
    if (couponIds.length) {
      const redemptions = await db
        .select({
          couponId: couponRedemption.couponId,
          redemptions: sql`count(${couponRedemption.id})`.as('redemptions'),
        })
        .from(couponRedemption)
        .where(and(inArray(couponRedemption.couponId, couponIds), isNull(couponRedemption.deletedAt)))
        .groupBy(couponRedemption.couponId);

      redemptionCounts = new Map(
        redemptions.map((row) => [row.couponId, Number(row.redemptions || 0)])
      );
    }

    const response = allCoupons.map((couponRow) => ({
      ...couponRow,
      redemptions: redemptionCounts.get(couponRow.id) || 0,
    }));

    res.json(response);
  } catch (err) {
    console.error('📦 error in GET /api/v1/coupons', err);

    const isPgError = err && typeof err === 'object' && ('code' in err || 'detail' in err);
    if (isPgError) {
      return res.status(500).json({
        error: 'DB_ERROR',
        code: err.code ?? null,
        message: err.message ?? String(err),
        detail: err.detail ?? null,
        table: err.table ?? null,
        schema: err.schema ?? null,
      });
    }

    return res.status(500).json({ error: err?.message || 'Server error' });
  }
});

// GET a single coupon by ID
router.get('/:id', async (req, res, next) => {
  console.log('📦  GET /api/v1/coupons/' + req.params.id);
  try {
    const [found] = await db
      .select()
      .from(coupon)
      .where(and(eq(coupon.id, req.params.id), isNull(coupon.deletedAt)));

    if (!found) {
      console.log('📦  coupon not found');
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.json(found);
  } catch (err) {
    console.error('📦  error in GET /api/v1/coupons/:id', err);
    next(err);
  }
});

// POST /api/v1/coupons
router.post('/', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  POST /api/v1/coupons', req.body);
  try {
    const {
      title,
      description,
      coupon_type,
      discount_value,
      valid_from,
      expires_at,
      merchant_id,
      group_id,
    } = req.body;

    if (!merchant_id) {
      return res.status(400).json({ error: 'merchant_id is required' });
    }

    // 🔐 Authz: super admin OR merchant owner
    const allowed = await canManageMerchant(req.dbUser, merchant_id);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this merchant' });
    }

    const [newCoupon] = await db
      .insert(coupon)
      .values({
        title,
        description,
        couponType:    coupon_type,
        discountValue: discount_value,
        validFrom:     valid_from ? new Date(valid_from) : null,
        expiresAt:     expires_at ? new Date(expires_at) : null,
        merchantId:    merchant_id,
        groupId:       group_id,
      })
      .returning();

    res.status(201).json(newCoupon);
  } catch (err) {
    console.error('📦  error in POST /api/v1/coupons', err);
    next(err);
  }
});

// POST /api/v1/coupons/:id/redeem  (ONE canonical route)
router.post('/:id/redeem', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const couponId = req.params.id;
    console.log('🎟️  Redeem attempt start', {
      couponId,
      authed: !!req.user,
      sub: req.user?.sub,
      email: req.user?.email,
    });

    // 1) Ensure coupon exists
    const [c] = await db.select().from(coupon).where(eq(coupon.id, couponId));
    if (!c) {
      console.log('🎟️  Coupon not found');
      return res.status(404).json({ error: 'Coupon not found' });
    }

    // 2) validity window check
    const now = new Date();
    if (c.validFrom && new Date(c.validFrom) > now) {
      console.warn('⛔ Coupon not yet valid', { couponId, validFrom: c.validFrom, now });
      return res.status(400).json({ error: 'Coupon is not yet valid' });
    }
    if (c.expiresAt && new Date(c.expiresAt) < now) {
      console.warn('⛔ Coupon expired', { couponId, expiresAt: c.expiresAt, now });
      return res.status(400).json({ error: 'Coupon is expired' });
    }

    // 3) Map Cognito subject -> local user row via *cognitoSub*
    const u = req.dbUser;

    // 3.5) Entitlement check for locked coupons
    if (c.locked) {
      const allowed = await hasEntitlement(u, c.groupId);
      if (!allowed) {
        console.warn('⛔ User not entitled to locked coupon', { userId: u.id, groupId: c.groupId });
        return res.status(403).json({ 
          error: 'LOCKED', 
          message: 'This coupon is part of a premium book. Please purchase access to redeem.' 
        });
      }
    }

    // 4) One-per-user check
    const [existing] = await db
      .select()
      .from(couponRedemption)
      .where(
        and(
          eq(couponRedemption.couponId, c.id),
          eq(couponRedemption.userId, u.id),
        ),
      );

    if (existing) {
      console.log('♻️  Already redeemed; returning 200', {
        couponId: c.id,
        userId:   u.id,
      });
      return res.status(200).json({
        ok:              true,
        alreadyRedeemed: true,
        redeemed_at:
          existing.redeemedAt?.toISOString?.() || existing.redeemedAt || null,
      });
    }

    // 5) Insert redemption
    const nowIso = new Date();
    const [created] = await db
      .insert(couponRedemption)
      .values({
        couponId:  c.id,
        userId:    u.id,
        redeemedAt: nowIso,
      })
      .returning();

    console.log('✅ Redemption recorded', {
      redemptionId: created.id,
      couponId:     c.id,
      userId:       u.id,
    });

    return res.status(201).json({
      ok:            true,
      redemptionId:  created.id,
      redeemed_at:   nowIso.toISOString(),
    });
  } catch (err) {
    console.error('🎟️  error in POST /api/v1/coupons/:id/redeem', err);
    next(err);
  }
});

// GET /api/v1/coupons/redemptions/merchant-insights
// Summary of redemptions for all coupons at restaurants owned by the authed user
router.get('/redemptions/merchant-insights', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const u = req.dbUser;

    // Aggregate redemptions per coupon for merchants this user owns
    const rows = await db
      .select({
        merchantId:     merchant.id,
        merchantName:   merchant.name,
        couponId:       coupon.id,
        couponTitle:    coupon.title,
        redemptions:    sql`count(${couponRedemption.id})`.as('redemptions'),
        lastRedeemedAt: sql`max(${couponRedemption.redeemedAt})`.as('last_redeemed_at'),
      })
      .from(couponRedemption)
      .innerJoin(coupon,   eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .where(eq(merchant.ownerId, u.id))
      .groupBy(merchant.id, merchant.name, coupon.id, coupon.title);

    res.json(rows);
  } catch (err) {
    console.error('🎟️  error in GET /api/v1/coupons/redemptions/merchant-insights', err);
    next(err);
  }
});

// GET /api/v1/coupons/redemptions/merchant-details
router.get('/redemptions/merchant-details', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const u = req.dbUser;
    const {
      merchantId,
      couponId,
      search,
      sortBy = 'redeemedAt',
      sortDir = 'desc',
    } = req.query;

    const limit = Math.min(
      parseIntegerParam(req.query.limit, DEFAULT_REDEMPTION_LIMIT),
      MAX_REDEMPTION_LIMIT,
    );
    const offset = parseIntegerParam(req.query.offset, 0);
    const normalizedSortDir = normalizeSortDirection(sortDir);

    const sortColumns = {
      redeemedAt: couponRedemption.redeemedAt,
      customerName: user.name,
      customerEmail: user.email,
      merchantName: merchant.name,
      couponTitle: coupon.title,
    };

    const primarySortColumn = sortColumns[sortBy] || couponRedemption.redeemedAt;
    const primarySort = normalizedSortDir === 'asc' ? asc(primarySortColumn) : desc(primarySortColumn);

    const rows = await db
      .select({
        merchantId: merchant.id,
        merchantName: merchant.name,
        couponId: coupon.id,
        couponTitle: coupon.title,
        redemptionId: couponRedemption.id,
        customerId: user.id,
        customerName: user.name,
        customerEmail: user.email,
        redeemedAt: couponRedemption.redeemedAt,
      })
      .from(couponRedemption)
      .innerJoin(coupon, eq(coupon.id, couponRedemption.couponId))
      .innerJoin(merchant, eq(merchant.id, coupon.merchantId))
      .innerJoin(user, eq(user.id, couponRedemption.userId))
      .where(buildMerchantRedemptionWhereClause(u, { merchantId, couponId, search }))
      .orderBy(primarySort, desc(couponRedemption.redeemedAt), asc(couponRedemption.id))
      .limit(limit)
      .offset(offset);

    res.json(rows);
  } catch (err) {
    console.error('🎟️  error in GET /api/v1/coupons/redemptions/merchant-details', err);
    next(err);
  }
});

// GET /api/v1/coupons/redemptions/merchant-export
router.get('/redemptions/merchant-export', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const u = req.dbUser;
    const {
      merchantId,
      couponId,
      search,
      mode = 'redemptions',
    } = req.query;

    if (!['redemptions', 'unique-customers'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    const rows = await getMerchantRedemptionRows(u, { merchantId, couponId, search });

    let csv;
    let filename;

    if (mode === 'unique-customers') {
      const byEmail = new Map();

      for (const row of rows) {
        const normalizedEmail = String(row.customerEmail || '').trim().toLowerCase();
        const key = normalizedEmail || row.customerId;

        if (!byEmail.has(key)) {
          byEmail.set(key, {
            customerId: row.customerId,
            customerName: row.customerName,
            customerEmail: row.customerEmail,
            redemptionCount: 0,
            firstRedeemedAt: row.redeemedAt,
            lastRedeemedAt: row.redeemedAt,
            merchantIds: new Set(),
            couponIds: new Set(),
          });
        }

        const aggregate = byEmail.get(key);
        aggregate.redemptionCount += 1;
        if (row.redeemedAt < aggregate.firstRedeemedAt) {
          aggregate.firstRedeemedAt = row.redeemedAt;
        }
        if (row.redeemedAt > aggregate.lastRedeemedAt) {
          aggregate.lastRedeemedAt = row.redeemedAt;
        }
        aggregate.merchantIds.add(row.merchantId);
        aggregate.couponIds.add(row.couponId);
      }

      const uniqueRows = Array.from(byEmail.values())
        .map((row) => ({
          customerId: row.customerId,
          customerName: row.customerName,
          customerEmail: row.customerEmail,
          redemptionCount: row.redemptionCount,
          firstRedeemedAt: row.firstRedeemedAt,
          lastRedeemedAt: row.lastRedeemedAt,
          merchantIds: Array.from(row.merchantIds),
          couponIds: Array.from(row.couponIds),
        }))
        .sort((a, b) => String(b.lastRedeemedAt).localeCompare(String(a.lastRedeemedAt)));

      csv = rowsToCsv(
        [
          { key: 'customerId', label: 'customerId' },
          { key: 'customerName', label: 'customerName' },
          { key: 'customerEmail', label: 'customerEmail' },
          { key: 'redemptionCount', label: 'redemptionCount' },
          { key: 'firstRedeemedAt', label: 'firstRedeemedAt' },
          { key: 'lastRedeemedAt', label: 'lastRedeemedAt' },
          { key: 'merchantIds', label: 'merchantIds' },
          { key: 'couponIds', label: 'couponIds' },
        ],
        uniqueRows,
      );
      filename = 'unique-customers.csv';
    } else {
      csv = rowsToCsv(
        [
          { key: 'merchantId', label: 'merchantId' },
          { key: 'merchantName', label: 'merchantName' },
          { key: 'couponId', label: 'couponId' },
          { key: 'couponTitle', label: 'couponTitle' },
          { key: 'redemptionId', label: 'redemptionId' },
          { key: 'customerId', label: 'customerId' },
          { key: 'customerName', label: 'customerName' },
          { key: 'customerEmail', label: 'customerEmail' },
          { key: 'redeemedAt', label: 'redeemedAt' },
        ],
        rows,
      );
      filename = 'redemptions.csv';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('🎟️  error in GET /api/v1/coupons/redemptions/merchant-export', err);
    next(err);
  }
});

// GET /api/v1/coupons/redemptions/me
router.get('/redemptions/me', auth(), resolveLocalUser, async (req, res, next) => {
  try {
    const u = req.dbUser;

    const rows = await db
      .select({
        couponId:   couponRedemption.couponId,
        redeemedAt: couponRedemption.redeemedAt,
      })
      .from(couponRedemption)
      .where(eq(couponRedemption.userId, u.id));

    res.json(rows);
  } catch (err) {
    console.error('🎟️  error in GET /api/v1/coupons/redemptions/me', err);
    next(err);
  }
});

// PATCH /api/v1/coupons/:id - Update a coupon
router.patch('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  PATCH /api/v1/coupons/' + req.params.id, req.body);
  try {
    const couponId = req.params.id;

    // 🔐 Authz: super admin OR merchant owner
    const allowed = await canManageCoupon(req.dbUser, couponId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this coupon' });
    }

    const updates = {};

    // Only allow specific fields to be updated
    const allowedFields = ['cuisine_type', 'title', 'description', 'locked'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        // Map snake_case to camelCase for Drizzle
        const camelField = field === 'cuisine_type' ? 'cuisineType' : field;
        updates[camelField] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const [updated] = await db
      .update(coupon)
      .set(updates)
      .where(eq(coupon.id, couponId))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    console.log('📦  updated coupon', updated.id);
    res.json(updated);
  } catch (err) {
    console.error('📦  error in PATCH /api/v1/coupons/:id', err);
    next(err);
  }
});

// DELETE /api/v1/coupons/:id
router.delete('/:id', auth(), resolveLocalUser, async (req, res, next) => {
  console.log('📦  DELETE /api/v1/coupons/' + req.params.id);
  try {
    const couponId = req.params.id;

    // 🔐 Authz: super admin OR merchant owner
    const allowed = await canManageCoupon(req.dbUser, couponId);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: You do not own this coupon' });
    }

    const result = await db
      .delete(coupon)
      .where(eq(coupon.id, couponId));

    if (!result.rowCount) {
      console.log('📦  coupon not found for delete');
      return res.status(404).json({ message: 'Coupon not found' });
    }

    console.log('📦  deleted coupon count:', result.rowCount);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    console.error('📦  error in DELETE /api/v1/coupons/:id', err);
    next(err);
  }
});

export default router;
