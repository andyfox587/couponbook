import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 60000;
const TEST_TIMEOUT_MS = 30000;

// Use the in-memory test DB for server routes
vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db, pool: { query: vi.fn() } };
});

// Simplified auth middleware for tests
vi.mock('../../../server/src/middleware/auth.js', () => ({
  default: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Token required' });
    req.user = { sub: token, email: `${token}@example.com` };
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

describe('Coupons List (API)', () => {
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

  it('filters coupons by groupId when provided', async () => {
    const owner = await seedHelpers.createUser(db);
    const groupA = await seedHelpers.createFoodieGroup(db);
    const groupB = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);

    await seedHelpers.createCoupon(db, groupA.id, merchant.id, { title: 'Coupon A' });
    await seedHelpers.createCoupon(db, groupB.id, merchant.id, { title: 'Coupon B' });

    const res = await request(app).get(`/api/v1/coupons?groupId=${groupA.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].foodie_group_id).toBe(groupA.id);
  }, TEST_TIMEOUT_MS);

  it('returns redemption counts for coupons', async () => {
    const owner = await seedHelpers.createUser(db);
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);
    const coupon = await seedHelpers.createCoupon(db, group.id, merchant.id);

    const user1 = await seedHelpers.createUser(db);
    const user2 = await seedHelpers.createUser(db);
    const user3 = await seedHelpers.createUser(db);

    await seedHelpers.createCouponRedemption(db, coupon.id, user1.id);
    await seedHelpers.createCouponRedemption(db, coupon.id, user2.id);
    await seedHelpers.createCouponRedemption(db, coupon.id, user3.id);

    const res = await request(app).get(`/api/v1/coupons?groupId=${group.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].redemptions).toBe(3);
  }, TEST_TIMEOUT_MS);

  it('returns zero redemptions when none exist', async () => {
    const owner = await seedHelpers.createUser(db);
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);
    await seedHelpers.createCoupon(db, group.id, merchant.id);

    const res = await request(app).get(`/api/v1/coupons?groupId=${group.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].redemptions).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('treats expired coupons as inactive by excluding them from the default list', async () => {
    const owner = await seedHelpers.createUser(db);
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);

    await seedHelpers.createCoupon(db, group.id, merchant.id, {
      title: 'Still Active',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await seedHelpers.createCoupon(db, group.id, merchant.id, {
      title: 'Already Expired',
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });

    const res = await request(app).get(`/api/v1/coupons?groupId=${group.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Still Active');
    expect(res.body[0].is_active).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('can include expired coupons when explicitly requested', async () => {
    const owner = await seedHelpers.createUser(db);
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);

    await seedHelpers.createCoupon(db, group.id, merchant.id, {
      title: 'Still Active',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await seedHelpers.createCoupon(db, group.id, merchant.id, {
      title: 'Already Expired',
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
    });

    const res = await request(app).get(
      `/api/v1/coupons?groupId=${group.id}&includeExpired=true`
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.find((coupon) => coupon.title === 'Still Active')?.is_active).toBe(true);
    expect(res.body.find((coupon) => coupon.title === 'Already Expired')?.is_active).toBe(false);
  }, TEST_TIMEOUT_MS);
});
