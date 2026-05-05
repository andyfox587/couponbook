// server/src/stripeWebhookHandler.js
// Shared webhook logic for Stripe. Use from Express (with express.raw) or from a
// dedicated serverless handler that reads the raw body without any body parser.
import { db } from './db.js';
import { purchase, paymentEvent, foodieGroupMembership, eventRefund, eventDispute, eventOrder } from './schema.js';
import { eq, and } from 'drizzle-orm';
import { stripe } from './config/stripe.js';
import {
  applyChargeRefundToEventOrder,
  confirmPaidEventOrderFromPaymentIntent,
  markPaidEventOrderPaymentFailed,
} from './services/eventPaymentService.js';

/**
 * Process a Stripe webhook payload. Call this with the raw body (Buffer or string)
 * and Stripe-Signature header so the body is never parsed before verification.
 *
 * @param {Buffer|string|Uint8Array} rawBody - Raw request body (must not be parsed)
 * @param {string} [signature] - req.headers['stripe-signature']
 * @returns {{ status: number, body: object }}
 */
export async function handleWebhook(rawBody, signature) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('💳  STRIPE_WEBHOOK_SECRET not configured');
    return { status: 500, body: { error: 'Webhook secret not configured' } };
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('💳  Webhook signature verification failed:', err.message);
    return { status: 400, body: { error: `Webhook Error: ${err.message}` } };
  }

  console.log('💳  Webhook verified:', event.type, event.id);

  try {
    const [existingEvent] = await db
      .select()
      .from(paymentEvent)
      .where(eq(paymentEvent.eventId, event.id));

    if (existingEvent) {
      console.log('💳  Event already processed, skipping:', event.id);
      return { status: 200, body: { received: true, duplicate: true } };
    }

    await db.insert(paymentEvent).values({
      provider: 'stripe',
      eventId: event.id,
      eventType: event.type,
      receivedAt: new Date().toISOString(),
      payload: event.data.object,
    });
  } catch (err) {
    if (err.code === '23505') {
      console.log('💳  Event already exists (race condition), skipping:', event.id);
      return { status: 200, body: { received: true, duplicate: true } };
    }
    throw err;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event);
        break;
      case 'checkout.session.expired':
        await handleCheckoutSessionExpired(event);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentPaymentFailed(event);
        break;
      case 'refund.failed':
        await handleRefundFailed(event);
        break;
      case 'charge.dispute.created':
      case 'charge.dispute.updated':
      case 'charge.dispute.closed':
        await handleChargeDispute(event);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;
      case 'invoice.upcoming':
        await handleInvoiceUpcoming(event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;
      default:
        console.log('💳  Unhandled event type:', event.type);
    }

    await db
      .update(paymentEvent)
      .set({ processedAt: new Date().toISOString() })
      .where(eq(paymentEvent.eventId, event.id));
  } catch (err) {
    console.error('💳  Error processing webhook event:', err);
    await db
      .update(paymentEvent)
      .set({
        processingError: err.message,
        processedAt: new Date().toISOString(),
      })
      .where(eq(paymentEvent.eventId, event.id));
  }

  return { status: 200, body: { received: true } };
}

