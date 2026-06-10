import crypto from 'node:crypto';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '../db.js';
import {
  event,
  eventCredit,
  eventGuestToken,
  eventOrder,
  eventRefund,
  eventRsvp,
  merchantBillingProfile,
} from '../schema.js';
import { hasEntitlement } from '../authz/index.js';
import { stripe } from '../config/stripe.js';
import { sendNotificationWebhook } from './notificationService.js';
import { buildEventIcs, buildEventIcsUid } from '../utils/icsBuilder.js';
import { serverBaseUrl } from '../utils/appUrl.js';

export const EVENT_REFUND_POLICY_VERSION = 'event-refunds-v2';
export const PAID_EVENT_TERMS_VERSION = 'paid-events-v1';

export function paidEventPaymentsEnabled() {
  return process.env.ENABLE_PAID_EVENT_PAYMENTS === 'true';
}

function nowIso() {
  return new Date().toISOString();
}


function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function makeGuestToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createGuestToken({
  database = defaultDb,
  eventId,
  eventOrderId = null,
  eventRsvpId = null,
  purpose,
  expiresAt,
  metadata = null,
}) {
  const rawToken = makeGuestToken();
  const [tokenRow] = await database
    .insert(eventGuestToken)
    .values({
      eventId,
      eventOrderId,
      eventRsvpId,
      purpose,
      tokenHash: hashToken(rawToken),
      expiresAt,
      metadata,
    })
    .returning();

  return { rawToken, tokenRow };
}

export async function findValidGuestToken({ database = defaultDb, rawToken, purpose }) {
  if (!rawToken) return null;
  const [tokenRow] = await database
    .select()
    .from(eventGuestToken)
    .where(
      and(
        eq(eventGuestToken.tokenHash, hashToken(rawToken)),
        eq(eventGuestToken.purpose, purpose),
        isNull(eventGuestToken.usedAt),
        isNull(eventGuestToken.revokedAt),
        sql`${eventGuestToken.expiresAt} > ${nowIso()}`,
      ),
    )
    .limit(1);

  return tokenRow || null;
}

export async function markGuestTokenUsed({ database = defaultDb, tokenId }) {
  await database
    .update(eventGuestToken)
    .set({ usedAt: nowIso() })
    .where(eq(eventGuestToken.id, tokenId));
}

export async function assertMerchantPaidEventReady({ database = defaultDb, merchantId }) {
  const [profile] = await database
    .select()
    .from(merchantBillingProfile)
    .where(eq(merchantBillingProfile.merchantId, merchantId))
    .limit(1);

  const ready = !!profile
    && profile.paidEventsEnabled
    && profile.payoutDestinationVerified
    && profile.backupChargeMethodReady
    && !!profile.paidEventTermsAcceptedAt;

  if (!ready) {
    const error = new Error('Merchant billing setup is required before paid event ticketing can be enabled');
    error.status = 409;
    error.code = 'MERCHANT_BILLING_NOT_READY';
    throw error;
  }

  return profile;
}

export async function resolveTicketPrice({ database = defaultDb, eventRow, dbUser = null }) {
  if (eventRow.isFree) {
    return { amountCents: 0, currency: 'usd', pricingBasis: 'free' };
  }

  if (dbUser && eventRow.membersOnlyPriceCents != null) {
    const entitled = await hasEntitlement(dbUser, eventRow.groupId);
    if (entitled) {
      return {
        amountCents: Number(eventRow.membersOnlyPriceCents),
        currency: 'usd',
        pricingBasis: 'members_only',
      };
    }
  }

  return {
    amountCents: Number(eventRow.priceCents || 0),
    currency: 'usd',
    pricingBasis: 'standard',
  };
}

/**
 * Computes the concrete cancellation deadlines for an event so emails can
 * say "cancel by <date>" instead of restating the abstract policy windows.
 */
