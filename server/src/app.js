import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import auth from './middleware/auth.js';
import { resolveLocalUser, requireSuperAdmin } from './authz/index.js';
import usersRouter from './routes/users.js';
import couponsRouter from './routes/coupons.js';
import eventsRouter from './routes/events.js';
import groupsRouter from './routes/foodieGroups.js';
import merchantsRouter from './routes/merchants.js';
import couponSubmissionsRouter from './routes/couponSubmissions.js';
import eventSubmissionsRouter from './routes/eventSubmissions.js';
import stripeRouter from './routes/stripe.js';
import adminRouter from './routes/admin.js';
import cronRouter from './routes/cron.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));

// IMPORTANT: Raw body handling for Stripe webhook MUST come BEFORE express.json()
// Stripe requires the raw request body to verify webhook signatures
app.use('/api/v1/stripe/webhook', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes
app.use(express.json());

// health should work even if DB is down
app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        node: process.version,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasPgCaCert: !!process.env.PG_CA_CERT,
    });
});

app.get('/api/db-ping', async (req, res, next) => {
  try {
    const t = Date.now();
    const r = await pool.query('SELECT 1 AS ok');
    res.json({ ok: r.rows[0].ok === 1, ms: Date.now() - t });
  } catch (e) {
    next(e);
  }
});

// public routes (individual endpoints within may still require auth)
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/merchants', merchantsRouter);
app.use('/api/v1/coupons', couponsRouter);
app.use('/api/v1/groups', groupsRouter);
app.use('/api/v1/coupon-submissions', couponSubmissionsRouter);
// Event submissions: individual endpoints apply auth() as needed (mirrors coupon-submissions)
app.use('/api/v1/event-submissions', eventSubmissionsRouter);
// Events: public read endpoints + auth-gated write/RSVP endpoints (individual routes apply auth)
app.use('/api/v1/events', eventsRouter);
// Stripe webhook is unauthenticated; security is Stripe-Signature + STRIPE_WEBHOOK_SECRET
app.use('/api/v1/stripe', stripeRouter);

// Cron endpoints are unauthenticated at the middleware level; individual routes
// enforce a CRON_SECRET header. Must be mounted OUTSIDE the admin auth chain
// because Vercel Cron cannot provide Cognito tokens.
app.use('/api/v1/cron', cronRouter);
// Legacy alias so existing Vercel Cron configs pointing at /admin/cron/... keep working.
app.use('/api/v1/admin/cron', cronRouter);

// 🔐 Super Admin "god mode" routes - require authentication + super_admin role
// Mounted with full auth chain for auditing and security
app.use('/api/v1/admin', auth(), resolveLocalUser, requireSuperAdmin, adminRouter);

// global error handler (get JSON instead of opaque 500)
app.use((err, req, res, _next) => {
    console.error('❌ Uncaught error:', err);
    res.status(500).json({ error: err?.message || 'Server error' });
});

export default app;
