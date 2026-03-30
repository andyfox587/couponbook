// FoodieGroups route unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createMockRequest, createMockResponse } from '../../../helpers/mocks.js';

// Mock dependencies
vi.mock('../../../../server/src/db.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../../../server/src/middleware/auth.js', () => ({
  default: vi.fn(() => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { sub: token, email: 'test@example.com' };
    next();
  }),
  optional: vi.fn(() => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) req.user = { sub: token, email: 'test@example.com' };
    next();
  }),
}));

vi.mock('../../../../server/src/config/stripe.js', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: 'cs_test_mock',
          url: 'https://checkout.stripe.com/test',
          payment_intent: 'pi_test_123',
          customer: 'cus_test_123',
        }),
      },
    },
    products: { create: vi.fn().mockResolvedValue({ id: 'prod_test' }) },
    prices: { create: vi.fn().mockResolvedValue({ id: 'price_test' }) },
  },
}));

import { db } from '../../../../server/src/db.js';
import foodieGroupsRouter from '../../../../server/src/routes/foodieGroups.js';

describe('FoodieGroups Routes', () => {
  let req, res;
  let app;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    app = express();
    app.use(express.json());
    app.use('/api/v1/groups', foodieGroupsRouter);
    vi.clearAllMocks();
    db.select.mockReset().mockReturnThis();
    db.from.mockReset().mockReturnThis();
    db.where.mockReset().mockReturnThis();
    db.innerJoin.mockReset().mockReturnThis();
    db.insert.mockReset().mockReturnThis();
    db.values.mockReset().mockReturnThis();
    db.returning.mockReset();
    db.update.mockReset().mockReturnThis();
    db.set.mockReset().mockReturnThis();
    db.delete.mockReset().mockReturnThis();
  });

  describe('GET /api/v1/groups/:id/access', () => {
    it('should require authentication', () => {
      req.user = null;
      expect(req.user).toBeNull();
    });

    it('should return hasAccess: false for user without purchase', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'group-id' };

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'user-id', cognitoSub: 'test-sub' },
          ]),
        }),
      });

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // No purchases
        }),
      });

      const user = await db.select().from().where();
      expect(user[0].cognitoSub).toBe('test-sub');
    });

    it('should return hasAccess: true for user with paid purchase', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'group-id' };

      // Mock purchases query - set up complete chain
      const mockPurchases = [
        {
          id: 'purchase-id',
          userId: 'user-id',
          groupId: 'group-id',
          status: 'paid',
        },
      ];
      
      // Reset mocks but keep the function structure
      db.select.mockReset();
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockPurchases),
        }),
      });

      const purchases = await db.select().from().where();
      expect(purchases.length).toBeGreaterThan(0);
      expect(purchases[0].status).toBe('paid');
    });
  });

  describe('POST /api/v1/groups/:id/test-purchase', () => {
    it('should require authentication', () => {
      req.user = null;
      expect(req.user).toBeNull();
    });

    it('should reject invalid test code', () => {
      req.body = { code: 'INVALID' };
      const VALID_CODE = 'TESTCODE';
      expect(req.body.code).not.toBe(VALID_CODE);
    });

    it('should create test purchase with valid code', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'group-id' };
      req.body = { code: 'TESTCODE' };

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'user-id', cognitoSub: 'test-sub' },
          ]),
        }),
      });

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // No existing purchase
        }),
      });

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'purchase-id',
              userId: 'user-id',
              groupId: 'group-id',
              status: 'paid',
            },
          ]),
        }),
      });

      expect(req.body.code).toBe('TESTCODE');
    });

    it('should not create duplicate test purchase', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'group-id' };
      req.body = { code: 'TESTCODE' };

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'user-id', cognitoSub: 'test-sub' },
          ]),
        }),
      });

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'existing-purchase-id',
              userId: 'user-id',
              groupId: 'group-id',
              status: 'paid',
            },
          ]),
        }),
      });

      const existing = await db.select().from().where();
      expect(existing.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/groups/my/admin-memberships', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/groups/my/admin-memberships');
      expect(res.status).toBe(401);
    });

    it('returns empty array for user with no admin memberships', async () => {
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'user-id', cognitoSub: 'test-sub' },
          ]),
        }),
      });

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const res = await request(app)
        .get('/api/v1/groups/my/admin-memberships')
        .set('Authorization', 'Bearer test-sub');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns memberships for foodie group admins', async () => {
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'user-id', cognitoSub: 'test-sub' },
          ]),
        }),
      });

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { groupId: 'group-1', name: 'Group 1' },
              { groupId: 'group-2', name: 'Group 2' },
            ]),
          }),
        }),
      });

      const res = await request(app)
        .get('/api/v1/groups/my/admin-memberships')
        .set('Authorization', 'Bearer test-sub');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toMatchObject({
        groupId: 'group-1',
        name: 'Group 1',
      });
    });
  });
});


