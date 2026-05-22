/**
 * server/src/services/emailService.js
 *
 * n8n-backed transactional email request service for subscription lifecycle
 * notifications. Scheduling stays in cron/webhooks; this service only emits
 * "please send this email" requests to n8n.
 *
 * Requires: N8N_NOTIFICATION_WEBHOOK_URL or PAID_EVENT_NOTIFICATION_WEBHOOK_URL.
 * All functions are safe to call even when n8n is not configured — they log a
 * warning and return false so callers don't need to guard against missing config
 * in non-production environments.
 */

import { db } from '../db.js';
import { user } from '../schema.js';
import { eq } from 'drizzle-orm';
import { sendNotificationWebhook } from './notificationService.js';
import { serverBaseUrl } from '../utils/appUrl.js';

/**
 * Low-level n8n notification helper. Returns true on success, false on failure.
 * @param {object} params - { template, eventType, entityType, entityId, recipient, data, metadata }
 */
async function requestEmail({ template, eventType, entityType, entityId, recipient, data = {}, metadata = {} }) {
  const result = await sendNotificationWebhook({
    template,
    eventType,
    entityType,
    entityId,
    recipient,
    data,
    metadata: {
      channel: 'email',
      source: 'server/src/services/emailService.js',
      ...metadata,
    },
  });

  if (result.sent) {
    console.log('📧  n8n email request sent:', { template, to: recipient?.email, entityId });
    return true;
  }

  if (result.skipped) {
    console.warn('📧  n8n email webhook not configured, skipping:', { template, to: recipient?.email, entityId });
    return false;
  }

  console.warn('📧  n8n email request failed:', { template, to: recipient?.email, entityId, error: result.error });
  return false;
}

/**
 * Send a renewal reminder email to the subscriber.
 * Called from webhook handler (invoice.upcoming) and from the cron endpoint.
 *
 * @param {object} purchaseRow - Purchase record with userId, groupId, currentPeriodEnd
 */
export async function sendRenewalReminderEmail(purchaseRow) {
  const [purchaseUser] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, purchaseRow.userId))
    .limit(1);

  if (!purchaseUser) {
    console.warn('📧  sendRenewalReminderEmail: user not found for purchase', purchaseRow.id);
    return false;
  }

  const renewalDate = purchaseRow.currentPeriodEnd
    ? new Date(purchaseRow.currentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'soon';

  const appUrl = serverBaseUrl();

  return requestEmail({
    template: 'subscription_renewal_reminder',
    eventType: 'subscription.renewal_reminder',
    entityType: 'purchase',
    entityId: purchaseRow.id,
    recipient: {
      email: purchaseUser.email,
      name: purchaseUser.name,
      userId: purchaseRow.userId,
    },
    data: {
      renewalDate,
      profileUrl: `${appUrl}/profile`,
      purchase: {
        id: purchaseRow.id,
        groupId: purchaseRow.groupId,
        currentPeriodEnd: purchaseRow.currentPeriodEnd,
        subscriptionStatus: purchaseRow.subscriptionStatus,
      },
    },
  });
}

/**
 * Send a cancellation confirmation email. Fired when a subscription is
 * fully canceled (customer.subscription.deleted). The user retains access
 * until currentPeriodEnd, which is surfaced in the email.
 * @param {object} purchaseRow
 */
export async function sendCancellationConfirmationEmail(purchaseRow) {
  const [purchaseUser] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, purchaseRow.userId))
    .limit(1);

  if (!purchaseUser) return false;

  const accessUntil = purchaseRow.currentPeriodEnd
    ? new Date(purchaseRow.currentPeriodEnd).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'the end of your current period';

  const appUrl = serverBaseUrl();
  return requestEmail({
    template: 'subscription_cancellation_confirmation',
    eventType: 'subscription.cancelled',
    entityType: 'purchase',
    entityId: purchaseRow.id,
    recipient: {
      email: purchaseUser.email,
      name: purchaseUser.name,
      userId: purchaseRow.userId,
    },
    data: {
      accessUntil,
      profileUrl: `${appUrl}/profile`,
      purchase: {
        id: purchaseRow.id,
        groupId: purchaseRow.groupId,
        currentPeriodEnd: purchaseRow.currentPeriodEnd,
        subscriptionStatus: purchaseRow.subscriptionStatus,
      },
    },
  });
}

/**
 * Send a gift-access notification email to the recipient of a gifted
 * subscription. Called from the webhook after a gift checkout completes.
 * @param {object} purchaseRow - The gifted purchase row (recipient in userId)
 */
export async function sendGiftAccessNotificationEmail(purchaseRow) {
  const [recipient] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, purchaseRow.userId))
    .limit(1);

  if (!recipient) return false;

  let gifterName = 'a friend';
  if (purchaseRow.giftedByUserId) {
    const [gifter] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, purchaseRow.giftedByUserId))
      .limit(1);
    if (gifter?.name) gifterName = gifter.name;
  }

  const appUrl = serverBaseUrl();
  return requestEmail({
    template: 'gift_access_notification',
    eventType: 'gift.access_granted',
    entityType: 'purchase',
    entityId: purchaseRow.id,
    recipient: {
      email: recipient.email,
      name: recipient.name,
      userId: purchaseRow.userId,
    },
    data: {
      gifterName,
      profileUrl: `${appUrl}/profile`,
      purchase: {
        id: purchaseRow.id,
        groupId: purchaseRow.groupId,
        giftedByUserId: purchaseRow.giftedByUserId,
        currentPeriodEnd: purchaseRow.currentPeriodEnd,
      },
    },
  });
}

/**
 * Send a payment failure notification.
 * @param {object} purchaseRow - Purchase record
 */
export async function sendPaymentFailedEmail(purchaseRow) {
  const [purchaseUser] = await db
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, purchaseRow.userId))
    .limit(1);

  if (!purchaseUser) return false;

  const appUrl = serverBaseUrl();
  return requestEmail({
    template: 'subscription_payment_failed',
    eventType: 'subscription.payment_failed',
    entityType: 'purchase',
    entityId: purchaseRow.id,
    recipient: {
      email: purchaseUser.email,
      name: purchaseUser.name,
      userId: purchaseRow.userId,
    },
    data: {
      profileUrl: `${appUrl}/profile`,
      purchase: {
        id: purchaseRow.id,
        groupId: purchaseRow.groupId,
        currentPeriodEnd: purchaseRow.currentPeriodEnd,
        subscriptionStatus: purchaseRow.subscriptionStatus,
      },
    },
  });
}
