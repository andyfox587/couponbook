import { describe, expect, it } from 'vitest';
import {
  calculateRefundQuote,
  EVENT_REFUND_POLICY_VERSION,
  paidEventPaymentsEnabled,
} from '../../../../server/src/services/eventPaymentService.js';

describe('eventPaymentService', () => {
  it('uses the configured paid-event feature flag', () => {
    const previous = process.env.ENABLE_PAID_EVENT_PAYMENTS;
    process.env.ENABLE_PAID_EVENT_PAYMENTS = 'true';
    expect(paidEventPaymentsEnabled()).toBe(true);
    process.env.ENABLE_PAID_EVENT_PAYMENTS = 'false';
    expect(paidEventPaymentsEnabled()).toBe(false);
    if (previous === undefined) delete process.env.ENABLE_PAID_EVENT_PAYMENTS;
    else process.env.ENABLE_PAID_EVENT_PAYMENTS = previous;
  });

  it('calculates the full refund window at least 72 hours before the event', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const quote = calculateRefundQuote('2026-04-05T12:00:00.000Z', 4000, now);
    expect(quote.amountCents).toBe(4000);
    expect(quote.refundPercent).toBe(100);
    expect(quote.policyWindow).toBe('full_refund_72_plus_hours');
  });

  it('calculates the 50 percent refund window between 24 and 72 hours', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const quote = calculateRefundQuote('2026-04-03T12:00:00.000Z', 4501, now);
    expect(quote.amountCents).toBe(2250);
    expect(quote.refundPercent).toBe(50);
    expect(quote.policyWindow).toBe('half_refund_24_to_72_hours');
  });

  it('declines refunds less than 24 hours before the event', () => {
    const now = new Date('2026-04-01T12:00:00.000Z');
    const quote = calculateRefundQuote('2026-04-02T11:00:00.000Z', 4000, now);
    expect(quote.amountCents).toBe(0);
    expect(quote.refundPercent).toBe(0);
    expect(quote.policyWindow).toBe('no_refund_under_24_hours');
  });

  it('exports the persisted refund policy version', () => {
    expect(EVENT_REFUND_POLICY_VERSION).toBe('event-refunds-v1');
  });
});
