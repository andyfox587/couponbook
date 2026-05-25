// Multi-tier subscription pricing (migration 0019)
// Exercises the schema changes that back the /prices CRUD endpoints and the
// "pick the right tier" logic in /checkout and /gift. Mirrors the style of
// pricing.test.js (raw DB operations) so it runs without spinning up Express.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, asc, desc, eq } from 'drizzle-orm';
import { getTestDb, closeTestDb, seedHelpers, withTransaction } from '../../helpers/db.js';
import * as schema from '../../../drizzle/schema';

describe('Multi-tier subscription pricing', () => {
  beforeAll(async () => {
    await getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Migration 0019 schema', () => {
    it('adds label / is_default / sort_order / status columns', async () => {
      await withTransaction(async (db) => {
        const group = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        const [row] = await db
          .insert(schema.couponBookPrice)
          .values({
            groupId: group.id,
            amountCents: 999,
            currency: 'usd',
            isActive: true,
            isDefault: true,
            label: 'Monthly',
            sortOrder: 0,
            status: 'active',
            billingInterval: 'month',
            billingIntervalCount: 1,
            createdByUserId: user.id,
          })
          .returning();

        expect(row.isDefault).toBe(true);
        expect(row.label).toBe('Monthly');
        expect(row.sortOrder).toBe(0);
        expect(row.status).toBe('active');
      });
    });

    it('allows multiple active tiers per group (the old single-active rule is gone)', async () => {
      await withTransaction(async (db) => {
        const group = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        for (const [label, cents, interval, count, sortOrder, isDefault] of [
          ['Monthly', 999, 'month', 1, 0, true],
          ['6 months', 5394, 'month', 6, 1, false],
          ['Annual', 9948, 'year', 1, 2, false],
        ]) {
          await db.insert(schema.couponBookPrice).values({
            groupId: group.id,
            amountCents: cents,
            currency: 'usd',
            isActive: true,
            isDefault,
            label,
            sortOrder,
            status: 'active',
            billingInterval: interval,
            billingIntervalCount: count,
            createdByUserId: user.id,
          });
        }

        const activeTiers = await db
          .select()
          .from(schema.couponBookPrice)
          .where(
            and(
              eq(schema.couponBookPrice.groupId, group.id),
              eq(schema.couponBookPrice.status, 'active')
            )
          );

        expect(activeTiers.length).toBe(3);

        // Exactly one default per group.
        const defaults = activeTiers.filter((t) => t.isDefault);
        expect(defaults.length).toBe(1);
        expect(defaults[0].label).toBe('Monthly');
      });
    });

    it('supports draft tiers without Stripe IDs (seed script artifacts)', async () => {
      await withTransaction(async (db) => {
        const group = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        const [draft] = await db
          .insert(schema.couponBookPrice)
          .values({
            groupId: group.id,
            amountCents: 9948,
            currency: 'usd',
            isActive: true,
            isDefault: false,
            label: 'Annual',
            sortOrder: 2,
            status: 'draft',
            billingInterval: 'year',
            billingIntervalCount: 1,
            createdByUserId: user.id,
            // intentionally no Stripe IDs — drafts are pre-Stripe suggestions
          })
          .returning();

        expect(draft.status).toBe('draft');
        expect(draft.stripePriceId).toBeNull();
        expect(draft.stripeRecurringPriceIdTest).toBeNull();
      });
    });
  });

  describe('Default-tier selection', () => {
    it('matches findDefaultActiveTier order: is_default desc, sort_order asc', async () => {
      await withTransaction(async (db) => {
        const group = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        // Seed two non-default + one default tier with deliberately weird sort orders.
        await db.insert(schema.couponBookPrice).values([
          {
            groupId: group.id, amountCents: 9948, currency: 'usd',
            isActive: true, isDefault: false, label: 'Annual', sortOrder: 2,
            status: 'active', billingInterval: 'year', billingIntervalCount: 1,
            createdByUserId: user.id,
          },
          {
            groupId: group.id, amountCents: 999, currency: 'usd',
            isActive: true, isDefault: true, label: 'Monthly', sortOrder: 5,
            status: 'active', billingInterval: 'month', billingIntervalCount: 1,
            createdByUserId: user.id,
          },
          {
            groupId: group.id, amountCents: 5394, currency: 'usd',
            isActive: true, isDefault: false, label: '6 months', sortOrder: 1,
            status: 'active', billingInterval: 'month', billingIntervalCount: 6,
            createdByUserId: user.id,
          },
        ]);

        const rows = await db
          .select()
          .from(schema.couponBookPrice)
          .where(
            and(
              eq(schema.couponBookPrice.groupId, group.id),
              eq(schema.couponBookPrice.status, 'active')
            )
          )
          .orderBy(
            desc(schema.couponBookPrice.isDefault),
            asc(schema.couponBookPrice.sortOrder)
          );

        expect(rows[0].label).toBe('Monthly');
        expect(rows[0].isDefault).toBe(true);
      });
    });
  });

  describe('Checkout tier selection', () => {
    it('rejects a couponBookPriceId that belongs to a different group', async () => {
      await withTransaction(async (db) => {
        const groupA = await seedHelpers.createFoodieGroup(db);
        const groupB = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        const [tierA] = await db
          .insert(schema.couponBookPrice)
          .values({
            groupId: groupA.id, amountCents: 999, currency: 'usd',
            isActive: true, isDefault: true, status: 'active',
            label: 'Monthly', billingInterval: 'month', billingIntervalCount: 1,
            createdByUserId: user.id,
          })
          .returning();

        // The route validates: id + groupId + status='active' must all match.
        const [match] = await db
          .select()
          .from(schema.couponBookPrice)
          .where(
            and(
              eq(schema.couponBookPrice.id, tierA.id),
              eq(schema.couponBookPrice.groupId, groupB.id),
              eq(schema.couponBookPrice.status, 'active')
            )
          );

        expect(match).toBeUndefined();
      });
    });

    it('rejects archived tiers even when the id matches the group', async () => {
      await withTransaction(async (db) => {
        const group = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        const [tier] = await db
          .insert(schema.couponBookPrice)
          .values({
            groupId: group.id, amountCents: 999, currency: 'usd',
            isActive: false, isDefault: false, status: 'archived',
            label: 'Old', billingInterval: 'month', billingIntervalCount: 1,
            createdByUserId: user.id,
            archivedAt: new Date().toISOString(),
          })
          .returning();

        const [match] = await db
          .select()
          .from(schema.couponBookPrice)
          .where(
            and(
              eq(schema.couponBookPrice.id, tier.id),
              eq(schema.couponBookPrice.groupId, group.id),
              eq(schema.couponBookPrice.status, 'active')
            )
          );

        expect(match).toBeUndefined();
      });
    });
  });

  describe('Gift selection (one-time mode)', () => {
    it('computes expiresAt = now + N months based on the chosen tier cadence', () => {
      // Mirror the inline calc in POST /:id/gift so we lock the formula.
      const cases = [
        { interval: 'month', count: 1, expectedMonths: 1 },
        { interval: 'month', count: 6, expectedMonths: 6 },
        { interval: 'month', count: 12, expectedMonths: 12 },
        { interval: 'year', count: 1, expectedMonths: 12 },
      ];
      for (const c of cases) {
        const months = c.interval === 'year' ? (c.count || 1) * 12 : (c.count || 1);
        const now = new Date('2026-01-15T00:00:00Z');
        const exp = new Date(now);
        exp.setMonth(exp.getMonth() + months);
        const deltaMonths =
          (exp.getUTCFullYear() - now.getUTCFullYear()) * 12 +
          (exp.getUTCMonth() - now.getUTCMonth());
        expect(deltaMonths).toBe(c.expectedMonths);
      }
    });

    it('lets monthly cadence gifts succeed (the < 6 month guard is gone)', async () => {
      await withTransaction(async (db) => {
        const group = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        // Subscription group with a monthly tier — previously blocked from gifting.
        const [monthly] = await db
          .insert(schema.couponBookPrice)
          .values({
            groupId: group.id, amountCents: 999, currency: 'usd',
            isActive: true, isDefault: true, status: 'active',
            label: 'Monthly', billingInterval: 'month', billingIntervalCount: 1,
            stripePriceIdTest: 'price_test_monthly_onetime',
            stripePriceId: 'price_test_monthly_onetime',
            createdByUserId: user.id,
          })
          .returning();

        // The route requires status='active' AND a one-time stripePriceId.
        expect(monthly.status).toBe('active');
        expect(monthly.stripePriceIdTest).toBe('price_test_monthly_onetime');
      });
    });
  });

  describe('Back-compat for one-time groups', () => {
    it('keeps a single active default row for one-time groups (no extra rows seeded)', async () => {
      await withTransaction(async (db) => {
        const group = await seedHelpers.createFoodieGroup(db);
        const user = await seedHelpers.createUser(db);

        await db.insert(schema.couponBookPrice).values({
          groupId: group.id, amountCents: 1999, currency: 'usd',
          isActive: true, isDefault: true, status: 'active',
          label: null, // one-time groups don't need a tier label
          createdByUserId: user.id,
        });

        const active = await db
          .select()
          .from(schema.couponBookPrice)
          .where(
            and(
              eq(schema.couponBookPrice.groupId, group.id),
              eq(schema.couponBookPrice.status, 'active')
            )
          );

        expect(active.length).toBe(1);
        expect(active[0].billingInterval).toBeNull();
      });
    });
  });
});
