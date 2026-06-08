/**
 * Seed three test users for QA, one per role tier:
 *   - customer            (areeya@ivalu8.com   / Customer1!)
 *   - merchant            (areeya+1@ivalu8.com / Merchant1!)
 *   - foodie_group_admin  (areeya+2@ivalu8.com / FoodieAdmin1!)
 *
 * For each, this script:
 *   1. Creates the AWS Cognito user (email_verified=true, suppresses welcome
 *      email) then sets a permanent password — no force-change-on-first-login,
 *      no email link to click. They can log in immediately.
 *   2. Inserts (or reuses) a row in the local `user` table keyed on
 *      cognito_sub, with the right role.
 *   3. Applies role-specific extras:
 *      - customer: $0 / provider='test' paid purchase on the chapel-hill group
 *        so they have immediate coupon-book access (skips Stripe checkout).
 *      - merchant: "Test Tester's Cafe" merchant row owned by them so they can
 *        immediately submit coupons.
 *      - foodie_group_admin: foodie_group_membership row, role='foodie_group_admin',
 *        on the chapel-hill group.
 *
 * Idempotent — safe to re-run. Reuses existing Cognito users / DB rows; only
 * makes the additional inserts/updates needed to converge on the target state.
 *
 * Cleanup markers (so test data is easy to find later):
 *   - purchase.provider = 'test'
 *   - purchase.metadata.source = 'seed-test-users.js'
 *   - merchant.name LIKE 'Test%'
 *   - user.email LIKE 'areeya%@ivalu8.com'
 *
 * Usage (from repo root):
 *   DB_HOST=couponbook-instance-1.ch2ctwanaaas.us-east-1.rds.amazonaws.com \
 *   DB_PORT=5432 \
 *   DB_USER=couponadmin \
 *   DB_PASS='starfish*73T93' \
 *   DB_NAME=vivaspot \
 *   COGNITO_USER_POOL_ID=us-east-1_O1hbHZsSq \
 *   AWS_REGION=us-east-1 \
 *   node scripts/seed-test-users.js
 *
 *   # Preview without making any changes:
 *   node scripts/seed-test-users.js --dry-run
 */

import 'dotenv/config';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { and, eq, isNull } from 'drizzle-orm';
import { db, pool } from '../server/src/db.js';
import {
  user,
  merchant,
  foodieGroup,
  foodieGroupMembership,
  purchase,
} from '../server/src/schema.js';

const DRY = process.argv.includes('--dry-run');
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_O1hbHZsSq';
const REGION = process.env.AWS_REGION || 'us-east-1';
const CHAPEL_HILL_SLUG = 'chapel-hill';

const TEST_USERS = [
  {
    label: 'customer',
    email: 'areeya@ivalu8.com',
    password: 'Customer1!',
    role: 'customer',
    name: 'Areeya (Test Customer)',
    extras: { prePaidGroup: CHAPEL_HILL_SLUG },
  },
  {
    label: 'merchant',
    email: 'areeya+1@ivalu8.com',
    password: 'Merchant1!',
    role: 'merchant',
    name: 'Areeya (Test Merchant)',
    extras: { merchantName: "Test Tester's Cafe" },
  },
  {
    label: 'foodie_group_admin',
    email: 'areeya+2@ivalu8.com',
    password: 'FoodieAdmin1!',
    role: 'foodie_group_admin',
    name: 'Areeya (Test Foodie Admin)',
    extras: { groupAdminSlug: CHAPEL_HILL_SLUG },
  },
];

const cognito = new CognitoIdentityProviderClient({ region: REGION });

function tag() {
  return DRY ? '[DRY]' : '     ';
}

async function ensureCognitoUser(email, password) {
  let sub;
  if (DRY) {
    console.log(`${tag()}  would create or reuse Cognito user: ${email}`);
    console.log(`${tag()}  would set permanent password`);
    return '00000000-0000-0000-0000-000000000000';
  }

  try {
    const created = await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS', // do not send welcome / temp-password emails
    }));
    sub = created.User.Attributes.find((a) => a.Name === 'sub').Value;
    console.log(`        ✅ Created Cognito user (sub=${sub.slice(0, 8)}…)`);
  } catch (e) {
    if (e.name === 'UsernameExistsException') {
      const got = await cognito.send(new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
      }));
      sub = got.UserAttributes.find((a) => a.Name === 'sub').Value;
      console.log(`        ⚠️  Cognito user already exists (sub=${sub.slice(0, 8)}…) — reusing`);
    } else {
      throw e;
    }
  }

  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    Password: password,
    Permanent: true,
  }));
  console.log(`        ✅ Permanent password set (no force-change prompt)`);

  return sub;
}

async function ensureUserRow({ sub, email, name, role }) {
  if (DRY) {
    console.log(`${tag()}  would insert or update local user row: ${email} role=${role}`);
    return '00000000-0000-0000-0000-000000000001';
  }
  const [existing] = await db
    .select({ id: user.id, role: user.role, deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.cognitoSub, sub));
  if (existing) {
    const updates = {};
    if (existing.role !== role) updates.role = role;
    if (existing.deletedAt) updates.deletedAt = null; // revive a soft-deleted test user
    if (Object.keys(updates).length) {
      updates.updatedAt = new Date().toISOString();
      await db.update(user).set(updates).where(eq(user.id, existing.id));
      console.log(`        ✅ Updated existing user row (${Object.keys(updates).filter((k) => k !== 'updatedAt').join(', ')})`);
    } else {
      console.log(`        ⚠️  User row already exists with correct role`);
    }
    return existing.id;
  }
  const [inserted] = await db
    .insert(user)
    .values({ cognitoSub: sub, email, name, role })
    .returning({ id: user.id });
  console.log(`        ✅ Inserted user row (id=${inserted.id.slice(0, 8)}…)`);
  return inserted.id;
}

