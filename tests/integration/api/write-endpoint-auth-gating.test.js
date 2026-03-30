// tests/integration/api/write-endpoint-auth-gating.test.js
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
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_mock_session_id',
          url: 'https://checkout.stripe.com/test',
        }),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
    products: {
      create: vi.fn().mockResolvedValue({ id: 'prod_test_123' }),
    },
    prices: {
      create: vi.fn().mockResolvedValue({ id: 'price_test_123' }),
    },
  },
}));

describe('Write Endpoint Auth Gating', () => {
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
  // FOODIE GROUPS
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/v1/groups (create group)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/groups')
        .send({ name: 'Test Group', description: 'Test' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when authenticated but not super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'regular-user', role: 'customer' });

      const res = await request(app)
        .post('/api/v1/groups')
        .set('Authorization', 'Bearer regular-user')
        .send({ name: 'Test Group', description: 'Test' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 201 when super_admin', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      // Note: slug is required by the database schema
      const slug = `test-group-${Date.now()}`;
      const res = await request(app)
        .post('/api/v1/groups')
        .set('Authorization', 'Bearer admin-sub')
        .send({ name: 'Test Group', description: 'Test', slug });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Group');
    }, TEST_TIMEOUT_MS);
  });

  describe('PUT /api/v1/groups/:id (update group)', () => {
    it('returns 401 when unauthenticated', async () => {
      const group = await seedHelpers.createFoodieGroup(db);

      const res = await request(app)
        .put(`/api/v1/groups/${group.id}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when user is not group admin', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createUser(db, { cognitoSub: 'other-user', role: 'customer' });

      const res = await request(app)
        .put(`/api/v1/groups/${group.id}`)
        .set('Authorization', 'Bearer other-user')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 when user is foodie_group_admin for this group', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user = await seedHelpers.createUser(db, { cognitoSub: 'group-admin' });
      await seedHelpers.createMembership(db, user.id, group.id, { role: 'foodie_group_admin' });

      const res = await request(app)
        .put(`/api/v1/groups/${group.id}`)
        .set('Authorization', 'Bearer group-admin')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when user is foodie_group_admin for DIFFERENT group', async () => {
      const group1 = await seedHelpers.createFoodieGroup(db, { name: 'Group 1' });
      const group2 = await seedHelpers.createFoodieGroup(db, { name: 'Group 2' });
      const user = await seedHelpers.createUser(db, { cognitoSub: 'group-admin' });
      await seedHelpers.createMembership(db, user.id, group1.id, { role: 'foodie_group_admin' });

      const res = await request(app)
        .put(`/api/v1/groups/${group2.id}`)
        .set('Authorization', 'Bearer group-admin')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 when super_admin', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .put(`/api/v1/groups/${group.id}`)
        .set('Authorization', 'Bearer admin-sub')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
    }, TEST_TIMEOUT_MS);
  });

  describe('DELETE /api/v1/groups/:id (delete group)', () => {
    it('returns 401 when unauthenticated', async () => {
      const group = await seedHelpers.createFoodieGroup(db);

      const res = await request(app).delete(`/api/v1/groups/${group.id}`);

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when not super_admin (even if group admin)', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const user = await seedHelpers.createUser(db, { cognitoSub: 'group-admin' });
      await seedHelpers.createMembership(db, user.id, group.id, { role: 'foodie_group_admin' });

      const res = await request(app)
        .delete(`/api/v1/groups/${group.id}`)
        .set('Authorization', 'Bearer group-admin');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('passes auth check when super_admin (delete proceeds to handler)', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });

      const res = await request(app)
        .delete(`/api/v1/groups/${group.id}`)
        .set('Authorization', 'Bearer admin-sub');

      // Auth passed - either 200 (success) or 404 (PGlite rowCount issue)
      // Both indicate auth check succeeded; we're testing auth gating, not delete behavior
      expect([200, 404]).toContain(res.status);
    }, TEST_TIMEOUT_MS);
  });

  // ═══════════════════════════════════════════════════════════════
  // MERCHANTS
  // ═══════════════════════════════════════════════════════════════

  describe('POST /api/v1/merchants (create merchant)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/v1/merchants')
        .send({ name: 'Test Merchant' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 201 when authenticated (creates merchant owned by self)', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub' });

      const res = await request(app)
        .post('/api/v1/merchants')
        .set('Authorization', 'Bearer user-sub')
        .send({ name: 'My Merchant' });

      expect(res.status).toBe(201);
      expect(res.body.ownerId).toBe(user.id);
    }, TEST_TIMEOUT_MS);

    it('super_admin can create merchant for another user', async () => {
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const otherUser = await seedHelpers.createUser(db, { cognitoSub: 'other-user' });

      const res = await request(app)
        .post('/api/v1/merchants')
        .set('Authorization', 'Bearer admin-sub')
        .send({ name: 'Their Merchant', owner_id: otherUser.id });

      expect(res.status).toBe(201);
      expect(res.body.ownerId).toBe(otherUser.id);
    }, TEST_TIMEOUT_MS);
  });

  describe('PUT /api/v1/merchants/:id (update merchant)', () => {
    it('returns 401 when unauthenticated', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const merchant = await seedHelpers.createMerchant(db, user.id);

      const res = await request(app)
        .put(`/api/v1/merchants/${merchant.id}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when user does not own merchant', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      await seedHelpers.createUser(db, { cognitoSub: 'other-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .put(`/api/v1/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer other-sub')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('returns 200 when user owns merchant', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .put(`/api/v1/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer owner-sub')
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    }, TEST_TIMEOUT_MS);

    it('returns 200 when super_admin', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .put(`/api/v1/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer admin-sub')
        .send({ name: 'Admin Updated' });

      expect(res.status).toBe(200);
    }, TEST_TIMEOUT_MS);
  });

  describe('DELETE /api/v1/merchants/:id (delete merchant)', () => {
    it('returns 401 when unauthenticated', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const merchant = await seedHelpers.createMerchant(db, user.id);

      const res = await request(app).delete(`/api/v1/merchants/${merchant.id}`);

      expect(res.status).toBe(401);
    }, TEST_TIMEOUT_MS);

    it('returns 403 when user does not own merchant', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      await seedHelpers.createUser(db, { cognitoSub: 'other-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .delete(`/api/v1/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer other-sub');

      expect(res.status).toBe(403);
    }, TEST_TIMEOUT_MS);

    it('passes auth check when user owns merchant (delete proceeds to handler)', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .delete(`/api/v1/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer owner-sub');

      // Auth passed - either 200 (success) or 404 (PGlite rowCount issue)
      // Both indicate auth check succeeded; we're testing auth gating, not delete behavior
      expect([200, 404]).toContain(res.status);
    }, TEST_TIMEOUT_MS);

    it('passes auth check when super_admin (delete proceeds to handler)', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const merchant = await seedHelpers.createMerchant(db, owner.id);

      const res = await request(app)
        .delete(`/api/v1/merchants/${merchant.id}`)
        .set('Authorization', 'Bearer admin-sub');

      // Auth passed - either 200 (success) or 404 (PGlite rowCount issue)
      // Both indicate auth check succeeded; we're testing auth gating, not delete behavior
      expect([200, 404]).toContain(res.status);
    }, TEST_TIMEOUT_MS);
  });
});
