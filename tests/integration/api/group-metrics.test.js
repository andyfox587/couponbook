import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = 30000;

const SERVICE_TOKEN = 'test-service-token-abc123';

process.env.METRICS_SERVICE_TOKEN = SERVICE_TOKEN;

vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db, pool: { query: vi.fn() } };
});

// Cognito auth mock — not used by metrics routes, but other routes in the app expect it.
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
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
    products: { create: vi.fn() },
    prices: { create: vi.fn() },
  },
}));

describe('Group Metrics API', () => {
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
    process.env.METRICS_SERVICE_TOKEN = SERVICE_TOKEN;
  }, HOOK_TIMEOUT_MS);

  describe('Auth', () => {
    it('returns 401 when no service token header is sent', async () => {
      const res = await request(app).get('/api/v1/groups/metrics');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/service token required/i);
    }, TEST_TIMEOUT_MS);

    it('returns 401 when the service token is wrong', async () => {
      const res = await request(app)
        .get('/api/v1/groups/metrics')
        .set('X-Service-Token', 'not-the-real-token');
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid service token/i);
    }, TEST_TIMEOUT_MS);

    it('returns 503 when METRICS_SERVICE_TOKEN env var is not set', async () => {
      const original = process.env.METRICS_SERVICE_TOKEN;
      delete process.env.METRICS_SERVICE_TOKEN;
      try {
        const res = await request(app)
          .get('/api/v1/groups/metrics')
          .set('X-Service-Token', SERVICE_TOKEN);
        expect(res.status).toBe(503);
      } finally {
        process.env.METRICS_SERVICE_TOKEN = original;
      }
    }, TEST_TIMEOUT_MS);
  });

  describe('GET /api/v1/groups/metrics', () => {
    it('returns an empty groups array when no groups exist', async () => {
      const res = await request(app)
        .get('/api/v1/groups/metrics')
        .set('X-Service-Token', SERVICE_TOKEN);
      expect(res.status).toBe(200);
      expect(res.body.groups).toEqual([]);
      expect(res.body.as_of).toBeTypeOf('string');
    }, TEST_TIMEOUT_MS);

    it('returns zeroed metrics for a brand-new group with no activity', async () => {
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Empty Group' });

      const res = await request(app)
        .get('/api/v1/groups/metrics')
        .set('X-Service-Token', SERVICE_TOKEN);

      expect(res.status).toBe(200);
      expect(res.body.groups).toHaveLength(1);
      expect(res.body.groups[0]).toMatchObject({
        groupId: group.id,
        slug: group.slug,
        name: 'Empty Group',
        members: 0,
        restaurants: 0,
        coupons_active: 0,
        coupons_redeemed: 0,
        gross_revenue_cents: 0,
        events_held: 0,
        events_revenue_cents: 0,
      });
    }, TEST_TIMEOUT_MS);

    it('computes correct metrics with paid purchases, coupons, redemptions, and active coupons', async () => {
      const merchantOwner = await seedHelpers.createUser(db, { email: 'mo@example.com', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Active Group' });
      const merchantA = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'A' });
      const merchantB = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'B' });

      const couponA1 = await seedHelpers.createCoupon(db, group.id, merchantA.id, {
        title: 'A1',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const couponA2 = await seedHelpers.createCoupon(db, group.id, merchantA.id, {
        title: 'A2',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const couponB1 = await seedHelpers.createCoupon(db, group.id, merchantB.id, {
        title: 'B1',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      const customer1 = await seedHelpers.createUser(db, { email: 'c1@example.com' });
      const customer2 = await seedHelpers.createUser(db, { email: 'c2@example.com' });
      const customer3 = await seedHelpers.createUser(db, { email: 'c3@example.com' });

      // 3 paid purchases (customer1 buys twice — should still count as 1 member, but 2x revenue)
      await seedHelpers.createPurchase(db, customer1.id, group.id, { amountCents: 999, status: 'paid' });
      await seedHelpers.createPurchase(db, customer1.id, group.id, { amountCents: 999, status: 'paid' });
      await seedHelpers.createPurchase(db, customer2.id, group.id, { amountCents: 1999, status: 'paid' });
      // a pending purchase (should not count)
      await seedHelpers.createPurchase(db, customer3.id, group.id, { amountCents: 999, status: 'pending' });

      // 2 redemptions
      await seedHelpers.createCouponRedemption(db, couponA1.id, customer1.id);
      await seedHelpers.createCouponRedemption(db, couponA2.id, customer2.id);

      const res = await request(app)
        .get('/api/v1/groups/metrics')
        .set('X-Service-Token', SERVICE_TOKEN);

      expect(res.status).toBe(200);
      const row = res.body.groups.find((g) => g.groupId === group.id);
      expect(row).toMatchObject({
        members: 2, // customer1, customer2 — pending purchase excluded
        restaurants: 2, // merchantA, merchantB
        coupons_active: 3, // A1, A2, B1 all in the future
        coupons_redeemed: 2,
        gross_revenue_cents: 999 + 999 + 1999, // 3997
      });
      // unused vars referenced to silence lints
      expect(couponB1).toBeDefined();
    }, TEST_TIMEOUT_MS);

    it('excludes soft-deleted, expired, and archived rows from metrics', async () => {
      const merchantOwner = await seedHelpers.createUser(db, { email: 'mo2@example.com', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Mixed State Group' });
      const archivedGroup = await seedHelpers.createFoodieGroup(db, {
        name: 'Archived Group',
        slug: `archived-${Date.now()}`,
      });

      // Archive the second group via direct DB update
      const { foodieGroup } = await import('../../../server/src/schema.js');
      const { eq } = await import('drizzle-orm');
      await db
        .update(foodieGroup)
        .set({ archivedAt: new Date().toISOString() })
        .where(eq(foodieGroup.id, archivedGroup.id));

      const merchant = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'Live' });
      const deletedMerchant = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'Deleted' });
      const { merchant: merchantTable } = await import('../../../server/src/schema.js');
      await db
        .update(merchantTable)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(merchantTable.id, deletedMerchant.id));

      // Active coupon (counts)
      await seedHelpers.createCoupon(db, group.id, merchant.id, {
        title: 'Active',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      // Expired coupon (excluded from coupons_active, but its merchant still counts as a restaurant)
      await seedHelpers.createCoupon(db, group.id, merchant.id, {
        title: 'Expired',
        expiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      });
      // Soft-deleted coupon (fully excluded)
      const deletedCoupon = await seedHelpers.createCoupon(db, group.id, merchant.id, {
        title: 'Deleted',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const { coupon: couponTable } = await import('../../../server/src/schema.js');
      await db
        .update(couponTable)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(couponTable.id, deletedCoupon.id));

      // Coupon owned by a deleted merchant (fully excluded)
      await seedHelpers.createCoupon(db, group.id, deletedMerchant.id, {
        title: 'OrphanedByDeletedMerchant',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      const res = await request(app)
        .get('/api/v1/groups/metrics')
        .set('X-Service-Token', SERVICE_TOKEN);

      expect(res.status).toBe(200);

      // Archived group should not appear in the list
      const archivedRow = res.body.groups.find((g) => g.groupId === archivedGroup.id);
      expect(archivedRow).toBeUndefined();

      // Main group: 1 active coupon (Active), 1 restaurant (Live merchant — both Active and Expired
      // belong to it, deleted merchant's orphan is excluded)
      const row = res.body.groups.find((g) => g.groupId === group.id);
      expect(row).toMatchObject({
        coupons_active: 1,
        restaurants: 1,
      });
    }, TEST_TIMEOUT_MS);

    it('excludes soft-deleted redemptions from coupons_redeemed', async () => {
      const merchantOwner = await seedHelpers.createUser(db, { email: 'mo3@example.com', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Redemption Group' });
      const merchant = await seedHelpers.createMerchant(db, merchantOwner.id);
      const couponRow = await seedHelpers.createCoupon(db, group.id, merchant.id, { locked: false });

      const c1 = await seedHelpers.createUser(db, { email: 'r1@example.com' });
      const c2 = await seedHelpers.createUser(db, { email: 'r2@example.com' });

      const liveRedemption = await seedHelpers.createCouponRedemption(db, couponRow.id, c1.id);
      const deletedRedemption = await seedHelpers.createCouponRedemption(db, couponRow.id, c2.id);

      const { couponRedemption } = await import('../../../server/src/schema.js');
      const { eq } = await import('drizzle-orm');
      await db
        .update(couponRedemption)
        .set({ deletedAt: new Date().toISOString() })
        .where(eq(couponRedemption.id, deletedRedemption.id));

      const res = await request(app)
        .get('/api/v1/groups/metrics')
        .set('X-Service-Token', SERVICE_TOKEN);

      const row = res.body.groups.find((g) => g.groupId === group.id);
      expect(row.coupons_redeemed).toBe(1);
      expect(liveRedemption).toBeDefined();
    }, TEST_TIMEOUT_MS);
  });

  describe('GET /api/v1/groups/:slug/metrics', () => {
    it('returns metrics for a single group looked up by slug', async () => {
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Slug Group', slug: 'slug-group-xyz' });

      const res = await request(app)
        .get('/api/v1/groups/slug-group-xyz/metrics')
        .set('X-Service-Token', SERVICE_TOKEN);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        groupId: group.id,
        slug: 'slug-group-xyz',
        name: 'Slug Group',
        members: 0,
        restaurants: 0,
        coupons_active: 0,
        coupons_redeemed: 0,
        gross_revenue_cents: 0,
      });
    }, TEST_TIMEOUT_MS);

    it('also accepts a UUID in the :slug parameter', async () => {
      const group = await seedHelpers.createFoodieGroup(db, { name: 'UUID Lookup' });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/metrics`)
        .set('X-Service-Token', SERVICE_TOKEN);

      expect(res.status).toBe(200);
      expect(res.body.groupId).toBe(group.id);
    }, TEST_TIMEOUT_MS);

    it('returns 404 for an unknown slug', async () => {
      const res = await request(app)
        .get('/api/v1/groups/no-such-group-exists/metrics')
        .set('X-Service-Token', SERVICE_TOKEN);

      expect(res.status).toBe(404);
    }, TEST_TIMEOUT_MS);

    it('requires a valid service token', async () => {
      await seedHelpers.createFoodieGroup(db, { name: 'Token Test', slug: 'token-test-slug' });

      const noToken = await request(app).get('/api/v1/groups/token-test-slug/metrics');
      expect(noToken.status).toBe(401);

      const badToken = await request(app)
        .get('/api/v1/groups/token-test-slug/metrics')
        .set('X-Service-Token', 'wrong');
      expect(badToken.status).toBe(401);
    }, TEST_TIMEOUT_MS);
  });
});
