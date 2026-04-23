// Subscription access integration tests
// Verifies entitlement logic for subscription purchases including
// expiry checks and past-due grace window behavior.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, closeTestDb, seedHelpers, withTransaction } from '../../helpers/db.js';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';

describe('Subscription Access Integration', () => {
  let db;

  beforeAll(async () => {
    db = await getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('should allow access for active subscription with future expires_at', async () => {
    await withTransaction(async (db) => {
      const user = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const futureEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createPurchase(db, user.id, group.id, {
        status: 'paid',
        provider: 'stripe',
        expiresAt: futureExpiry,
        subscriptionStatus: 'active',
        currentPeriodEnd: futureEnd,
      });

      const [purchase] = await db
        .select()
        .from(schema.purchase)
        .where(
          and(
            eq(schema.purchase.userId, user.id),
            eq(schema.purchase.groupId, group.id),
            eq(schema.purchase.status, 'paid')
          )
        );

      expect(purchase).toBeDefined();
      expect(purchase.subscriptionStatus).toBe('active');
      expect(new Date(purchase.expiresAt) > new Date()).toBe(true);
    });
  });

  it('should deny access for expired subscription', async () => {
    await withTransaction(async (db) => {
      const user = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createPurchase(db, user.id, group.id, {
        status: 'paid',
        provider: 'stripe',
        expiresAt: pastExpiry,
        subscriptionStatus: 'active',
      });

      const [purchase] = await db
        .select()
        .from(schema.purchase)
        .where(
          and(
            eq(schema.purchase.userId, user.id),
            eq(schema.purchase.groupId, group.id),
            eq(schema.purchase.status, 'paid')
          )
        );

      expect(purchase).toBeDefined();
      // expiresAt is in the past — access should be denied
      expect(new Date(purchase.expiresAt) > new Date()).toBe(false);
    });
  });

  it('should allow access for past_due subscription within 3-day grace window', async () => {
    await withTransaction(async (db) => {
      const user = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      // period ended 1 day ago — within 3-day grace
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createPurchase(db, user.id, group.id, {
        status: 'paid',
        provider: 'stripe',
        expiresAt: oneDayAgo,
        subscriptionStatus: 'past_due',
        currentPeriodEnd: oneDayAgo,
      });

      const [purchase] = await db
        .select()
        .from(schema.purchase)
        .where(
          and(
            eq(schema.purchase.userId, user.id),
            eq(schema.purchase.groupId, group.id),
            eq(schema.purchase.status, 'paid')
          )
        );

      expect(purchase).toBeDefined();
      expect(purchase.subscriptionStatus).toBe('past_due');

      const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      // currentPeriodEnd (1 day ago) is within the 3-day grace window
      expect(new Date(purchase.currentPeriodEnd) > graceCutoff).toBe(true);
    });
  });

  it('should deny access for past_due subscription outside grace window', async () => {
    await withTransaction(async (db) => {
      const user = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      // period ended 5 days ago — outside 3-day grace
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      await seedHelpers.createPurchase(db, user.id, group.id, {
        status: 'paid',
        provider: 'stripe',
        expiresAt: fiveDaysAgo,
        subscriptionStatus: 'past_due',
        currentPeriodEnd: fiveDaysAgo,
      });

      const [purchase] = await db
        .select()
        .from(schema.purchase)
        .where(
          and(
            eq(schema.purchase.userId, user.id),
            eq(schema.purchase.groupId, group.id),
            eq(schema.purchase.status, 'paid')
          )
        );

      expect(purchase).toBeDefined();
      const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      // Outside grace window — access should be denied
      expect(new Date(purchase.currentPeriodEnd) > graceCutoff).toBe(false);
    });
  });

  it('should allow perpetual access for admin_grant with null expires_at', async () => {
    await withTransaction(async (db) => {
      const user = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      await seedHelpers.createPurchase(db, user.id, group.id, {
        status: 'paid',
        provider: 'admin_grant',
        expiresAt: null,
        subscriptionStatus: null,
        stripeCheckoutId: null,
      });

      const [purchase] = await db
        .select()
        .from(schema.purchase)
        .where(
          and(
            eq(schema.purchase.userId, user.id),
            eq(schema.purchase.groupId, group.id),
            eq(schema.purchase.status, 'paid')
          )
        );

      expect(purchase).toBeDefined();
      expect(purchase.provider).toBe('admin_grant');
      expect(purchase.expiresAt).toBeNull();
    });
  });
});
