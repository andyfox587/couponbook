// Event lifecycle integration tests (route-level)
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import * as schema from '../../../server/src/schema.js';

import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 20000;

// Use the in-memory test DB for server routes
vi.mock('../../../server/src/db.js', async () => {
  const { getTestDb } = await import('../../helpers/db.js');
  const db = await getTestDb();
  return { db };
});

// Simplified auth middleware for tests — token value becomes req.user.sub
vi.mock('../../../server/src/middleware/auth.js', () => ({
  default: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Token required' });
    req.user = { sub: token };
    return next();
  },
  optional: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) req.user = { sub: token };
    return next();
  },
}));

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function makeApp(eventSubmissionsRouter, eventsRouter) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/event-submissions', eventSubmissionsRouter);
  app.use('/api/v1/events', eventsRouter);
  return app;
}

function validSubmissionData(overrides = {}) {
  return {
    name: 'Test Event',
    description: 'A test event',
    start_datetime: new Date(Date.now() + 86400000).toISOString(),
    end_datetime: new Date(Date.now() + 2 * 86400000).toISOString(),
    location: '123 Main St',
    capacity: 10,
    is_free: true,
    visibility: 'public',
    max_tickets_per_guest: 1,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────

describe('Event Lifecycle (API)', () => {
  let db;
  let app;
  let eventSubmissionsRouter;
  let eventsRouter;

  beforeAll(async () => {
    db = await getTestDb();
    eventSubmissionsRouter = (await import('../../../server/src/routes/eventSubmissions.js')).default;
    eventsRouter = (await import('../../../server/src/routes/events.js')).default;
    app = makeApp(eventSubmissionsRouter, eventsRouter);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await closeTestDb();
  }, HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    await resetTestDb();
  }, HOOK_TIMEOUT_MS);

  // ─── 1. Submission auth & ownership gating ───────────────

  describe('submission auth and ownership gating', () => {
    it('returns 401 when unauthenticated', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const u = await seedHelpers.createUser(db, { role: 'merchant' });
      const m = await seedHelpers.createMerchant(db, u.id);

      const res = await request(app)
        .post('/api/v1/event-submissions')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });

      expect(res.status).toBe(401);
    });

    it('returns 403 when merchant submits for a merchant they do not own', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'merchant-a', email: 'a@example.com' });
      const otherUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'merchant-b', email: 'b@example.com' });
      const otherMerchant = await seedHelpers.createMerchant(db, otherUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer merchant-a')
        .send({ group_id: group.id, merchant_id: otherMerchant.id, submission_data: validSubmissionData() });

      expect(res.status).toBe(403);
    });

    it('returns 201 when merchant submits for their own merchant', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'merch-owner', email: 'owner@example.com' });
      const ownedMerchant = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer merch-owner')
        .send({ group_id: group.id, merchant_id: ownedMerchant.id, submission_data: validSubmissionData() });

      expect(res.status).toBe(201);
      expect(res.body.state).toBe('pending');
      expect(res.body.groupId).toBe(group.id);
      expect(res.body.merchantId).toBe(ownedMerchant.id);
    });

    it('returns 400 when submission_data is missing required fields', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'merch-bad', email: 'bad@example.com' });
      const ownedMerchant = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer merch-bad')
        .send({ group_id: group.id, merchant_id: ownedMerchant.id, submission_data: { description: 'Missing name' } });

      expect(res.status).toBe(400);
    });
  });

  // ─── 2. Pending-only edits ───────────────────────────────

  describe('pending-only edits', () => {
    it('allows merchant to PATCH their pending submission', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'patch-merch', email: 'patch@example.com' });
      const ownedMerchant = await seedHelpers.createMerchant(db, merchantUser.id);

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer patch-merch')
        .send({ group_id: group.id, merchant_id: ownedMerchant.id, submission_data: validSubmissionData() });

      expect(createRes.status).toBe(201);
      const subId = createRes.body.id;

      const patchRes = await request(app)
        .patch(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer patch-merch')
        .send({ submission_data: validSubmissionData({ name: 'Updated Event Name' }) });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.submissionData.name).toBe('Updated Event Name');
    });

    it('blocks PATCH after approval', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, { role: 'super_admin', cognitoSub: 'admin-patch', email: 'admin-patch@example.com' });
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'merch-patch2', email: 'merch-patch2@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer merch-patch2')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });
      const subId = createRes.body.id;

      // Approve
      await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer admin-patch')
        .send({ state: 'approved' });

      // Try to patch after approval
      const patchRes = await request(app)
        .patch(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer merch-patch2')
        .send({ submission_data: validSubmissionData({ name: 'Too Late' }) });

      expect(patchRes.status).toBe(403);
    });
  });

  // ─── 3. Approval and rejection ───────────────────────────

  describe('approval and rejection', () => {
    it('group admin can approve a pending submission and gets submission + event back', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, { role: 'customer', cognitoSub: 'group-admin', email: 'gadmin@example.com' });
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'merch-sub', email: 'merch-sub@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer merch-sub')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });
      expect(createRes.status).toBe(201);
      const subId = createRes.body.id;

      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer group-admin')
        .send({ state: 'approved' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.submission).toBeDefined();
      expect(approveRes.body.event).toBeDefined();
      expect(approveRes.body.submission.state).toBe('approved');
      expect(approveRes.body.event.status).toBe('published');
      expect(approveRes.body.event.name).toBe('Test Event');
    });

    it('group admin can reject a pending submission with a rejection_message', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, { role: 'customer', cognitoSub: 'reject-admin', email: 'radmin@example.com' });
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'reject-merch', email: 'rmerch@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer reject-merch')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });
      const subId = createRes.body.id;

      const rejectRes = await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer reject-admin')
        .send({ state: 'rejected', rejection_message: 'Not suitable for this group' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.state).toBe('rejected');
      expect(rejectRes.body.rejectionMessage).toBe('Not suitable for this group');
    });

    it('returns 409 when trying to approve an already-approved submission', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, { role: 'super_admin', cognitoSub: 'dupe-admin', email: 'dadmin@example.com' });
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'dupe-merch', email: 'dmerch@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer dupe-merch')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });
      const subId = createRes.body.id;

      await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer dupe-admin')
        .send({ state: 'approved' });

      const secondApproveRes = await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer dupe-admin')
        .send({ state: 'approved' });

      expect(secondApproveRes.status).toBe(409);
    });

    it('group admin can reject using legacy "message" field for backward compat', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, { role: 'customer', cognitoSub: 'compat-admin', email: 'compat-admin@example.com' });
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'compat-merch', email: 'compat-merch@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer compat-merch')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });
      const subId = createRes.body.id;

      const rejectRes = await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer compat-admin')
        .send({ state: 'rejected', message: 'Legacy field test' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.state).toBe('rejected');
      expect(rejectRes.body.rejectionMessage).toBe('Legacy field test');
    });

    it('returns 403 when non-admin tries to approve', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'nonadmin-merch', email: 'na@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer nonadmin-merch')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });
      const subId = createRes.body.id;

      const res = await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', 'Bearer nonadmin-merch')
        .send({ state: 'approved' });

      expect(res.status).toBe(403);
    });
  });

  // ─── 4. Merchant / group read paths ─────────────────────

  describe('merchant and group read paths', () => {
    it('merchant can list their own submissions via GET /by-merchant', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'list-merch', email: 'list@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer list-merch')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });

      const res = await request(app)
        .get('/api/v1/event-submissions/by-merchant')
        .set('Authorization', 'Bearer list-merch');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].merchantId).toBe(m.id);
    });

    it('group admin can list pending submissions for their group', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, { role: 'customer', cognitoSub: 'grp-list-admin', email: 'gla@example.com' });
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'grp-list-merch', email: 'glm@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer grp-list-merch')
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });

      const res = await request(app)
        .get(`/api/v1/event-submissions/by-group/${group.id}`)
        .set('Authorization', 'Bearer grp-list-admin');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  // ─── 5. Public event listing / detail ───────────────────

  describe('public event listing and detail', () => {
    async function seedApprovedEvent(db, app, overrides = {}) {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, {
        role: 'super_admin',
        cognitoSub: `seed-admin-${Date.now()}-${Math.random()}`,
        email: `sadmin-${Date.now()}-${Math.random()}@example.com`,
      });
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: `seed-merch-${Date.now()}-${Math.random()}`,
        email: `smerch-${Date.now()}-${Math.random()}@example.com`,
      });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData(overrides) });

      const subId = createRes.body.id;
      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', `Bearer ${adminUser.cognitoSub}`)
        .send({ state: 'approved' });

      return { group, adminUser, merchantUser, merchant: m, event: approveRes.body.event };
    }

    it('GET /events lists published events with confirmedCount', async () => {
      await seedApprovedEvent(db, app);

      const res = await request(app).get('/api/v1/events');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('confirmedCount');
    });

    it('GET /events excludes events whose end time has passed', async () => {
      const now = Date.now();
      const past = await seedApprovedEvent(db, app, {
        name: 'Past Event',
        start_datetime: new Date(now - 3 * 86400000).toISOString(),
        end_datetime: new Date(now - 2 * 86400000).toISOString(),
      });
      const upcoming = await seedApprovedEvent(db, app, {
        name: 'Upcoming Event',
        start_datetime: new Date(now + 86400000).toISOString(),
        end_datetime: new Date(now + 2 * 86400000).toISOString(),
      });

      const res = await request(app).get('/api/v1/events');
      expect(res.status).toBe(200);
      expect(res.body.map((event) => event.id)).toContain(upcoming.event.id);
      expect(res.body.map((event) => event.id)).not.toContain(past.event.id);
    });

    it('GET /events/:id returns a published event', async () => {
      const { event: e } = await seedApprovedEvent(db, app);

      const res = await request(app).get(`/api/v1/events/${e.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(e.id);
      expect(res.body.status).toBe('published');
    });

    it('GET /events/:id returns 404 for non-published events', async () => {
      const { event: e, merchantUser, merchant: m } = await seedApprovedEvent(db, app);

      // Soft-cancel the event by direct DB update
await db.update(schema.event).set({ status: 'cancelled' }).where(eq(schema.event.id, e.id));

      const res = await request(app).get(`/api/v1/events/${e.id}`);
      expect(res.status).toBe(404);
    });

    it('GET /events/:id hides membersOnlyPriceCents for members_only events without token', async () => {
      const { event: e } = await seedApprovedEvent(db, app, {
        visibility: 'members_only',
        is_free: false,
        price_cents: 1000,
        members_only_price_cents: 500,
      });

      const res = await request(app).get(`/api/v1/events/${e.id}`);
      expect(res.status).toBe(200);
      expect(res.body.membersOnlyPriceCents).toBeNull();
      expect(res.body.memberAccessToken).toBeUndefined();
    });

    it('GET /events/:id exposes membersOnlyPriceCents when correct token provided', async () => {
      const { event: e } = await seedApprovedEvent(db, app, {
        visibility: 'members_only',
        is_free: false,
        price_cents: 1000,
        members_only_price_cents: 500,
      });

      // Fetch the token directly from DB
const [row] = await db.select({ memberAccessToken: schema.event.memberAccessToken }).from(schema.event).where(eq(schema.event.id, e.id));
      const token = row.memberAccessToken;

      const res = await request(app)
        .get(`/api/v1/events/${e.id}`)
        .query({ member_token: token });

      expect(res.status).toBe(200);
      expect(res.body.membersOnlyPriceCents).toBe(500);
    });
  });

  // ─── 6. RSVP: confirmation, waitlist, duplicate, guest ──

  describe('RSVP flows', () => {
    async function seedPublishedEvent(db, app, capacity = 2) {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, {
        role: 'super_admin',
        cognitoSub: `rsvp-admin-${Date.now()}-${Math.random()}`,
        email: `rsvpadmin-${Date.now()}-${Math.random()}@example.com`,
      });
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: `rsvp-merch-${Date.now()}-${Math.random()}`,
        email: `rsvpmerch-${Date.now()}-${Math.random()}@example.com`,
      });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData({ capacity }) });

      const subId = createRes.body.id;
      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${subId}`)
        .set('Authorization', `Bearer ${adminUser.cognitoSub}`)
        .send({ state: 'approved' });

      return { event: approveRes.body.event, adminUser, merchantUser, merchant: m };
    }

    it('authenticated user can RSVP and gets going status', async () => {
      const { event: e } = await seedPublishedEvent(db, app);
      const rsvpUser = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-user-1', email: 'rsvp1@example.com' });

      const res = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .set('Authorization', 'Bearer rsvp-user-1')
        .send({ attendees: 1 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('going');
      expect(res.body.userId).toBe(rsvpUser.id);
    });

    it('duplicate RSVP returns 409', async () => {
      const { event: e } = await seedPublishedEvent(db, app);
      await seedHelpers.createUser(db, { cognitoSub: 'dupe-rsvp-user', email: 'dupe-rsvp@example.com' });

      await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .set('Authorization', 'Bearer dupe-rsvp-user')
        .send({ attendees: 1 });

      const res = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .set('Authorization', 'Bearer dupe-rsvp-user')
        .send({ attendees: 1 });

      expect(res.status).toBe(409);
    });

    it('guest can RSVP without auth', async () => {
      const { event: e } = await seedPublishedEvent(db, app);

      const res = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .send({ attendees: 1, guest_name: 'Jane Guest', guest_email: 'jane@guest.com' });

      expect(res.status).toBe(201);
      expect(res.body.guestName).toBe('Jane Guest');
      expect(res.body.userId).toBeNull();
    });

    it('RSVP goes to waitlist when event is at capacity', async () => {
      const { event: e } = await seedPublishedEvent(db, app, 1);
      await seedHelpers.createUser(db, { cognitoSub: 'cap-user-1', email: 'cap1@example.com' });
      await seedHelpers.createUser(db, { cognitoSub: 'cap-user-2', email: 'cap2@example.com' });

      // First fills capacity
      await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .set('Authorization', 'Bearer cap-user-1')
        .send({ attendees: 1 });

      // Second goes to waitlist
      const res = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .set('Authorization', 'Bearer cap-user-2')
        .send({ attendees: 1 });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('waitlist');
      expect(res.body.waitlistPosition).toBe(1);
    });

    it('invite-only event rejects public RSVPs', async () => {
      const { event: e } = await seedPublishedEvent(db, app);
await db.update(schema.event).set({ inviteOnly: true }).where(eq(schema.event.id, e.id));

      const res = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .send({ attendees: 1, guest_name: 'Test' });

      expect(res.status).toBe(403);
    });
  });

  // ─── 7. Cancellation and waitlist promotion ──────────────

  describe('cancellation and waitlist promotion', () => {
    it('cancelling a confirmed RSVP promotes the earliest waitlisted entry', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, {
        role: 'super_admin',
        cognitoSub: `cancel-admin-${Date.now()}`,
        email: `cancel-admin-${Date.now()}@example.com`,
      });
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: `cancel-merch-${Date.now()}`,
        email: `cancel-merch-${Date.now()}@example.com`,
      });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData({ capacity: 1 }) });

      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminUser.cognitoSub}`)
        .send({ state: 'approved' });

      const e = approveRes.body.event;

      await seedHelpers.createUser(db, { cognitoSub: 'cancel-u1', email: 'cu1@example.com' });
      await seedHelpers.createUser(db, { cognitoSub: 'cancel-u2', email: 'cu2@example.com' });

      const rsvp1Res = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .set('Authorization', 'Bearer cancel-u1')
        .send({ attendees: 1 });
      expect(rsvp1Res.body.status).toBe('going');

      const rsvp2Res = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .set('Authorization', 'Bearer cancel-u2')
        .send({ attendees: 1 });
      expect(rsvp2Res.body.status).toBe('waitlist');

      const cancelRes = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp/${rsvp1Res.body.id}/cancel`)
        .set('Authorization', 'Bearer cancel-u1');
      expect(cancelRes.status).toBe(200);

      // Verify waitlisted user was promoted
