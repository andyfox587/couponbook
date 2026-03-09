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

async function seedOwnedCoupon(db, options = {}) {
  const owner = options.owner || await seedHelpers.createUser(db, {
    cognitoSub: options.ownerSub || 'owner-sub',
    role: 'merchant',
  });
  const group = options.group || await seedHelpers.createFoodieGroup(db, {
    name: options.groupName || 'Test Group',
  });
  const merchant = options.merchant || await seedHelpers.createMerchant(db, owner.id, {
    name: options.merchantName || 'Test Merchant',
  });
  const coupon = options.coupon || await seedHelpers.createCoupon(db, group.id, merchant.id, {
    title: options.couponTitle || 'Test Coupon',
    locked: false,
  });

  return { owner, group, merchant, coupon };
}

describe('Merchant Redemption Insights API', () => {
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

  it('merchant-details only returns redeemers for owned coupons', async () => {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub', role: 'merchant' });
    const otherOwner = await seedHelpers.createUser(db, { cognitoSub: 'other-owner-sub', role: 'merchant' });
    const sharedGroup = await seedHelpers.createFoodieGroup(db);

    const ownedMerchant = await seedHelpers.createMerchant(db, owner.id, { name: 'Bella Bistro' });
    const otherMerchant = await seedHelpers.createMerchant(db, otherOwner.id, { name: 'Hidden Cafe' });

    const ownedCoupon = await seedHelpers.createCoupon(db, sharedGroup.id, ownedMerchant.id, {
      title: 'Owned Coupon',
      locked: false,
    });
    const otherCoupon = await seedHelpers.createCoupon(db, sharedGroup.id, otherMerchant.id, {
      title: 'Other Coupon',
      locked: false,
    });

    const visibleCustomer = await seedHelpers.createUser(db, {
      email: 'visible@example.com',
      name: 'Visible Customer',
    });
    const hiddenCustomer = await seedHelpers.createUser(db, {
      email: 'hidden@example.com',
      name: 'Hidden Customer',
    });

    await seedHelpers.createCouponRedemption(db, ownedCoupon.id, visibleCustomer.id, {
      redeemedAt: '2026-03-08T10:00:00.000Z',
    });
    await seedHelpers.createCouponRedemption(db, otherCoupon.id, hiddenCustomer.id, {
      redeemedAt: '2026-03-08T11:00:00.000Z',
    });

    const res = await request(app)
      .get('/api/v1/coupons/redemptions/merchant-details')
      .set('Authorization', 'Bearer owner-sub');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].couponId).toBe(ownedCoupon.id);
    expect(res.body[0].customerEmail).toBe('visible@example.com');
  }, TEST_TIMEOUT_MS);

  it('merchant-details couponId filter only returns rows for that coupon', async () => {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub', role: 'merchant' });
    const group = await seedHelpers.createFoodieGroup(db, { name: 'Coupon Filter Group' });
    const merchant = await seedHelpers.createMerchant(db, owner.id, { name: 'Coupon House' });
    const couponA = await seedHelpers.createCoupon(db, group.id, merchant.id, {
      title: 'Coupon A',
      locked: false,
    });
    const couponB = await seedHelpers.createCoupon(db, group.id, merchant.id, {
      title: 'Coupon B',
      locked: false,
    });

    const customerA = await seedHelpers.createUser(db, {
      email: 'filter-a@example.com',
      name: 'Filter A',
    });
    const customerB = await seedHelpers.createUser(db, {
      email: 'filter-b@example.com',
      name: 'Filter B',
    });

    await seedHelpers.createCouponRedemption(db, couponA.id, customerA.id, {
      redeemedAt: '2026-03-08T09:00:00.000Z',
    });
    await seedHelpers.createCouponRedemption(db, couponB.id, customerB.id, {
      redeemedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await request(app)
      .get(`/api/v1/coupons/redemptions/merchant-details?couponId=${couponA.id}`)
      .set('Authorization', 'Bearer owner-sub');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].couponId).toBe(couponA.id);
    expect(res.body[0].customerEmail).toBe('filter-a@example.com');
  }, TEST_TIMEOUT_MS);

  it('merchant-details search filter matches email and name', async () => {
    const { coupon } = await seedOwnedCoupon(db, {
      ownerSub: 'owner-sub',
      merchantName: 'Search Merchant',
      couponTitle: 'Search Coupon',
    });

    const jane = await seedHelpers.createUser(db, {
      email: 'jane@example.com',
      name: 'Jane Doe',
    });
    const alex = await seedHelpers.createUser(db, {
      email: 'alex@example.com',
      name: 'Alex Smith',
    });

    await seedHelpers.createCouponRedemption(db, coupon.id, jane.id, {
      redeemedAt: '2026-03-08T09:00:00.000Z',
    });
    await seedHelpers.createCouponRedemption(db, coupon.id, alex.id, {
      redeemedAt: '2026-03-08T10:00:00.000Z',
    });

    const emailRes = await request(app)
      .get('/api/v1/coupons/redemptions/merchant-details?search=jane@example.com')
      .set('Authorization', 'Bearer owner-sub');

    expect(emailRes.status).toBe(200);
    expect(emailRes.body).toHaveLength(1);
    expect(emailRes.body[0].customerName).toBe('Jane Doe');

    const nameRes = await request(app)
      .get('/api/v1/coupons/redemptions/merchant-details?search=Alex')
      .set('Authorization', 'Bearer owner-sub');

    expect(nameRes.status).toBe(200);
    expect(nameRes.body).toHaveLength(1);
    expect(nameRes.body[0].customerEmail).toBe('alex@example.com');
  }, TEST_TIMEOUT_MS);

  it('merchant-details supports pagination with limit and offset', async () => {
    const { coupon } = await seedOwnedCoupon(db, {
      ownerSub: 'owner-sub',
      merchantName: 'Paged Merchant',
      couponTitle: 'Paged Coupon',
    });

    const customerA = await seedHelpers.createUser(db, {
      email: 'page-a@example.com',
      name: 'Page A',
    });
    const customerB = await seedHelpers.createUser(db, {
      email: 'page-b@example.com',
      name: 'Page B',
    });

    await seedHelpers.createCouponRedemption(db, coupon.id, customerA.id, {
      redeemedAt: '2026-03-08T09:00:00.000Z',
    });
    await seedHelpers.createCouponRedemption(db, coupon.id, customerB.id, {
      redeemedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await request(app)
      .get(`/api/v1/coupons/redemptions/merchant-details?couponId=${coupon.id}&limit=1&offset=1&sortBy=redeemedAt&sortDir=desc`)
      .set('Authorization', 'Bearer owner-sub');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].customerEmail).toBe('page-a@example.com');
  }, TEST_TIMEOUT_MS);

  it('merchant-details returns an empty array when no rows match', async () => {
    await seedOwnedCoupon(db, {
      ownerSub: 'owner-sub',
      merchantName: 'Empty Merchant',
      couponTitle: 'Empty Coupon',
    });

    const res = await request(app)
      .get('/api/v1/coupons/redemptions/merchant-details')
      .set('Authorization', 'Bearer owner-sub');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  }, TEST_TIMEOUT_MS);

  it('merchant-export in redemptions mode returns every redemption row as CSV', async () => {
    const { coupon, merchant } = await seedOwnedCoupon(db, {
      ownerSub: 'owner-sub',
      merchantName: 'Export Merchant',
      couponTitle: 'Export Coupon',
    });

    const customerA = await seedHelpers.createUser(db, {
      email: 'export-a@example.com',
      name: 'Export A',
    });
    const customerB = await seedHelpers.createUser(db, {
      email: 'export-b@example.com',
      name: 'Export B',
    });

    await seedHelpers.createCouponRedemption(db, coupon.id, customerA.id, {
      redeemedAt: '2026-03-08T09:00:00.000Z',
    });
    await seedHelpers.createCouponRedemption(db, coupon.id, customerB.id, {
      redeemedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await request(app)
      .get(`/api/v1/coupons/redemptions/merchant-export?couponId=${coupon.id}&mode=redemptions`)
      .set('Authorization', 'Bearer owner-sub');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('redemptions.csv');
    expect(res.text).toContain('"merchantName"');
    expect(res.text).toContain(`"${merchant.name}"`);
    expect(res.text).toContain('"export-a@example.com"');
    expect(res.text).toContain('"export-b@example.com"');
  }, TEST_TIMEOUT_MS);

  it('merchant-export in unique-customers mode dedupes by normalized email', async () => {
    const { coupon } = await seedOwnedCoupon(db, {
      ownerSub: 'owner-sub',
      merchantName: 'Unique Merchant',
      couponTitle: 'Unique Coupon',
    });

    const customerA = await seedHelpers.createUser(db, {
      email: 'Jane@example.com',
      name: 'Jane Original',
    });
    const customerB = await seedHelpers.createUser(db, {
      email: 'jane@example.com',
      name: 'Jane Followup',
    });

    await seedHelpers.createCouponRedemption(db, coupon.id, customerA.id, {
      redeemedAt: '2026-03-08T09:00:00.000Z',
    });
    await seedHelpers.createCouponRedemption(db, coupon.id, customerB.id, {
      redeemedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await request(app)
      .get(`/api/v1/coupons/redemptions/merchant-export?couponId=${coupon.id}&mode=unique-customers`)
      .set('Authorization', 'Bearer owner-sub');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('unique-customers.csv');
    const lines = res.text.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(res.text).toContain('"redemptionCount"');
    expect(res.text).toContain('"2"');
  }, TEST_TIMEOUT_MS);

  it('merchant-export does not include another merchant’s redeemers', async () => {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub', role: 'merchant' });
    const otherOwner = await seedHelpers.createUser(db, { cognitoSub: 'other-owner-sub', role: 'merchant' });
    const group = await seedHelpers.createFoodieGroup(db);

    const ownedMerchant = await seedHelpers.createMerchant(db, owner.id, { name: 'Owned Export Merchant' });
    const otherMerchant = await seedHelpers.createMerchant(db, otherOwner.id, { name: 'Other Export Merchant' });

    const ownedCoupon = await seedHelpers.createCoupon(db, group.id, ownedMerchant.id, {
      title: 'Owned Export Coupon',
      locked: false,
    });
    const otherCoupon = await seedHelpers.createCoupon(db, group.id, otherMerchant.id, {
      title: 'Other Export Coupon',
      locked: false,
    });

    const visibleCustomer = await seedHelpers.createUser(db, {
      email: 'visible-export@example.com',
      name: 'Visible Export',
    });
    const hiddenCustomer = await seedHelpers.createUser(db, {
      email: 'hidden-export@example.com',
      name: 'Hidden Export',
    });

    await seedHelpers.createCouponRedemption(db, ownedCoupon.id, visibleCustomer.id, {
      redeemedAt: '2026-03-08T09:00:00.000Z',
    });
    await seedHelpers.createCouponRedemption(db, otherCoupon.id, hiddenCustomer.id, {
      redeemedAt: '2026-03-08T10:00:00.000Z',
    });

    const res = await request(app)
      .get('/api/v1/coupons/redemptions/merchant-export?mode=redemptions')
      .set('Authorization', 'Bearer owner-sub');

    expect(res.status).toBe(200);
    expect(res.text).toContain('"visible-export@example.com"');
    expect(res.text).not.toContain('"hidden-export@example.com"');
  }, TEST_TIMEOUT_MS);
});
