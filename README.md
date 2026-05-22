# Viva Spot Coupon Book

Digital coupon management and redemption platform for foodie groups and local merchants.

## 🌟 Overview

Viva Spot Coupon Book is a full-stack web application designed to help "foodie groups" curate and sell digital coupon books featuring local merchants. The platform handles everything from merchant coupon submissions and group administration to secure QR-code-based redemption for customers.

### Core Tech Stack

- **Frontend**: [Vue 3](https://vuejs.org/) (Composition API), [Vuex](https://vuex.vuejs.org/), [Vue Router](https://router.vuejs.org/)
- **Backend**: [Node.js](https://nodejs.org/), [Express 5](https://expressjs.com/), [Drizzle ORM](https://orm.drizzle.team/)
- **Database**: [PostgreSQL](https://www.postgresql.org/)
- **Authentication**: [AWS Cognito](https://aws.amazon.com/cognito/)
- **Infrastructure**: [Vercel](https://vercel.com/)
- **Payments**: [Stripe](https://stripe.com/)
- **Testing**: [Vitest](https://vitest.dev/), [Supertest](https://github.com/ladjs/supertest), [PGLite](https://pglite.dev/)

---

## ✨ Key Features

### For Customers
- **Browse & Join Groups**: Discover local foodie groups and join their membership.
- **Digital Coupon Book**: Access a library of coupons from participating merchants.
- **QR Code Redemption**: Securely redeem coupons at physical locations using QR codes.
- **Event RSVPs**: View and sign up for upcoming foodie group events.

### For Merchants
- **Coupon Submissions**: Submit new coupon offers to foodie groups for approval.
- **Merchant Dashboard**: Manage your profile, view redemption history, and track engagement.
- **Event Hosting**: Coordinate with foodie groups to host special events.

### For Group Admins
- **Curation**: Review and approve/reject coupon and event submissions.
- **Membership Management**: Track user roles and group memberships.
- **Dashboard**: High-level overview of group activity and revenue.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: Local instance or AWS RDS
- **AWS CLI**: Configured with credentials for Cognito/S3 access

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/viva-spot-coupon-book.git
   cd viva-spot-coupon-book
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` and fill in your values (see [Environment Variables](#environment-variables) below).

### Local Development

Run the frontend and backend concurrently:

```bash
# Frontend (localhost:8080)
npm run serve

# Backend (localhost:3000)
npm run dev
```

### Stripe webhooks: dev vs production

Webhooks go to **different URLs** depending on environment. You don’t change app code—you use different Stripe config and secrets per environment.

| Environment | Where webhooks go | How to set it up |
|-------------|-------------------|-------------------|
| **Dev** | Your local machine | 1. Install [Stripe CLI](https://stripe.com/docs/stripe-cli).<br>2. Run `npm run stripe:listen` (forwards to `http://localhost:3000/api/v1/stripe/webhook` by default; set `PORT` if your backend uses another port).<br>3. Copy the printed `whsec_...` into `.env.development` as `STRIPE_WEBHOOK_SECRET`. |
| **Production** | Your Vercel app | 1. In [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks), add an endpoint.<br>2. URL: `https://<your-vercel-domain>/api/v1/stripe/webhook`.<br>3. Subscribe events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`.<br>4. Copy the endpoint’s **Signing secret** into Vercel’s env as `STRIPE_WEBHOOK_SECRET`. |

In dev, keep `npm run stripe:listen` running in a separate terminal so events from Stripe (or the CLI) are forwarded to your local server.

#### Required Stripe webhook event subscriptions

For one-time billing, subscribe to:
- `checkout.session.completed`
- `checkout.session.expired`
- `charge.refunded`

For subscription billing (required when any group uses `billing_model='subscription'`), also subscribe to:
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.upcoming`
- `customer.subscription.updated`
- `customer.subscription.deleted`

#### Verifying the production webhook (before or after deploy)

1. **Stripe CLI in live mode**  
   Forward live events to your production URL (use the same signing secret from Stripe Dashboard for that endpoint):
   ```bash
   stripe listen --forward-to https://<production-domain>/api/v1/stripe/webhook
   ```
   Then trigger a test payment or use the CLI to send a test event.

2. **Stripe Dashboard**  
   **Webhooks** → your production endpoint → **Send test webhook** → choose `checkout.session.completed` (or another subscribed event).

If signature verification fails in production (e.g. 400 "Webhook Error"), the request body may have been parsed before verification. This app avoids that on Vercel by routing `POST /api/v1/stripe/webhook` to a dedicated serverless function (`api/stripe-webhook.js`) that never uses a body parser and reads the raw stream before calling Stripe’s `constructEvent`. The rewrite is in `vercel.json`; the shared logic lives in `server/src/stripeWebhookHandler.js`.

---

## 🛠️ Database Management

The project uses **Drizzle ORM** for schema management and migrations.

- **Generate & Push Migrations**:
  ```bash
  npm run migrate
  ```
- **Pull Schema from DB**:
  ```bash
  npm run pull-schema
  ```

Schema definition can be found in `server/src/schema.ts`.

---

## 🧪 Testing

The test suite is powered by **Vitest** and covers unit, integration, and UI tests.

```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

See [tests/README.md](./tests/README.md) for detailed testing documentation.

---

## 📡 Environment Variables

Create a `.env` file in the root directory. Key variables include:

### Backend
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_HOST` / `DB_USER` / `DB_PASS` | Discrete DB connection params |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `COGNITO_USER_POOL_ID` | AWS Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | AWS Cognito App Client ID |
| `AWS_S3_MERCHANT_LOGO_BUCKET`| S3 bucket for merchant assets |

### Frontend
| Variable | Description |
|----------|-------------|
| `VUE_APP_API_URL` | Backend API base URL |
| `VUE_APP_GOOGLE_MAPS_API_KEY`| API key for map features |

### Stripe
| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Publishable key (`pk_test_...` or `pk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Per-environment: dev = from `stripe listen`; production = from Dashboard webhook endpoint |
| `APP_URL` | Legacy alias for `APP_PUBLIC_URL`. Either works; `APP_PUBLIC_URL` takes precedence. |
| `APP_PUBLIC_URL` | Public base URL for this environment. Used for Stripe redirects and transactional email links when there's no request context. Set per Vercel environment: prod = your prod URL; preview = leave unset so the per-deployment `VERCEL_URL` is used; dev = `http://localhost:8080`. |
| `ALLOWED_APP_ORIGINS` | Comma-separated allowlist of `Origin` headers permitted to drive Stripe checkout success/cancel URLs. Supports exact origins and wildcard subdomain patterns (e.g. `https://*.vercel.app`). Set once across all environments. |

### Email & Cron (subscription billing)
| Variable | Description |
|----------|-------------|
| `N8N_NOTIFICATION_WEBHOOK_URL` | n8n webhook that receives transactional email requests. Cron/webhooks schedule the work; n8n sends the email. |
| `PAID_EVENT_NOTIFICATION_WEBHOOK_URL` | Optional paid-events-specific n8n webhook override. Falls back to `N8N_NOTIFICATION_WEBHOOK_URL`. |
| `CRON_SECRET` | Random secret used to authenticate Vercel cron calls to `/api/v1/cron/*` (legacy alias: `/api/v1/admin/cron/*`). Generate with `openssl rand -hex 32`. |
| `ACCESS_MIGRATION_GRACE_DAYS` | Days of access to grant when backfilling existing purchases (default: `365`) |

### Stripe Customer Portal (subscription management)
Configure the Stripe Customer Portal at [dashboard.stripe.com/settings/billing/portal](https://dashboard.stripe.com/settings/billing/portal) to allow subscribers to cancel, update payment methods, and view invoices.

---

## 📂 Project Structure

```text
├── drizzle/              # DB Migrations & snapshots
├── public/               # Frontend static assets
├── scripts/              # Maintenance & utility scripts
├── server/
│   ├── src/
│   │   ├── middleware/   # Express middlewares (Auth, etc.)
│   │   ├── routes/       # API endpoints (Coupons, Users, etc.)
│   │   ├── index.js      # Main API entry point
│   │   └── schema.ts     # Drizzle schema definitions
├── src/
│   ├── assets/           # Frontend styles & images
│   ├── components/       # Reusable Vue components
│   ├── router/           # Vue Router config
│   ├── services/         # API & Auth services
│   ├── store/            # Vuex state management
│   └── views/            # Main page components
├── tests/                # Full test suite
├── vercel.json           # Vercel deployment config
└── package.json          # Project dependencies & scripts
```

---

## 📦 Deployment

### Vercel (Recommended)

The project is optimized for deployment on Vercel.

1.  **Frontend**: Standard Vue SPA build.
2.  **Backend**: The Express app in `server/src/` is automatically served via Vercel Serverless Functions through the `api/[...slug].js` entrypoint.

To deploy:
```bash
vercel --prod
```

### Local Development
The project can also be run locally using the `npm run dev` and `npm run serve` commands.

---

## 🔄 Subscription Rollout Runbook

Follow this sequence when enabling subscription billing for the first time or for a new group.

### 1. Database Migration

```bash
# Apply schema migration 0014 (additive, safe to run on live DB)
npm run migrate
```

### 2. Backfill Existing Purchases (one-time)

```bash
# Preview what will change
node scripts/migrate-existing-purchases.js --dry-run

# Apply (stamps expires_at = now + ACCESS_MIGRATION_GRACE_DAYS on legacy purchases)
node scripts/migrate-existing-purchases.js
```

After this runs, `expires_at IS NULL` means admin_grant (perpetual) only.

### 3. Stripe Configuration

1. Add new webhook event subscriptions (see [Required Stripe webhook event subscriptions](#required-stripe-webhook-event-subscriptions)).
2. Configure the [Stripe Customer Portal](https://dashboard.stripe.com/settings/billing/portal):
   - Enable subscription cancellation
   - Enable payment method updates
   - Enable invoice download

### 4. Environment Variables

Set in your Vercel project:
- `N8N_NOTIFICATION_WEBHOOK_URL` — n8n transactional email webhook
- `CRON_SECRET` — secret for cron endpoint auth
- Ensure `STRIPE_WEBHOOK_SECRET` is updated if you added new events to the endpoint

### 5. Deploy Application

```bash
vercel --prod
```

### 6. Enable Subscription for a Group (super admin)

1. In the Super Admin Dashboard → Groups → edit a group.
2. Set `billing_model = 'subscription'`.
3. In the pricing panel, set `billing_interval` and `billing_interval_count` (e.g. `month` / `1` for monthly).
4. This creates a recurring Stripe Price automatically.

### 7. Verify on Staging

- Complete a test subscription checkout with a Stripe test card.
- Verify `purchase.subscriptionStatus = 'active'` and `expires_at` is set.
- Simulate a renewal: `stripe trigger invoice.payment_succeeded`.
- Simulate cancellation: `stripe trigger customer.subscription.deleted`.
- Confirm cron endpoint: `curl -X POST /api/v1/cron/renewal-reminders -H "x-cron-secret: $CRON_SECRET"` (the legacy alias `/api/v1/admin/cron/renewal-reminders` also works).

---

## 📄 License

This project is private and proprietary.
