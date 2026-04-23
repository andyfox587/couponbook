// server/src/routes/cron.js
// Unauthenticated endpoints invoked by Vercel Cron.
// Security is enforced via a shared CRON_SECRET header — Vercel Cron cannot
// send Cognito tokens, so these routes must be mounted OUTSIDE the admin auth chain.
import express from 'express';
import { db } from '../db.js';
import * as schema from '../schema.js';
import { and, eq, isNull, sql } from 'drizzle-orm';

const router = express.Router();

console.log('📦  cron router loaded');

function requireCronSecret(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  const providedSecret =
    req.headers['x-cron-secret'] ||
    (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (providedSecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

async function runRenewalReminderJob() {
  const { sendRenewalReminderEmail } = await import('../services/emailService.js');

  // Find active subscriptions expiring in the next 2 days that haven't been reminded yet
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const upcomingRenewals = await db
    .select()
    .from(schema.purchase)
    .where(
      and(
        eq(schema.purchase.status, 'paid'),
        eq(schema.purchase.subscriptionStatus, 'active'),
        eq(schema.purchase.cancelAtPeriodEnd, false),
        isNull(schema.purchase.renewalReminderSentAt),
        sql`${schema.purchase.currentPeriodEnd} <= ${twoDaysFromNow}`,
        sql`${schema.purchase.currentPeriodEnd} > ${now}`
      )
    );

  console.log(`📦  cron: ${upcomingRenewals.length} subscription(s) due for renewal reminder`);

  let sent = 0;
  let errors = 0;
  for (const row of upcomingRenewals) {
    try {
      const ok = await sendRenewalReminderEmail(row);
      if (ok) {
        await db
          .update(schema.purchase)
          .set({
            renewalReminderSentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.purchase.id, row.id));
        sent++;
      }
    } catch (err) {
      console.error('📦  cron: renewal reminder failed for', row.id, err.message);
      errors++;
    }
  }

  return { processed: upcomingRenewals.length, sent, errors };
}

// POST /api/v1/cron/renewal-reminders — Vercel Cron daily trigger
// Legacy path kept as an alias: POST /api/v1/admin/cron/renewal-reminders
// is served via this same router mounted under /api/v1 in app.js.
router.post('/renewal-reminders', requireCronSecret, async (req, res, next) => {
  console.log('📦  POST /api/v1/cron/renewal-reminders');
  try {
    const result = await runRenewalReminderJob();
    res.json(result);
  } catch (err) {
    console.error('📦  error in POST /cron/renewal-reminders', err);
    next(err);
  }
});

// GET alias: Vercel Cron issues GET requests by default.
router.get('/renewal-reminders', requireCronSecret, async (req, res, next) => {
  console.log('📦  GET /api/v1/cron/renewal-reminders');
  try {
    const result = await runRenewalReminderJob();
    res.json(result);
  } catch (err) {
    console.error('📦  error in GET /cron/renewal-reminders', err);
    next(err);
  }
});

export default router;
