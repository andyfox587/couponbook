import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = 30000;

vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db, pool: { query: vi.fn() } };
});

vi.mock('../../../server/src/middleware/auth.js', () => ({
  default: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Token required' });
    req.user = { sub: token, email: `${token}@example.com` };
    return next();
  },
}));

vi.mock('../../../server/src/config/stripe.js', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ id: 'cs_test', url: 'https://stripe.test' }) } },
    webhooks: { constructEvent: vi.fn() },
    products: { create: vi.fn().mockResolvedValue({ id: 'prod_test' }) },
    prices: { create: vi.fn().mockResolvedValue({ id: 'price_test' }) },
  },
}));

describe('Redemption Overview APIs', () => {
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

  describe('GET /api/v1/groups/:groupId/admin/overview', () => {
    it('counts only non-expired coupons so the overview matches the active coupons list', async () => {
      const groupAdmin = await seedHelpers.createUser(db, {
        cognitoSub: 'group-admin-sub',
        role: 'foodie_group_admin',
      });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Overview Group' });
      const merchantOwner = await seedHelpers.createUser(db, {
        cognitoSub: 'merchant-owner-sub',
        role: 'merchant',
      });
      const merchant = await seedHelpers.createMerchant(db, merchantOwner.id, {
        name: 'Overview Merchant',
      });

      await seedHelpers.createMembership(db, groupAdmin.id, group.id, {
        role: 'foodie_group_admin',
      });

      await seedHelpers.createCoupon(db, group.id, merchant.id, {
        title: 'Active Coupon',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      await seedHelpers.createCoupon(db, group.id, merchant.id, {
        title: 'Expired Coupon',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/admin/overview`)
        .set('Authorization', 'Bearer group-admin-sub');

      expect(res.status).toBe(200);
      expect(res.body.counts?.coupons).toBe(1);
    });
  });

  describe('GET /api/v1/coupons/redemptions/merchant-overview', () => {
    it('returns recent total and top coupon for the authenticated merchant owner', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'merchant-sub', role: 'merchant' });
      const otherOwner = await seedHelpers.createUser(db, { cognitoSub: 'other-merchant-sub', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Merchant Group' });
      const merchant = await seedHelpers.createMerchant(db, owner.id, { name: 'Owner Merchant' });
      const otherMerchant = await seedHelpers.createMerchant(db, otherOwner.id, { name: 'Other Merchant' });

      const topCoupon = await seedHelpers.createCoupon(db, group.id, merchant.id, {
        title: 'Free Appetizer',
        locked: false,
      });
      const secondaryCoupon = await seedHelpers.createCoupon(db, group.id, merchant.id, {
        title: 'Dessert Deal',
        locked: false,
      });
      const hiddenCoupon = await seedHelpers.createCoupon(db, group.id, otherMerchant.id, {
        title: 'Hidden Deal',
        locked: false,
      });

      const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createCouponRedemption(db, topCoupon.id, (await seedHelpers.createUser(db, { email: 'm1@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, topCoupon.id, (await seedHelpers.createUser(db, { email: 'm2@example.com' })).id, { redeemedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() });
      await seedHelpers.createCouponRedemption(db, secondaryCoupon.id, (await seedHelpers.createUser(db, { email: 'm3@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, topCoupon.id, (await seedHelpers.createUser(db, { email: 'm4@example.com' })).id, { redeemedAt: old });
      await seedHelpers.createCouponRedemption(db, hiddenCoupon.id, (await seedHelpers.createUser(db, { email: 'hidden@example.com' })).id, { redeemedAt: recent });

      const res = await request(app)
        .get('/api/v1/coupons/redemptions/merchant-overview')
        .set('Authorization', 'Bearer merchant-sub');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        redemptionsLast30Days: 4,
        topCoupon: {
          couponId: topCoupon.id,
          couponTitle: 'Free Appetizer',
          redemptions: 3,
        },
      });
    }, TEST_TIMEOUT_MS);

    it('returns zero and null when there are no recent redemptions', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'merchant-sub', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db);
      const merchant = await seedHelpers.createMerchant(db, owner.id);
      const couponRow = await seedHelpers.createCoupon(db, group.id, merchant.id, { locked: false });
      const old = new Date(Date.now() - 36 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createCouponRedemption(
        db,
        couponRow.id,
        (await seedHelpers.createUser(db, { email: 'old@example.com' })).id,
        { redeemedAt: old },
      );

      const res = await request(app)
        .get('/api/v1/coupons/redemptions/merchant-overview')
        .set('Authorization', 'Bearer merchant-sub');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        redemptionsLast30Days: 0,
        topCoupon: null,
      });
    }, TEST_TIMEOUT_MS);
  });

  describe('GET /api/v1/groups/:groupId/redemption-overview', () => {
    it('returns recent total and top coupon for the managed group only', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'group-admin-sub', role: 'foodie_group_admin' });
      const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'merchant-owner-sub', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Charlotte Foodies' });
      const otherGroup = await seedHelpers.createFoodieGroup(db, { name: 'Other Group' });
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });

      const merchantRow = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'Group Merchant' });
      const couponA = await seedHelpers.createCoupon(db, group.id, merchantRow.id, { title: '10% Off Dinner', locked: false });
      const couponB = await seedHelpers.createCoupon(db, group.id, merchantRow.id, { title: 'Free Drink', locked: false });
      const otherGroupCoupon = await seedHelpers.createCoupon(db, otherGroup.id, merchantRow.id, { title: 'Outside Group Deal', locked: false });

      const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const old = new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createCouponRedemption(db, couponA.id, (await seedHelpers.createUser(db, { email: 'g1@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponA.id, (await seedHelpers.createUser(db, { email: 'g2@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponA.id, (await seedHelpers.createUser(db, { email: 'g3@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponB.id, (await seedHelpers.createUser(db, { email: 'g4@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponB.id, (await seedHelpers.createUser(db, { email: 'g5@example.com' })).id, { redeemedAt: old });
      await seedHelpers.createCouponRedemption(db, otherGroupCoupon.id, (await seedHelpers.createUser(db, { email: 'outside@example.com' })).id, { redeemedAt: recent });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/redemption-overview`)
        .set('Authorization', 'Bearer group-admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        redemptionsLast30Days: 5,
        topCoupon: {
          couponId: couponA.id,
          couponTitle: '10% Off Dinner',
          submittedBy: 'Group Merchant',
          submittedAt: couponA.createdAt,
          expiresAt: couponA.expiresAt,
          redemptions: 3,
        },
      });
    }, TEST_TIMEOUT_MS);

    it('returns zero and null for a managed group with no recent redemptions', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'group-admin-sub', role: 'foodie_group_admin' });
      const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'merchant-owner-sub', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });
      const merchantRow = await seedHelpers.createMerchant(db, merchantOwner.id);
      const couponRow = await seedHelpers.createCoupon(db, group.id, merchantRow.id, { locked: false });
      const old = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createCouponRedemption(
        db,
        couponRow.id,
        (await seedHelpers.createUser(db, { email: 'old-group@example.com' })).id,
        { redeemedAt: old },
      );

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/redemption-overview`)
        .set('Authorization', 'Bearer group-admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        redemptionsLast30Days: 0,
        topCoupon: null,
      });
    }, TEST_TIMEOUT_MS);

    it('rejects unauthenticated and unauthorized callers', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'group-admin-sub', role: 'foodie_group_admin' });
      const merchantUser = await seedHelpers.createUser(db, { cognitoSub: 'merchant-sub', role: 'merchant' });
      const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'merchant-owner-sub', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });
      await seedHelpers.createMerchant(db, merchantOwner.id);

      const unauthenticated = await request(app).get(`/api/v1/groups/${group.id}/redemption-overview`);
      expect(unauthenticated.status).toBe(401);

      const forbidden = await request(app)
        .get(`/api/v1/groups/${group.id}/redemption-overview`)
        .set('Authorization', 'Bearer merchant-sub');
      expect(forbidden.status).toBe(403);

      const allowed = await request(app)
        .get(`/api/v1/groups/${group.id}/redemption-overview`)
        .set('Authorization', 'Bearer group-admin-sub');
      expect(allowed.status).toBe(200);
    }, TEST_TIMEOUT_MS);
  });

  describe('GET /api/v1/admin/redemption-overview', () => {
    it('returns platform-wide recent total and top group for super admins', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'super-admin-sub', role: 'super_admin' });
      const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'merchant-owner-sub', role: 'merchant' });
      const groupA = await seedHelpers.createFoodieGroup(db, { name: 'Charlotte Foodie Group' });
      const groupB = await seedHelpers.createFoodieGroup(db, { name: 'Raleigh Foodie Group' });
      const merchantRow = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'Platform Merchant' });
      const couponA = await seedHelpers.createCoupon(db, groupA.id, merchantRow.id, { title: 'Group A Deal', locked: false });
      const couponB = await seedHelpers.createCoupon(db, groupB.id, merchantRow.id, { title: 'Group B Deal', locked: false });

      const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const old = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createCouponRedemption(db, couponA.id, (await seedHelpers.createUser(db, { email: 'pa@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponA.id, (await seedHelpers.createUser(db, { email: 'pb@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponA.id, (await seedHelpers.createUser(db, { email: 'pc@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponB.id, (await seedHelpers.createUser(db, { email: 'pd@example.com' })).id, { redeemedAt: recent });
      await seedHelpers.createCouponRedemption(db, couponB.id, (await seedHelpers.createUser(db, { email: 'pe@example.com' })).id, { redeemedAt: old });

      const res = await request(app)
        .get('/api/v1/admin/redemption-overview')
        .set('Authorization', 'Bearer super-admin-sub');

      expect(res.status).toBe(200);
      expect(res.body.redemptionsLast30Days).toBe(5);
      expect(res.body.topGroup).toEqual({
        groupId: groupA.id,
        groupName: 'Charlotte Foodie Group',
        redemptions: 3,
      });
      expect(res.body.recentRedemptions).toHaveLength(5);
      expect(res.body.recentRedemptions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          couponId: couponA.id,
          couponTitle: 'Group A Deal',
          merchantId: merchantRow.id,
          merchantName: 'Platform Merchant',
          groupId: groupA.id,
          groupName: 'Charlotte Foodie Group',
        }),
        expect.objectContaining({
          couponId: couponB.id,
          couponTitle: 'Group B Deal',
          merchantId: merchantRow.id,
          merchantName: 'Platform Merchant',
          groupId: groupB.id,
          groupName: 'Raleigh Foodie Group',
        }),
      ]));
    }, TEST_TIMEOUT_MS);

    it('returns zero and null when the platform has no recent redemptions', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'super-admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/redemption-overview')
        .set('Authorization', 'Bearer super-admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        redemptionsLast30Days: 0,
        topGroup: null,
        recentRedemptions: [],
      });
    }, TEST_TIMEOUT_MS);

    it('rejects merchants, group admins, and unauthenticated users', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'merchant-sub', role: 'merchant' });
      await seedHelpers.createUser(db, { cognitoSub: 'group-admin-sub', role: 'foodie_group_admin' });

      const unauthenticated = await request(app).get('/api/v1/admin/redemption-overview');
      expect(unauthenticated.status).toBe(401);

      const merchantRes = await request(app)
        .get('/api/v1/admin/redemption-overview')
        .set('Authorization', 'Bearer merchant-sub');
      expect(merchantRes.status).toBe(403);

      const groupAdminRes = await request(app)
        .get('/api/v1/admin/redemption-overview')
        .set('Authorization', 'Bearer group-admin-sub');
      expect(groupAdminRes.status).toBe(403);
    }, TEST_TIMEOUT_MS);
  });
});
