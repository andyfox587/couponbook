// tests/integration/api/admin-endpoints.test.js
// Tests for /api/v1/admin/* endpoints - security audit pass
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = 30000;

// Use the in-memory test DB for server routes
vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db, pool: { query: vi.fn() } };
});

// Simplified auth middleware for tests: token = cognitoSub
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

// Mock Stripe config
vi.mock('../../../server/src/config/stripe.js', () => ({
  stripe: {
    checkout: { sessions: { create: vi.fn().mockResolvedValue({ id: 'cs_test', url: 'https://stripe.test' }) } },
    webhooks: { constructEvent: vi.fn() },
    products: { create: vi.fn().mockResolvedValue({ id: 'prod_test' }) },
    prices: { create: vi.fn().mockResolvedValue({ id: 'price_test' }) },
  },
}));

describe('Admin Endpoints Security Audit', () => {
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

  // ═══════════════════════════════════════════════════════════════
  // ADMIN OVERVIEW
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/admin/overview', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/admin/overview');
      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 with stats when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('counts');
      expect(res.body).toHaveProperty('paymentHealth');
      expect(res.body).toHaveProperty('revenue');
    }, TEST_TIMEOUT_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN USERS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/admin/users', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/admin/users');
      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 with users when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('users');
      expect(Array.isArray(res.body.users)).toBe(true);
    }, TEST_TIMEOUT_MS);

    it('supports query filter', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      await seedHelpers.createUser(db, { cognitoSub: 'test-user', email: 'test@example.com', name: 'Test User' });

      const res = await request(app)
        .get('/api/v1/admin/users?query=test@example.com')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body.users.length).toBeGreaterThan(0);
      expect(res.body.users.some(u => u.email === 'test@example.com')).toBe(true);
    }, TEST_TIMEOUT_MS);
  });

  describe('PATCH /api/v1/admin/users/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'target-user' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${user.id}`)
        .send({ role: 'merchant' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });
      const target = await seedHelpers.createUser(db, { cognitoSub: 'target-user' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${target.id}`)
        .set('Authorization', 'Bearer regular-user')
        .send({ role: 'merchant' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 and updates role when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const target = await seedHelpers.createUser(db, { cognitoSub: 'target-user', role: 'customer' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${target.id}`)
        .set('Authorization', 'Bearer admin-sub')
        .send({ role: 'merchant' });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('merchant');
    }, TEST_TIMEOUT_MS);

    it('prevents changing own role', async () => {
      const admin = await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .patch(`/api/v1/admin/users/${admin.id}`)
        .set('Authorization', 'Bearer admin-sub')
        .send({ role: 'customer' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot change your own role');
    }, TEST_TIMEOUT_MS);
  });

  describe('POST /api/v1/admin/users/:id/disable', () => {
    it('returns 401 when unauthenticated', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'target-user' });

      const res = await request(app).post(`/api/v1/admin/users/${user.id}/disable`);

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });
      const target = await seedHelpers.createUser(db, { cognitoSub: 'target-user' });

      const res = await request(app)
        .post(`/api/v1/admin/users/${target.id}/disable`)
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 and disables user when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const target = await seedHelpers.createUser(db, { cognitoSub: 'target-user' });

      const res = await request(app)
        .post(`/api/v1/admin/users/${target.id}/disable`)
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body.deletedAt).toBeTruthy();
    }, TEST_TIMEOUT_MS);

    it('prevents disabling own account', async () => {
      const admin = await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .post(`/api/v1/admin/users/${admin.id}/disable`)
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot disable your own account');
    }, TEST_TIMEOUT_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN MERCHANTS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/admin/merchants', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/admin/merchants');
      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .get('/api/v1/admin/merchants')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 with merchants when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/merchants')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('merchants');
      expect(Array.isArray(res.body.merchants)).toBe(true);
    }, TEST_TIMEOUT_MS);
  });

  describe('POST /api/v1/admin/merchants', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/admin/merchants')
        .send({ name: 'Test Merchant' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .post('/api/v1/admin/merchants')
        .set('Authorization', 'Bearer regular-user')
        .send({ name: 'Test Merchant' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 201 when super_admin with valid data', async () => {
      const admin = await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });

      const res = await request(app)
        .post('/api/v1/admin/merchants')
        .set('Authorization', 'Bearer admin-sub')
        .send({ name: 'Test Merchant', ownerId: owner.id });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Merchant');
      expect(res.body.ownerId).toBe(owner.id);
    }, TEST_TIMEOUT_MS);
  });

  describe('PATCH /api/v1/admin/merchants/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .patch(`/api/v1/admin/merchants/${merchant.id}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .patch(`/api/v1/admin/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer regular-user')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .patch(`/api/v1/admin/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer admin-sub')
        .send({ name: 'Admin Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Admin Updated');
    }, TEST_TIMEOUT_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN GROUPS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/admin/groups', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/admin/groups');
      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .get('/api/v1/admin/groups')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 with groups when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/groups')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('groups');
      expect(Array.isArray(res.body.groups)).toBe(true);
    }, TEST_TIMEOUT_MS);
  });

  describe('POST /api/v1/admin/groups', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/admin/groups')
        .send({ name: 'Test Group' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .post('/api/v1/admin/groups')
        .set('Authorization', 'Bearer regular-user')
        .send({ name: 'Test Group' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 201 when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const slug = `test-group-${Date.now()}`;
      const res = await request(app)
        .post('/api/v1/admin/groups')
        .set('Authorization', 'Bearer admin-sub')
        .send({ name: 'Test Group', slug });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Group');
    }, TEST_TIMEOUT_MS);
  });

  describe('POST /api/v1/admin/groups/:id/admins', () => {
    it('returns 401 when unauthenticated', async () => {
      const group = await seedHelpers.createFoodieGroup(db);

      const res = await request(app)
        .post(`/api/v1/admin/groups/${group.id}/admins`)
        .send({ userId: 'some-id' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });
      const group = await seedHelpers.createFoodieGroup(db);

      const res = await request(app)
        .post(`/api/v1/admin/groups/${group.id}/admins`)
        .set('Authorization', 'Bearer regular-user')
        .send({ userId: 'some-id' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 201 when super_admin assigns admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const target = await seedHelpers.createUser(db, { cognitoSub: 'target-user' });
      const group = await seedHelpers.createFoodieGroup(db);

      const res = await request(app)
        .post(`/api/v1/admin/groups/${group.id}/admins`)
        .set('Authorization', 'Bearer admin-sub')
        .send({ userId: target.id });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('foodie_group_admin');
    }, TEST_TIMEOUT_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // ADMIN PAYMENTS
  // ═══════════════════════════════════════════════════════════════

  describe('GET /api/v1/admin/payments/overview', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/admin/payments/overview');
      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .get('/api/v1/admin/payments/overview')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 with payment overview when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/payments/overview')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalPurchases');
      expect(res.body).toHaveProperty('byStatus');
      expect(res.body).toHaveProperty('paymentHealth');
    }, TEST_TIMEOUT_MS);
  });

  describe('GET /api/v1/admin/purchases', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/admin/purchases');
      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .get('/api/v1/admin/purchases')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 with purchases when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/purchases')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('purchases');
      expect(Array.isArray(res.body.purchases)).toBe(true);
    }, TEST_TIMEOUT_MS);
  });

  describe('GET /api/v1/admin/payment-events', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/v1/admin/payment-events');
      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .get('/api/v1/admin/payment-events')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 with events when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .get('/api/v1/admin/payment-events')
        .set('Authorization', 'Bearer admin-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('events');
      expect(Array.isArray(res.body.events)).toBe(true);
    }, TEST_TIMEOUT_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // EVENTS WRITE LOCKDOWN (per plan requirement)
  // ═══════════════════════════════════════════════════════════════

  // POST /api/v1/events is intentionally removed — events are created via the
  // event-submission approval flow (POST /api/v1/event-submissions + PUT approval).

  describe('PUT /api/v1/events/:id (events write lockdown)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .put('/api/v1/events/some-id')
        .send({ name: 'Updated Event' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .put('/api/v1/events/some-id')
        .set('Authorization', 'Bearer regular-user')
        .send({ name: 'Updated Event' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);
  });

  describe('DELETE /api/v1/events/:id (events write lockdown)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).delete('/api/v1/events/some-id');

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .delete('/api/v1/events/some-id')
        .set('Authorization', 'Bearer regular-user');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // DISABLED USER ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Disabled user enforcement (resolveLocalUser)', () => {
    it('blocks disabled user from accessing admin endpoints', async () => {
      // Create a disabled super_admin user (to test the middleware blocks before role check)
      await seedHelpers.createUser(db, {
        cognitoSub: 'disabled-admin',
        role: 'super_admin',
        deletedAt: new Date().toISOString(),
      });

      // Try to access an admin endpoint - should be blocked by resolveLocalUser
      const res = await request(app)
        .get('/api/v1/admin/overview')
        .set('Authorization', 'Bearer disabled-admin');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('disabled');
    }, TEST_TIMEOUT_MS);
  });
});