export function buildRefundDeadlines(eventStartDatetime) {
  const eventStart = new Date(eventStartDatetime);
  if (Number.isNaN(eventStart.getTime())) return null;
  return {
    fullRefundUntil: new Date(eventStart.getTime() - 168 * 60 * 60 * 1000).toISOString(),
    halfRefundUntil: new Date(eventStart.getTime() - 72 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Refund policy v2 (April 2026):
 *   7+ days out   → 100% cash refund, no credit needed
 *   3–7 days out  → 50% cash refund, OR 100% event credit in lieu of cash
 *   under 72 hrs  → no cash refund, 50% event credit auto-offered
 *
 * Event credits are valid 12 months, same-merchant only, no cash value.
 * The credit fields describe what MAY be issued; issuance is decided by the
 * cancellation flow (guest's compensation choice in the 3–7 day window).
 */
export function calculateRefundQuote(eventStartDatetime, paidAmountCents, now = new Date()) {
  const eventStart = new Date(eventStartDatetime);
  const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (60 * 60 * 1000);

  if (hoursUntilEvent >= 168) {
    return {
      amountCents: paidAmountCents,
      policyWindow: 'full_refund_7_plus_days',
      refundPercent: 100,
      creditPercent: 0,
      creditAmountCents: 0,
      reason: '7+ days before event',
    };
  }

  if (hoursUntilEvent >= 72) {
    return {
      amountCents: Math.floor(paidAmountCents * 0.5),
      policyWindow: 'half_refund_3_to_7_days',
      refundPercent: 50,
      creditPercent: 100,
      creditAmountCents: paidAmountCents,
      reason: '3-7 days before event',
    };
  }

  return {
    amountCents: 0,
    policyWindow: 'no_refund_under_72_hours',
    refundPercent: 0,
    creditPercent: 50,
    creditAmountCents: Math.floor(paidAmountCents * 0.5),
    reason: 'Less than 72 hours before event',
  };
}

export async function getConfirmedSeatCount({ database = defaultDb, eventId }) {
  const rows = await database
    .select({ attendees: eventRsvp.attendees })
    .from(eventRsvp)
    .where(
      and(
        eq(eventRsvp.eventId, eventId),
        sql`${eventRsvp.status}::text IN ('going', 'checked_in')`,
        isNull(eventRsvp.deletedAt),
      ),
    );
  return rows.reduce((sum, row) => sum + Number(row.attendees || 0), 0);
}

/**
 * Finds the guest's best active credit for this merchant that fully covers
 * the given total. v1 keeps redemption simple: a credit is only auto-applied
 * when it covers the entire ticket total (no partial Stripe charges yet).
 * Credits expiring soonest are preferred.
 */
export async function findApplicableEventCredit({
  database = defaultDb,
  merchantId,
  userId = null,
  guestEmail = null,
  minAmountCents,
}) {
  if (!userId && !guestEmail) return null;

  const ownerClauses = [];
  if (userId) ownerClauses.push(eq(eventCredit.userId, userId));
  if (guestEmail) ownerClauses.push(eq(eventCredit.guestEmail, guestEmail));

  const [credit] = await database
    .select()
    .from(eventCredit)
    .where(
      and(
        eq(eventCredit.merchantId, merchantId),
        eq(eventCredit.status, 'active'),
        sql`${eventCredit.expiresAt} > ${nowIso()}`,
        sql`${eventCredit.amountCents} >= ${minAmountCents}`,
        or(...ownerClauses),
      ),
    )
    .orderBy(asc(eventCredit.expiresAt))
    .limit(1);

  return credit || null;
}

/**
 * Consumes `applyCents` from a credit with optimistic concurrency (the
 * status+balance guard in the WHERE makes a double-spend lose the race and
 * return null). A fully-spent credit flips to 'redeemed'; a partially spent
 * one keeps the remainder active.
 */
export async function consumeEventCredit({
  database = defaultDb,
  credit,
  applyCents,
  orderId,
}) {
  const now = nowIso();
  const fullySpent = applyCents >= credit.amountCents;
  const [consumed] = await database
    .update(eventCredit)
    .set(
      fullySpent
        ? { status: 'redeemed', redeemedAt: now, redeemedEventOrderId: orderId, updatedAt: now }
        : {
            amountCents: credit.amountCents - applyCents,
            updatedAt: now,
            metadata: {
              ...(credit.metadata || {}),
              lastPartialRedemption: { orderId, applyCents, at: now },
            },
          },
    )
    .where(
      and(
        eq(eventCredit.id, credit.id),
        eq(eventCredit.status, 'active'),
        eq(eventCredit.amountCents, credit.amountCents),
      ),
    )
    .returning();
  return consumed || null;
}

export async function createPaidEventOrder({
  database = defaultDb,
  eventRow,
  dbUser = null,
  attendees,
  guestName = null,
  guestEmail = null,
  refundPolicyAcknowledgedAt,
  baseUrl,
}) {
  if (!paidEventPaymentsEnabled()) {
    const error = new Error('Paid event payments are not enabled');
    error.status = 503;
    error.code = 'PAID_EVENTS_DISABLED';
    throw error;
  }

  if (!stripe) {
    const error = new Error('Stripe is not configured');
    error.status = 503;
    error.code = 'STRIPE_NOT_CONFIGURED';
    throw error;
  }

  if (!refundPolicyAcknowledgedAt) {
    const error = new Error('Refund policy acknowledgment is required for paid events');
    error.status = 400;
    error.code = 'REFUND_POLICY_REQUIRED';
    throw error;
  }

  if (process.env.SKIP_PAID_EVENT_MERCHANT_READINESS !== 'true') {
    await assertMerchantPaidEventReady({ database, merchantId: eventRow.merchantId });
  }

  const quantity = Number(attendees || 1);
  const price = await resolveTicketPrice({ database, eventRow, dbUser });
  if (price.amountCents <= 0) {
    const error = new Error('This event does not require payment');
    error.status = 400;
    error.code = 'EVENT_NOT_PAID';
    throw error;
  }

  const amountCents = price.amountCents * quantity;
  const now = nowIso();
  const customerEmail = guestEmail || dbUser?.email || null;
  const [order] = await database
    .insert(eventOrder)
    .values({
      eventId: eventRow.id,
      userId: dbUser?.id || null,
      groupId: eventRow.groupId,
      merchantId: eventRow.merchantId,
      quantity,
      guestName: guestName || null,
      guestEmail: customerEmail,
      emailConfirmationStatus: dbUser ? 'not_required' : 'confirmed',
      emailConfirmedAt: dbUser ? null : now,
      amountCents,
      currency: price.currency,
      pricingBasis: price.pricingBasis,
      status: 'pending_payment',
      refundPolicyVersion: EVENT_REFUND_POLICY_VERSION,
      refundPolicyAcknowledgedAt,
      metadata: {
        createdVia: 'event-rsvp-checkout-session',
        unitAmountCents: price.amountCents,
      },
    })
    .returning();

  // Event-credit redemption: when an active same-merchant credit covers the
  // whole total, consume it and confirm the order with no Stripe charge.
  const applicableCredit = await findApplicableEventCredit({
    database,
    merchantId: eventRow.merchantId,
    userId: dbUser?.id || null,
    guestEmail: customerEmail,
    minAmountCents: amountCents,
  });
  if (applicableCredit) {
    const consumed = await consumeEventCredit({
      database,
      credit: applicableCredit,
      applyCents: amountCents,
      orderId: order.id,
    });
    if (consumed) {
      await database
        .update(eventOrder)
        .set({
          pricingBasis: 'event_credit',
          metadata: {
            ...(order.metadata || {}),
            creditApplied: { creditId: applicableCredit.id, amountCents },
          },
          updatedAt: nowIso(),
        })
        .where(eq(eventOrder.id, order.id));

      const confirmedOrder = await finalizeConfirmedEventOrder({
        database,
        order: { ...order, pricingBasis: 'event_credit' },
        source: 'event_credit_redemption',
      });

      return {
        order: confirmedOrder,
        paidWithCredit: true,
        creditAppliedCents: amountCents,
        checkoutUrl: null,
        checkoutSessionId: null,
        amountCents,
        currency: price.currency,
      };
    }
    // Credit lost a concurrent race — fall through to the normal Stripe path.
  }

  try {
    const base = (baseUrl || serverBaseUrl()).replace(/\/$/, '');
    const eventPath = eventRow.slug ? `/e/${eventRow.slug}` : `/events/${eventRow.id}`;
    const successUrl = `${base}${eventPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${base}${eventPath}?checkout=canceled`;

    const metadata = {
      payment_type: 'event_ticket',
      event_order_id: order.id,
      event_id: eventRow.id,
      restaurant_id: eventRow.merchantId,
      merchant_id: eventRow.merchantId,
      group_id: eventRow.groupId,
      user_id: dbUser?.id || '',
      guest_email: customerEmail || '',
      event_date: new Date(eventRow.startDatetime).toISOString(),
      refund_policy_version: EVENT_REFUND_POLICY_VERSION,
      refund_policy_acknowledged_at: refundPolicyAcknowledgedAt,
    };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail || undefined,
      line_items: [
        {
          quantity,
          price_data: {
            currency: price.currency,
            unit_amount: price.amountCents,
            product_data: {
              name: eventRow.name || 'Event Ticket',
              ...(eventRow.description ? { description: String(eventRow.description).slice(0, 500) } : {}),
            },
          },
        },
      ],
      metadata,
      payment_intent_data: {
        receipt_email: customerEmail || undefined,
        statement_descriptor_suffix: makeStatementDescriptorSuffix(eventRow),
        metadata,
      },
    });

    const [updatedOrder] = await database
      .update(eventOrder)
      .set({
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : null,
        updatedAt: nowIso(),
      })
      .where(eq(eventOrder.id, order.id))
      .returning();

    return {
      order: updatedOrder,
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
      amountCents,
      currency: price.currency,
    };
  } catch (err) {
    await database
      .update(eventOrder)
      .set({
        status: 'payment_failed',
        metadata: {
          ...(order.metadata || {}),
          stripeCreateError: err.message,
        },
        updatedAt: nowIso(),
      })
      .where(eq(eventOrder.id, order.id));
    throw err;
  }
}

function makeStatementDescriptorSuffix(eventRow) {
  const merchantOrEvent = String(eventRow.name || 'EVENT')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, 13)
    .toUpperCase();
  return merchantOrEvent ? `${merchantOrEvent} EVENT`.slice(0, 22) : 'EVENT TICKET';
}

async function finalizeConfirmedEventOrder({
  database,
  order,
  paymentIntentId = null,
  latestChargeId = null,
  stripeCustomerId = null,
  source = 'unknown',
}) {
  if (order.status === 'paid' && order.rsvpId) {
    return order;
  }

  const [eventRow] = await database
    .select()
    .from(event)
    .where(eq(event.id, order.eventId))
    .limit(1);

  if (!eventRow) return order;

  const confirmedSeats = await getConfirmedSeatCount({ database, eventId: order.eventId });
  const remaining = eventRow.capacity > 0 ? eventRow.capacity - confirmedSeats : Infinity;

  if (remaining < order.quantity || eventRow.status !== 'published') {
    const [updated] = await database
      .update(eventOrder)
      .set({
        status: 'paid',
        stripePaymentIntentId: paymentIntentId || order.stripePaymentIntentId,
        stripeChargeId: latestChargeId || order.stripeChargeId,
        stripeCustomerId: stripeCustomerId || order.stripeCustomerId,
        metadata: {
          ...(order.metadata || {}),
          paidButUnconfirmedReason: eventRow.status !== 'published' ? 'event_not_published' : 'capacity_unavailable',
        },
        updatedAt: nowIso(),
      })
      .where(eq(eventOrder.id, order.id))
      .returning();
    return updated;
  }

  let rsvpId = order.rsvpId;
  if (!rsvpId) {
    const [rsvp] = await database
      .insert(eventRsvp)
      .values({
        eventId: order.eventId,
        userId: order.userId,
        attendees: order.quantity,
        status: 'going',
        guestName: order.guestName,
        guestEmail: order.guestEmail,
      })
      .returning();
    rsvpId = rsvp.id;
  } else {
    await database
      .update(eventRsvp)
      .set({
        status: 'going',
        waitlistPosition: null,
        deletedAt: null,
        updatedAt: nowIso(),
      })
      .where(eq(eventRsvp.id, rsvpId));
  }

  const [updatedOrder] = await database
    .update(eventOrder)
    .set({
      rsvpId,
      status: 'paid',
      stripePaymentIntentId: paymentIntentId || order.stripePaymentIntentId,
      stripeChargeId: latestChargeId || order.stripeChargeId,
      stripeCustomerId: stripeCustomerId || order.stripeCustomerId,
      updatedAt: nowIso(),
    })
    .where(eq(eventOrder.id, order.id))
    .returning();

  let guestCancellationToken = null;
  if (!order.userId && order.guestEmail) {
    const createdToken = await createGuestToken({
      database,
      eventId: order.eventId,
      eventOrderId: order.id,
      eventRsvpId: rsvpId,
      purpose: 'cancellation',
      expiresAt: new Date(eventRow.startDatetime).toISOString(),
      metadata: { createdVia: source },
    });
    guestCancellationToken = createdToken.rawToken;
  }

  await notifyEventRsvpConfirmed({
    order: updatedOrder,
    eventRow,
    cancellationToken: guestCancellationToken,
  });

  return updatedOrder;
}

export async function confirmPaidEventOrderFromPaymentIntent(paymentIntent, { database = defaultDb } = {}) {
  if (paymentIntent.metadata?.payment_type !== 'event_ticket') return null;

  const orderId = paymentIntent.metadata?.event_order_id;
  const [order] = await database
    .select()
    .from(eventOrder)
    .where(orderId ? eq(eventOrder.id, orderId) : eq(eventOrder.stripePaymentIntentId, paymentIntent.id))
    .limit(1);

  if (!order) {
    console.warn('🎟️  No event order found for payment intent:', paymentIntent.id);
    return null;
  }

  const latestCharge = typeof paymentIntent.latest_charge === 'string'
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id || null;

  return finalizeConfirmedEventOrder({
    database,
    order,
    paymentIntentId: paymentIntent.id,
    latestChargeId: latestCharge,
    stripeCustomerId: typeof paymentIntent.customer === 'string' ? paymentIntent.customer : null,
    source: 'payment_intent.succeeded',
  });
}

export async function confirmPaidEventOrderFromCheckoutSession(session, { database = defaultDb } = {}) {
  if (session?.metadata?.payment_type !== 'event_ticket') return null;
  if (session.payment_status && session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
    return null;
  }

  const orderId = session.metadata?.event_order_id;
  const [order] = await database
    .select()
    .from(eventOrder)
    .where(orderId ? eq(eventOrder.id, orderId) : eq(eventOrder.stripeCheckoutSessionId, session.id))
    .limit(1);

  if (!order) {
    console.warn('🎟️  No event order found for checkout session:', session.id);
    return null;
  }

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id || null;
  const stripeCustomerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id || null;

  if (!order.stripeCheckoutSessionId) {
    await database
      .update(eventOrder)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: nowIso() })
      .where(eq(eventOrder.id, order.id));
    order.stripeCheckoutSessionId = session.id;
  }

  return finalizeConfirmedEventOrder({
    database,
    order,
    paymentIntentId,
    stripeCustomerId,
    source: 'checkout.session.completed',
  });
}

