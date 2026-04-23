// Unit tests for subscription service helpers
import { describe, it, expect } from 'vitest';
import {
  formatBillingCadence,
  isActiveSubscription,
  isPastDueGrace,
} from '../../../../src/services/subscriptionService.js';

describe('subscriptionService helpers', () => {
  describe('formatBillingCadence', () => {
    it('returns "One-time" when no interval', () => {
      expect(formatBillingCadence(null, null)).toBe('One-time');
    });

    it('returns "Monthly" for month/1', () => {
      expect(formatBillingCadence('month', 1)).toBe('Monthly');
    });

    it('returns "Every 6 months" for month/6', () => {
      expect(formatBillingCadence('month', 6)).toBe('Every 6 months');
    });

    it('returns "Yearly" for month/12', () => {
      expect(formatBillingCadence('month', 12)).toBe('Yearly');
    });

    it('returns "Yearly" for year/1', () => {
      expect(formatBillingCadence('year', 1)).toBe('Yearly');
    });
  });

  describe('isActiveSubscription', () => {
    it('returns true for active paid subscription', () => {
      expect(isActiveSubscription({ subscriptionStatus: 'active', status: 'paid' })).toBe(true);
    });

    it('returns false for past_due subscription', () => {
      expect(isActiveSubscription({ subscriptionStatus: 'past_due', status: 'paid' })).toBe(false);
    });

    it('returns false for null purchase', () => {
      expect(isActiveSubscription(null)).toBe(false);
    });

    it('returns false when status is not paid', () => {
      expect(isActiveSubscription({ subscriptionStatus: 'active', status: 'expired' })).toBe(false);
    });
  });

  describe('isPastDueGrace', () => {
    it('returns false when subscription is not past_due', () => {
      expect(isPastDueGrace({ subscriptionStatus: 'active', currentPeriodEnd: new Date().toISOString() })).toBe(false);
    });

    it('returns true when past_due and within 3-day grace window', () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
      expect(isPastDueGrace({ subscriptionStatus: 'past_due', currentPeriodEnd: oneDayAgo })).toBe(true);
    });

    it('returns false when past_due but outside 3-day grace window', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      expect(isPastDueGrace({ subscriptionStatus: 'past_due', currentPeriodEnd: fiveDaysAgo })).toBe(false);
    });

    it('returns false when currentPeriodEnd is missing', () => {
      expect(isPastDueGrace({ subscriptionStatus: 'past_due', currentPeriodEnd: null })).toBe(false);
    });
  });
});
