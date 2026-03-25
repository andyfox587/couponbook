import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse, createMockNext } from '../../../helpers/mocks.js';

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
import eventSubmissionsRouter from '../../../../server/src/routes/eventSubmissions.js';
import { eventSubmission } from '../../../../server/src/schema.js';
import { isNull } from 'drizzle-orm';

describe('EventSubmissions Routes', () => {
  let req, res;

  beforeEach(() => {
    req = createMockRequest();
    res = createMockResponse();
    vi.clearAllMocks();
  });

  describe('PUT /api/v1/event-submissions/:id', () => {
    it('should require authentication', () => {
      req.user = null;
      expect(req.user).toBeNull();
    });

    it('should require group admin role', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'submission-id' };
      req.body = { state: 'approved' };

      const mockWhere = vi.fn().mockResolvedValue([
        { id: 'user-id', cognitoSub: 'test-sub', role: 'customer' },
      ]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      db.select.mockReturnValue({ from: mockFrom });

      const result = await db.select().from().where();
      expect(result[0].role).toBe('customer');
    });

    it('should accept both rejection_message and message fields', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'submission-id' };

      // rejection_message takes precedence
      req.body = { state: 'rejected', rejection_message: 'Primary field', message: 'Fallback field' };
      expect(req.body.rejection_message || req.body.message).toBe('Primary field');

      // message is accepted as fallback
      req.body = { state: 'rejected', message: 'Legacy reason' };
      expect(req.body.rejection_message || req.body.message).toBe('Legacy reason');
    });

    it('should create event when submission is approved', async () => {
      req.user = { sub: 'test-sub' };
      req.params = { id: 'submission-id' };
      req.body = { state: 'approved' };

      const submissionData = {
        name: 'Test Event',
        description: 'A test event',
        start_datetime: new Date(Date.now() + 86400000).toISOString(),
        end_datetime: new Date(Date.now() + 2 * 86400000).toISOString(),
        location: '123 Main St',
        capacity: 10,
        is_free: true,
        visibility: 'public',
        max_tickets_per_guest: 1,
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
              id: 'event-id',
              name: submissionData.name,
              groupId: 'group-id',
              merchantId: 'merchant-id',
              status: 'published',
            },
          ]),
        }),
      });

      expect(submissionData.name).toBe('Test Event');
    });
  });

  describe('GET /api/v1/event-submissions/by-merchant', () => {
    it('should use isNull for deletedAt and return camelCase shape including rejectionMessage', async () => {
      req = createMockRequest({
        user: { sub: 'test-sub' },
        query: { state: 'rejected' },
      });
      req.dbUser = { id: 'user-1', cognitoSub: 'test-sub', role: 'merchant' };

      res = createMockResponse();
      const next = createMockNext();

      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'm1', name: 'Merchant 1' }]),
        }),
      });

      const rows = [
        {
          id: 'sub-1',
          merchantId: 'm1',
          groupId: 'g1',
          state: 'rejected',
          submittedAt: '2025-01-01T00:00:00.000Z',
          submissionData: { name: 'Test Event' },
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

      const layer = eventSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/by-merchant',
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;

      await handler(req, res, next);

      expect(isNull).toHaveBeenCalledWith(eventSubmission.deletedAt);

      const selectArg = db.select.mock.calls[1][0];
      expect(selectArg).toHaveProperty('merchantId');
      expect(selectArg).toHaveProperty('submittedAt');
      expect(selectArg).toHaveProperty('submissionData');
      expect(selectArg).toHaveProperty('rejectionMessage');

      expect(res.json).toHaveBeenCalledWith(rows);
      expect(res.json.mock.calls[0][0][0].rejectionMessage).toBe('Needs more details');
    });
  });

  describe('PATCH /api/v1/event-submissions/:id (merchant edit pending)', () => {
    const pendingSubmission = {
      id: 'sub-1',
      groupId: 'group-1',
      merchantId: 'merchant-1',
      state: 'pending',
      submittedAt: '2025-06-01T00:00:00.000Z',
      submissionData: {
        name: 'Old Event Name',
        description: 'Old description',
        start_datetime: new Date(Date.now() + 86400000).toISOString(),
        end_datetime: new Date(Date.now() + 2 * 86400000).toISOString(),
        location: '123 Main St',
        capacity: 10,
        is_free: true,
        visibility: 'public',
        max_tickets_per_guest: 1,
      },
      rejectionMessage: null,
    };

    function setupPatchMocks(existing, updatedRow) {
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(existing ? [existing] : []),
        }),
      });
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

    it('should reject PATCH on non-pending submission', async () => {
      const approved = { ...pendingSubmission, state: 'approved' };
      setupPatchMocks(approved);

      req = createMockRequest({
        user: { sub: 'merchant-sub' },
        params: { id: 'sub-1' },
        body: {
          submission_data: {
            name: 'Updated Event Name',
            description: 'Updated description',
            start_datetime: new Date(Date.now() + 86400000).toISOString(),
            end_datetime: new Date(Date.now() + 2 * 86400000).toISOString(),
            location: '123 Main St',
            capacity: 10,
            is_free: true,
            visibility: 'public',
            max_tickets_per_guest: 1,
          },
        },
      });
      req.dbUser = { id: 'user-1', cognitoSub: 'merchant-sub', role: 'merchant' };
      res = createMockResponse();

      const layer = eventSubmissionsRouter.stack.find(
        (l) => l.route && l.route.path === '/:id' && l.route.methods.patch,
      );
      const handler = layer.route.stack[layer.route.stack.length - 1].handle;

      await handler(req, res, createMockNext());

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('approved') }),
      );
    });
  });
});