export async function markPaidEventOrderFromSessionExpired(session, { database = defaultDb } = {}) {
  if (session?.metadata?.payment_type !== 'event_ticket') return null;

  const orderId = session.metadata?.event_order_id;
  const [order] = await database
    .select()
    .from(eventOrder)
    .where(orderId ? eq(eventOrder.id, orderId) : eq(eventOrder.stripeCheckoutSessionId, session.id))
    .limit(1);

  if (!order) return null;
  if (order.status === 'paid' || order.status === 'refunded' || order.status === 'partially_refunded') {
    return order;
  }

  const [updated] = await database
    .update(eventOrder)
    .set({
      status: 'payment_failed',
      metadata: {
        ...(order.metadata || {}),
        checkoutSessionExpiredAt: nowIso(),
      },
      updatedAt: nowIso(),
    })
    .where(eq(eventOrder.id, order.id))
    .returning();

  return updated || null;
}

// Build the calendar block for the n8n webhook payload. The .ics body is
// emitted inline as base64 so the workflow can attach it directly without
// needing to call back into our API (which removes the need for a public
// URL during local dev and for the HMAC download token altogether).
function buildCalendarPayload({ eventRow, rsvp, order = null, method }) {
  if (!rsvp?.id) return null;
  const base = serverBaseUrl().replace(/\/$/, '');
  const eventUrl = eventRow.slug ? `${base}/e/${eventRow.slug}` : `${base}/events/${eventRow.id}`;
  const filename = `vivaspot-${eventRow.slug || eventRow.id}.ics`;
  let icsBase64 = null;
  try {
    const icsBody = buildEventIcs({ event: eventRow, rsvp, order, method, eventUrl });
    icsBase64 = Buffer.from(icsBody, 'utf8').toString('base64');
  } catch (err) {
    console.warn('🗓️  Failed to build .ics body for webhook payload:', err.message);
    return null;
  }
  return {
    method,
    uid: buildEventIcsUid({ eventId: eventRow.id, rsvpId: rsvp.id }),
    filename,
    icsBase64,
  };
}