async function ensurePrePaidPurchase(userId, groupSlug) {
  if (DRY) {
    console.log(`${tag()}  would ensure $0 paid purchase on ${groupSlug}`);
    return;
  }
  const [group] = await db
    .select({ id: foodieGroup.id })
    .from(foodieGroup)
    .where(and(eq(foodieGroup.slug, groupSlug), isNull(foodieGroup.archivedAt)));
  if (!group) throw new Error(`Foodie group not found: ${groupSlug}`);

  const [existing] = await db
    .select({ id: purchase.id })
    .from(purchase)
    .where(and(
      eq(purchase.userId, userId),
      eq(purchase.groupId, group.id),
      eq(purchase.status, 'paid'),
    ));
  if (existing) {
    console.log(`        ⚠️  Paid purchase already exists on ${groupSlug}`);
    return;
  }
  await db.insert(purchase).values({
    userId,
    groupId: group.id,
    provider: 'test',
    amountCents: 0,
    currency: 'usd',
    status: 'paid',
    purchasedAt: new Date().toISOString(),
    metadata: { source: 'seed-test-users.js' },
  });
  console.log(`        ✅ Inserted $0 test purchase on ${groupSlug}`);
}

async function ensureMerchant(userId, merchantName) {
  if (DRY) {
    console.log(`${tag()}  would create/reuse merchant "${merchantName}"`);
    return;
  }
  const [existing] = await db
    .select({ id: merchant.id, name: merchant.name })
    .from(merchant)
    .where(and(eq(merchant.ownerId, userId), isNull(merchant.deletedAt)));
  if (existing) {
    console.log(`        ⚠️  Merchant already exists for this user: "${existing.name}"`);
    return;
  }
  const [inserted] = await db
    .insert(merchant)
    .values({ name: merchantName, ownerId: userId })
    .returning({ id: merchant.id });
  console.log(`        ✅ Inserted merchant "${merchantName}" (id=${inserted.id.slice(0, 8)}…)`);
}

async function ensureGroupAdminMembership(userId, groupSlug) {
  if (DRY) {
    console.log(`${tag()}  would ensure foodie_group_admin membership on ${groupSlug}`);
    return;
  }
  const [group] = await db
    .select({ id: foodieGroup.id })
    .from(foodieGroup)
    .where(and(eq(foodieGroup.slug, groupSlug), isNull(foodieGroup.archivedAt)));
  if (!group) throw new Error(`Foodie group not found: ${groupSlug}`);

  const [existing] = await db
    .select({ id: foodieGroupMembership.id, role: foodieGroupMembership.role, deletedAt: foodieGroupMembership.deletedAt })
    .from(foodieGroupMembership)
    .where(and(
      eq(foodieGroupMembership.userId, userId),
      eq(foodieGroupMembership.groupId, group.id),
    ));
  if (existing) {
    const updates = {};
    if (existing.role !== 'foodie_group_admin') updates.role = 'foodie_group_admin';
    if (existing.deletedAt) updates.deletedAt = null;
    if (Object.keys(updates).length) {
      await db.update(foodieGroupMembership).set(updates).where(eq(foodieGroupMembership.id, existing.id));
      console.log(`        ✅ Updated existing membership (${Object.keys(updates).join(', ')})`);
    } else {
      console.log(`        ⚠️  Membership already grants foodie_group_admin on ${groupSlug}`);
    }
    return;
  }
  await db.insert(foodieGroupMembership).values({
    userId,
    groupId: group.id,
    role: 'foodie_group_admin',
    joinedAt: new Date().toISOString(),
  });
  console.log(`        ✅ Inserted foodie_group_admin membership on ${groupSlug}`);
}

async function main() {
  console.log(`🌱 Seeding ${TEST_USERS.length} test users — pool=${USER_POOL_ID} ${DRY ? '(DRY RUN, no writes)' : '(LIVE)'}`);

  const summary = [];
  for (const u of TEST_USERS) {
    console.log(`\n──────── ${u.label} ────────`);
    console.log(`  Email:    ${u.email}`);
    console.log(`  Password: ${u.password}`);
    console.log(`  Role:     ${u.role}`);

    const sub = await ensureCognitoUser(u.email, u.password);
    const userId = await ensureUserRow({ sub, email: u.email, name: u.name, role: u.role });

    if (u.extras.prePaidGroup) await ensurePrePaidPurchase(userId, u.extras.prePaidGroup);
    if (u.extras.merchantName) await ensureMerchant(userId, u.extras.merchantName);
    if (u.extras.groupAdminSlug) await ensureGroupAdminMembership(userId, u.extras.groupAdminSlug);

    summary.push({ label: u.label, email: u.email, password: u.password, role: u.role });
  }

  // Final credentials summary — paste to your tester
  const line = '═'.repeat(78);
  console.log(`\n${line}`);
  console.log('  CREDENTIALS — hand these to your tester');
  console.log(`${line}`);
  for (const s of summary) {
    console.log(
      `  ${s.label.padEnd(22)} ${s.email.padEnd(26)} ${s.password.padEnd(16)} (${s.role})`
    );
  }
  console.log(`${line}\n`);

  await pool.end();
}

main().catch(async (err) => {
  console.error('❌ Failed:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
