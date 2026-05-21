import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';

const HOOK_TIMEOUT_MS = 60000;

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
  stripe: { refunds: { create: vi.fn() } },
}));

function makeApp(eventsRouter) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/events', eventsRouter);
  return app;
}

describe('GET /api/v1/events/:id/rsvp/:rsvpId/calendar.ics', () => {
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

  async function seedScenario() {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'merchant-owner-ics' });
    const attendee = await seedHelpers.createUser(db, { cognitoSub: 'attendee-ics' });
    const stranger = await seedHelpers.createUser(db, { cognitoSub: 'stranger-ics' });
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);
    const eventRow = await seedHelpers.createEvent(db, group.id, merchant.id, {
      name: 'Calendar Test Event',
      location: 'Test Venue',
    });
    const rsvp = await seedHelpers.createEventRsvp(db, eventRow.id, {
      userId: attendee.id,
      attendees: 1,
      status: 'going',
      guestEmail: 'attendee@example.com',
      guestName: 'Attendee Person',
    });
    return { owner, attendee, stranger, eventRow, rsvp };
  }

  it('serves the .ics body when the signed-in user owns the RSVP', async () => {
    const { attendee, eventRow, rsvp } = await seedScenario();

    const res = await request(app)
      .get(`/api/v1/events/${eventRow.id}/rsvp/${rsvp.id}/calendar.ics`)
      .set('Authorization', `Bearer ${attendee.cognitoSub}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/calendar/);
    expect(res.headers['content-type']).toMatch(/method=REQUEST/);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toContain('.ics');
    expect(res.text).toContain('BEGIN:VCALENDAR');
    expect(res.text).toContain(`UID:event-${eventRow.id}-rsvp-${rsvp.id}@vivaspot.app`);
  });

  it('returns 403 when the signed-in user does not own the RSVP', async () => {
    const { stranger, eventRow, rsvp } = await seedScenario();

    const res = await request(app)
      .get(`/api/v1/events/${eventRow.id}/rsvp/${rsvp.id}/calendar.ics`)
      .set('Authorization', `Bearer ${stranger.cognitoSub}`);

    expect(res.status).toBe(403);
  });

  it('returns 401 when no session is provided', async () => {
    const { eventRow, rsvp } = await seedScenario();

    const res = await request(app)
      .get(`/api/v1/events/${eventRow.id}/rsvp/${rsvp.id}/calendar.ics`);

    expect(res.status).toBe(401);
  });

  it('returns 404 when the RSVP does not exist', async () => {
    const { attendee, eventRow } = await seedScenario();

    const res = await request(app)
      .get(`/api/v1/events/${eventRow.id}/rsvp/missing-rsvp/calendar.ics`)
      .set('Authorization', `Bearer ${attendee.cognitoSub}`);

    expect(res.status).toBe(404);
  });
});