async function handleCheckoutSessionCompleted(event) {
  const session = event.data.object;
  const checkoutType = session.metadata?.checkoutType || 'one_time';
  console.log('💳  Processing checkout.session.completed:', session.id, { checkoutType });

  // For subscription checkouts, pull period dates from the subscription object
  let subscriptionFields = {};
  if (session.mode === 'subscription' && session.subscription) {
    try {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      subscriptionFields = {
        stripeSubscriptionId: sub.id,
        subscriptionStatus: sub.status,
        currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        // For subscriptions, expires_at tracks when access ends (= current_period_end)
        expiresAt: new Date(sub.current_period_end * 1000).toISOString(),
      };
    } catch (err) {
      console.warn('💳  Could not retrieve subscription for period dates:', err.message);
    }
  }

  const [purchaseRow] = await db
    .select()
    .from(purchase)
    .where(eq(purchase.stripeCheckoutId, session.id));

  if (!purchaseRow) {
    console.warn('💳  No purchase found for checkout session:', session.id);
    const userId = session.metadata?.userId;
    const groupId = session.metadata?.groupId;
    const giftedByUserId = session.metadata?.giftedByUserId || null;

    if (userId && groupId) {
      console.log('💳  Creating purchase from webhook metadata:', { userId, groupId, checkoutType });
      try {
        await db.insert(purchase).values({
          userId,
          groupId,
          provider: 'stripe',
          stripeCheckoutId: session.id,
          stripeCustomerId: session.customer,
          stripePaymentIntentId: session.payment_intent || null,
          amountCents: session.amount_total || 0,
          currency: session.currency || 'usd',
          status: 'paid',
          purchasedAt: new Date().toISOString(),
          giftedByUserId,
          ...subscriptionFields,
          metadata: { createdVia: 'webhook', checkoutType },
        });
        await ensureFoodieGroupMembership(userId, groupId);
      } catch (insertErr) {
        if (insertErr.code === '23505') {
          console.log('💳  Purchase already exists for checkout session (duplicate webhook), skipping:', session.id);
          await ensureFoodieGroupMembership(userId, groupId);
        } else {
          throw insertErr;
        }
      }
    }
    return;
  }

  await db
    .update(purchase)
    .set({
      status: 'paid',
      purchasedAt: new Date().toISOString(),
      stripeCustomerId: session.customer,
      stripePaymentIntentId: session.payment_intent || null,
      updatedAt: new Date().toISOString(),
      ...subscriptionFields,
    })
    .where(eq(purchase.id, purchaseRow.id));

  console.log('💳  Purchase marked as paid:', purchaseRow.id);

  await db
    .update(paymentEvent)
    .set({ purchaseId: purchaseRow.id })
    .where(eq(paymentEvent.eventId, event.id));

  await ensureFoodieGroupMembership(purchaseRow.userId, purchaseRow.groupId);

  // If this was a gift checkout, notify the recipient.
  if (checkoutType === 'gift' && purchaseRow.giftedByUserId) {
    try {
      const { sendGiftAccessNotificationEmail } = await import('./services/emailService.js');
      await sendGiftAccessNotificationEmail({
        userId: purchaseRow.userId,
        giftedByUserId: purchaseRow.giftedByUserId,
        ...subscriptionFields,
      });
    } catch (err) {
      console.warn('💳  Could not send gift access notification:', err.message);
    }
  }

  console.log('💳  Checkout session completed successfully:', {
    purchaseId: purchaseRow.id,
    sessionId: session.id,
    checkoutType,
  });
}

async function handlePaymentIntentSucceeded(event) {
  const paymentIntent = event.data.object;
  console.log('💳  Processing payment_intent.succeeded:', paymentIntent.id);

  const order = await confirmPaidEventOrderFromPaymentIntent(paymentIntent);
  if (!order) return;

  await db
    .update(paymentEvent)
    .set({ eventOrderId: order.id })
    .where(eq(paymentEvent.eventId, event.id));

  console.log('💳  Event order marked paid:', order.id);
}

async function handlePaymentIntentPaymentFailed(event) {
  const paymentIntent = event.data.object;
  console.log('💳  Processing payment_intent.payment_failed:', paymentIntent.id);

  const order = await markPaidEventOrderPaymentFailed(paymentIntent);
  if (!order) return;

  await db
    .update(paymentEvent)
    .set({ eventOrderId: order.id })
    .where(eq(paymentEvent.eventId, event.id));

  console.log('💳  Event order payment failed:', order.id);
}

