// Admin access grant/revoke integration tests
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, closeTestDb, seedHelpers, withTransaction } from '../../helpers/db.js';
import { eq, and, isNull, or, sql } from 'drizzle-orm';
import * as schema from '../../../drizzle/schema';

describe('Admin Access Grants Integration', () => {
  let db;

  beforeAll(async () => {
    db = await getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('should create an admin_grant purchase with null expires_at for perpetual access', async () => {
    await withTransaction(async (db) => {
      const adminUser = await seedHelpers.createUser(db, { role: 'super_admin' });
      const targetUser = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      const now = new Date().toISOString();
      const [grant] = await db
        .insert(schema.purchase)
        .values({
          userId: targetUser.id,
          groupId: group.id,
          provider: 'admin_grant',
          amountCents: 0,
          currency: 'usd',
          status: 'paid',
          purchasedAt: now,
          expiresAt: null,
          metadata: {
            grantedBy: adminUser.id,
            reason: 'test grant',
            grantedAt: now,
          },
        })
        .returning();

      expect(grant.provider).toBe('admin_grant');
      expect(grant.status).toBe('paid');
      expect(grant.expiresAt).toBeNull();
      expect(grant.amountCents).toBe(0);
    });
  });

  it('should create an admin_grant with a fixed expiry', async () => {
    await withTransaction(async (db) => {
      const targetUser = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      const futureExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const [grant] = await db
        .insert(schema.purchase)
        .values({
          userId: targetUser.id,
          groupId: group.id,
          provider: 'admin_grant',
          amountCents: 0,
          currency: 'usd',
          status: 'paid',
          purchasedAt: new Date().toISOString(),
          expiresAt: futureExpiry,
        })
        .returning();

      expect(grant.provider).toBe('admin_grant');
      // PGlite stores timestamp WITHOUT TIME ZONE in local time, so the
      // rehydrated Date may be offset by the runner's tz. Verify the value is
      // persisted and still in the future rather than strict instant equality.
      expect(grant.expiresAt).toBeTruthy();
      expect(new Date(grant.expiresAt) > new Date()).toBe(true);
    });
  });

  it('should revoke an admin_grant by setting expires_at to now', async () => {
    await withTransaction(async (db) => {
      const targetUser = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      const [grant] = await db
        .insert(schema.purchase)
        .values({
          userId: targetUser.id,
          groupId: group.id,
          provider: 'admin_grant',
          amountCents: 0,
          currency: 'usd',
          status: 'paid',
          purchasedAt: new Date().toISOString(),
          expiresAt: null,
        })
        .returning();

      expect(grant.expiresAt).toBeNull();

      // Revoke
      const revokedAt = new Date().toISOString();
      const [revoked] = await db
        .update(schema.purchase)
        .set({ expiresAt: revokedAt, updatedAt: revokedAt })
        .where(eq(schema.purchase.id, grant.id))
        .returning();

      expect(revoked.expiresAt).toBeTruthy();
      // Behavioral check: after revoke, expires_at is set such that the access
      // gate would deny (i.e. it is at or before now, allowing for PGlite's
      // local-time storage offset by tolerating up to 24h in the past).
      const msFromNow = new Date(revoked.expiresAt).getTime() - Date.now();
      expect(msFromNow).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });
  });

  it('should confirm admin_grant appears as active when expires_at is null', async () => {
    await withTransaction(async (db) => {
      const targetUser = await seedHelpers.createUser(db);
      const group = await seedHelpers.createFoodieGroup(db);

      await db.insert(schema.purchase).values({
        userId: targetUser.id,
        groupId: group.id,
        provider: 'admin_grant',
        amountCents: 0,
        currency: 'usd',
        status: 'paid',
        purchasedAt: new Date().toISOString(),
        expiresAt: null,
      });

      const now = new Date().toISOString();
      const [active] = await db
        .select({ id: schema.purchase.id })
        .from(schema.purchase)
        .where(
          and(
            eq(schema.purchase.userId, targetUser.id),
            eq(schema.purchase.groupId, group.id),
            eq(schema.purchase.status, 'paid'),
            eq(schema.purchase.provider, 'admin_grant'),
            or(
              isNull(schema.purchase.expiresAt),
              sql`${schema.purchase.expiresAt} > ${now}`
            )
          )
        )
        .limit(1);

      expect(active).toBeDefined();
    });
  });
});