async function notifyEventRsvpConfirmed({ order, eventRow, cancellationToken = null }) {
  const recipientEmail = order.guestEmail;
  if (!recipientEmail) return;

  const cancellationUrl = cancellationToken
    ? `${serverBaseUrl()}/events/${eventRow.id}/cancel?token=${encodeURIComponent(cancellationToken)}`
    : null;

  const calendar = buildCalendarPayload({
    eventRow,
    rsvp: order.rsvpId
      ? { id: order.rsvpId, guestName: order.guestName, guestEmail: order.guestEmail }
      : null,
    order,
    method: 'REQUEST',
  });

  await sendNotificationWebhook({
    template: 'event_rsvp_confirmation',
    eventType: 'event.rsvp_confirmed',
    entityType: 'event_order',
    entityId: order.id,
    recipient: {
      email: recipientEmail,
      name: order.guestName || null,
      userId: order.userId || null,
    },
    data: {
      event: {
        id: eventRow.id,
        slug: eventRow.slug,
        name: eventRow.name,
        startDatetime: eventRow.startDatetime,
        endDatetime: eventRow.endDatetime,
        location: eventRow.location,
      },
      order: {
        id: order.id,
        rsvpId: order.rsvpId,
        quantity: order.quantity,
        amountCents: order.amountCents,
        currency: order.currency,
        pricingBasis: order.pricingBasis,
      },
      eventUrl: eventRow.slug ? `${serverBaseUrl()}/e/${eventRow.slug}` : `${serverBaseUrl()}/events/${eventRow.id}`,
      cancellationUrl,
      refundPolicyVersion: order.refundPolicyVersion,
      refundDeadlines: buildRefundDeadlines(eventRow.startDatetime),
      calendar,
    },
    metadata: {
      channel: 'email',
      source: 'eventPaymentService.confirmPaidEventOrderFromPaymentIntent',
    },
  });
}

