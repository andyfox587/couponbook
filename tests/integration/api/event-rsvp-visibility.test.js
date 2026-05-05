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
  optional: () => (req, res, next) => {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (token) req.user = { sub: token, email: `${token}@example.com` };
    return next();
  },
}));

vi.mock('../../../server/src/config/stripe.js', () => ({
  stripe: {
    refunds: { create: vi.fn() },
    paymentIntents: { create: vi.fn(), retrieve: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    webhooks: { constructEvent: vi.fn() },
  },
}));

describe('Registered RSVP visibility APIs', () => {
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

  async function seedEventSetup() {
    const merchantOwner = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-owner', role: 'merchant' });
    const customer = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-customer', role: 'customer' });
    const otherCustomer = await seedHelpers.createUser(db, { cognitoSub: 'rsvp-other', role: 'customer' });
    const group = await seedHelpers.createFoodieGroup(db, { name: 'RSVP Visibility Group' });
    const m = await seedHelpers.createMerchant(db, merchantOwner.id, { name: 'RSVP Bistro' });
    return { customer, otherCustomer, group, merchant: m };
  }

  it('lists only the signed-in customer active upcoming RSVPs', async () => {
    const { customer, otherCustomer, group, merchant: m } = await seedEventSetup();
    const futureEvent = await seedHelpers.createEvent(db, group.id, m.id, {
      name: 'Future Dinner',
      startDatetime: new Date(Date.now() + 5 * 86400000).toISOString(),
    });
    const waitlistEvent = await seedHelpers.createEvent(db, group.id, m.id, {
      name: 'Waitlist Dinner',
      startDatetime: new Date(Date.now() + 6 * 86400000).toISOString(),
    });
    const pastEvent = await seedHelpers.createEvent(db, group.id, m.id, {
      name: 'Past Dinner',
      startDatetime: new Date(Date.now() - 5 * 86400000).toISOString(),
      endDatetime: new Date(Date.now() - 4 * 86400000).toISOString(),
    });

    await seedHelpers.createEventRsvp(db, futureEvent.id, { userId: customer.id, status: 'going', attendees: 2 });
    await seedHelpers.createEventRsvp(db, waitlistEvent.id, { userId: customer.id, status: 'waitlist' });
    await seedHelpers.createEventRsvp(db, futureEvent.id, { userId: otherCustomer.id, status: 'going' });
    await seedHelpers.createEventRsvp(db, pastEvent.id, { userId: customer.id, status: 'going' });
    await seedHelpers.createEventRsvp(db, futureEvent.id, { guestName: 'Guest User', guestEmail: 'guest@example.com' });

    const res = await request(app)
      .get('/api/v1/events/my-rsvps')
      .set('Authorization', 'Bearer rsvp-customer');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((row) => row.eventName)).toEqual(['Future Dinner', 'Waitlist Dinner']);
    expect(res.body[0]).toMatchObject({
      eventId: futureEvent.id,
      attendees: 2,
      status: 'going',
      merchantName: 'RSVP Bistro',
    });
  }, TEST_TIMEOUT_MS);

  it('returns the signed-in customer RSVP for one event or null', async () => {
    const { customer, otherCustomer, group, merchant: m } = await seedEventSetup();
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { name: 'Single Event' });
    const rsvp = await seedHelpers.createEventRsvp(db, evt.id, { userId: customer.id, status: 'checked_in' });
    await seedHelpers.createEventRsvp(db, evt.id, { userId: otherCustomer.id, status: 'going' });

    const found = await request(app)
      .get(`/api/v1/events/${evt.id}/my-rsvp`)
      .set('Authorization', 'Bearer rsvp-customer');

    expect(found.status).toBe(200);
    expect(found.body).toMatchObject({
      id: rsvp.id,
      eventId: evt.id,
      status: 'checked_in',
      attendees: 1,
    });

    const missing = await request(app)
      .get(`/api/v1/events/${evt.id}/my-rsvp`)
      .set('Authorization', 'Bearer rsvp-owner');

    expect(missing.status).toBe(200);
    expect(missing.body).toBeNull();
  }, TEST_TIMEOUT_MS);

  it('allows authenticated cancellation from a listed RSVP id', async () => {
    const { customer, group, merchant: m } = await seedEventSetup();
    const evt = await seedHelpers.createEvent(db, group.id, m.id, { name: 'Cancelable Event' });
    const rsvp = await seedHelpers.createEventRsvp(db, evt.id, { userId: customer.id, status: 'going' });

    const cancel = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp/${rsvp.id}/cancel`)
      .set('Authorization', 'Bearer rsvp-customer')
      .send({});

    expect(cancel.status).toBe(200);
    expect(cancel.body.cancelled).toBe(true);

    const list = await request(app)
      .get('/api/v1/events/my-rsvps')
      .set('Authorization', 'Bearer rsvp-customer');

    expect(list.status).toBe(200);
    expect(list.body).toEqual([]);
  }, TEST_TIMEOUT_MS);
});
