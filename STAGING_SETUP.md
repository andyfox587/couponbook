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

Order matters, because the two settings happen at different times: **env vars are
set during import; the branch can only be changed after the project exists.**

1. Vercel → **Add New → Project** → import **`andyfox587/couponbook`**
   (the same repo — Vercel already has access).
2. **Project Name:** `couponbook-staging`. Leave framework/build as detected.
3. Expand **Environment Variables** on that same screen and add them all
   (see §2). Doing it now means the first build already works.
4. **Deploy.** This first build comes from `main`, because Vercel defaults to the
   repo's default branch and offers no branch choice during import. That's
   expected and harmless — production *code* against the staging *database* —
   and it proves the DB connection works.
5. **Settings → Git → Production Branch:** change `main` → **`staging`**.
6. **Deployments → ⋯ → Redeploy.** Now you're running the staging branch.

> Step 6 is the easy one to forget. Until it's done the site looks exactly like
> production and you'll wonder where the new UI went.

## 2 · Environment variables

Copy every variable from the production project, then **change these five**:

| Variable | Staging value | Why |
|---|---|---|
| `DB_NAME` | `vivaspot_staging` | the isolated clone |
| `STRIPE_MODE` | `test` | no real charges |
| `STRIPE_SECRET_KEY` | your `sk_test_…` | " |
| `STRIPE_PUBLISHABLE_KEY` | your `pk_test_…` | " |
| `STRIPE_WEBHOOK_SECRET` | a **test-mode** `whsec_…` for the *staging URL* | see below |

Keep identical to production: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`,
`AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, the `AWS_S3_*`
buckets, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `VUE_APP_API_URL`,
`VUE_APP_GOOGLE_MAPS_API_KEY`, `CRON_SECRET`.

Set to the staging URL once Vercel assigns it: `APP_URL`, `APP_PUBLIC_URL`,
and add it to `ALLOWED_APP_ORIGINS`.

> ⚠️ **Do not** leave `DB_NAME` as `vivaspot`. That single variable is what
> keeps staging from writing to live customer records.

### The Stripe keys

`pk_test_…` and `sk_test_…` both come from
[dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys)
(publishable is visible; secret needs **Reveal test key**).

`STRIPE_WEBHOOK_SECRET` is different: signing secrets are **per endpoint**, so
an old test secret pointing at couponbook.vivaspot.com will not validate
anything sent to staging. Mint one for the staging URL:

```bash
STRIPE_KEY=sk_test_… node scripts/stripe-create-webhook.mjs \
  --url https://<staging-url>
```

It subscribes the same 14 events the handler processes and prints the secret
once. Only needed if you want to test purchases; browsing and redemption work
without it.

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
