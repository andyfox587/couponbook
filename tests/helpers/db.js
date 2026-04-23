// Test database utilities using PGlite (in-memory PostgreSQL)
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../../drizzle/schema';
import { readFileSync } from 'fs';
import { join } from 'path';

// Tests run from project root, so use relative path from there
const drizzleDir = join(process.cwd(), 'drizzle');

let pglite = null;
let testDb = null;
let isInitialized = false;

/**
 * Run SQL migrations to set up the database schema
 */
async function runMigrations(pg) {
  
  // Read and execute migration files in order
  const migration0 = readFileSync(join(drizzleDir, '0000_mature_betty_brant.sql'), 'utf-8');
  const migration1 = readFileSync(join(drizzleDir, '0001_nifty_cloak.sql'), 'utf-8');
  const migration2 = readFileSync(join(drizzleDir, '0002_add_foodie_group_admin_role.sql'), 'utf-8');
  const migration3 = readFileSync(join(drizzleDir, '0003_add_rejection_message_to_coupon_submission.sql'), 'utf-8');
  const migration4 = readFileSync(join(drizzleDir, '0004_add_super_admin_role.sql'), 'utf-8');
  const migration5 = readFileSync(join(drizzleDir, '0005_add_stripe_checkout_support.sql'), 'utf-8');
  const migration6 = readFileSync(join(drizzleDir, '0006_add_membership_unique_constraint.sql'), 'utf-8');
  const migration7 = readFileSync(join(drizzleDir, '0007_add_admin_audit_and_user_anonymization.sql'), 'utf-8');
  const migration8 = readFileSync(join(drizzleDir, '0008_add_stripe_test_live_ids.sql'), 'utf-8');
  const migration9 = readFileSync(join(drizzleDir, '0009_add_submission_timestamps.sql'), 'utf-8');
  const migration10 = readFileSync(join(drizzleDir, '0010_expand_event_schema.sql'), 'utf-8');
  const migration11 = readFileSync(join(drizzleDir, '0011_expand_event_rsvp.sql'), 'utf-8');
  const migration12 = readFileSync(join(drizzleDir, '0012_expand_event_submission.sql'), 'utf-8');
  const migration13 = readFileSync(join(drizzleDir, '0013_expand_attendance_status.sql'), 'utf-8');
  const migration14 = readFileSync(join(drizzleDir, '0014_add_subscription_support.sql'), 'utf-8');
  
  // Split by statement breakpoint and execute each statement
  const statements0 = migration0.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  const statements1 = migration1.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  const statements2 = migration2.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  const statements3 = migration3.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  const statements4 = migration4.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  // Migration 5+ use semicolons as delimiters (raw SQL, not drizzle format)
  // We need to keep statements that contain SQL even if they start with comments
  const statements5 = migration5
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      // Strip leading comment lines and check if there's actual SQL content
      const withoutComments = s.split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      return withoutComments.length > 0;
    });

  const statements6 = migration6
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const withoutComments = s.split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      return withoutComments.length > 0;
    });

  const statements7 = migration7
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const withoutComments = s.split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      return withoutComments.length > 0;
    });

  const statements8 = migration8
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const withoutComments = s.split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      return withoutComments.length > 0;
    });

  const statements9 = migration9
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const withoutComments = s.split('\n')
        .filter(line => !line.trim().startsWith('--'))
        .join('\n')
        .trim();
      return withoutComments.length > 0;
    });
  
  for (const stmt of statements0) {
    await pg.exec(stmt);
  }
  
  for (const stmt of statements1) {
    await pg.exec(stmt);
  }

  for (const stmt of statements2) {
    await pg.exec(stmt);
  }

  for (const stmt of statements3) {
    await pg.exec(stmt);
  }

  for (const stmt of statements4) {
    await pg.exec(stmt);
  }

  for (const stmt of statements5) {
    try {
      await pg.exec(stmt);
    } catch (e) {
      // Some statements might fail in PGlite (like partial indexes)
      // Continue with other statements
    }
  }

  for (const stmt of statements6) {
    try {
      await pg.exec(stmt);
    } catch (e) {
      // Some statements might fail in PGlite (like partial indexes)
      // Continue with other statements
    }
  }

  for (const stmt of statements7) {
    try {
      await pg.exec(stmt);
    } catch (e) {
      // Some statements might fail in PGlite (like partial indexes)
      // Continue with other statements
    }
  }

  for (const stmt of statements8) {
    try {
      await pg.exec(stmt);
    } catch (e) {
      // Some statements might fail in PGlite (like partial indexes)
      // Continue with other statements
    }
  }

  for (const stmt of statements9) {
    try {
      await pg.exec(stmt);
    } catch (e) {
      // Some statements might fail in PGlite (like partial indexes)
      // Continue with other statements
    }
  }

  // Migration 10: event schema expansion (uses DO $$ blocks for safe enum creation)
  // Try the full file first since PGlite supports PL/pgSQL DO blocks.
  // Fall back to direct CREATE TYPE + ALTER TABLE if the full exec fails.
  try {
    await pg.exec(migration10);
  } catch (e) {
    try { await pg.exec(`CREATE TYPE event_status AS ENUM ('draft', 'published', 'cancelled')`); } catch (_) { /* already exists */ }
    try { await pg.exec(`CREATE TYPE event_visibility AS ENUM ('public', 'members_only', 'invite_only')`); } catch (_) { /* already exists */ }
    const stmts10 = migration10
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        if (!s) return false;
        const noComments = s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();
        // Skip DO $$ blocks — handled above
        return noComments.length > 0 && !noComments.startsWith('DO $$') && !noComments.includes('EXCEPTION') && !noComments.startsWith('END');
      });
    for (const stmt of stmts10) {
      try { await pg.exec(stmt); } catch (_) { /* continue */ }
    }
  }

  // Migration 11: event_rsvp expansion (simple ALTER TABLE statements)
  const stmts11 = migration11
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const noComments = s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();
      return noComments.length > 0;
    });
  for (const stmt of stmts11) {
    try { await pg.exec(stmt); } catch (_) { /* continue */ }
  }

  // Migration 12: event_submission expansion (simple ALTER TABLE statements)
  const stmts12 = migration12
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      if (!s) return false;
      const noComments = s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();
      return noComments.length > 0;
    });
  for (const stmt of stmts12) {
    try { await pg.exec(stmt); } catch (_) { /* continue */ }
  }

  // Migration 13: attendance status expansion
  try {
    await pg.exec(migration13);
  } catch (e) {
    const stmts13 = migration13
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);
    for (const stmt of stmts13) {
      try { await pg.exec(stmt); } catch (_) { /* continue */ }
    }
  }

  // Migration 14: subscription support
  try {
    await pg.exec(migration14);
  } catch (e) {
    const stmts14 = migration14
      .split(';')
      .map(s => s.trim())
      .filter(s => {
        if (!s) return false;
        const noComments = s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim();
        return noComments.length > 0 && !noComments.startsWith('DO $$');
      });
    for (const stmt of stmts14) {
      try { await pg.exec(stmt); } catch (_) { /* continue */ }
    }
  }

  // Add the unique constraint on coupon_redemption that may not be in migrations
  try {
    await pg.exec(`
      ALTER TABLE "coupon_redemption" 
      ADD CONSTRAINT "coupon_redemption_user_coupon_unique" 
      UNIQUE ("coupon_id", "user_id")
    `);
  } catch (e) {
    // Constraint may already exist from migration
  }
}