async function notifyEventRsvpCancelled({ order, eventRow, refund = null, refundQuote = null, credit = null, rsvp = null }) {
  const recipientEmail = order?.guestEmail || rsvp?.guestEmail;
  if (!recipientEmail) return;

  const rsvpForCalendar = rsvp
    ? rsvp
    : order?.rsvpId
      ? { id: order.rsvpId, guestName: order.guestName, guestEmail: order.guestEmail }
      : null;
  const calendar = buildCalendarPayload({
    eventRow,
    rsvp: rsvpForCalendar,
    order,
    method: 'CANCEL',
  });

  await sendNotificationWebhook({
    template: 'event_rsvp_cancelled',
    eventType: 'event.rsvp_cancelled',
    entityType: order ? 'event_order' : 'event_rsvp',
    entityId: order?.id || rsvp?.id,
    recipient: {
      email: recipientEmail,
      name: order?.guestName || rsvp?.guestName || null,
      userId: order?.userId || rsvp?.userId || null,
    },
    data: {
      event: {
        id: eventRow.id,
        slug: eventRow.slug,
        name: eventRow.name,
        startDatetime: eventRow.startDatetime,
        location: eventRow.location,
      },
      order: order ? {
        id: order.id,
        rsvpId: order.rsvpId,
        quantity: order.quantity,
        amountCents: order.amountCents,
        refundedAmountCents: Number(order.refundedAmountCents || 0) + Number(refund?.amountCents || 0),
        currency: order.currency,
      } : null,
      refund: refund ? {
        id: refund.id,
        amountCents: refund.amountCents,
        status: refund.status,
        policyWindow: refund.policyWindow,
      } : null,
      credit: credit ? {
        id: credit.id,
        amountCents: credit.amountCents,
        currency: credit.currency,
        expiresAt: credit.expiresAt,
        merchantId: credit.merchantId,
      } : null,
      refundQuote,
      calendar,
    },
    metadata: {
      channel: 'email',
      source: 'eventPaymentService.cancelRsvpWithRefund',
    },
  });
}

