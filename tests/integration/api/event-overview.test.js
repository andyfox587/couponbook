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

describe('Event Overview APIs', () => {
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

  // ─── GET /api/v1/groups/:groupId/admin/overview (event counts) ───

  describe('GET /api/v1/groups/:groupId/admin/overview', () => {
    it('includes event and eventSubmission counts alongside coupon counts', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'eo-admin', role: 'foodie_group_admin' });
      const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'eo-merchant', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Event Overview Group' });
      const m = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'EO Merchant' });

      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });

      await seedHelpers.createEvent(db, group.id, m.id, { name: 'Published 1' });
      await seedHelpers.createEvent(db, group.id, m.id, { name: 'Published 2' });

      await seedHelpers.createEventSubmission(db, group.id, m.id, { state: 'pending' });
      await seedHelpers.createEventSubmission(db, group.id, m.id, { state: 'approved' });
      await seedHelpers.createEventSubmission(db, group.id, m.id, { state: 'rejected' });
      await seedHelpers.createEventSubmission(db, group.id, m.id, { state: 'rejected' });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/admin/overview`)
        .set('Authorization', 'Bearer eo-admin');

      expect(res.status).toBe(200);
      expect(res.body.counts.events).toEqual({ published: 2 });
      expect(res.body.counts.eventSubmissions).toEqual({ pending: 1, approved: 1, rejected: 2 });
      expect(res.body.counts.coupons).toBeDefined();
      expect(res.body.counts.purchases).toBeDefined();
    }, TEST_TIMEOUT_MS);

    it('returns zero event counts when no events exist', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'eo-empty-admin', role: 'foodie_group_admin' });
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/admin/overview`)
        .set('Authorization', 'Bearer eo-empty-admin');

      expect(res.status).toBe(200);
      expect(res.body.counts.events).toEqual({ published: 0 });
      expect(res.body.counts.eventSubmissions).toEqual({ pending: 0, approved: 0, rejected: 0 });
    }, TEST_TIMEOUT_MS);
  });

  // ─── GET /api/v1/groups/:groupId/event-overview ──────────────────

  describe('GET /api/v1/groups/:groupId/event-overview', () => {
    it('returns rsvpsLast30Days, topEvent and upcomingPublishedEvents for a managed group', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'evov-admin', role: 'foodie_group_admin' });
      const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'evov-merchant', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'RSVP Group' });
      const m = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'RSVP Merchant' });
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });

      const futureEvent = await seedHelpers.createEvent(db, group.id, m.id, {
        name: 'Big Future Event',
        startDatetime: new Date(Date.now() + 7 * 86400000).toISOString(),
      });

      const rsvpUser1 = await seedHelpers.createUser(db, { email: 'r1@test.com' });
      const rsvpUser2 = await seedHelpers.createUser(db, { email: 'r2@test.com' });

      await seedHelpers.createEventRsvp(db, futureEvent.id, { userId: rsvpUser1.id, status: 'going' });
      await seedHelpers.createEventRsvp(db, futureEvent.id, { userId: rsvpUser2.id, status: 'going' });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/event-overview`)
        .set('Authorization', 'Bearer evov-admin');

      expect(res.status).toBe(200);
      expect(res.body.rsvpsLast30Days).toBe(2);
      expect(res.body.topEvent).toBeDefined();
      expect(res.body.topEvent.eventName).toBe('Big Future Event');
      expect(res.body.topEvent.rsvps).toBe(2);
      expect(res.body.upcomingPublishedEvents).toBeGreaterThanOrEqual(1);
    }, TEST_TIMEOUT_MS);

    it('returns zero and null when no RSVPs exist', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'evov-empty-admin', role: 'foodie_group_admin' });
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/event-overview`)
        .set('Authorization', 'Bearer evov-empty-admin');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        rsvpsLast30Days: 0,
        topEvent: null,
        upcomingPublishedEvents: 0,
      });
    }, TEST_TIMEOUT_MS);

    it('only counts RSVPs for the requested group', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'evov-iso-admin', role: 'foodie_group_admin' });
      const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'evov-iso-merchant', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db, { name: 'Isolated Group' });
      const otherGroup = await seedHelpers.createFoodieGroup(db, { name: 'Other Group' });
      const m = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'Iso Merchant' });
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });

      const myEvent = await seedHelpers.createEvent(db, group.id, m.id, { name: 'My Event' });
      const otherEvent = await seedHelpers.createEvent(db, otherGroup.id, m.id, { name: 'Other Event' });

      const u1 = await seedHelpers.createUser(db, { email: 'iso1@test.com' });
      const u2 = await seedHelpers.createUser(db, { email: 'iso2@test.com' });

      await seedHelpers.createEventRsvp(db, myEvent.id, { userId: u1.id, status: 'going' });
      await seedHelpers.createEventRsvp(db, otherEvent.id, { userId: u2.id, status: 'going' });

      const res = await request(app)
        .get(`/api/v1/groups/${group.id}/event-overview`)
        .set('Authorization', 'Bearer evov-iso-admin');

      expect(res.status).toBe(200);
      expect(res.body.rsvpsLast30Days).toBe(1);
    }, TEST_TIMEOUT_MS);

    it('rejects unauthenticated and unauthorized callers', async () => {
      const groupAdmin = await seedHelpers.createUser(db, { cognitoSub: 'evov-auth-admin', role: 'foodie_group_admin' });
      const merchantUser = await seedHelpers.createUser(db, { cognitoSub: 'evov-auth-merch', role: 'merchant' });
      const group = await seedHelpers.createFoodieGroup(db);
      await seedHelpers.createMembership(db, groupAdmin.id, group.id, { role: 'foodie_group_admin' });

      const unauthenticated = await request(app).get(`/api/v1/groups/${group.id}/event-overview`);
      expect(unauthenticated.status).toBe(401);

      const forbidden = await request(app)
        .get(`/api/v1/groups/${group.id}/event-overview`)
        .set('Authorization', 'Bearer evov-auth-merch');
      expect(forbidden.status).toBe(403);

      const allowed = await request(app)
        .get(`/api/v1/groups/${group.id}/event-overview`)
        .set('Authorization', 'Bearer evov-auth-admin');
      expect(allowed.status).toBe(200);
    }, TEST_TIMEOUT_MS);
  });
});
