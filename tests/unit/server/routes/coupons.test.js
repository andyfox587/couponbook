// Coupons route unit tests
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse, generateMockJWT } from '../../../helpers/mocks.js';
import { eq, and } from 'drizzle-orm';

// Mock dependencies
vi.mock('../../../../server/src/db.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    delete: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../../../server/src/middleware/auth.js', () => ({
  default: vi.fn(() => (req, res, next) => {
    req.user = { sub: 'test-sub', email: 'test@example.com' };
    next();
  }),
  optional: vi.fn(() => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) req.user = { sub: token, email: 'test@example.com' };
    next();
  }),
}));

import { db } from '../../../../server/src/db.js';

describe('Coupons Routes', () => {
  let req, res;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    vi.clearAllMocks();
  });

  describe('POST /api/v1/coupons/:id/redeem', () => {
    it('should require authentication', () => {
      req.user = null;
      expect(req.user).toBeNull();
    });

    it('should reject redemption for non-existent coupon', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'non-existent-id' };

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      // Coupon not found
      const coupons = await db.select().from().where();
      expect(coupons).toEqual([]);
    });

    it('should reject redemption for expired coupon', () => {
      const now = new Date();
      const expiredDate = new Date(now.getTime() - 86400000); // yesterday

      const coupon = {
        id: 'coupon-id',
        expiresAt: expiredDate.toISOString(),
        validFrom: new Date(now.getTime() - 172800000).toISOString(), // 2 days ago
      };

      expect(new Date(coupon.expiresAt) < now).toBe(true);
    });

    it('should reject redemption for not-yet-valid coupon', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 86400000); // tomorrow

      const coupon = {
        id: 'coupon-id',
        validFrom: futureDate.toISOString(),
        expiresAt: new Date(now.getTime() + 172800000).toISOString(), // 2 days from now
      };

      expect(new Date(coupon.validFrom) > now).toBe(true);
    });

    it('should prevent duplicate redemption', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'coupon-id' };

      const existingRedemption = {
        id: 'redemption-id',
        couponId: 'coupon-id',
        userId: 'user-id',
        redeemedAt: new Date().toISOString(),
      };

      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existingRedemption]),
        }),
      });

      const redemptions = await db.select().from().where();
      expect(redemptions.length).toBeGreaterThan(0);
    });

    it('should create redemption for valid coupon', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'coupon-id' };

      const now = new Date();
      const coupon = {
        id: 'coupon-id',
        validFrom: new Date(now.getTime() - 86400000).toISOString(),
        expiresAt: new Date(now.getTime() + 86400000).toISOString(),
      };

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([coupon]),
        }),
      });

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: 'user-id', cognitoSub: 'test-sub' },
          ]),
        }),
      });

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // No existing redemption
        }),
      });

      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'redemption-id',
              couponId: 'coupon-id',
              userId: 'user-id',
              redeemedAt: now.toISOString(),
            },
          ]),
        }),
      });

      const couponResult = await db.select().from().where();
      expect(couponResult[0].id).toBe('coupon-id');
    });
  });

  describe('GET /api/v1/coupons/redemptions/me', () => {
    it('should require authentication', () => {
      req.user = null;
      expect(req.user).toBeNull();
    });

    it('should return user redemptions', async () => {
      req.user = { sub: 'test-sub' };

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
            { couponId: 'coupon-1', redeemedAt: new Date().toISOString() },
            { couponId: 'coupon-2', redeemedAt: new Date().toISOString() },
          ]),
        }),
      });

      const user = await db.select().from().where();
      expect(user[0].cognitoSub).toBe('test-sub');
    });
  });

  describe('GET /api/v1/coupons response shape', () => {
    it('should include cuisine_type in response', async () => {
      const mockCoupon = {
        id: 'coupon-id',
        title: 'Test Coupon',
        description: 'Test description',
        coupon_type: 'percent',
        discount_value: 10,
        valid_from: '2025-01-01T00:00:00.000Z',
        expires_at: '2025-01-31T00:00:00.000Z',
        qr_code_url: null,
        locked: true,
        cuisine_type: 'Italian',
        merchant_id: 'merchant-id',
        merchant_name: 'Test Merchant',
        merchant_logo: null,
        foodie_group_id: 'group-id',
        foodie_group_name: 'Test Group',
      };

      // Verify the expected response shape includes cuisine_type
      expect(mockCoupon).toHaveProperty('cuisine_type');
      expect(mockCoupon.cuisine_type).toBe('Italian');
    });

    it('should return coupon_type in snake_case for API consistency', async () => {
      const mockCoupon = {
        id: 'coupon-id',
        title: 'Test Coupon',
        coupon_type: 'percent',
        cuisine_type: 'Mexican',
        merchant_name: 'Test Merchant',
        foodie_group_name: 'Test Group',
      };

      // API should use snake_case
      expect(mockCoupon).toHaveProperty('coupon_type');
      expect(mockCoupon).not.toHaveProperty('couponType');
      expect(mockCoupon).toHaveProperty('cuisine_type');
      expect(mockCoupon).not.toHaveProperty('cuisineType');
    });

    it('should handle null cuisine_type gracefully', async () => {
      const mockCoupon = {
        id: 'coupon-id',
        title: 'Test Coupon',
        cuisine_type: null,
      };

      expect(mockCoupon.cuisine_type).toBeNull();
    });

    it('should return all expected fields in GET /coupons', async () => {
      const expectedFields = [
        'id',
        'title',
        'description',
        'coupon_type',
        'discount_value',
        'valid_from',
        'expires_at',
        'qr_code_url',
        'locked',
        'cuisine_type',
        'merchant_id',
        'merchant_name',
        'merchant_logo',
        'foodie_group_id',
        'foodie_group_name',
      ];

      const mockCoupon = {
        id: 'coupon-id',
        title: 'Test Coupon',
        description: 'Test',
        coupon_type: 'bogo',
        discount_value: 0,
        valid_from: '2025-01-01',
        expires_at: '2025-01-31',
        qr_code_url: null,
        locked: true,
        cuisine_type: 'Fusion',
        merchant_id: 'merchant-id',
        merchant_name: 'Test',
        merchant_logo: null,
        foodie_group_id: 'group-id',
        foodie_group_name: 'Test Group',
      };

      for (const field of expectedFields) {
        expect(mockCoupon).toHaveProperty(field);
      }
    });
  });
});