export async function markPaidEventOrderPaymentFailed(paymentIntent, { database = defaultDb } = {}) {
  if (paymentIntent.metadata?.payment_type !== 'event_ticket') return null;

  const orderId = paymentIntent.metadata?.event_order_id;
  const [updated] = await database
    .update(eventOrder)
    .set({
      status: 'payment_failed',
      updatedAt: nowIso(),
      metadata: {
        paymentIntentStatus: paymentIntent.status,
        lastPaymentError: paymentIntent.last_payment_error?.message || null,
      },
    })
    .where(orderId ? eq(eventOrder.id, orderId) : eq(eventOrder.stripePaymentIntentId, paymentIntent.id))
    .returning();

  return updated || null;
}

export async function createEventRefundForOrder({
  database = defaultDb,
  order,
  eventRow,
  amountCents,
  policyWindow,
  reason,
  requestedByUserId = null,
  requestedByRole = null,
  metadata = null,
}) {
  if (amountCents <= 0) {
    const [refundRow] = await database
      .insert(eventRefund)
      .values({
        eventOrderId: order.id,
        eventRsvpId: order.rsvpId,
        eventId: order.eventId,
        amountCents: 0,
        currency: order.currency,
        reason,
        policyWindow,
        refundPolicyVersion: order.refundPolicyVersion || EVENT_REFUND_POLICY_VERSION,
        status: 'declined',
        requestedByUserId,
        requestedByRole,
        metadata,
        processedAt: nowIso(),
      })
      .returning();
    return refundRow;
  }

  if (!stripe) {
    const error = new Error('Stripe is not configured');
    error.status = 503;
    throw error;
  }

  const refundArgs = {
    amount: amountCents,
    reason: reason === 'event_cancelled' ? 'requested_by_customer' : 'requested_by_customer',
    metadata: {
      payment_type: 'event_ticket',
      event_order_id: order.id,
      event_id: order.eventId,
      refund_policy_version: order.refundPolicyVersion || EVENT_REFUND_POLICY_VERSION,
      policy_window: policyWindow,
    },
  };
  if (order.stripeChargeId) refundArgs.charge = order.stripeChargeId;
  else refundArgs.payment_intent = order.stripePaymentIntentId;

  const stripeRefund = await stripe.refunds.create(refundArgs);
  const refundStatus = stripeRefund.status === 'succeeded'
    ? 'succeeded'
    : stripeRefund.status === 'failed'
      ? 'failed'
      : 'pending';
  const [refundRow] = await database
    .insert(eventRefund)
    .values({
      eventOrderId: order.id,
      eventRsvpId: order.rsvpId,
      eventId: order.eventId,
      amountCents,
      currency: order.currency,
      reason,
      policyWindow,
      refundPolicyVersion: order.refundPolicyVersion || EVENT_REFUND_POLICY_VERSION,
      status: refundStatus,
      stripeRefundId: stripeRefund.id,
      stripeChargeId: stripeRefund.charge || order.stripeChargeId || null,
      failureReason: stripeRefund.failure_reason || null,
      requestedByUserId,
      requestedByRole,
      metadata,
      processedAt: nowIso(),
    })
    .returning();

  if (refundStatus === 'succeeded') {
    const refundedTotal = Number(order.refundedAmountCents || 0) + amountCents;
    await database
      .update(eventOrder)
      .set({
        refundedAmountCents: refundedTotal,
        status: refundedTotal >= order.amountCents ? 'refunded' : 'partially_refunded',
        cancelledAt: order.cancelledAt || nowIso(),
        updatedAt: nowIso(),
      })
      .where(eq(eventOrder.id, order.id));
  }

  return refundRow;
}

