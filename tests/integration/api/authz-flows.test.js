import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = 30000;

// Use the in-memory test DB for server routes
vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db, pool: { query: vi.fn() } }; // pool is used in app.js
});

// Simplified auth middleware for tests:
vi.mock('../../../server/src/middleware/auth.js', () => ({
  default: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Token required' });
    req.user = { sub: token, email: `${token}@example.com` };
    return next();
  },
  optional: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) req.user = { sub: token, email: `${token}@example.com` };
    return next();
  },
}));

// Mock Stripe config for tests that import server app
vi.mock('../../../server/src/config/stripe.js', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_mock_session_id',
          url: 'https://checkout.stripe.com/test',
          payment_intent: 'pi_test_123',
          customer: 'cus_test_123',
        }),
      },
    },
    webhooks: {
      constructEvent: vi.fn().mockImplementation((body) => {
        const parsed = JSON.parse(body);
        return parsed;
      }),
    },
    products: {
      create: vi.fn().mockResolvedValue({
        id: 'prod_test_123',
      }),
    },
    prices: {
      create: vi.fn().mockResolvedValue({
        id: 'price_test_123',
      }),
    },
  },
}));

describe('Authorization Flows (API)', () => {
  let db;
  let app;

  beforeAll(async () => {
    db = await getTestDb();
    const { default: serverApp } = await import('../../../server/src/app.js');
    app = serverApp;
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await closeTestDb();
  }, HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    await resetTestDb();
  }, HOOK_TIMEOUT_MS);

  describe('POST /api/v1/coupons/:id/redeem', () => {
    it('returns 403 when user is not entitled to a locked coupon', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub' });
      const merchant = await seedHelpers.createMerchant(db, user.id);
      const coupon = await seedHelpers.createCoupon(db, group.id, merchant.id, { locked: true });

      const res = await request(app)
        .post(`/api/v1/coupons/${coupon.id}/redeem`)
        .set('Authorization', 'Bearer user-sub');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('LOCKED');
    }, TEST_TIMEOUT_MS);

    it('returns 201 when user is entitled (has paid purchase)', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub' });
      const merchant = await seedHelpers.createMerchant(db, user.id);
      const coupon = await seedHelpers.createCoupon(db, group.id, merchant.id, { locked: true });

      // Create a paid purchase
      await seedHelpers.createPurchase(db, user.id, group.id, { status: 'paid' });

      const res = await request(app)
        .post(`/api/v1/coupons/${coupon.id}/redeem`)
        .set('Authorization', 'Bearer user-sub');

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    }, TEST_TIMEOUT_MS);

    it('returns 201 when user is entitled (is group admin)', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub' });
      const merchant = await seedHelpers.createMerchant(db, user.id);
      const coupon = await seedHelpers.createCoupon(db, group.id, merchant.id, { locked: true });

      // Create a group membership with role 'foodie_group_admin'
      await seedHelpers.createMembership(db, user.id, group.id, { role: 'foodie_group_admin' });

      const res = await request(app)
        .post(`/api/v1/coupons/${coupon.id}/redeem`)
        .set('Authorization', 'Bearer user-sub');

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    }, TEST_TIMEOUT_MS);

    it('returns 201 for non-locked coupons without purchase', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub' });
      const merchant = await seedHelpers.createMerchant(db, user.id);
      const coupon = await seedHelpers.createCoupon(db, group.id, merchant.id, { locked: false });

      const res = await request(app)
        .post(`/api/v1/coupons/${coupon.id}/redeem`)
        .set('Authorization', 'Bearer user-sub');

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    }, TEST_TIMEOUT_MS);
  });

  describe('GET /api/v1/coupons/redemptions/merchant-insights', () => {
    it('only returns insights for merchants owned by the user', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user1 = await seedHelpers.createUser(db, { cognitoSub: 'user1-sub' });
      const user2 = await seedHelpers.createUser(db, { cognitoSub: 'user2-sub' });

      const merchant1 = await seedHelpers.createMerchant(db, user1.id, { name: 'Merchant 1' });
      const merchant2 = await seedHelpers.createMerchant(db, user2.id, { name: 'Merchant 2' });

      const coupon1 = await seedHelpers.createCoupon(db, group.id, merchant1.id, { title: 'Coupon 1' });
      const coupon2 = await seedHelpers.createCoupon(db, group.id, merchant2.id, { title: 'Coupon 2' });

      // Create some redemptions
      await seedHelpers.createCouponRedemption(db, coupon1.id, user2.id); // user2 redeems coupon1
      await seedHelpers.createCouponRedemption(db, coupon2.id, user1.id); // user1 redeems coupon2

      // Check user1 insights
      const res1 = await request(app)
        .get('/api/v1/coupons/redemptions/merchant-insights')
        .set('Authorization', 'Bearer user1-sub');

      expect(res1.status).toBe(200);
      expect(res1.body).toHaveLength(1);
      expect(res1.body[0].merchantId).toBe(merchant1.id);
      expect(res1.body[0].couponId).toBe(coupon1.id);

      // Check user2 insights
      const res2 = await request(app)
        .get('/api/v1/coupons/redemptions/merchant-insights')
        .set('Authorization', 'Bearer user2-sub');

      expect(res2.status).toBe(200);
      expect(res2.body).toHaveLength(1);
      expect(res2.body[0].merchantId).toBe(merchant2.id);
      expect(res2.body[0].couponId).toBe(coupon2.id);
    }, TEST_TIMEOUT_MS);
  });

  describe('POST /api/v1/coupons', () => {
    it('returns 403 when creating coupon for a merchant you do not own', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user1 = await seedHelpers.createUser(db, { cognitoSub: 'user1-sub' });
      const user2 = await seedHelpers.createUser(db, { cognitoSub: 'user2-sub' });
      const merchant2 = await seedHelpers.createMerchant(db, user2.id);

      const res = await request(app)
        .post('/api/v1/coupons')
        .set('Authorization', 'Bearer user1-sub')
        .send({
          title: 'New Coupon',
          coupon_type: 'percent',
          discount_value: 10,
          merchant_id: merchant2.id,
          group_id: group.id,
        });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 201 when creating coupon for owned merchant', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user1 = await seedHelpers.createUser(db, { cognitoSub: 'user1-sub' });
      const merchant1 = await seedHelpers.createMerchant(db, user1.id);

      const res = await request(app)
        .post('/api/v1/coupons')
        .set('Authorization', 'Bearer user1-sub')
        .send({
          title: 'New Coupon',
          coupon_type: 'percent',
          discount_value: 10,
          merchant_id: merchant1.id,
          group_id: group.id,
          valid_from: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        });

      expect(res.status).toBe(201);
    }, TEST_TIMEOUT_MS);
  });
});
