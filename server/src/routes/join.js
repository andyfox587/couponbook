// server/src/routes/join.js
// PUBLIC coupon-first merchant onboarding: "Get your deal in the book."
//
// One form, no login: restaurant + the deal + contact email. On submit this
// orchestrates everything the admin used to do by hand:
//   1. pending coupon submission  → the group admin's existing approval queue
//   2. restaurant (merchant) record, with optional logo upload
//   3. an invited account (Cognito temp password emailed) — or quiet adoption
//      of an existing account with the same email
//
// The merchant may never sign in; everything still works. Safety on a public
// endpoint: honeypot field, light per-IP rate limit, size-capped upload, and —
// most importantly — nothing goes live without group-admin approval.
import express from 'express';
import { db } from '../db.js';
import { user, merchant, couponSubmission, foodieGroup } from '../schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminConfirmSignUpCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  upload,
  handleMulterError,
  ALLOWED_MIME_TYPES,
  getExtensionFromMime,
  uploadFileToS3,
} from '../lib/uploadHelper.js';

const router = express.Router();
console.log('📦  join (public onboarding) router loaded');

// NOTE: keep the region fallback — an empty AWS_REGION crashes at module load.
const cognito = new CognitoIdentityProviderClient({
  region: (process.env.AWS_REGION || 'us-east-1').trim(),
});
const POOL_ID = (process.env.COGNITO_USER_POOL_ID || '').trim();
const REGION = (process.env.AWS_REGION || 'us-east-1').trim();
const LOGO_BUCKET = process.env.AWS_S3_MERCHANT_LOGO_BUCKET;
const LOGO_BASE_URL =
  process.env.AWS_S3_MERCHANT_LOGO_BASE_URL ||
  (LOGO_BUCKET ? `https://${LOGO_BUCKET}.s3.${REGION}.amazonaws.com` : null);
// Same n8n notification the in-app submission flow fires.
const NOTIFY_WEBHOOK = 'https://n8n.vivaspot.com/webhook/7d15576d-01a3-49c8-b0f4-6c490e54baa7';

const COUPON_TYPES = ['percent', 'amount', 'bogo', 'free_item'];

// Best-effort per-IP limiter (per serverless instance — a speed bump, not a wall;
// the approval gate is the real filter).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 6;
}