export const EVENT_CREDIT_VALIDITY_MONTHS = 12;

/**
 * Issues an event credit in lieu of (or in addition to) a cash refund.
 * Credits are same-merchant only, valid 12 months, no cash value.
 * Idempotent per source order via the unique constraint — a double-cancel
 * can never mint two credits for the same order.
 */
export async function issueEventCreditForOrder({
  database = defaultDb,
  order,
  policyWindow,
  amountCents,
  metadata = null,
}) {
  if (!order || amountCents <= 0) return null;

  const expires = new Date();
  expires.setMonth(expires.getMonth() + EVENT_CREDIT_VALIDITY_MONTHS);

  const [creditRow] = await database
    .insert(eventCredit)
    .values({
      userId: order.userId || null,
      guestEmail: order.guestEmail || null,
      merchantId: order.merchantId,
      groupId: order.groupId || null,
      sourceEventOrderId: order.id,
      sourceEventId: order.eventId || null,
      amountCents,
      currency: order.currency || 'usd',
      status: 'active',
      policyWindow,
      refundPolicyVersion: order.refundPolicyVersion || EVENT_REFUND_POLICY_VERSION,
      expiresAt: expires.toISOString(),
      metadata,
    })
    .onConflictDoNothing({ target: eventCredit.sourceEventOrderId })
    .returning();

  return creditRow || null;
}

