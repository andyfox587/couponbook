# Staging environment — setup

A second, fully working deployment of the app for testing the new consumer UI.
Same code, same RDS instance, **different database** — so real logins,
redemptions and uploads all work, and none of it touches live customers.

| | Production | Staging |
|---|---|---|
| Vercel project | `couponbook` | `couponbook-staging` (new) |
| Git branch | `main` | **`staging`** |
| Database | `vivaspot` | **`vivaspot_staging`** |
| Stripe | **live** keys | **test** keys |
| URL | couponbook.vivaspot.com | (assigned by Vercel) |

---

## 1 · Create the Vercel project — *5 min, you*

Vercel → **Add New → Project** → import **`andyfox587/couponbook`** (the same repo;
Vercel already has access).

Then, before the first deploy:

- **Project Name:** `couponbook-staging`
- **Settings → Git → Production Branch:** change `main` → **`staging`**
  *(critical — otherwise staging deploys production code)*
- Framework preset / build command: leave as detected (same as prod)

## 2 · Environment variables

Copy every variable from the production project, then **change these five**:

| Variable | Staging value | Why |
|---|---|---|
| `DB_NAME` | `vivaspot_staging` | the isolated clone |
| `STRIPE_MODE` | `test` | no real charges |
| `STRIPE_SECRET_KEY` | your `sk_test_…` | " |
| `STRIPE_PUBLISHABLE_KEY` | your `pk_test_…` | " |
| `STRIPE_WEBHOOK_SECRET` | a **test-mode** `whsec_…` | " |

Keep identical to production: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`,
`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, the `AWS_S3_*`
buckets, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `VUE_APP_API_URL`,
`VUE_APP_GOOGLE_MAPS_API_KEY`, `CRON_SECRET`.

Set to the staging URL once Vercel assigns it: `APP_URL`, `APP_PUBLIC_URL`,
and add it to `ALLOWED_APP_ORIGINS`.

> ⚠️ **Do not** leave `DB_NAME` as `vivaspot`. That single variable is what
> keeps staging from writing to live customer records.

## 3 · Cognito callback — *me, once you have the URL*

The staging URL must be registered on the Cognito app client or sign-in fails:

```
https://<staging-url>/callback     → CallbackURLs
https://<staging-url>              → LogoutURLs
```

Send me the URL and I'll add both via the AWS CLI.

## 4 · Refreshing staging data

Staging drifts as you test. To reset it to a fresh copy of production:

```bash
./scripts/clone-prod-to-staging.sh
```

Production is only ever read. External customer emails are rewritten to
`@staging.invalid` so staging can never mail a real member; team addresses
(`@ivalu8.com`, `@vivaspot.com`) are preserved so you can still sign in as
yourself.

---

## What's deliberately shared with production

- **RDS instance** (different database on it) — no extra infra cost
- **Cognito user pool** — sign in with the same credentials
- **S3 buckets** — uploads land alongside production assets

If you'd rather isolate S3 too, add a staging prefix/bucket later; it's
cosmetic, not a data-safety issue.