router.post('/', upload.single('logo'), handleMulterError, async (req, res, next) => {
  try {
    const b = req.body || {};

    // Honeypot: hidden field real users never fill. Pretend success for bots.
    if ((b.company || '').trim() !== '') return res.status(200).json({ ok: true });

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'unknown';
    if (rateLimited(ip)) {
      return res.status(429).json({ error: 'Too many submissions from this connection — please try again in an hour.' });
    }

    // ---- gather + validate --------------------------------------------------
    const restaurantName = (b.restaurant_name || '').trim();
    const groupId = (b.group_id || '').trim();
    const cuisine = (b.cuisine_type || '').trim();
    const website = (b.website || '').trim();
    const instagramRaw = (b.instagram || '').trim();
    const contactName = (b.contact_name || '').trim();
    const email = (b.email || '').trim().toLowerCase();
    const couponType = (b.coupon_type || '').trim();
    const discountValue = parseFloat(b.discount_value) || 0;
    const title = (b.title || '').trim();
    const description = (b.description || '').trim();
    const validFrom = (b.valid_from || '').trim();
    const expiresAt = (b.expires_at || '').trim();

    const fail = (msg) => res.status(400).json({ error: msg });

    if (restaurantName.length < 2 || restaurantName.length > 255) return fail('Restaurant name is required');
    if (!groupId) return fail('Please choose your foodie group');
    if (!contactName || contactName.length > 255) return fail('Your name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return fail('A valid email address is required');
    if (!COUPON_TYPES.includes(couponType)) return fail('Please choose an offer type');
    if ((couponType === 'percent' || couponType === 'amount') && !(discountValue > 0)) {
      return fail('Please enter the discount value');
    }
    if (couponType === 'percent' && discountValue > 100) return fail('Percent off cannot exceed 100');
    if (title.length < 3 || title.length > 255) return fail('A short coupon title is required');
    if (description.length < 3 || description.length > 2000) return fail('Please describe the offer (a sentence or two)');
    const vf = new Date(validFrom);
    const ex = new Date(expiresAt);
    if (Number.isNaN(vf.getTime())) return fail('Valid-from date is required');
    if (Number.isNaN(ex.getTime())) return fail('Expiration date is required');
    if (ex <= vf) return fail('The expiration date must be after the valid-from date');
    if (website) {
      try {
        const u = new URL(website.startsWith('http') ? website : `https://${website}`);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
      } catch {
        return fail('Website must be a valid URL (or leave it blank)');
      }
    }
    if (req.file && !ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      return fail('Logo must be a PNG, JPG or WebP image');
    }

    // Instagram: accept "@handle", "handle", or a full instagram.com URL →
    // normalize to https://instagram.com/<handle>. Optional.
    let instagramUrl = null;
    if (instagramRaw) {
      let handle = instagramRaw.replace(/^@/, '');
      const m = handle.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
      if (m) handle = m[1];
      if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
        return fail('Instagram should be your handle, like @yourrestaurant');
      }
      instagramUrl = `https://instagram.com/${handle}`;
    }

    const [group] = await db
      .select({ id: foodieGroup.id, name: foodieGroup.name })
      .from(foodieGroup)
      .where(eq(foodieGroup.id, groupId))
      .limit(1);
    if (!group) return fail('That foodie group was not found');

    if (!POOL_ID) return res.status(500).json({ error: 'Sign-up is not configured on the server' });

    // ---- 1) account: invite new, or quietly adopt existing ------------------
    let sub = null;
    let invited = false;
    try {
      const created = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: contactName },
        ],
        DesiredDeliveryMediums: ['EMAIL'], // temp password lands in their inbox
      }));
      sub = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
      invited = true;
    } catch (err) {
      if (err?.name === 'UsernameExistsException') {
        const found = await cognito.send(new AdminGetUserCommand({ UserPoolId: POOL_ID, Username: email }));
        const attrs = Object.fromEntries((found.UserAttributes || []).map((a) => [a.Name, a.Value]));
        sub = attrs.sub;
        if (found.UserStatus === 'UNCONFIRMED') {
          await cognito.send(new AdminConfirmSignUpCommand({ UserPoolId: POOL_ID, Username: email }));
        }
        if (attrs.email_verified !== 'true') {
          await cognito.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: POOL_ID,
            Username: email,
            UserAttributes: [{ Name: 'email_verified', Value: 'true' }],
          }));
        }
      } else if (err?.name === 'InvalidParameterException') {
        return fail(err.message);
      } else {
        throw err;
      }
    }
    if (!sub) return res.status(500).json({ error: 'Could not create your account — please try again' });

    // ---- 2) local user row (merchant) ---------------------------------------
    let [row] = await db.select().from(user).where(eq(user.cognitoSub, sub)).limit(1);
    if (!row) {
      [row] = await db.select().from(user).where(and(eq(user.email, email), isNull(user.deletedAt))).limit(1);
    }
    if (!row) {
      [row] = await db
        .insert(user)
        .values({ cognitoSub: sub, email, name: contactName, role: 'merchant' })
        .returning();
    } else if (row.role === 'customer') {
      // A member becoming a merchant — upgrade. Never touches admin roles.
      [row] = await db.update(user).set({ role: 'merchant' }).where(eq(user.id, row.id)).returning();
    }

    // ---- 3) restaurant record (reuse if this owner already has the name) ----
    let [rest] = await db
      .select()
      .from(merchant)
      .where(and(eq(merchant.ownerId, row.id), eq(merchant.name, restaurantName), isNull(merchant.deletedAt)))
      .limit(1);
    if (!rest) {
      [rest] = await db
        .insert(merchant)
        .values({
          name: restaurantName,
          ownerId: row.id,
          websiteUrl: website ? (website.startsWith('http') ? website : `https://${website}`) : null,
          instagramUrl,
        })
        .returning();
    } else if (instagramUrl && !rest.instagramUrl) {
      await db.update(merchant).set({ instagramUrl }).where(eq(merchant.id, rest.id));
    }

    // ---- 4) optional logo → S3 ----------------------------------------------
    if (req.file && LOGO_BUCKET && LOGO_BASE_URL) {
      try {
        const ext = getExtensionFromMime(req.file.mimetype);
        const key = `logos/merchants/${rest.id}/logo-${Math.random().toString(36).slice(2)}.${ext}`;
        const logoUrl = await uploadFileToS3({
          bucket: LOGO_BUCKET,
          baseUrl: LOGO_BASE_URL,
          key,
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
        });
        await db.update(merchant).set({ logoUrl }).where(eq(merchant.id, rest.id));
      } catch (e) {
        // Logo is a nice-to-have; the initials chip covers a failed upload.
        console.error('📦  join: logo upload failed (continuing without)', e?.message);
      }
    }

    // ---- 5) the coupon → the group admin's pending queue --------------------
    const submissionData = {
      title,
      description,
      coupon_type: couponType,
      discount_value: couponType === 'percent' || couponType === 'amount' ? discountValue : 0,
      valid_from: validFrom,
      expires_at: expiresAt,
      qr_code_url: null,
      locked: false,
      cuisine_type: cuisine || null,
    };
    const [submission] = await db
      .insert(couponSubmission)
      .values({
        groupId: group.id,
        merchantId: rest.id,
        state: 'pending',
        submissionData,
      })
      .returning();

    // ---- 6) notify the admins (same n8n hook the in-app flow uses) ----------
    try {
      await fetch(NOTIFY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: email,
          groupId: group.id,
          merchantId: rest.id,
          submission_data: submissionData,
          source: 'public-join',
        }),
      });
    } catch (e) {
      console.error('📦  join: notify webhook failed (submission is saved)', e?.message);
    }

    console.log(`📦  join: submission ${submission.id} · ${restaurantName} → ${group.name} · invited=${invited}`);

    return res.status(201).json({
      ok: true,
      invited,
      restaurant: rest.name,
      group: group.name,
      message: invited
        ? 'Your deal is in! It goes live once the group approves it. We also emailed you a temporary password so you can sign in later — no rush.'
        : 'Your deal is in! It goes live once the group approves it. This email already has an account — your existing sign-in still works.',
    });
  } catch (err) {
    console.error('📦  error in POST /join', err);
    next(err);
  }
});

export default router;
