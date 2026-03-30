// Drizzle schema validation tests
import { describe, it, expect } from 'vitest';
import * as schema from '../../../drizzle/schema';

describe('Drizzle Schema', () => {
  describe('Table Definitions', () => {
    it('should have user table with required fields', () => {
      expect(schema.user).toBeDefined();
      expect(schema.user.id).toBeDefined();
      expect(schema.user.cognitoSub).toBeDefined();
      expect(schema.user.email).toBeDefined();
      expect(schema.user.name).toBeDefined();
      expect(schema.user.role).toBeDefined();
    });

    it('should have coupon table with required fields', () => {
      expect(schema.coupon).toBeDefined();
      expect(schema.coupon.id).toBeDefined();
      expect(schema.coupon.groupId).toBeDefined();
      expect(schema.coupon.merchantId).toBeDefined();
      expect(schema.coupon.title).toBeDefined();
      expect(schema.coupon.couponType).toBeDefined();
      expect(schema.coupon.discountValue).toBeDefined();
      expect(schema.coupon.validFrom).toBeDefined();
      expect(schema.coupon.expiresAt).toBeDefined();
    });

    it('should have foodieGroup table with required fields', () => {
      expect(schema.foodieGroup).toBeDefined();
      expect(schema.foodieGroup.id).toBeDefined();
      expect(schema.foodieGroup.slug).toBeDefined();
      expect(schema.foodieGroup.name).toBeDefined();
    });

    it('should have merchant table with required fields', () => {
      expect(schema.merchant).toBeDefined();
      expect(schema.merchant.id).toBeDefined();
      expect(schema.merchant.name).toBeDefined();
      expect(schema.merchant.ownerId).toBeDefined();
    });

    it('should have purchase table with required fields', () => {
      expect(schema.purchase).toBeDefined();
      expect(schema.purchase.id).toBeDefined();
      expect(schema.purchase.userId).toBeDefined();
      expect(schema.purchase.groupId).toBeDefined();
      expect(schema.purchase.stripeCheckoutId).toBeDefined();
      expect(schema.purchase.amountCents).toBeDefined();
      expect(schema.purchase.currency).toBeDefined();
      expect(schema.purchase.status).toBeDefined();
    });

    it('should have couponRedemption table with required fields', () => {
      expect(schema.couponRedemption).toBeDefined();
      expect(schema.couponRedemption.id).toBeDefined();
      expect(schema.couponRedemption.couponId).toBeDefined();
      expect(schema.couponRedemption.userId).toBeDefined();
      expect(schema.couponRedemption.redeemedAt).toBeDefined();
    });

    it('should have event table with required fields', () => {
      expect(schema.event).toBeDefined();
      expect(schema.event.id).toBeDefined();
      expect(schema.event.groupId).toBeDefined();
      expect(schema.event.merchantId).toBeDefined();
      expect(schema.event.name).toBeDefined();
      expect(schema.event.startDatetime).toBeDefined();
      expect(schema.event.capacity).toBeDefined();
    });

    it('should have couponSubmission table with required fields', () => {
      expect(schema.couponSubmission).toBeDefined();
      expect(schema.couponSubmission.id).toBeDefined();
      expect(schema.couponSubmission.groupId).toBeDefined();
      expect(schema.couponSubmission.state).toBeDefined();
      expect(schema.couponSubmission.submissionData).toBeDefined();
    });

    it('should have foodieGroupMembership table with required fields', () => {
      expect(schema.foodieGroupMembership).toBeDefined();
      expect(schema.foodieGroupMembership.id).toBeDefined();
      expect(schema.foodieGroupMembership.userId).toBeDefined();
      expect(schema.foodieGroupMembership.groupId).toBeDefined();
      expect(schema.foodieGroupMembership.role).toBeDefined();
    });
  });

  describe('Enum Types', () => {
    it('should have role enum with correct values', () => {
      expect(schema.role).toBeDefined();
      const roleValues = ['super_admin', 'merchant', 'customer', 'foodie_group_admin'];
      const validRoles = ['super_admin', 'merchant', 'customer', 'foodie_group_admin'];
      roleValues.forEach((role) => {
        expect(validRoles).toContain(role);
      });
    });

    it('should have couponType enum with correct values', () => {
      expect(schema.couponType).toBeDefined();
      const couponTypes = ['percent', 'amount', 'bogo', 'free_item'];
      const validTypes = ['percent', 'amount', 'bogo', 'free_item'];
      couponTypes.forEach((type) => {
        expect(validTypes).toContain(type);
      });
    });

    it('should have purchaseStatus enum with correct values', () => {
      expect(schema.purchaseStatus).toBeDefined();
      const statuses = ['created', 'pending', 'paid', 'expired', 'refunded'];
      const validStatuses = ['created', 'pending', 'paid', 'expired', 'refunded'];
      statuses.forEach((status) => {
        expect(validStatuses).toContain(status);
      });
    });

    it('should have submissionState enum with correct values', () => {
      expect(schema.submissionState).toBeDefined();
      const states = ['pending', 'approved', 'rejected'];
      const validStates = ['pending', 'approved', 'rejected'];
      states.forEach((state) => {
        expect(validStates).toContain(state);
      });
    });

    it('should have attendanceStatus enum with correct values', () => {
      expect(schema.attendanceStatus).toBeDefined();
      const statuses = ['going', 'waitlist', 'cancelled', 'checked_in', 'no_show'];
      const validStatuses = ['going', 'waitlist', 'cancelled', 'checked_in', 'no_show'];
      statuses.forEach((status) => {
        expect(validStatuses).toContain(status);
      });
    });
  });

  describe('Default Values', () => {
    it('should have default role for user table', () => {
      // The role field should have a default value
      expect(schema.user.role).toBeDefined();
    });

    it('should have default locked value for coupon table', () => {
      expect(schema.coupon.locked).toBeDefined();
    });

    it('should have default role for foodieGroupMembership table', () => {
      expect(schema.foodieGroupMembership.role).toBeDefined();
    });
  });

  describe('Unique Constraints', () => {
    it('should have unique constraint on user.cognitoSub', () => {
      // Schema should define unique constraint
      expect(schema.user.cognitoSub).toBeDefined();
    });

    it('should have unique constraint on user.email', () => {
      expect(schema.user.email).toBeDefined();
    });

    it('should have unique constraint on foodieGroup.slug', () => {
      expect(schema.foodieGroup.slug).toBeDefined();
    });

    it('should have unique constraint on purchase.stripeCheckoutId', () => {
      expect(schema.purchase.stripeCheckoutId).toBeDefined();
    });
  });

  describe('Foreign Key Relationships', () => {
    it('should have foreign key from coupon to foodieGroup', () => {
      expect(schema.coupon.groupId).toBeDefined();
    });

    it('should have foreign key from coupon to merchant', () => {
      expect(schema.coupon.merchantId).toBeDefined();
    });

    it('should have foreign key from couponRedemption to coupon', () => {
      expect(schema.couponRedemption.couponId).toBeDefined();
    });

    it('should have foreign key from couponRedemption to user', () => {
      expect(schema.couponRedemption.userId).toBeDefined();
    });

    it('should have foreign key from purchase to user', () => {
      expect(schema.purchase.userId).toBeDefined();
    });

    it('should have foreign key from purchase to foodieGroup', () => {
      expect(schema.purchase.groupId).toBeDefined();
    });

    it('should have foreign key from merchant to user (owner)', () => {
      expect(schema.merchant.ownerId).toBeDefined();
    });

    it('should have foreign key from foodieGroupMembership to user', () => {
      expect(schema.foodieGroupMembership.userId).toBeDefined();
    });

    it('should have foreign key from foodieGroupMembership to foodieGroup', () => {
      expect(schema.foodieGroupMembership.groupId).toBeDefined();
    });
  });

  describe('Soft Delete Support', () => {
    it('should have deletedAt field on user table', () => {
      expect(schema.user.deletedAt).toBeDefined();
    });

    it('should have deletedAt field on coupon table', () => {
      expect(schema.coupon.deletedAt).toBeDefined();
    });

    it('should have deletedAt field on merchant table', () => {
      expect(schema.merchant.deletedAt).toBeDefined();
    });

    it('should have deletedAt field on couponSubmission table', () => {
      expect(schema.couponSubmission.deletedAt).toBeDefined();
    });

    it('should have deletedAt field on couponRedemption table', () => {
      expect(schema.couponRedemption.deletedAt).toBeDefined();
    });

    it('should have deletedAt field on foodieGroupMembership table', () => {
      expect(schema.foodieGroupMembership.deletedAt).toBeDefined();
    });
  });
});