const [promoted] = await db
        .select()
        .from(schema.eventRsvp)
        .where(eq(schema.eventRsvp.id, rsvp2Res.body.id));
      expect(promoted.status).toBe('going');
    });
  });

  // ─── 8. Attendee visibility ──────────────────────────────

  describe('attendee visibility', () => {
    it('merchant can see attendees for their event', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, {
        role: 'super_admin',
        cognitoSub: `att-admin-${Date.now()}`,
        email: `att-admin-${Date.now()}@example.com`,
      });
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: `att-merch-${Date.now()}`,
        email: `att-merch-${Date.now()}@example.com`,
      });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });

      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminUser.cognitoSub}`)
        .send({ state: 'approved' });

      const e = approveRes.body.event;

      await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .send({ attendees: 1, guest_name: 'Attendee One' });

      const res = await request(app)
        .get(`/api/v1/events/${e.id}/attendees`)
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('random user cannot see attendees', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, {
        role: 'super_admin',
        cognitoSub: `vis-admin-${Date.now()}`,
        email: `vis-admin-${Date.now()}@example.com`,
      });
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: `vis-merch-${Date.now()}`,
        email: `vis-merch-${Date.now()}@example.com`,
      });
      const randomUser = await seedHelpers.createUser(db, { cognitoSub: 'random-vis-user', email: 'random-vis@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });

      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminUser.cognitoSub}`)
        .send({ state: 'approved' });

      const e = approveRes.body.event;

      const res = await request(app)
        .get(`/api/v1/events/${e.id}/attendees`)
        .set('Authorization', 'Bearer random-vis-user');

      expect(res.status).toBe(403);
    });
  });

  // ─── 9. Attendee management and event stats ───────────────

  describe('attendee management and stats', () => {
    it('manager can mark checked-in and no-show', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, {
        role: 'super_admin',
        cognitoSub: `mgr-admin-${Date.now()}`,
        email: `mgr-admin-${Date.now()}@example.com`,
      });
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: `mgr-merch-${Date.now()}`,
        email: `mgr-merch-${Date.now()}@example.com`,
      });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData() });
      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminUser.cognitoSub}`)
        .send({ state: 'approved' });
      const e = approveRes.body.event;

      const attendee = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .send({ attendees: 1, guest_name: 'Checkin Guest', guest_email: 'checkin@example.com' });
      expect(attendee.status).toBe(201);

      const checkedInRes = await request(app)
        .patch(`/api/v1/events/${e.id}/rsvp/${attendee.body.id}/status`)
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ status: 'checked_in' });
      expect(checkedInRes.status).toBe(200);
      expect(checkedInRes.body.status).toBe('checked_in');

      const noShowRes = await request(app)
        .patch(`/api/v1/events/${e.id}/rsvp/${attendee.body.id}/status`)
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ status: 'no_show' });
      expect(noShowRes.status).toBe(200);
      expect(noShowRes.body.status).toBe('no_show');
    });

    it('manager can fetch per-event stats summary', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, {
        role: 'super_admin',
        cognitoSub: `stats-admin-${Date.now()}`,
        email: `stats-admin-${Date.now()}@example.com`,
      });
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: `stats-merch-${Date.now()}`,
        email: `stats-merch-${Date.now()}@example.com`,
      });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ group_id: group.id, merchant_id: m.id, submission_data: validSubmissionData({ capacity: 3, max_tickets_per_guest: 3 }) });
      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminUser.cognitoSub}`)
        .send({ state: 'approved' });
      const e = approveRes.body.event;

      const going = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .send({ attendees: 1, guest_name: 'Going', guest_email: 'going@example.com' });
      const waitlist = await request(app)
        .post(`/api/v1/events/${e.id}/rsvp`)
        .send({ attendees: 3, guest_name: 'Wait', guest_email: 'wait@example.com' });
      expect(waitlist.body.status).toBe('waitlist');

      await request(app)
        .patch(`/api/v1/events/${e.id}/rsvp/${going.body.id}/status`)
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`)
        .send({ status: 'checked_in' });

      const statsRes = await request(app)
        .get(`/api/v1/events/${e.id}/stats`)
        .set('Authorization', `Bearer ${merchantUser.cognitoSub}`);
      expect(statsRes.status).toBe(200);
      expect(statsRes.body.confirmedSeats).toBeGreaterThanOrEqual(1);
      expect(statsRes.body.waitlistCount).toBeGreaterThanOrEqual(3);
      expect(statsRes.body.checkedIns).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── 10. Image upload endpoints ──────────────────────────

  describe('image upload endpoints', () => {
    // In the test environment AWS_S3_EVENT_IMAGE_BUCKET is not set,
    // so all successful uploads take the dev-fallback path and return
    // a fake URL without touching S3.

    it('POST /upload-cover returns 401 when unauthenticated', async () => {
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-unauth', email: 'img-unauth@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions/upload-cover')
        .field('merchant_id', m.id)
        .attach('file', Buffer.from('fake'), { filename: 'test.png', contentType: 'image/png' });

      expect(res.status).toBe(401);
    });

    it('POST /upload-cover returns 403 when user does not own the merchant', async () => {
      const ownerUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-owner', email: 'img-owner@example.com' });
      const otherUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-other', email: 'img-other@example.com' });
      const m = await seedHelpers.createMerchant(db, ownerUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions/upload-cover')
        .set('Authorization', 'Bearer img-other')
        .field('merchant_id', m.id)
        .attach('file', Buffer.from('fake'), { filename: 'test.png', contentType: 'image/png' });

      expect(res.status).toBe(403);
    });

    it('POST /upload-cover returns 400 when no file is attached', async () => {
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-nofile', email: 'img-nofile@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions/upload-cover')
        .set('Authorization', 'Bearer img-nofile')
        .field('merchant_id', m.id);

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no file/i);
    });

    it('POST /upload-cover returns 400 for unsupported MIME type', async () => {
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-mime', email: 'img-mime@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions/upload-cover')
        .set('Authorization', 'Bearer img-mime')
        .field('merchant_id', m.id)
        .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'doc.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsupported file type/i);
    });

    it('POST /upload-cover returns 400 when file exceeds 5 MB', async () => {
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-large', email: 'img-large@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const bigBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB

      const res = await request(app)
        .post('/api/v1/event-submissions/upload-cover')
        .set('Authorization', 'Bearer img-large')
        .field('merchant_id', m.id)
        .attach('file', bigBuffer, { filename: 'big.png', contentType: 'image/png' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/file too large/i);
    });

    it('POST /upload-cover returns 200 with dev fake URL when S3 is not configured', async () => {
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-ok-cover', email: 'img-ok-cover@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions/upload-cover')
        .set('Authorization', 'Bearer img-ok-cover')
        .field('merchant_id', m.id)
        .attach('file', Buffer.from('fake-png-data'), { filename: 'cover.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.cover_image_url).toBeDefined();
      expect(typeof res.body.cover_image_url).toBe('string');
    });

    it('POST /upload-banner returns 200 with dev fake URL when S3 is not configured', async () => {
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-ok-banner', email: 'img-ok-banner@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(app)
        .post('/api/v1/event-submissions/upload-banner')
        .set('Authorization', 'Bearer img-ok-banner')
        .field('merchant_id', m.id)
        .attach('file', Buffer.from('fake-png-data'), { filename: 'banner.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.banner_image_url).toBeDefined();
      expect(typeof res.body.banner_image_url).toBe('string');
    });

    it('uploaded URL survives approval: cover_image_url is preserved on the created event', async () => {
      const group = await seedHelpers.createFoodieGroup(db);
      const adminUser = await seedHelpers.createUser(db, { role: 'super_admin', cognitoSub: 'img-approve-admin', email: 'img-approve-admin@example.com' });
      const merchantUser = await seedHelpers.createUser(db, { role: 'merchant', cognitoSub: 'img-approve-merch', email: 'img-approve-merch@example.com' });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);
      await seedHelpers.createMembership(db, adminUser.id, group.id, { role: 'foodie_group_admin' });

      // Upload cover image → get back dev fake URL
      const uploadRes = await request(app)
        .post('/api/v1/event-submissions/upload-cover')
        .set('Authorization', 'Bearer img-approve-merch')
        .field('merchant_id', m.id)
        .attach('file', Buffer.from('fake-img'), { filename: 'cover.jpg', contentType: 'image/jpeg' });
      expect(uploadRes.status).toBe(200);
      const coverUrl = uploadRes.body.cover_image_url;

      // Create submission including the URL in submission_data
      const createRes = await request(app)
        .post('/api/v1/event-submissions')
        .set('Authorization', 'Bearer img-approve-merch')
        .send({
          group_id: group.id,
          merchant_id: m.id,
          submission_data: validSubmissionData({ cover_image_url: coverUrl }),
        });
      expect(createRes.status).toBe(201);

      // Approve
      const approveRes = await request(app)
        .put(`/api/v1/event-submissions/${createRes.body.id}`)
        .set('Authorization', 'Bearer img-approve-admin')
        .send({ state: 'approved' });
      expect(approveRes.status).toBe(200);

      // Confirm image URL is on the live event
      expect(approveRes.body.event.coverImageUrl).toBe(coverUrl);
    });
  });

  // ─── 11. Coupon regression smoke check ───────────────────

  describe('coupon regression smoke check', () => {
    it('coupon submission still works alongside event routes', async () => {
      const couponRouter = (await import('../../../server/src/routes/couponSubmissions.js')).default;
      const couponApp = express();
      couponApp.use(express.json());
      couponApp.use('/api/v1/coupon-submissions', couponRouter);

      const group = await seedHelpers.createFoodieGroup(db);
      const merchantUser = await seedHelpers.createUser(db, {
        role: 'merchant',
        cognitoSub: 'coupon-regression-merch',
        email: 'coupon-regression@example.com',
      });
      const m = await seedHelpers.createMerchant(db, merchantUser.id);

      const res = await request(couponApp)
        .post('/api/v1/coupon-submissions')
        .set('Authorization', 'Bearer coupon-regression-merch')
        .send({
          group_id: group.id,
          merchant_id: m.id,
          submission_data: {
            title: 'Regression Coupon',
            description: 'Test',
            coupon_type: 'percent',
            discount_value: 10,
            valid_from: new Date().toISOString(),
            expires_at: new Date(Date.now() + 86400000).toISOString(),
            locked: true,
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.state).toBe('pending');
    });
  });
});