export async function cancelRsvpWithRefund({
  database = defaultDb,
  rsvp,
  eventRow,
  order = null,
  requestedByUserId = null,
  requestedByRole = 'customer',
  reason = 'customer_cancelled',
  compensation = 'cash',
}) {
  const wasConfirmed = rsvp.status === 'going' || rsvp.status === 'checked_in';
  const now = nowIso();
  await database
    .update(eventRsvp)
    .set({ status: 'cancelled', deletedAt: now, updatedAt: now })
    .where(eq(eventRsvp.id, rsvp.id));

  let refund = null;
  let refundQuote = null;
  let credit = null;

  if (order && order.status === 'paid') {
    refundQuote = reason === 'event_cancelled'
      ? {
          amountCents: order.amountCents - Number(order.refundedAmountCents || 0),
          policyWindow: 'merchant_event_cancelled_full_refund',
          refundPercent: 100,
          creditPercent: 0,
          creditAmountCents: 0,
          reason: 'Event cancelled by merchant',
        }
      : calculateRefundQuote(
          eventRow.startDatetime,
          order.amountCents - Number(order.refundedAmountCents || 0),
        );

    // The guest may swap the 50% cash refund for a 100% event credit in the
    // 3-7 day window. Inside 72 hours the 50% credit is issued automatically.
    const creditInsteadOfCash = compensation === 'credit'
      && refundQuote.refundPercent === 50
      && refundQuote.creditPercent === 100;
    const cashRefundCents = creditInsteadOfCash ? 0 : refundQuote.amountCents;
    const creditCents = creditInsteadOfCash || refundQuote.refundPercent === 0
      ? (refundQuote.creditAmountCents || 0)
      : 0;

    await database
      .update(eventOrder)
      .set({
        status: cashRefundCents > 0 ? order.status : 'cancelled',
        cancellationReason: reason,
        cancellationRequestedAt: now,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(eventOrder.id, order.id));

    refund = await createEventRefundForOrder({
      database,
      order: { ...order, cancelledAt: now },
      eventRow,
      amountCents: cashRefundCents,
      policyWindow: refundQuote.policyWindow,
      reason,
      requestedByUserId,
      requestedByRole,
      metadata: {
        refundReason: refundQuote.reason,
        ...(creditInsteadOfCash ? { compensationChoice: 'credit' } : {}),
      },
    });

    credit = await issueEventCreditForOrder({
      database,
      order,
      policyWindow: refundQuote.policyWindow,
      amountCents: creditCents,
      metadata: { source: 'rsvp_cancellation', refundReason: refundQuote.reason },
    });
  } else if (order) {
    await database
      .update(eventOrder)
      .set({
        status: 'cancelled',
        cancellationReason: reason,
        cancellationRequestedAt: now,
        cancelledAt: now,
        updatedAt: now,
      })
      .where(eq(eventOrder.id, order.id));
  }

  if (wasConfirmed && reason !== 'event_cancelled') {
    await promoteFirstWaitlistedRsvp({ database, eventId: rsvp.eventId });
  }

  await notifyEventRsvpCancelled({
    order,
    eventRow,
    refund,
    refundQuote,
    credit,
    rsvp,
  });

  return {
    cancelled: true,
    refund,
    refundQuote,
    credit,
  };
}

export async function promoteFirstWaitlistedRsvp({ database = defaultDb, eventId }) {
  const [earliest] = await database
    .select()
    .from(eventRsvp)
    .where(and(eq(eventRsvp.eventId, eventId), eq(eventRsvp.status, 'waitlist'), isNull(eventRsvp.deletedAt)))
    .orderBy(asc(eventRsvp.waitlistPosition))
    .limit(1);

  if (!earliest) return null;

  const [updated] = await database
    .update(eventRsvp)
    .set({ status: 'going', waitlistPosition: null, updatedAt: nowIso() })
    .where(eq(eventRsvp.id, earliest.id))
    .returning();

  return updated;
}

export async function findEventOrderForRsvp({ database = defaultDb, rsvpId }) {
  const [order] = await database
    .select()
    .from(eventOrder)
    .where(eq(eventOrder.rsvpId, rsvpId))
    .limit(1);
  return order || null;
}

export async function findEventOrderByPaymentIntent({ database = defaultDb, paymentIntentId }) {
  const [order] = await database
    .select()
    .from(eventOrder)
    .where(eq(eventOrder.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  return order || null;
}

export async function applyChargeRefundToEventOrder({ database = defaultDb, charge }) {
  if (!charge?.payment_intent) return null;
  const order = await findEventOrderByPaymentIntent({
    database,
    paymentIntentId: charge.payment_intent,
  });
  if (!order) return null;

  const refundedAmount = Number(charge.amount_refunded || 0);
  const status = refundedAmount >= order.amountCents ? 'refunded' : 'partially_refunded';
  const [updated] = await database
    .update(eventOrder)
    .set({
      refundedAmountCents: refundedAmount,
      status,
      stripeChargeId: charge.id,
      updatedAt: nowIso(),
    })
    .where(eq(eventOrder.id, order.id))
    .returning();

  return updated;
}
