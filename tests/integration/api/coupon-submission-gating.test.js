// Coupon submission gating integration tests (route-level)
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 20000;

// Use the in-memory test DB for server routes
vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db };
});

// Simplified auth middleware for tests:
// - no JWT verification
// - requires Bearer token
// - sets req.user.sub to token value
vi.mock('../../../server/src/middleware/auth.js', () => ({
  default: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Token required' });
    req.user = { sub: token };
    return next();
  },
  optional: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) req.user = { sub: token };
    return next();
  },
}));

describe('Coupon Submission Gating (API)', () => {
  let db;
  let app;

  beforeAll(async () => {
    db = await getTestDb();
    const router = (await import('../../../server/src/routes/couponSubmissions.js')).default;

    app = express();
    app.use(express.json());
    app.use('/api/v1/coupon-submissions', router);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await closeTestDb();
  }, HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    await resetTestDb();
  }, HOOK_TIMEOUT_MS);

  it('returns 401 when unauthenticated', async () => {
    const group = await seedHelpers.createFoodieGroup(db);
    const u = await seedHelpers.createUser(db, { role: 'merchant' });
    const m = await seedHelpers.createMerchant(db, u.id);

    const res = await request(app)
      .post('/api/v1/coupon-submissions')
      .send({
        group_id: group.id,
        merchant_id: m.id,
        submission_data: {
          title: 'Test Coupon',
          description: 'Test',
          coupon_type: 'percent',
          discount_value: 10,
          valid_from: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          locked: true,
        },
      });

    expect(res.status).toBe(401);
  });

  it('returns 403 when non-admin submits for a merchant they do not own', async () => {
    const group = await seedHelpers.createFoodieGroup(db);

    const merchantUser = await seedHelpers.createUser(db, {
      role: 'merchant',
      cognitoSub: 'merchant-sub',
      email: 'merchant@example.com',
    });
    const otherUser = await seedHelpers.createUser(db, {
      role: 'merchant',
      cognitoSub: 'other-sub',
      email: 'other@example.com',
    });

    const owned = await seedHelpers.createMerchant(db, merchantUser.id, { name: 'Owned Merchant' });
    const notOwned = await seedHelpers.createMerchant(db, otherUser.id, { name: 'Not Owned Merchant' });

    const res = await request(app)
      .post('/api/v1/coupon-submissions')
      .set('Authorization', 'Bearer merchant-sub')
      .send({
        group_id: group.id,
        merchant_id: notOwned.id,
        submission_data: {
          title: 'Bad Coupon',
          description: 'Should be blocked',
          coupon_type: 'percent',
          discount_value: 10,
          valid_from: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          locked: true,
        },
      });

    expect(res.status).toBe(403);
    expect(res.body?.error).toMatch(/own/i);

    // sanity: owned merchant would be allowed for this user
    expect(owned.ownerId).toBe(merchantUser.id);
  });

  it('returns 201 when merchant submits for their owned merchant', async () => {
    const group = await seedHelpers.createFoodieGroup(db);

    const merchantUser = await seedHelpers.createUser(db, {
      role: 'merchant',
      cognitoSub: 'merchant-sub',
      email: 'merchant2@example.com',
    });
    const owned = await seedHelpers.createMerchant(db, merchantUser.id, { name: 'Owned Merchant' });

    const res = await request(app)
      .post('/api/v1/coupon-submissions')
      .set('Authorization', 'Bearer merchant-sub')
      .send({
        group_id: group.id,
        merchant_id: owned.id,
        submission_data: {
          title: 'Good Coupon',
          description: 'Allowed',
          coupon_type: 'percent',
          discount_value: 15,
          valid_from: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          locked: true,
          cuisine_type: 'Italian',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.groupId).toBe(group.id);
    expect(res.body.merchantId).toBe(owned.id);
    expect(res.body.state).toBe('pending');
  });

  it('returns 201 when super admin submits for any merchant', async () => {
    const group = await seedHelpers.createFoodieGroup(db);

    const adminUser = await seedHelpers.createUser(db, {
      role: 'super_admin',
      cognitoSub: 'admin-sub',
      email: 'admin@example.com',
    });
    const otherUser = await seedHelpers.createUser(db, {
      role: 'merchant',
      cognitoSub: 'other-sub',
      email: 'other2@example.com',
    });

    const notOwned = await seedHelpers.createMerchant(db, otherUser.id, { name: 'Not Owned Merchant' });

    const res = await request(app)
      .post('/api/v1/coupon-submissions')
      .set('Authorization', 'Bearer admin-sub')
      .send({
        group_id: group.id,
        merchant_id: notOwned.id,
        submission_data: {
          title: 'Admin Coupon',
          description: 'Allowed for super admin',
          coupon_type: 'amount',
          discount_value: 5,
          valid_from: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          locked: true,
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.groupId).toBe(group.id);
    expect(res.body.merchantId).toBe(notOwned.id);
    expect(res.body.state).toBe('pending');

    // sanity: admin exists with correct role
    expect(adminUser.role).toBe('super_admin');
  });
});

