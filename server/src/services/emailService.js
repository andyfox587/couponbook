/**
 * server/src/services/emailService.js
 *
 * SES-backed transactional email service for subscription lifecycle notifications.
 * Requires: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (or instance role),
 *           and EMAIL_FROM environment variables.
 *
 * All functions are safe to call even when SES is not configured — they log a
 * warning and return without throwing so callers don't need to guard against
 * missing config in non-production environments.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { db } from '../db.js';
import { user } from '../schema.js';
import { eq } from 'drizzle-orm';

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@vivaspot.app';
const SES_REGION = process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1';

let sesClient = null;

function getSesClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: SES_REGION });
  }
  return sesClient;
}

/**
 * Low-level send helper. Returns true on success, false on failure.
 * @param {object} params - { to, subject, htmlBody, textBody }
 */
async function sendEmail({ to, subject, htmlBody, textBody }) {
  if (!process.env.EMAIL_FROM) {
    console.warn('📧  EMAIL_FROM not set, skipping email send to:', to);
    return false;
  }

  const client = getSesClient();
  const command = new SendEmailCommand({
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' },
      },
    },
    Source: EMAIL_FROM,
  });

  try {
    await client.send(command);
    console.log('📧  Email sent:', { to, subject });
    return true;
  } catch (err) {
    console.error('📧  SES send failed:', { to, subject, error: err.message });
    return false;
  }
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

  const appUrl = process.env.APP_PUBLIC_URL || process.env.APP_URL || 'https://vivaspot.app';

  const subject = `Your VivaSpot subscription renews on ${renewalDate}`;
  const htmlBody = `
    <p>Hi ${purchaseUser.name},</p>
    <p>Your VivaSpot subscription will automatically renew on <strong>${renewalDate}</strong>.</p>
    <p>If you'd like to manage your subscription, visit your
    <a href="${appUrl}/profile">profile page</a>.</p>
    <p>Thanks for being a VivaSpot member!</p>
  `;
  const textBody = `Hi ${purchaseUser.name},\n\nYour VivaSpot subscription will automatically renew on ${renewalDate}.\n\nManage your subscription: ${appUrl}/profile\n\nThanks for being a VivaSpot member!`;

  return sendEmail({ to: purchaseUser.email, subject, htmlBody, textBody });
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

  const appUrl = process.env.APP_PUBLIC_URL || process.env.APP_URL || 'https://vivaspot.app';
  const subject = 'Your VivaSpot subscription has been canceled';
  const htmlBody = `
    <p>Hi ${purchaseUser.name},</p>
    <p>Your VivaSpot subscription has been canceled. You'll continue to enjoy access
    through <strong>${accessUntil}</strong>.</p>
    <p>If this was a mistake, you can resubscribe from your
    <a href="${appUrl}/profile">profile page</a>.</p>
  `;
  const textBody = `Hi ${purchaseUser.name},\n\nYour VivaSpot subscription has been canceled. You'll continue to enjoy access through ${accessUntil}.\n\nResubscribe: ${appUrl}/profile`;

  return sendEmail({ to: purchaseUser.email, subject, htmlBody, textBody });
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

  const appUrl = process.env.APP_PUBLIC_URL || process.env.APP_URL || 'https://vivaspot.app';
  const subject = `You've received a VivaSpot gift from ${gifterName}!`;
  const htmlBody = `
    <p>Hi ${recipient.name},</p>
    <p><strong>${gifterName}</strong> has gifted you VivaSpot access. Your
    membership is active and ready to use.</p>
    <p><a href="${appUrl}/profile">Open VivaSpot</a></p>
  `;
  const textBody = `Hi ${recipient.name},\n\n${gifterName} has gifted you VivaSpot access. Your membership is active.\n\nOpen VivaSpot: ${appUrl}/profile`;

  return sendEmail({ to: recipient.email, subject, htmlBody, textBody });
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

  const appUrl = process.env.APP_PUBLIC_URL || process.env.APP_URL || 'https://vivaspot.app';
  const subject = 'Action required: VivaSpot subscription payment failed';
  const htmlBody = `
    <p>Hi ${purchaseUser.name},</p>
    <p>We were unable to process your VivaSpot subscription payment. Your access will remain active for
    a short grace period, but please update your payment method to avoid interruption.</p>
    <p><a href="${appUrl}/profile">Update payment method</a></p>
    <p>If you have questions, reply to this email.</p>
  `;
  const textBody = `Hi ${purchaseUser.name},\n\nWe were unable to process your VivaSpot subscription payment. Please update your payment method: ${appUrl}/profile`;

  return sendEmail({ to: purchaseUser.email, subject, htmlBody, textBody });
}
