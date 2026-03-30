// Merchant logo upload integration tests
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';
import { eq } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';

const HOOK_TIMEOUT_MS = 30000;
const TEST_TIMEOUT_MS = 30000;

// Use the in-memory test DB for server routes
vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db, pool: { query: vi.fn() } }; // pool is used in app.js
});

// Mock AWS S3 client to avoid actual S3 calls
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  return {
    S3Client: vi.fn(() => ({
      send: mockSend,
    })),
    PutObjectCommand: vi.fn((params) => params),
    mockSend, // Export for test assertions
  };
});

// Simplified auth middleware for tests
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

// Helper function to create test image buffer with specific size and MIME type
function createTestImageBuffer(sizeBytes, mimeType = 'image/png') {
  const buffer = Buffer.alloc(sizeBytes);
  // Fill with some data (not actual image data, but sufficient for testing)
  buffer.fill(0);
  return buffer;
}

// Helper function to create test file buffer for invalid types
function createTestFileBuffer(sizeBytes, mimeType = 'application/pdf') {
  const buffer = Buffer.alloc(sizeBytes);
  buffer.fill(0);
  return buffer;
}

describe('Merchant Logo Upload Integration', () => {
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
    // Reset S3 mock
    const { mockSend } = await import('@aws-sdk/client-s3');
    mockSend.mockClear();
    // Set environment variables for S3 (don't use real bucket in tests)
    process.env.AWS_S3_MERCHANT_LOGO_BUCKET = '';
    process.env.AWS_S3_MERCHANT_LOGO_BASE_URL = '';
  }, HOOK_TIMEOUT_MS);

  describe('Successful logo upload', () => {
    it('should upload valid image file and update merchant logo URL', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-1' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      const testImageBuffer = createTestImageBuffer(1024 * 100, 'image/png'); // 100KB PNG

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer user-sub-1')
        .attach('file', testImageBuffer, 'logo.png')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', merchant.id);
      expect(res.body).toHaveProperty('logo_url');
      expect(res.body.logo_url).toMatch(/\/dev-merchant-logo\//);

      // Verify logo was updated in database
      const [updatedMerchant] = await db
        .select()
        .from(schema.merchant)
        .where(eq(schema.merchant.id, merchant.id));

      expect(updatedMerchant.logoUrl).toBeTruthy();
      expect(updatedMerchant.logoUrl).toMatch(/\/dev-merchant-logo\//);
    }, TEST_TIMEOUT_MS);
  });

  describe('File size validation', () => {
    it('should reject file larger than 5MB', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-2' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      // Create a file larger than 5MB (5 * 1024 * 1024 + 1)
      const largeBuffer = createTestImageBuffer(5 * 1024 * 1024 + 1, 'image/png');

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer user-sub-2')
        .attach('file', largeBuffer, 'large-logo.png')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/too large|5 MB/i);

      // Verify logo was NOT updated in database
      const [unchangedMerchant] = await db
        .select()
        .from(schema.merchant)
        .where(eq(schema.merchant.id, merchant.id));

      expect(unchangedMerchant.logoUrl).toBeNull();
    }, TEST_TIMEOUT_MS);

    it('should accept file just under 5MB limit', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-3' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      // Create a file just under 5MB limit (multer limit is 5MB, so use 4.9MB to be safe)
      const nearLimitBuffer = createTestImageBuffer(Math.floor(4.9 * 1024 * 1024), 'image/png');

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer user-sub-3')
        .attach('file', nearLimitBuffer, 'near-limit-logo.png')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logo_url');
    }, TEST_TIMEOUT_MS);
  });

  describe('File type validation', () => {
    it('should reject non-image file (PDF)', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-4' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      const pdfBuffer = createTestFileBuffer(1024 * 100, 'application/pdf');

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer user-sub-4')
        .attach('file', pdfBuffer, 'document.pdf')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/unsupported file type|Unsupported file type/i);

      // Verify logo was NOT updated
      const [unchangedMerchant] = await db
        .select()
        .from(schema.merchant)
        .where(eq(schema.merchant.id, merchant.id));

      expect(unchangedMerchant.logoUrl).toBeNull();
    }, TEST_TIMEOUT_MS);

    it('should reject unsupported image type (GIF)', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-5' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      const gifBuffer = createTestImageBuffer(1024 * 100, 'image/gif');

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer user-sub-5')
        .attach('file', gifBuffer, 'image.gif')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/unsupported file type|Unsupported file type/i);
    }, TEST_TIMEOUT_MS);

    it('should reject text file', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-6' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      const textBuffer = Buffer.from('This is a text file, not an image');

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer user-sub-6')
        .attach('file', textBuffer, 'document.txt')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/unsupported file type|Unsupported file type/i);
    }, TEST_TIMEOUT_MS);
  });

  describe('Supported file types', () => {
    const supportedTypes = [
      { mime: 'image/png', ext: 'png', name: 'PNG' },
      { mime: 'image/jpeg', ext: 'jpg', name: 'JPEG' },
      { mime: 'image/jpg', ext: 'jpg', name: 'JPG' },
      { mime: 'image/webp', ext: 'webp', name: 'WebP' },
      { mime: 'image/svg+xml', ext: 'svg', name: 'SVG' },
    ];

    supportedTypes.forEach(({ mime, ext, name }) => {
      it(`should accept ${name} file type`, async () => {
        const user = await seedHelpers.createUser(db, { cognitoSub: `user-sub-${name}` });
        const merchant = await seedHelpers.createMerchant(db, user.id, {
          name: 'Test Merchant',
          logoUrl: null,
        });

        const imageBuffer = createTestImageBuffer(1024 * 50, mime);

        const res = await request(app)
          .post(`/api/v1/merchants/${merchant.id}/logo`)
          .set('Authorization', `Bearer user-sub-${name}`)
          .attach('file', imageBuffer, `logo.${ext}`)
          .expect('Content-Type', /json/);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('logo_url');
        expect(res.body.logo_url).toBeTruthy();
      }, TEST_TIMEOUT_MS);
    });
  });

  describe('Missing file', () => {
    it('should return error when no file is uploaded', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-7' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer user-sub-7')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/No file uploaded/i);
    }, TEST_TIMEOUT_MS);
  });

  describe('Authentication and authorization', () => {
    it('should return 401 when no authentication token is provided', async () => {
      const user = await seedHelpers.createUser(db, { cognitoSub: 'user-sub-8' });
      const merchant = await seedHelpers.createMerchant(db, user.id, {
        name: 'Test Merchant',
      });

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .expect('Content-Type', /json/);

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('message');
    }, TEST_TIMEOUT_MS);

    it('should return 403 when user does not own the merchant', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub' });
      const nonOwner = await seedHelpers.createUser(db, { cognitoSub: 'nonowner-sub' });
      const merchant = await seedHelpers.createMerchant(db, owner.id, {
        name: 'Test Merchant',
      });

      const testImageBuffer = createTestImageBuffer(1024 * 100, 'image/png');

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer nonowner-sub')
        .attach('file', testImageBuffer, 'logo.png')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toMatch(/do not own|Forbidden/i);
    }, TEST_TIMEOUT_MS);

    it('should allow super admin user to upload logo for any merchant', async () => {
      const owner = await seedHelpers.createUser(db, { cognitoSub: 'owner-sub-2', role: 'customer' });
      const admin = await seedHelpers.createUser(db, { cognitoSub: 'admin-sub', role: 'super_admin' });
      const merchant = await seedHelpers.createMerchant(db, owner.id, {
        name: 'Test Merchant',
        logoUrl: null,
      });

      // Create admin user with cognitoSub matching the token
      const testImageBuffer = createTestImageBuffer(1024 * 100, 'image/png');

      const res = await request(app)
        .post(`/api/v1/merchants/${merchant.id}/logo`)
        .set('Authorization', 'Bearer admin-sub')
        .attach('file', testImageBuffer, 'logo.png')
        .expect('Content-Type', /json/);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('logo_url');
    }, TEST_TIMEOUT_MS);
  });
});
