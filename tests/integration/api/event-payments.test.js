import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDb, resetTestDb, seedHelpers } from '../../helpers/db.js';
import * as schema from '../../../drizzle/schema';

const HOOK_TIMEOUT_MS = 60000;
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

const stripeMock = {
  paymentIntents: {
    create: vi.fn().mockResolvedValue({
      id: 'pi_test_event_ticket',
      client_secret: 'pi_test_event_ticket_secret',
      customer: 'cus_test_customer',
    }),
  },
  checkout: {
    sessions: {
      create: vi.fn().mockResolvedValue({
        id: 'cs_test_event_ticket',
        url: 'https://checkout.stripe.com/test/cs_test_event_ticket',
        payment_intent: null,
        customer: null,
        payment_status: 'unpaid',
      }),
    },
  },
  refunds: {
    create: vi.fn().mockResolvedValue({
      id: 're_test_event_refund',
      status: 'succeeded',
      charge: 'ch_test_event_ticket',
    }),
  },
  webhooks: {
    constructEvent: vi.fn().mockImplementation((body) => JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : String(body))),
  },
};

vi.mock('../../../server/src/config/stripe.js', () => ({
  stripe: stripeMock,
}));

function makeApp(eventsRouter) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/events', eventsRouter);
  return app;
}

describe('Paid event payments', () => {
  let db;
  let app;
  let handleWebhook;

  beforeAll(async () => {
    process.env.ENABLE_PAID_EVENT_PAYMENTS = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    db = await getTestDb();
    const eventsRouter = (await import('../../../server/src/routes/events.js')).default;
    handleWebhook = (await import('../../../server/src/stripeWebhookHandler.js')).handleWebhook;
    app = makeApp(eventsRouter);
  }, HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await closeTestDb();
  }, HOOK_TIMEOUT_MS);

  beforeEach(async () => {
    stripeMock.paymentIntents.create.mockClear();
    stripeMock.checkout.sessions.create.mockClear();
    await resetTestDb();
  }, HOOK_TIMEOUT_MS);

  it('returns a Checkout Session URL for paid RSVPs and waits for webhook confirmation', async () => {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'paid-event-owner' });
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);
    await seedHelpers.createMerchantBillingProfile(db, merchant.id);
    const evt = await seedHelpers.createEvent(db, group.id, merchant.id, {
      isFree: false,
      priceCents: 2500,
      capacity: 10,
      maxTicketsPerGuest: 2,
    });

    const res = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .send({
        attendees: 2,
        guest_name: 'Guest',
        guest_email: 'guest@example.com',
        refund_policy_accepted: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.requiresPayment).toBe(true);
    expect(res.body.amountCents).toBe(5000);
    expect(res.body.checkoutUrl).toBe('https://checkout.stripe.com/test/cs_test_event_ticket');
    expect(res.body.checkoutSessionId).toBe('cs_test_event_ticket');
    expect(res.body.clientSecret).toBeUndefined();

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const sessionArgs = stripeMock.checkout.sessions.create.mock.calls[0][0];
    expect(sessionArgs.mode).toBe('payment');
    expect(sessionArgs.customer_email).toBe('guest@example.com');
    expect(sessionArgs.success_url).toContain('checkout=success');
    expect(sessionArgs.cancel_url).toContain('checkout=canceled');
    expect(sessionArgs.metadata.payment_type).toBe('event_ticket');

    const rsvpsBeforeWebhook = await db.select().from(schema.eventRsvp).where(eq(schema.eventRsvp.eventId, evt.id));
    expect(rsvpsBeforeWebhook).toHaveLength(0);

    const [order] = await db.select().from(schema.eventOrder).where(eq(schema.eventOrder.id, res.body.orderId));
    expect(order.status).toBe('pending_payment');
    expect(order.quantity).toBe(2);
    expect(order.amountCents).toBe(5000);
    expect(order.stripeCheckoutSessionId).toBe('cs_test_event_ticket');

    const webhookResult = await handleWebhook(JSON.stringify({
      id: 'evt_cs_completed',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_event_ticket',
          payment_status: 'paid',
          payment_intent: 'pi_test_event_ticket',
          customer: 'cus_test_customer',
          metadata: {
            payment_type: 'event_ticket',
            event_order_id: order.id,
          },
        },
      },
    }), 'sig');

    expect(webhookResult.status).toBe(200);

    const [confirmedOrder] = await db.select().from(schema.eventOrder).where(eq(schema.eventOrder.id, order.id));
    expect(confirmedOrder.status).toBe('paid');
    expect(confirmedOrder.rsvpId).toBeTruthy();
    expect(confirmedOrder.stripePaymentIntentId).toBe('pi_test_event_ticket');

    const [rsvp] = await db.select().from(schema.eventRsvp).where(eq(schema.eventRsvp.id, confirmedOrder.rsvpId));
    expect(rsvp.status).toBe('going');
    expect(rsvp.attendees).toBe(2);
  }, TEST_TIMEOUT_MS);

  it('still confirms RSVPs via the legacy payment_intent.succeeded webhook', async () => {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'legacy-pi-owner' });
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);
    await seedHelpers.createMerchantBillingProfile(db, merchant.id);
    const evt = await seedHelpers.createEvent(db, group.id, merchant.id, {
      isFree: false,
      priceCents: 2500,
      capacity: 5,
    });

    const order = await seedHelpers.createEventOrder(db, evt, {
      quantity: 1,
      guestEmail: 'legacy@example.com',
      amountCents: 2500,
      stripePaymentIntentId: 'pi_legacy_event_ticket',
      status: 'pending_payment',
    });

    const webhookResult = await handleWebhook(JSON.stringify({
      id: 'evt_pi_succeeded_legacy',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_legacy_event_ticket',
          status: 'succeeded',
          latest_charge: 'ch_legacy_event_ticket',
          customer: 'cus_legacy_customer',
          metadata: {
            payment_type: 'event_ticket',
            event_order_id: order.id,
          },
        },
      },
    }), 'sig');

    expect(webhookResult.status).toBe(200);

    const [confirmedOrder] = await db.select().from(schema.eventOrder).where(eq(schema.eventOrder.id, order.id));
    expect(confirmedOrder.status).toBe('paid');
    expect(confirmedOrder.rsvpId).toBeTruthy();
    expect(confirmedOrder.stripeChargeId).toBe('ch_legacy_event_ticket');

    const [rsvp] = await db.select().from(schema.eventRsvp).where(eq(schema.eventRsvp.id, confirmedOrder.rsvpId));
    expect(rsvp.status).toBe('going');
  }, TEST_TIMEOUT_MS);

  it('blocks duplicate active paid ticket orders before webhook confirmation', async () => {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'duplicate-paid-owner' });
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);
    await seedHelpers.createMerchantBillingProfile(db, merchant.id);
    const evt = await seedHelpers.createEvent(db, group.id, merchant.id, {
      isFree: false,
      priceCents: 2500,
      capacity: 10,
    });

    const payload = {
      attendees: 1,
      guest_name: 'Guest',
      guest_email: 'guest@example.com',
      refund_policy_accepted: true,
    };

    const first = await request(app).post(`/api/v1/events/${evt.id}/rsvp`).send(payload);
    expect(first.status).toBe(201);

    const duplicate = await request(app).post(`/api/v1/events/${evt.id}/rsvp`).send(payload);
    expect(duplicate.status).toBe(409);

    const orders = await db.select().from(schema.eventOrder).where(eq(schema.eventOrder.eventId, evt.id));
    expect(orders).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it('does not create unpaid waitlist RSVPs for sold-out paid events', async () => {
    const owner = await seedHelpers.createUser(db, { cognitoSub: 'sold-out-paid-owner' });
    const group = await seedHelpers.createFoodieGroup(db);
    const merchant = await seedHelpers.createMerchant(db, owner.id);
    await seedHelpers.createMerchantBillingProfile(db, merchant.id);
    const evt = await seedHelpers.createEvent(db, group.id, merchant.id, {
      isFree: false,
      priceCents: 2500,
      capacity: 1,
    });

    const first = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .send({
        attendees: 1,
        guest_name: 'First Guest',
        guest_email: 'first@example.com',
        refund_policy_accepted: true,
      });
    expect(first.status).toBe(201);

    const soldOut = await request(app)
      .post(`/api/v1/events/${evt.id}/rsvp`)
      .send({
        attendees: 1,
        guest_name: 'Second Guest',
        guest_email: 'second@example.com',
        refund_policy_accepted: true,
      });
    expect(soldOut.status).toBe(409);

    const rsvps = await db.select().from(schema.eventRsvp).where(eq(schema.eventRsvp.eventId, evt.id));
    expect(rsvps).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});
