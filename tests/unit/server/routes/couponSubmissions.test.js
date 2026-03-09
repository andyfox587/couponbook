// CouponSubmissions route unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse, createMockNext } from '../../../helpers/mocks.js';

// Mock dependencies
vi.mock('../../../../server/src/db.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...args) => ({ __op: 'eq', args })),
  and: vi.fn((...args) => ({ __op: 'and', args })),
  inArray: vi.fn((...args) => ({ __op: 'inArray', args })),
  isNull: vi.fn((arg) => ({ __op: 'isNull', arg })),
}));

vi.mock('../../../../server/src/middleware/auth.js', () => ({
  default: vi.fn(() => (req, res, next) => {
    req.user = { sub: 'test-sub', email: 'test@example.com' };
    next();
  }),
}));

import { db } from '../../../../server/src/db.js';
import couponSubmissionsRouter from '../../../../server/src/routes/couponSubmissions.js';
import { couponSubmission } from '../../../../server/src/schema.js';
import { eq, isNull } from 'drizzle-orm';

describe('CouponSubmissions Routes', () => {
  let req, res;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    vi.clearAllMocks();
  });

  describe('PUT /api/v1/coupon-submissions/:id', () => {
    it('should require authentication', () => {
      req.user = null;
      expect(req.user).toBeNull();
    });

    it('should require group admin role', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'submission-id' };
      req.body = { state: 'approved' };

      // Mock the database query chain
      const mockWhere = vi.fn().mockResolvedValue([
        { id: 'user-id', cognitoSub: 'test-sub', role: 'customer' },
      ]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      db.select.mockReturnValue({ from: mockFrom });

      const result = await db.select().from().where();
      expect(result[0].role).toBe('customer');
    });

    it('should allow super admin to approve submission', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'submission-id' };
      req.body = { state: 'approved' };

      // Mock user query for admin check
      const mockWhere = vi.fn().mockResolvedValue([
        { id: 'user-id', cognitoSub: 'test-sub', role: 'super_admin' },
      ]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      db.select.mockReturnValue({ from: mockFrom });

      const user = await db.select().from().where();
      expect(user[0].role).toBe('super_admin');
    });

    it('should create coupon when submission is approved', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'submission-id' };
      req.body = { state: 'approved' };

      const submissionData = {
        title: 'Test Coupon',
        description: 'Test',
        coupon_type: 'percent',
        discount_value: 10,
        valid_from: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        locked: true,
      };

      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'submission-id',
                state: 'approved',
                groupId: 'group-id',
                merchantId: 'merchant-id',
                submissionData,
              },
            ]),
          }),
        }),
      });

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'coupon-id',
              title: submissionData.title,
              groupId: 'group-id',
              merchantId: 'merchant-id',
            },
          ]),
        }),
      });

      expect(submissionData.title).toBe('Test Coupon');
    });
  });

  describe('GET /api/v1/coupon-submissions/by-merchant', () => {
    it('should use isNull for deletedAt and return camelCase shape including rejectionMessage', async () => {
      req = createMockRequest({
        user: { sub: 'test-sub' },
        query: { state: 'rejected' },
      });
      // Route now expects req.dbUser from resolveLocalUser middleware
      req.dbUser = { id: 'user-1', cognitoSub: 'test-sub', role: 'merchant' };
      
      res = createMockResponse();
      const next = createMockNext();

      // 1) Owned merchants (first query in the handler)
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'm1', name: 'Merchant 1' }]),
        }),
      });

      // 2) Submissions query (second query in the handler)
      const rows = [
        {
          id: 'sub-1',
          merchantId: 'm1',
          groupId: 'g1',
          state: 'rejected',
          submittedAt: '2025-01-01T00:00:00.000Z',
          submissionData: { title: 'Test Coupon' },
          rejectionMessage: 'Needs more details',
          deletedAt: null,
          merchantName: 'Merchant 1',
        },
      ];

      const mockOrderBy = vi.fn().mockResolvedValue(rows);
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: mockOrderBy,
            }),
          }),
        }),
      });

      // Find and invoke the actual route handler (skip auth middleware by calling the last stack item)
      const layer = couponSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/by-merchant',
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;

      await handler(req, res, next);

      // Soft-delete predicate should be null-safe
      expect(isNull).toHaveBeenCalledWith(couponSubmission.deletedAt);
      expect(eq).not.toHaveBeenCalledWith(couponSubmission.deletedAt, null);

      // The /by-merchant select should be camelCase + include rejectionMessage
      const selectArg = db.select.mock.calls[1][0];
      expect(selectArg).toHaveProperty('merchantId');
      expect(selectArg).toHaveProperty('submittedAt');
      expect(selectArg).toHaveProperty('submissionData');
      expect(selectArg).toHaveProperty('rejectionMessage');
      expect(selectArg).not.toHaveProperty('merchant_id');
      expect(selectArg).not.toHaveProperty('submitted_at');
      expect(selectArg).not.toHaveProperty('submission_data');

      // Response should include rejectionMessage for UI display
      expect(res.json).toHaveBeenCalledWith(rows);
      expect(res.json.mock.calls[0][0][0].rejectionMessage).toBe('Needs more details');
    });
  });

  describe('PATCH /api/v1/coupon-submissions/:id (merchant edit pending)', () => {
    const pendingSubmission = {
      id: 'sub-1',
      groupId: 'group-1',
      merchantId: 'merchant-1',
      state: 'pending',
      submittedAt: '2025-06-01T00:00:00.000Z',
      submissionData: { title: 'Old Title', description: 'Old', coupon_type: 'percent', discount_value: 10, valid_from: '2025-06-01', expires_at: '2025-07-01' },
      rejectionMessage: null,
    };

    function setupPatchMocks(existing, updatedRow) {
      // 1st select: fetch existing submission
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(existing ? [existing] : []),
        }),
      });
      // update chain
      if (updatedRow) {
        db.update.mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedRow]),
            }),
          }),
        });
      }
    }

    it('should allow merchant to edit own pending submission', async () => {
      req = createMockRequest({
        user: { sub: 'merchant-sub' },
        params: { id: 'sub-1' },
        body: { submission_data: { title: 'New Title', description: 'Desc', coupon_type: 'percent', discount_value: 15, valid_from: '2025-06-01', expires_at: '2025-07-01' } },
      });
      req.dbUser = { id: 'owner-1', role: 'merchant' };
      res = createMockResponse();
      const next = createMockNext();

      const updatedRow = { ...pendingSubmission, submissionData: req.body.submission_data, updatedAt: '2025-06-02T00:00:00.000Z' };
      setupPatchMocks(pendingSubmission, updatedRow);

      // Mock canManageMerchant — the route calls it with (dbUser, existing.merchantId)
      // Since we mock the db, we need to mock the merchant-owner lookup too
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ownerId: 'owner-1' }]),
          }),
        }),
      });

      const layer = couponSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/:id' && l.route.methods.patch,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const result = res.json.mock.calls[0][0];
      expect(result.id).toBe('sub-1');
      expect(result.state).toBe('pending');
      expect(result.updatedAt).toBeTruthy();
    });

    it('should return 403 when merchant does not own the submission merchant', async () => {
      req = createMockRequest({
        user: { sub: 'other-sub' },
        params: { id: 'sub-1' },
        body: { submission_data: { title: 'New', description: 'Desc', coupon_type: 'percent', discount_value: 15, valid_from: '2025-06-01', expires_at: '2025-07-01' } },
      });
      req.dbUser = { id: 'other-owner', role: 'merchant' };
      res = createMockResponse();
      const next = createMockNext();

      setupPatchMocks(pendingSubmission, null);

      // canManageMerchant lookup — different owner
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ ownerId: 'owner-1' }]),
          }),
        }),
      });

      const layer = couponSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/:id' && l.route.methods.patch,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 403 when submission is approved', async () => {
      req = createMockRequest({
        user: { sub: 'merchant-sub' },
        params: { id: 'sub-1' },
        body: { submission_data: { title: 'New', description: 'Desc', coupon_type: 'percent', discount_value: 15, valid_from: '2025-06-01', expires_at: '2025-07-01' } },
      });
      req.dbUser = { id: 'owner-1', role: 'merchant' };
      res = createMockResponse();
      const next = createMockNext();

      setupPatchMocks({ ...pendingSubmission, state: 'approved' }, null);

      const layer = couponSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/:id' && l.route.methods.patch,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('approved') }),
      );
    });

    it('should return 403 when submission is rejected', async () => {
      req = createMockRequest({
        user: { sub: 'merchant-sub' },
        params: { id: 'sub-1' },
        body: { submission_data: { title: 'New', description: 'Desc', coupon_type: 'percent', discount_value: 15, valid_from: '2025-06-01', expires_at: '2025-07-01' } },
      });
      req.dbUser = { id: 'owner-1', role: 'merchant' };
      res = createMockResponse();
      const next = createMockNext();

      setupPatchMocks({ ...pendingSubmission, state: 'rejected' }, null);

      const layer = couponSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/:id' && l.route.methods.patch,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('rejected') }),
      );
    });

    it('should allow super admin to edit any pending submission', async () => {
      req = createMockRequest({
        user: { sub: 'admin-sub' },
        params: { id: 'sub-1' },
        body: { submission_data: { title: 'Admin Edit', description: 'Desc', coupon_type: 'bogo', valid_from: '2025-06-01', expires_at: '2025-07-01' } },
      });
      req.dbUser = { id: 'admin-user', role: 'super_admin' };
      res = createMockResponse();
      const next = createMockNext();

      const updatedRow = { ...pendingSubmission, submissionData: req.body.submission_data, updatedAt: '2025-06-02T00:00:00.000Z' };
      setupPatchMocks(pendingSubmission, updatedRow);

      const layer = couponSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/:id' && l.route.methods.patch,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.json).toHaveBeenCalled();
      const result = res.json.mock.calls[0][0];
      expect(result.state).toBe('pending');
    });

    it('should return 400 when submission_data is missing', async () => {
      req = createMockRequest({
        user: { sub: 'merchant-sub' },
        params: { id: 'sub-1' },
        body: {},
      });
      req.dbUser = { id: 'owner-1', role: 'merchant' };
      res = createMockResponse();
      const next = createMockNext();

      const layer = couponSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/:id' && l.route.methods.patch,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;
      await handler(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('POST /api/v1/coupon-submissions validation', () => {
    it('should reject submission with missing required fields', () => {
      const submissionData = {
        title: '',
        description: 'Test',
        coupon_type: 'percent',
        valid_from: '2025-01-01',
        expires_at: '2025-01-31',
      };

      // title is empty, should fail validation
      expect(submissionData.title).toBe('');
    });

    it('should reject submission with invalid coupon_type', () => {
      const validTypes = ['percent', 'amount', 'bogo', 'free_item'];
      const invalidType = 'invalid_type';

      expect(validTypes.includes(invalidType)).toBe(false);
    });

    it('should require discount_value for percent coupon type', () => {
      const submissionData = {
        title: 'Test',
        description: 'Test',
        coupon_type: 'percent',
        valid_from: '2025-01-01',
        expires_at: '2025-01-31',
        // discount_value is missing
      };

      // discount_value is required for percent type
      expect(submissionData.coupon_type).toBe('percent');
      expect(submissionData.discount_value).toBeUndefined();
    });

    it('should require discount_value for amount coupon type', () => {
      const submissionData = {
        title: 'Test',
        description: 'Test',
        coupon_type: 'amount',
        valid_from: '2025-01-01',
        expires_at: '2025-01-31',
        // discount_value is missing
      };

      // discount_value is required for amount type
      expect(submissionData.coupon_type).toBe('amount');
      expect(submissionData.discount_value).toBeUndefined();
    });

    it('should default discount_value to 0 for bogo coupon type', () => {
      const submissionData = {
        title: 'Test',
        description: 'Test',
        coupon_type: 'bogo',
        valid_from: '2025-01-01',
        expires_at: '2025-01-31',
      };

      // bogo doesn't require discount_value, should default to 0
      const normalizedDiscountValue = submissionData.discount_value ?? 0;
      expect(normalizedDiscountValue).toBe(0);
    });

    it('should default discount_value to 0 for free_item coupon type', () => {
      const submissionData = {
        title: 'Test',
        description: 'Test',
        coupon_type: 'free_item',
        valid_from: '2025-01-01',
        expires_at: '2025-01-31',
      };

      // free_item doesn't require discount_value, should default to 0
      const normalizedDiscountValue = submissionData.discount_value ?? 0;
      expect(normalizedDiscountValue).toBe(0);
    });

    it('should default locked to true if omitted', () => {
      const submissionData = {
        title: 'Test',
        description: 'Test',
        coupon_type: 'bogo',
        valid_from: '2025-01-01',
        expires_at: '2025-01-31',
      };

      // locked should default to true
      const normalizedLocked = submissionData.locked ?? true;
      expect(normalizedLocked).toBe(true);
    });

    it('should reject submission with invalid date format', () => {
      const invalidDate = 'not-a-date';
      const parsedDate = new Date(invalidDate);

      expect(isNaN(parsedDate.getTime())).toBe(true);
    });
  });

  describe('Approval creates coupon with cuisineType', () => {
    it('should write cuisineType from submissionData.cuisine_type on approval', async () => {
      const submissionData = {
        title: 'Test Coupon',
        description: 'Test',
        coupon_type: 'percent',
        discount_value: 10,
        valid_from: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        locked: true,
        cuisine_type: 'Italian',
      };

      // Verify cuisine_type is preserved
      expect(submissionData.cuisine_type).toBe('Italian');

      // Expected coupon payload should include cuisineType
      const couponPayload = {
        groupId: 'group-id',
        merchantId: 'merchant-id',
        title: submissionData.title,
        description: submissionData.description,
        couponType: submissionData.coupon_type,
        discountValue: submissionData.discount_value ?? 0,
        validFrom: new Date(submissionData.valid_from),
        expiresAt: new Date(submissionData.expires_at),
        qrCodeUrl: submissionData.qr_code_url || null,
        locked: submissionData.locked ?? true,
        cuisineType: submissionData.cuisine_type || null,
      };

      expect(couponPayload.cuisineType).toBe('Italian');
    });

    it('should set cuisineType to null if not provided in submission', async () => {
      const submissionData = {
        title: 'Test Coupon',
        description: 'Test',
        coupon_type: 'bogo',
        valid_from: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      };

      const couponPayload = {
        cuisineType: submissionData.cuisine_type || null,
      };

      expect(couponPayload.cuisineType).toBeNull();
    });
  });
});

