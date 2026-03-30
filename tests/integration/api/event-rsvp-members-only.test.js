import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
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
  optional: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) req.user = { sub: token, email: `${token}@example.com` };
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

function makeApp(eventsRouter) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/events', eventsRouter);
  return app;
}

describe('Event RSVP – Members-Only Gating', () => {
  let db;
  let app;

  beforeAll(async () => {
    db = await getTestDb();
    const eventsRouter = (await import('../../../server/src/routes/events.js')).default;
    app = makeApp(eventsRouter);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await closeTestDb();
  }, HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    await resetTestDb();
  }, HOOK_TIMEOUT_MS);

  // ─── Public events ────────────────────────────────────────────

  it('allows anonymous RSVP for public events', async () => {
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-pub-merchant' });
    const group = await seedHelpers.createFoodieGroup(db);
    const m = await seedHelpers.createMerchant(db, merchantOwner.id);
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { visibility: 'public' });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .send({ guest_name: 'Test', guest_email: 'test@example.com' });

    if (res.status === 500) console.error('500 body:', res.body, res.text);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('going');
  }, TEST_TIMEOUT_MS);

  it('allows authenticated RSVP for public events', async () => {
    const customer = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-pub-customer' });
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-pub-merchant2' });
    const group = await seedHelpers.createFoodieGroup(db);
    const m = await seedHelpers.createMerchant(db, merchantOwner.id);
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { visibility: 'public' });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .set('Authorization', 'Bearer rsvp-pub-customer')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(customer.id);
  }, TEST_TIMEOUT_MS);

  // ─── Members-only: unauthenticated ────────────────────────────

  it('rejects unauthenticated RSVP for members-only events with 401', async () => {
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-merchant' });
    const group = await seedHelpers.createFoodieGroup(db);
    const m = await seedHelpers.createMerchant(db, merchantOwner.id);
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { visibility: 'members_only' });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .send({ guest_name: 'Anon', guest_email: 'anon@test.com' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('signed in');
  }, TEST_TIMEOUT_MS);

  // ─── Members-only: authenticated but no purchase ──────────────

  it('rejects authenticated RSVP without coupon book purchase with 403', async () => {
    const customer = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-nopurchase' });
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-merchant2' });
    const group = await seedHelpers.createFoodieGroup(db);
    const m = await seedHelpers.createMerchant(db, merchantOwner.id);
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { visibility: 'members_only' });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .set('Authorization', 'Bearer rsvp-mo-nopurchase')
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('purchase');
  }, TEST_TIMEOUT_MS);

  // ─── Members-only: authenticated with valid purchase ──────────

  it('allows RSVP for members-only event when user has coupon book purchase', async () => {
    const customer = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-member' });
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-merchant3' });
    const group = await seedHelpers.createFoodieGroup(db);
    const m = await seedHelpers.createMerchant(db, merchantOwner.id);
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { visibility: 'members_only' });

    await seedHelpers.createPurchase(db, customer.id, group.id, { status: 'paid' });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .set('Authorization', 'Bearer rsvp-mo-member')
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('going');
    expect(res.body.userId).toBe(customer.id);
  }, TEST_TIMEOUT_MS);

  // ─── Members-only: super admin bypass ─────────────────────────

  it('allows super admin to RSVP for members-only events without purchase', async () => {
    const admin = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-admin', role: 'super_admin' });
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-merchant4' });
    const group = await seedHelpers.createFoodieGroup(db);
    const m = await seedHelpers.createMerchant(db, merchantOwner.id);
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { visibility: 'members_only' });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .set('Authorization', 'Bearer rsvp-mo-admin')
      .send({});

    expect(res.status).toBe(201);
  }, TEST_TIMEOUT_MS);

  // ─── Members-only: expired/refunded purchase should not grant access ──

  it('rejects RSVP when purchase is refunded', async () => {
    const customer = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-refunded' });
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-mo-merchant5' });
    const group = await seedHelpers.createFoodieGroup(db);
    const m = await seedHelpers.createMerchant(db, merchantOwner.id);
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { visibility: 'members_only' });

    await seedHelpers.createPurchase(db, customer.id, group.id, { status: 'refunded' });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .set('Authorization', 'Bearer rsvp-mo-refunded')
      .send({});

    expect(res.status).toBe(403);
  }, TEST_TIMEOUT_MS);
});
