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
    const [newPurchase] = await db
      .insert(purchase)
      .values({
        userId,
        groupId,
        provider: overrides.provider || 'stripe',
        stripeCheckoutId: overrides.stripeCheckoutId || `test-checkout-${Date.now()}-${Math.random()}`,
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
        expiresAt: overrides.expiresAt || null,
      })
      .returning();
    return newPurchase;
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
};