async function handleInvoicePaymentSucceeded(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  console.log('💳  Processing invoice.payment_succeeded for subscription:', subscriptionId);

  const [purchaseRow] = await db
    .select()
    .from(purchase)
    .where(eq(purchase.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (!purchaseRow) {
    console.warn('💳  No purchase found for subscription:', subscriptionId);
    return;
  }

  let periodStart, periodEnd;
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    periodStart = new Date(sub.current_period_start * 1000).toISOString();
    periodEnd = new Date(sub.current_period_end * 1000).toISOString();
  } catch (err) {
    console.warn('💳  Could not retrieve subscription period:', err.message);
  }

  await db
    .update(purchase)
    .set({
      status: 'paid',
      subscriptionStatus: 'active',
      ...(periodStart ? { currentPeriodStart: periodStart } : {}),
      ...(periodEnd ? { currentPeriodEnd: periodEnd, expiresAt: periodEnd } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(purchase.id, purchaseRow.id));

  await db
    .update(paymentEvent)
    .set({ purchaseId: purchaseRow.id })
    .where(eq(paymentEvent.eventId, event.id));

  console.log('💳  Subscription renewed, purchase updated:', purchaseRow.id);
}

async function handleInvoicePaymentFailed(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  console.log('💳  Processing invoice.payment_failed for subscription:', subscriptionId);

  const [purchaseRow] = await db
    .select()
    .from(purchase)
    .where(eq(purchase.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (!purchaseRow) {
    console.warn('💳  No purchase found for subscription:', subscriptionId);
    return;
  }

  await db
    .update(purchase)
    .set({
      subscriptionStatus: 'past_due',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(purchase.id, purchaseRow.id));

  await db
    .update(paymentEvent)
    .set({ purchaseId: purchaseRow.id })
    .where(eq(paymentEvent.eventId, event.id));

  console.log('💳  Subscription payment failed, marked past_due:', purchaseRow.id);
}

async function handleInvoiceUpcoming(event) {
  const invoice = event.data.object;
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  console.log('💳  Processing invoice.upcoming for subscription:', subscriptionId);

  // Send immediate renewal reminder email if reminder service is available
  try {
    const { sendRenewalReminderEmail } = await import('./services/emailService.js');
    const [purchaseRow] = await db
      .select()
      .from(purchase)
      .where(eq(purchase.stripeSubscriptionId, subscriptionId))
      .limit(1);

    if (purchaseRow) {
      await sendRenewalReminderEmail(purchaseRow);
      await db
        .update(purchase)
        .set({
          renewalReminderSentAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(purchase.id, purchaseRow.id));

      await db
        .update(paymentEvent)
        .set({ purchaseId: purchaseRow.id })
        .where(eq(paymentEvent.eventId, event.id));

      console.log('💳  Renewal reminder sent for purchase:', purchaseRow.id);
    }
  } catch (err) {
    // Email failure must not block webhook acknowledgment
    console.warn('💳  Could not send renewal reminder email:', err.message);
  }
}

async function handleSubscriptionUpdated(event) {
  const sub = event.data.object;
  console.log('💳  Processing customer.subscription.updated:', sub.id);

  const [purchaseRow] = await db
    .select()
    .from(purchase)
    .where(eq(purchase.stripeSubscriptionId, sub.id))
    .limit(1);

  if (!purchaseRow) {
    console.warn('💳  No purchase found for subscription:', sub.id);
    return;
  }

  const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

  await db
    .update(purchase)
    .set({
      subscriptionStatus: sub.status,
      currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
      currentPeriodEnd: periodEnd,
      expiresAt: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(purchase.id, purchaseRow.id));

  await db
    .update(paymentEvent)
    .set({ purchaseId: purchaseRow.id })
    .where(eq(paymentEvent.eventId, event.id));

  console.log('💳  Subscription updated:', { purchaseId: purchaseRow.id, status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end });
}

async function handleSubscriptionDeleted(event) {
  const sub = event.data.object;
  console.log('💳  Processing customer.subscription.deleted:', sub.id);

  const [purchaseRow] = await db
    .select()
    .from(purchase)
    .where(eq(purchase.stripeSubscriptionId, sub.id))
    .limit(1);

  if (!purchaseRow) {
    console.warn('💳  No purchase found for deleted subscription:', sub.id);
    return;
  }

  // When Stripe marks a subscription as deleted, the user has already paid
  // through current_period_end. Preserve access until that date rather than
  // yanking it immediately: expiresAt = current_period_end.
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : (purchaseRow.currentPeriodEnd || new Date().toISOString());

  await db
    .update(purchase)
    .set({
      subscriptionStatus: 'canceled',
      expiresAt: periodEnd,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(purchase.id, purchaseRow.id));

  await db
    .update(paymentEvent)
    .set({ purchaseId: purchaseRow.id })
    .where(eq(paymentEvent.eventId, event.id));

  // Send cancellation confirmation email (non-fatal if email service is down)
  try {
    const { sendCancellationConfirmationEmail } = await import('./services/emailService.js');
    await sendCancellationConfirmationEmail({ ...purchaseRow, currentPeriodEnd: periodEnd });
  } catch (err) {
    console.warn('💳  Could not send cancellation email:', err.message);
  }

  console.log('💳  Subscription canceled, access retained until periodEnd:', {
    purchaseId: purchaseRow.id,
    periodEnd,
  });
}

async function handleCheckoutSessionExpired(event) {
  const session = event.data.object;
  console.log('💳  Processing checkout.session.expired:', session.id);

  const [purchaseRow] = await db
    .select()
    .from(purchase)
    .where(eq(purchase.stripeCheckoutId, session.id));

  if (!purchaseRow) {
    console.warn('💳  No purchase found for expired session:', session.id);
    return;
  }

  if (purchaseRow.status === 'pending') {
    await db
      .update(purchase)
      .set({
        status: 'expired',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(purchase.id, purchaseRow.id));
    console.log('💳  Purchase marked as expired:', purchaseRow.id);
  }
}

async function handleChargeRefunded(event) {
  const charge = event.data.object;
  console.log('💳  Processing charge.refunded:', charge.id);

  const eventOrderRow = await applyChargeRefundToEventOrder({ charge });
  if (eventOrderRow) {
    await db
      .update(paymentEvent)
      .set({ eventOrderId: eventOrderRow.id })
      .where(eq(paymentEvent.eventId, event.id));
    console.log('💳  Event order refund updated:', eventOrderRow.id);
    return;
  }

  let purchaseRow;
  [purchaseRow] = await db
    .select()
    .from(purchase)
    .where(eq(purchase.stripeChargeId, charge.id));

  if (!purchaseRow && charge.payment_intent) {
    [purchaseRow] = await db
      .select()
      .from(purchase)
      .where(eq(purchase.stripePaymentIntentId, charge.payment_intent));
  }

  if (!purchaseRow) {
    console.warn('💳  No purchase found for refunded charge:', charge.id);
    return;
  }

  await db
    .update(purchase)
    .set({
      status: charge.amount_refunded >= charge.amount ? 'refunded' : purchaseRow.status,
      refundedAt: new Date().toISOString(),
      stripeChargeId: charge.id,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(purchase.id, purchaseRow.id));

  console.log('💳  Purchase marked as refunded:', purchaseRow.id);

  await db
    .update(paymentEvent)
    .set({ purchaseId: purchaseRow.id })
    .where(eq(paymentEvent.eventId, event.id));
}

async function handleRefundFailed(event) {
  const refund = event.data.object;
  console.log('💳  Processing refund.failed:', refund.id);

  const [refundRow] = await db
    .update(eventRefund)
    .set({
      status: 'failed',
      failureReason: refund.failure_reason || 'Stripe refund failed',
      processedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(eventRefund.stripeRefundId, refund.id))
    .returning();

  if (refundRow) {
    const successfulRefunds = await db
      .select({ amountCents: eventRefund.amountCents })
      .from(eventRefund)
      .where(and(eq(eventRefund.eventOrderId, refundRow.eventOrderId), eq(eventRefund.status, 'succeeded')));

    const refundedAmountCents = successfulRefunds.reduce((sum, row) => sum + Number(row.amountCents || 0), 0);
    const [order] = await db
      .select()
      .from(eventOrder)
      .where(eq(eventOrder.id, refundRow.eventOrderId))
      .limit(1);

    if (order) {
      let status = order.status;
      if (refundedAmountCents >= Number(order.amountCents || 0)) {
        status = 'refunded';
      } else if (refundedAmountCents > 0) {
        status = 'partially_refunded';
      } else {
        status = order.cancelledAt ? 'cancelled' : 'paid';
      }

      await db
        .update(eventOrder)
        .set({
          refundedAmountCents,
          status,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(eventOrder.id, order.id));
    }

    await db
      .update(paymentEvent)
      .set({ eventOrderId: refundRow.eventOrderId })
      .where(eq(paymentEvent.eventId, event.id));
  }
}

async function handleChargeDispute(event) {
  const dispute = event.data.object;
  console.log('💳  Processing dispute event:', event.type, dispute.id);

  const [order] = await db
    .select()
    .from(eventOrder)
    .where(eq(eventOrder.stripeChargeId, dispute.charge))
    .limit(1);

  if (!order) {
    console.warn('💳  No event order found for disputed charge:', dispute.charge);
    return;
  }

  const isLost = event.type === 'charge.dispute.closed' && dispute.status === 'lost';
  const recoveryAmountCents = isLost ? Number(dispute.amount || 0) + Number(dispute.balance_transactions?.[0]?.fee || 0) : null;

  try {
    await db.insert(eventDispute).values({
      eventOrderId: order.id,
      eventId: order.eventId,
      merchantId: order.merchantId,
      stripeDisputeId: dispute.id,
      stripeChargeId: dispute.charge,
      amountCents: dispute.amount || 0,
      currency: dispute.currency || order.currency || 'usd',
      status: dispute.status || 'unknown',
      disputeFeeCents: dispute.balance_transactions?.[0]?.fee || null,
      recoveryAmountCents,
      recoveryStatus: isLost ? 'due' : null,
      metadata: dispute,
    });
  } catch (err) {
    if (err.code === '23505') {
      await db
        .update(eventDispute)
        .set({
          status: dispute.status || 'unknown',
          disputeFeeCents: dispute.balance_transactions?.[0]?.fee || null,
          recoveryAmountCents,
          recoveryStatus: isLost ? 'due' : null,
          metadata: dispute,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(eventDispute.stripeDisputeId, dispute.id));
    } else {
      throw err;
    }
  }

  await db
    .update(paymentEvent)
    .set({ eventOrderId: order.id })
    .where(eq(paymentEvent.eventId, event.id));
}

async function ensureFoodieGroupMembership(userId, groupId) {
  const [existing] = await db
    .select()
    .from(foodieGroupMembership)
    .where(
      and(
        eq(foodieGroupMembership.userId, userId),
        eq(foodieGroupMembership.groupId, groupId)
      )
    );

  if (existing) {
    if (existing.deletedAt) {
      await db
        .update(foodieGroupMembership)
        .set({ deletedAt: null })
        .where(eq(foodieGroupMembership.id, existing.id));
    }
    return;
  }

  await db.insert(foodieGroupMembership).values({
    userId,
    groupId,
    role: 'customer',
    joinedAt: new Date().toISOString(),
  });
  console.log('💳  Created foodie group membership:', { userId, groupId });
}