/**
 * Get or create test database connection
 * Returns a promise that resolves to the database instance
 */
export async function getTestDb() {
  if (testDb && isInitialized) return testDb;

  // Create in-memory PGlite instance
  pglite = new PGlite();
  testDb = drizzle(pglite, { schema });
  
  // Run migrations to set up schema
  await runMigrations(pglite);
  isInitialized = true;

  return testDb;
}

/**
 * Clean up test database connection
 */
export async function closeTestDb() {
  if (pglite) {
    await pglite.close();
    pglite = null;
    testDb = null;
    isInitialized = false;
  }
}

/**
 * Reset the database (drop all data but keep schema)
 * Useful between test suites
 */
export async function resetTestDb() {
  if (!pglite) return;
  
  // Delete all data from tables in reverse dependency order
  const tables = [
    'admin_audit_log',
    'payment_event',
    'coupon_redemption',
    'event_rsvp', 
    'purchase',
    'coupon_book_price',
    'foodie_group_membership',
    'coupon',
    'event',
    'coupon_submission',
    'event_submission',
    'merchant',
    'foodie_group',
    'user',
  ];
  
  for (const table of tables) {
    try {
      await pglite.exec(`DELETE FROM "${table}"`);
    } catch (e) {
      // Table may not exist, ignore
    }
  }
}

/**
 * Run a test in a transaction that gets rolled back
 * This ensures test isolation - each test starts with a clean slate
 */
export async function withTransaction(testFn) {
  const db = await getTestDb();
  
  // Start a savepoint for rollback
  await pglite.exec('BEGIN');
  
  try {
    await testFn(db);
  } finally {
    // Rollback to ensure test isolation
    await pglite.exec('ROLLBACK');
  }
}

/**
 * Seed test data helpers
 */
export const seedHelpers = {
  async createUser(db, overrides = {}) {
    const { user } = schema;
    const values = {
      cognitoSub: overrides.cognitoSub || `test-sub-${Date.now()}-${Math.random()}`,
      email: overrides.email || `test-${Date.now()}-${Math.random()}@example.com`,
      name: overrides.name || 'Test User',
      role: overrides.role || 'customer',
    };
    // Support creating disabled users for testing
    if (overrides.deletedAt) {
      values.deletedAt = overrides.deletedAt;
    }
    const [newUser] = await db
      .insert(user)
      .values(values)
      .returning();
    return newUser;
  },

  async createFoodieGroup(db, overrides = {}) {
    const { foodieGroup } = schema;
    const [newGroup] = await db
      .insert(foodieGroup)
      .values({
        slug: overrides.slug || `test-group-${Date.now()}-${Math.random()}`,
        name: overrides.name || 'Test Foodie Group',
        description: overrides.description || 'Test description',
      })
      .returning();
    return newGroup;
  },

  async createMerchant(db, ownerId, overrides = {}) {
    const { merchant } = schema;
    const [newMerchant] = await db
      .insert(merchant)
      .values({
        name: overrides.name || `Test Merchant ${Date.now()}`,
        ownerId,
        logoUrl: overrides.logoUrl || null,
      })
      .returning();
    return newMerchant;
  },

  async createCoupon(db, groupId, merchantId, overrides = {}) {
    const { coupon } = schema;
    const now = new Date();
    const [newCoupon] = await db
      .insert(coupon)
      .values({
        groupId,
        merchantId,
        title: overrides.title || 'Test Coupon',
        description: overrides.description || 'Test description',
        couponType: overrides.couponType || 'percent',
        discountValue: overrides.discountValue || 10.0,
        validFrom: overrides.validFrom || new Date(now.getTime() - 86400000).toISOString(), // yesterday
        expiresAt: overrides.expiresAt || new Date(now.getTime() + 86400000).toISOString(), // tomorrow
        locked: overrides.locked !== undefined ? overrides.locked : true,
      })
      .returning();
    return newCoupon;
  },

  async createPurchase(db, userId, groupId, overrides = {}) {
    const { purchase } = schema;
    // For admin_grant provider, stripeCheckoutId should be null (no unique constraint issue)
    const defaultCheckoutId = overrides.provider === 'admin_grant'
      ? null
      : (overrides.stripeCheckoutId || `test-checkout-${Date.now()}-${Math.random()}`);
    const [newPurchase] = await db
      .insert(purchase)
      .values({
        userId,
        groupId,
        provider: overrides.provider || 'stripe',
        stripeCheckoutId: overrides.stripeCheckoutId !== undefined ? overrides.stripeCheckoutId : defaultCheckoutId,
        stripeSubscriptionId: overrides.stripeSubscriptionId || null,
        stripeCustomerId: overrides.stripeCustomerId || null,
        stripePaymentIntentId: overrides.stripePaymentIntentId || null,
        stripeChargeId: overrides.stripeChargeId || null,
        amountCents: overrides.amountCents || 0,
        currency: overrides.currency || 'usd',
        status: overrides.status || 'paid',
        priceSnapshot: overrides.priceSnapshot || null,
        metadata: overrides.metadata || null,
        purchasedAt: overrides.purchasedAt || new Date().toISOString(),
        expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : null,
        // Subscription lifecycle fields
        giftedByUserId: overrides.giftedByUserId || null,
        subscriptionStatus: overrides.subscriptionStatus || null,
        currentPeriodStart: overrides.currentPeriodStart || null,
        currentPeriodEnd: overrides.currentPeriodEnd || null,
        cancelAtPeriodEnd: overrides.cancelAtPeriodEnd || false,
        renewalReminderSentAt: overrides.renewalReminderSentAt || null,
      })
      .returning();
    return newPurchase;
  },

  async createAdminGrant(db, userId, groupId, overrides = {}) {
    const { purchase } = schema;
    const now = new Date().toISOString();
    const [grant] = await db
      .insert(purchase)
      .values({
        userId,
        groupId,
        provider: 'admin_grant',
        stripeCheckoutId: null,
        amountCents: 0,
        currency: 'usd',
        status: 'paid',
        purchasedAt: now,
        expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : null,
        metadata: overrides.metadata || { reason: 'test admin grant' },
      })
      .returning();
    return grant;
  },

  async createMembership(db, userId, groupId, overrides = {}) {
    const { foodieGroupMembership } = schema;
    const [newMembership] = await db
      .insert(foodieGroupMembership)
      .values({
        userId,
        groupId,
        role: overrides.role || 'customer',
        joinedAt: overrides.joinedAt || new Date().toISOString(),
      })
      .returning();
    return newMembership;
  },

  async createCouponRedemption(db, couponId, userId, overrides = {}) {
    const { couponRedemption } = schema;
    const [newRedemption] = await db
      .insert(couponRedemption)
      .values({
        couponId,
        userId,
        redeemedAt: overrides.redeemedAt || new Date().toISOString(),
      })
      .returning();
    return newRedemption;
  },

  async createEvent(db, groupId, merchantId, overrides = {}) {
    const { event } = schema;
    const now = new Date();
    const [newEvent] = await db
      .insert(event)
      .values({
        groupId,
        merchantId,
        name: overrides.name || 'Test Event',
        description: overrides.description || 'Test event description',
        startDatetime: overrides.startDatetime || new Date(now.getTime() + 86400000).toISOString(),
        endDatetime: overrides.endDatetime || new Date(now.getTime() + 2 * 86400000).toISOString(),
        location: overrides.location || '123 Main St',
        capacity: overrides.capacity ?? 50,
        status: overrides.status || 'published',
        visibility: overrides.visibility || 'public',
        isFree: overrides.isFree !== undefined ? overrides.isFree : true,
        slug: overrides.slug || `test-event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        coverImageUrl: overrides.coverImageUrl || null,
        bannerImageUrl: overrides.bannerImageUrl || null,
        priceCents: overrides.priceCents || null,
        membersOnlyPriceCents: overrides.membersOnlyPriceCents || null,
        maxTicketsPerGuest: overrides.maxTicketsPerGuest || 1,
        inviteOnly: overrides.inviteOnly || false,
      })
      .returning();
    return newEvent;
  },

  async createEventRsvp(db, eventId, overrides = {}) {
    const { eventRsvp } = schema;
    const [newRsvp] = await db
      .insert(eventRsvp)
      .values({
        eventId,
        userId: overrides.userId || null,
        attendees: overrides.attendees ?? 1,
        status: overrides.status || 'going',
        guestName: overrides.guestName || null,
        guestEmail: overrides.guestEmail || null,
      })
      .returning();
    return newRsvp;
  },

  async createEventSubmission(db, groupId, merchantId, overrides = {}) {
    const { eventSubmission } = schema;
    const [newSub] = await db
      .insert(eventSubmission)
      .values({
        groupId,
        merchantId,
        state: overrides.state || 'pending',
        submissionData: overrides.submissionData || {
          name: 'Test Event',
          description: 'A test event',
          start_datetime: new Date(Date.now() + 86400000).toISOString(),
          end_datetime: new Date(Date.now() + 2 * 86400000).toISOString(),
          location: '123 Main St',
          capacity: 10,
          is_free: true,
          visibility: 'public',
          max_tickets_per_guest: 1,
        },
        ...(overrides.rejectionMessage ? { rejectionMessage: overrides.rejectionMessage } : {}),
        ...(overrides.reviewedAt ? { reviewedAt: overrides.reviewedAt } : {}),
      })
      .returning();
    return newSub;
  },
};
